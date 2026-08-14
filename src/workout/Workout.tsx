// ====================================================================
//  Trainingsbildschirm
//
//  Hybrid-Aufbau (docs/UI-UX.md §5): Die aktuelle Übung nimmt den Platz
//  ein, der Rest der Einheit steht darunter als schmale Liste. Man sieht
//  also immer, was gerade zu tun ist UND wo man in der Einheit steht.
//
//  Hier bewusst KEINE aufklappbaren Abschnitte: Zwischen zwei Sätzen, mit
//  Hanteln in der Hand und 60 Sekunden Pause, darf nichts erst
//  aufgeklappt werden müssen. Alles, was zum Eintragen nötig ist, ist mit
//  einem Blick sichtbar und mit zwei Tipps erledigt:
//
//      Tipp 1  Wie viele Wiederholungen?
//      Tipp 2  Hat die Anstrengung zur Vorgabe gepasst?
//
//  Der zweite Tipp ist der wichtigere: Aus ihm entsteht die ganze
//  Progressionslogik (Regelkreise 1 und 2).
// ====================================================================

import { useMemo, useState } from 'react'
import { equipmentById, exerciseById, exercises as ALL_EXERCISES } from '../data'
import {
  blockedEquipmentFor,
  findAlternatives,
  type Alternative,
} from '../domain/alternatives'
import { inSessionCorrection } from '../domain/progression'
import { probeNext } from '../domain/calibration'
import type {
  SetFeedback,
  SetLog,
  StrengthReference,
  UserProfile,
  WorkoutSession,
} from '../domain/records'
import { adjustBySteps, loadBearingEquipment, weightLabel } from '../domain/weights'
import { Button, Notice } from '../ui/controls'
import { InfoButton } from '../ui/ExerciseInfo'
import { ExerciseInfoOverlay } from '../ui/ExerciseInfoOverlay'
import { RestTimer } from './RestTimer'
import {
  abandonSession,
  logSet,
  recordFoundWeight,
  setSlots,
  type SetSlot,
} from './session'
import { swapExercise } from './swap'
import { SwapSheet } from './SwapSheet'
import { formatSeconds, useTicker } from './useTicker'

// ────────────────────────────────────────────────────────────────────

/** Wo im Ablauf eines Satzes wir stehen. */
type Phase = 'input' | 'feedback' | 'rest' | 'swap'

/**
 * Pause nach einem Aufwärmsatz.
 *
 * Deutlich kürzer als die Arbeitspause — und genau der Wert, mit dem die
 * Dauerschätzung des Generators rechnet (`estimateExerciseSeconds`). Würde
 * hier die volle Arbeitspause laufen, dauerte jede Einheit mehrere Minuten
 * länger als angekündigt.
 */
const WARMUP_REST_SECONDS = 50

interface Position {
  exerciseIndex: number
  slotIndex: number
}

export function Workout({
  userId,
  session,
  calibrationWeek,
  profile,
  references,
  bodyweightKg,
  previousSessions,
  logsBySession,
  onFinished,
  onAbandoned,
}: {
  userId: string
  session: WorkoutSession
  calibrationWeek: boolean
  /** Für den Übungstausch: Sperrliste, Verletzungen, Level. */
  profile: UserProfile
  references: readonly StrengthReference[]
  bodyweightKg: number
  previousSessions: readonly WorkoutSession[]
  logsBySession: ReadonlyMap<string, readonly SetLog[]>
  onFinished: (logs: SetLog[]) => void
  onAbandoned: () => void
}) {
  /**
   * Die Einheit als eigener Zustand.
   *
   * Nötig, weil ein Übungstausch die Vorgabe verändert — und zwar mitten im
   * Training. Als reine Eigenschaft gelesen, würde der Bildschirm nach dem
   * Tausch weiter die alte Übung anzeigen.
   */
  const [current, setCurrent] = useState<WorkoutSession>(session)
  const exercises = current.planned
  const [position, setPosition] = useState<Position>({ exerciseIndex: 0, slotIndex: 0 })
  const [phase, setPhase] = useState<Phase>('input')
  const [logs, setLogs] = useState<SetLog[]>([])
  const [busy, setBusy] = useState(false)

  /**
   * Korrigierte Gewichte aus Regelkreis 1, je Übung.
   *
   * Bewusst nur im Arbeitsspeicher: Die eingefrorene Vorgabe der Einheit
   * bleibt unangetastet, denn sie ist der Anker, an dem die
   * Bestätigungsregel das Gewicht wiedererkennt.
   */
  const [corrected, setCorrected] = useState<Record<string, number>>({})
  const [correctionNote, setCorrectionNote] = useState<string | null>(null)

  /** Zuletzt eingetragene Wiederholungen — wartet auf den Abgleich. */
  const [pendingReps, setPendingReps] = useState<number | null>(null)
  const [pendingSeconds, setPendingSeconds] = useState<number | null>(null)
  const [restSeconds, setRestSeconds] = useState(0)

  /**
   * Geräte, die in dieser Einheit als besetzt gemeldet wurden.
   *
   * Bleiben bis zum Ende gesperrt: Wer zweimal tauscht, soll nicht auf dem
   * Gerät landen, das er gerade als besetzt gemeldet hat.
   */
  const [blockedEquipment, setBlockedEquipment] = useState<Set<string>>(new Set())
  const [swapNote, setSwapNote] = useState<string | null>(null)

  const exercise = exercises[position.exerciseIndex]
  const slots = useMemo(() => (exercise ? setSlots(exercise) : []), [exercise])
  const slot = slots[position.slotIndex]

  const allSlots = useMemo(
    () => exercises.map((planned) => setSlots(planned)),
    [exercises],
  )
  const totalSets = allSlots.reduce((sum, list) => sum + list.length, 0)
  const doneSets =
    allSlots.slice(0, position.exerciseIndex).reduce((sum, list) => sum + list.length, 0) +
    position.slotIndex

  // Der Hook muss VOR jedem vorzeitigen Rücksprung stehen — sonst
  // unterscheidet sich die Zahl der Hooks je Durchlauf.
  const equipment = useEquipmentFor(exercise?.exerciseId ?? '')

  if (!exercise || !slot) {
    return (
      <div className="p-5">
        <Notice tone="warning">Diese Einheit enthält keine Übungen.</Notice>
      </div>
    )
  }

  const weightKg = corrected[exercise.exerciseId] ?? slot.weightKg
  const isTimed = slot.seconds !== null

  /**
   * Arbeitssätze, die für die aktuelle Übung schon stehen.
   *
   * Entscheidet, ob getauscht werden darf: Nach dem ersten Arbeitssatz ist
   * die Übung angefangen. Ein Tausch würde einen Übungsplatz auf zwei
   * Übungen aufteilen, und beide wären für die Progression nicht mehr
   * auswertbar.
   */
  const loggedWorkingSets = exercise
    ? logs.filter((log) => log.exerciseId === exercise.exerciseId && !log.isWarmup).length
    : 0

  const alternatives = useMemo<Alternative[]>(() => {
    if (phase !== 'swap' || !exercise) return []
    const besetzt = exerciseById.get(exercise.exerciseId)
    if (!besetzt) return []
    return findAlternatives({
      exercise: besetzt,
      pool: ALL_EXERCISES,
      profile,
      usedExerciseIds: new Set(exercises.map((e) => e.exerciseId)),
      alsoBlocked: blockedEquipment,
      limit: 4,
    })
  }, [phase, exercise, exercises, profile, blockedEquipment])

  const blockedNames = useMemo(() => {
    if (!exercise) return []
    const besetzt = exerciseById.get(exercise.exerciseId)
    if (!besetzt) return []
    return blockedEquipmentFor(besetzt)
      .map((id) => equipmentById.get(id)?.name)
      .filter((name): name is string => Boolean(name))
  }, [exercise])

  async function applySwap(alternative: Alternative) {
    if (!exercise || busy) return
    setBusy(true)
    try {
      const result = await swapExercise({
        userId,
        session: current,
        original: exercise,
        replacement: alternative.exercise,
        profile,
        references,
        bodyweightKg,
        calibrationWeek,
        previousSessions,
        logsBySession,
      })

      setCurrent(result.session)
      setBlockedEquipment((prev) => new Set([...prev, ...result.blockedEquipmentIds]))
      // Beim Tausch von vorn: Die Ersatzübung hat eigene Aufwärmsätze.
      setPosition({ ...position, slotIndex: 0 })
      setPhase('input')
      setCorrectionNote(null)
      setSwapNote(
        result.weightSource === 'history'
          ? `${result.planned.exerciseName}: Gewicht aus deiner Historie.`
          : result.weightSource === 'estimate'
            ? `${result.planned.exerciseName}: Gewicht aus deinen Referenzwerten umgerechnet — der erste Satz messt es ein.`
            : `${result.planned.exerciseName}: Körpergewichtsübung.`,
      )
    } finally {
      setBusy(false)
    }
  }

  // ── Fortschritt innerhalb der Einheit ──
  function advance() {
    setPendingReps(null)
    setPendingSeconds(null)

    if (position.slotIndex + 1 < slots.length) {
      // Innerhalb derselben Übung bleibt der Kreis-1-Hinweis stehen — er
      // gilt für alle Folgesätze.
      setPosition({ ...position, slotIndex: position.slotIndex + 1 })
      setPhase('input')
      return
    }

    setCorrectionNote(null)
    setSwapNote(null)
    if (position.exerciseIndex + 1 < exercises.length) {
      setPosition({ exerciseIndex: position.exerciseIndex + 1, slotIndex: 0 })
      setPhase('input')
      return
    }
    onFinished(logs)
  }

  // ── Tipp 1: Wiederholungen (oder Sekunden) ──
  function submitAmount(value: number) {
    if (isTimed) setPendingSeconds(value)
    else setPendingReps(value)

    // Aufwärmsätze fragen keinen Abgleich — sie haben keine Vorgabe, mit
    // der sich die Anstrengung vergleichen ließe.
    if (slot.isWarmup) {
      void save(value, null)
      return
    }
    setPhase('feedback')
  }

  // ── Tipp 2: Abgleich geplant/tatsächlich ──
  async function save(amount: number, feedback: SetFeedback | null) {
    if (busy) return
    setBusy(true)
    try {
      const log = await logSet({
        userId,
        session: current,
        exercise,
        setNumber: slot.setNumber,
        isWarmup: slot.isWarmup,
        prescribedWeightKg: weightKg,
        actualWeightKg: weightKg,
        actualReps: isTimed ? null : amount,
        actualSeconds: isTimed ? amount : null,
        feedback,
      })
      const next = [...logs, log]
      setLogs(next)

      // ── Einmessphase: Tastsatz auswerten ──
      //
      // Sie ersetzt Regelkreis 1 für diese Einheit. Beides gleichzeitig wäre
      // widersprüchlich: Kreis 1 rettet einen Schätzfehler in EINEM Schritt,
      // das Einmessen tastet gezielt heran.
      const probeFor = exercise.probeForReps
      if (
        current.kind === 'calibration' &&
        !slot.isWarmup &&
        probeFor != null &&
        weightKg !== null &&
        equipment !== null &&
        !isTimed
      ) {
        const probeNumber = next.filter(
          (entry) => entry.exerciseId === exercise.exerciseId && !entry.isWarmup,
        ).length

        const result = probeNext({
          weightKg,
          actualReps: amount,
          feedback,
          targetReps: probeFor,
          targetRir: exercise.targetRir,
          probeReps: exercise.targetReps ?? amount,
          equipment,
          probeNumber,
        })

        setCorrectionNote(result.message)

        if (result.found && result.foundWeightKg !== null) {
          // Das gefundene Gewicht IN DIE VORGABE der Einheit schreiben. Von
          // dort holt es `applyProgression` beim nächsten Planaufbau — kein
          // neuer Datensatz, kein neuer Weg, keine zweite Wahrheit.
          await recordFoundWeight({
            userId,
            session: current,
            exerciseId: exercise.exerciseId,
            weightKg: result.foundWeightKg,
          })
          // Restliche Tastsätze dieser Übung entfallen. `next` statt `logs`,
          // weil der gerade geschriebene Satz sonst fehlte.
          setPendingReps(null)
          setPendingSeconds(null)
          setSwapNote(null)
          if (position.exerciseIndex + 1 < exercises.length) {
            setPosition({ exerciseIndex: position.exerciseIndex + 1, slotIndex: 0 })
            setPhase('input')
          } else {
            onFinished(next)
          }
          return
        }

        if (result.nextWeightKg !== null) {
          setCorrected((prev) => ({
            ...prev,
            [exercise.exerciseId]: result.nextWeightKg as number,
          }))
        }
      } else {
        // Regelkreis 1: nur nach dem ERSTEN Arbeitssatz einer Übung und nur
        // einmal — er soll einen Schätzfehler retten, nicht progressieren.
        const applied = maybeCorrect({
          slot,
          exercise,
          log,
          equipment,
          calibrationWeek,
          alreadyCorrected: corrected[exercise.exerciseId] !== undefined,
        })
        if (applied) {
          setCorrected((prev) => ({ ...prev, [exercise.exerciseId]: applied.weightKg }))
          setCorrectionNote(applied.message)
        }
      }

      const lastOfExercise = position.slotIndex + 1 >= slots.length
      const isLast = lastOfExercise && position.exerciseIndex + 1 >= exercises.length

      if (isLast) {
        onFinished(next)
        return
      }

      // Zwischen zwei Übungen läuft kein Timer: Das Umbauen — Gerät wechseln,
      // Scheiben tauschen — IST die Pause. Genau so rechnet auch die
      // Dauerschätzung des Generators.
      if (lastOfExercise) {
        advance()
        return
      }

      setRestSeconds(slot.isWarmup ? WARMUP_REST_SECONDS : exercise.restSeconds)
      setPhase('rest')
    } finally {
      setBusy(false)
    }
  }

  // Getrennt von `phase`: Die Info liegt ÜBER dem Bildschirm, damit ein
  // laufender Pausentimer nicht abgebaut und neu gestartet wird.
  const [infoExerciseId, setInfoExerciseId] = useState<string | null>(null)

  const nextLabel = describeNext({ slots, position, exercises })

  return (
    <div className="min-h-svh flex flex-col bg-bg">
      <header className="px-5 pt-6 pb-3 sticky top-0 bg-bg/95 backdrop-blur z-10">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted truncate">{current.label}</p>
          <p className="text-sm tabular text-muted shrink-0">
            {doneSets} / {totalSets} Sätze
          </p>
        </div>
        <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-2">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${(doneSets / Math.max(1, totalSets)) * 100}%` }}
          />
        </div>
      </header>

      <main className="px-5 pb-8 flex-1 space-y-4">
        {/* Der Kreis-1-Hinweis gilt für alle Folgesätze der Übung und bleibt
            deshalb über den Phasenwechsel hinweg stehen. */}
        {correctionNote ? <Notice tone="warning">{correctionNote}</Notice> : null}

        {swapNote ? <Notice>{swapNote}</Notice> : null}

        {phase === 'swap' ? (
          <SwapSheet
            exerciseName={exercise.exerciseName}
            blockedNames={blockedNames}
            alternatives={alternatives}
            onPick={(alternative) => void applySwap(alternative)}
            onCancel={() => setPhase('input')}
          />
        ) : phase === 'rest' ? (
          <RestTimer seconds={restSeconds} nextLabel={nextLabel} onDone={advance} />
        ) : (
          <CurrentSet
            exerciseName={exercise.exerciseName}
            selectionReason={exercise.selectionReason}
            slot={slot}
            slotIndex={position.slotIndex}
            slots={slots}
            weightKg={weightKg}
            weightHint={equipment ? weightLabel(equipment) : null}
            targetRir={exercise.targetRir}
            phase={phase}
            busy={busy}
            pending={isTimed ? pendingSeconds : pendingReps}
            onWeightChange={(steps) => {
              if (weightKg === null || !equipment) return
              const next = adjustBySteps(equipment, weightKg, steps)
              if (next !== null) {
                setCorrected((prev) => ({ ...prev, [exercise.exerciseId]: next }))
              }
            }}
            onInfo={() => setInfoExerciseId(exercise.exerciseId)}
            canSwap={loggedWorkingSets === 0}
            onSwap={() => setPhase('swap')}
            onAmount={submitAmount}
            onFeedback={(feedback) => {
              const amount = isTimed ? pendingSeconds : pendingReps
              if (amount === null) return
              void save(amount, feedback)
            }}
            onBack={() => setPhase('input')}
          />
        )}

        <SessionOutline
          exercises={exercises}
          allSlots={allSlots}
          position={position}
          logs={logs}
          onInfo={setInfoExerciseId}
        />

        <Button
          variant="ghost"
          full
          onClick={() => {
            void abandonSession({ userId, session: current }).then(onAbandoned)
          }}
        >
          Training abbrechen
        </Button>
      </main>

      <ExerciseInfoOverlay
        exerciseId={infoExerciseId}
        onClose={() => setInfoExerciseId(null)}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
//  Der aktuelle Satz
// ────────────────────────────────────────────────────────────────────

function CurrentSet({
  exerciseName,
  selectionReason,
  slot,
  slotIndex,
  slots,
  weightKg,
  weightHint,
  targetRir,
  phase,
  busy,
  pending,
  canSwap,
  onInfo,
  onSwap,
  onWeightChange,
  onAmount,
  onFeedback,
  onBack,
}: {
  exerciseName: string
  selectionReason: string | null
  slot: SetSlot
  slotIndex: number
  slots: readonly SetSlot[]
  weightKg: number | null
  weightHint: { label: string; hint: string | null } | null
  targetRir: number
  phase: Phase
  busy: boolean
  pending: number | null
  /** Tauschen geht nur, solange kein Arbeitssatz steht. */
  canSwap: boolean
  onInfo: () => void
  onSwap: () => void
  onWeightChange: (steps: number) => void
  onAmount: (value: number) => void
  onFeedback: (feedback: SetFeedback) => void
  onBack: () => void
}) {
  const workingSlots = slots.filter((s) => !s.isWarmup)
  const workingNumber = workingSlots.findIndex((s) => s.setNumber === slot.setNumber) + 1
  const isTimed = slot.seconds !== null

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start gap-4">
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          {exerciseName}
        </h1>
        <div className="ml-auto mt-1.5">
          <InfoButton exerciseName={exerciseName} onClick={onInfo} />
        </div>
      </div>
      <p className="text-sm text-muted mt-1">
        {slot.isWarmup
          ? `Aufwärmsatz ${slotIndex + 1}`
          : `Satz ${workingNumber} von ${workingSlots.length}`}
        {slot.isWarmup ? null : <> · {rirText(targetRir)}</>}
      </p>

      {/* ── Gewicht ── */}
      {weightKg !== null ? (
        <div className="mt-5 flex items-center gap-3">
          <Stepper label="leichter" onClick={() => onWeightChange(-1)} disabled={busy}>
            −
          </Stepper>
          <div className="flex-1 text-center">
            <p className="text-4xl font-bold tabular leading-none">
              {formatKg(weightKg)}
              <span className="text-lg font-semibold text-muted ml-1">kg</span>
            </p>
            <p className="text-xs text-muted mt-1">
              {weightHint?.hint ?? weightHint?.label ?? 'Gewicht'}
            </p>
          </div>
          <Stepper label="schwerer" onClick={() => onWeightChange(1)} disabled={busy}>
            +
          </Stepper>
        </div>
      ) : (
        <p className="mt-5 text-center text-2xl font-bold">Körpergewicht</p>
      )}

      <div className="mt-6">
        {phase === 'input' ? (
          isTimed ? (
            <TimedInput target={slot.seconds ?? 0} busy={busy} onDone={onAmount} />
          ) : (
            <RepPad target={slot.reps ?? 8} busy={busy} onPick={onAmount} />
          )
        ) : (
          <FeedbackPad
            targetRir={targetRir}
            amount={pending}
            isTimed={isTimed}
            busy={busy}
            onPick={onFeedback}
            onBack={onBack}
          />
        )}
      </div>

      {phase === 'input' ? (
        <div className="mt-5">
          {canSwap ? (
            <button
              type="button"
              onClick={onSwap}
              disabled={busy}
              className={
                'w-full min-h-12 rounded-xl border border-border bg-bg text-sm ' +
                'font-medium text-muted hover:text-text hover:border-muted ' +
                'transition-colors disabled:opacity-40 ' +
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
              }
            >
              Gerät besetzt — andere Übung
            </button>
          ) : (
            <p className="text-xs text-muted leading-relaxed">
              Tauschen geht nur vor dem ersten Arbeitssatz. Danach würde der
              Übungsplatz auf zwei Übungen aufgeteilt, und keine von beiden wäre für
              die Progression auswertbar.
            </p>
          )}
        </div>
      ) : null}

      {selectionReason && phase === 'input' ? (
        <p className="text-xs text-muted mt-4 leading-relaxed">{selectionReason}</p>
      ) : null}
    </section>
  )
}

function Stepper({
  children,
  label,
  onClick,
  disabled,
}: {
  children: string
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={
        'w-14 h-14 shrink-0 rounded-2xl border border-border bg-surface-2 ' +
        'text-2xl font-semibold text-text disabled:opacity-40 ' +
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
      }
    >
      {children}
    </button>
  )
}

// ── Tipp 1 ──────────────────────────────────────────────────────────

/**
 * Wiederholungen als Knöpfe.
 *
 * Der Zielwert steht in der Mitte und ist hervorgehoben — das ist in den
 * meisten Fällen der richtige Knopf, also ein Tipp. Der Bereich reicht
 * bewusst weit nach unten: Ein schlechter Satz muss genauso leicht
 * eintragbar sein wie ein guter, sonst wird geschönt.
 */
function RepPad({
  target,
  busy,
  onPick,
}: {
  target: number
  busy: boolean
  onPick: (reps: number) => void
}) {
  const [free, setFree] = useState(false)
  const [value, setValue] = useState('')

  const low = Math.max(1, target - 3)
  const options: number[] = []
  for (let reps = low; reps <= target + 3; reps++) options.push(reps)

  if (free) {
    return (
      <div>
        <p className="text-sm font-medium mb-2">Wie viele Wiederholungen?</p>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className={
              'flex-1 min-h-14 px-4 rounded-2xl bg-bg border border-border ' +
              'text-2xl tabular text-center focus:outline-2 focus:outline-primary'
            }
          />
          <Button
            disabled={busy || value === ''}
            onClick={() => onPick(Math.max(0, Number(value)))}
          >
            Eintragen
          </Button>
        </div>
        <button
          type="button"
          className="text-sm text-muted mt-3 underline"
          onClick={() => setFree(false)}
        >
          Zurück zu den Knöpfen
        </button>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm font-medium mb-2">Wie viele Wiederholungen?</p>
      <div className="grid grid-cols-4 gap-2">
        {options.map((reps) => (
          <button
            key={reps}
            type="button"
            disabled={busy}
            onClick={() => onPick(reps)}
            className={
              'h-16 rounded-2xl border text-xl font-semibold tabular transition-colors ' +
              'disabled:opacity-40 ' +
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
              (reps === target
                ? 'border-primary bg-primary/20 text-text'
                : 'border-border bg-bg text-text hover:border-muted')
            }
          >
            {reps}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="text-sm text-muted mt-3 underline"
        onClick={() => setFree(true)}
      >
        Andere Zahl
      </button>
    </div>
  )
}

/** Zeit-Übungen: Uhr läuft mit, gestoppt wird die tatsächliche Dauer. */
function TimedInput({
  target,
  busy,
  onDone,
}: {
  target: number
  busy: boolean
  onDone: (seconds: number) => void
}) {
  const ticker = useTicker()

  if (!ticker.running && ticker.elapsed === 0) {
    return (
      <div className="text-center">
        <p className="text-sm font-medium mb-3">Ziel: {formatSeconds(target)}</p>
        <Button full onClick={ticker.start} disabled={busy}>
          Starten
        </Button>
      </div>
    )
  }

  const remaining = target - ticker.elapsed
  return (
    <div className="text-center">
      <p
        className={
          'text-5xl font-bold tabular ' + (remaining <= 0 ? 'text-success' : 'text-text')
        }
      >
        {formatSeconds(Math.abs(remaining))}
      </p>
      <p className="text-xs text-muted mt-1">
        {remaining > 0 ? `von ${formatSeconds(target)}` : 'über der Vorgabe'}
      </p>
      <div className="mt-4">
        <Button
          full
          disabled={busy}
          onClick={() => {
            ticker.stop()
            onDone(ticker.elapsed)
          }}
        >
          Fertig — {formatSeconds(ticker.elapsed)} eintragen
        </Button>
      </div>
    </div>
  )
}

// ── Tipp 2 ──────────────────────────────────────────────────────────

/**
 * Der Abgleich.
 *
 * Gefragt wird nicht „wie hart war das?", sondern ob die tatsächliche
 * Anstrengung zur VORGABE passte. Ein Vergleich ist leichter zu beantworten
 * als eine absolute Einschätzung — und liefert genau die Abweichung, die die
 * Progressionslogik braucht (docs/UI-UX.md §5.3).
 */
function FeedbackPad({
  targetRir,
  amount,
  isTimed,
  busy,
  onPick,
  onBack,
}: {
  targetRir: number
  amount: number | null
  isTimed: boolean
  busy: boolean
  onPick: (feedback: SetFeedback) => void
  onBack: () => void
}) {
  const question =
    targetRir <= 0
      ? 'Warst du wirklich am Limit?'
      : `Waren wirklich ${targetRir} Wiederholungen übrig?`

  const options: { feedback: SetFeedback; label: string; hint: string }[] =
    targetRir <= 0
      ? [
          { feedback: 'at_limit', label: 'Ja, am Limit', hint: 'Genau wie geplant' },
          { feedback: 'more_left', label: 'Nein, da war mehr drin', hint: 'Zu leicht' },
          { feedback: 'as_planned', label: 'Fast', hint: 'Knapp dran' },
        ]
      : [
          { feedback: 'as_planned', label: 'Ja, hat gepasst', hint: 'Wie geplant' },
          { feedback: 'more_left', label: 'Da war mehr drin', hint: 'Zu leicht' },
          { feedback: 'at_limit', label: 'Nein, war am Limit', hint: 'Zu schwer' },
        ]

  return (
    <div>
      <p className="text-sm text-muted">
        {amount ?? 0} {isTimed ? 'Sekunden' : 'Wiederholungen'} eingetragen
      </p>
      <p className="text-base font-semibold mt-1 mb-3">{question}</p>
      <div className="space-y-2">
        {options.map((option) => (
          <button
            key={option.feedback}
            type="button"
            disabled={busy}
            onClick={() => onPick(option.feedback)}
            className={
              'w-full text-left min-h-16 px-4 py-3 rounded-2xl border border-border ' +
              'bg-bg hover:border-muted transition-colors disabled:opacity-40 ' +
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
            }
          >
            <span className="block font-semibold">{option.label}</span>
            <span className="block text-xs text-muted mt-0.5">{option.hint}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="text-sm text-muted mt-3 underline"
        onClick={onBack}
        disabled={busy}
      >
        Zahl korrigieren
      </button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
//  Der Rest der Einheit
// ────────────────────────────────────────────────────────────────────

/**
 * Schmale Liste aller Übungen. Kein Aufklappen: Man will beim Blick nach
 * unten sofort wissen, was noch kommt — nicht erst tippen müssen.
 */
function SessionOutline({
  exercises,
  allSlots,
  position,
  logs,
  onInfo,
}: {
  exercises: WorkoutSession['planned']
  allSlots: readonly SetSlot[][]
  position: Position
  logs: readonly SetLog[]
  onInfo: (exerciseId: string) => void
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 px-1">
        Einheit
      </h2>
      <ol className="space-y-1">
        {exercises.map((exercise, index) => {
          const done = logs.filter(
            (log) => log.exerciseId === exercise.exerciseId && !log.isWarmup,
          ).length
          const current = index === position.exerciseIndex
          const past = index < position.exerciseIndex

          return (
            <li
              key={`${exercise.exerciseId}-${index}`}
              className={
                'flex items-center gap-3 px-3 py-2 rounded-xl text-sm ' +
                (current
                  ? 'bg-primary/15 border border-primary/40'
                  : past
                    ? 'text-muted'
                    : 'text-muted')
              }
            >
              <span className="tabular w-4 shrink-0 text-xs">{index + 1}</span>
              <span className={'flex-1 truncate ' + (current ? 'font-semibold' : '')}>
                {exercise.exerciseName}
              </span>
              <span className="tabular text-xs shrink-0">
                {past || done >= exercise.sets ? '✓' : `${done}/${exercise.sets}`}
              </span>
              <span className="tabular text-xs shrink-0 w-16 text-right">
                {describeTarget(exercise, allSlots[index])}
              </span>
              <InfoButton
                exerciseName={exercise.exerciseName}
                onClick={() => onInfo(exercise.exerciseId)}
              />
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────
//  Hilfsfunktionen
// ────────────────────────────────────────────────────────────────────

function useEquipmentFor(exerciseId: string) {
  return useMemo(() => {
    const exercise = exerciseById.get(exerciseId)
    if (!exercise) return null
    return loadBearingEquipment(exercise, equipmentById)
  }, [exerciseId])
}

/**
 * Regelkreis 1 im Ablauf: greift nur nach dem ersten Arbeitssatz einer
 * Übung, nur einmal, und nur bei klarer Abweichung.
 */
function maybeCorrect(input: {
  slot: SetSlot
  exercise: WorkoutSession['planned'][number]
  log: SetLog
  equipment: ReturnType<typeof loadBearingEquipment>
  calibrationWeek: boolean
  alreadyCorrected: boolean
}) {
  const { slot, log, equipment, calibrationWeek, alreadyCorrected } = input
  if (slot.isWarmup || slot.setNumber !== 1) return null
  if (alreadyCorrected || equipment === null) return null

  return inSessionCorrection({
    firstSet: {
      prescribedReps: log.prescribedReps,
      prescribedSeconds: log.prescribedSeconds,
      actualReps: log.actualReps,
      actualSeconds: log.actualSeconds,
      weightKg: log.actualWeightKg,
      feedback: log.feedback,
      abandoned: log.abandoned,
    },
    equipment,
    calibrationWeek,
  })
}

function describeNext(input: {
  slots: readonly SetSlot[]
  position: Position
  exercises: WorkoutSession['planned']
}): string {
  const { slots, position, exercises } = input
  if (position.slotIndex + 1 < slots.length) {
    const next = slots[position.slotIndex + 1]
    const working = slots.filter((s) => !s.isWarmup)
    const number = working.findIndex((s) => s.setNumber === next.setNumber) + 1
    return next.isWarmup
      ? 'noch ein Aufwärmsatz'
      : `Satz ${number} von ${working.length}`
  }
  const nextExercise = exercises[position.exerciseIndex + 1]
  return nextExercise ? nextExercise.exerciseName : 'Einheit abschließen'
}

function describeTarget(
  exercise: WorkoutSession['planned'][number],
  slots: readonly SetSlot[] | undefined,
): string {
  const working = (slots ?? []).filter((s) => !s.isWarmup).length || exercise.sets
  if (exercise.targetSeconds !== null) return `${working}×${exercise.targetSeconds}s`
  return `${working}×${exercise.targetReps ?? '?'}`
}

function rirText(targetRir: number): string {
  if (targetRir <= 0) return 'bis zum Limit'
  return `${targetRir} Wdh. im Tank`
}

function formatKg(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',')
}
