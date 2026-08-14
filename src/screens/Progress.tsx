// ====================================================================
//  Fortschritt
//
//  Zeigt, was sich seit dem Start bewegt hat. Aufgeklappt wird nur, was
//  gerade interessiert — die Kennzahl steht in der Kopfzeile.
//
//  Auswahl der Inhalte nach dem Grundsatz: Es wird nur gezeigt, was der
//  Nutzer BEEINFLUSSEN kann oder was eine Entscheidung stützt. Deshalb
//  keine Diagramm-Sammlung, sondern vier Fragen:
//
//    Wie entwickelt sich mein Gewicht?
//    Werde ich stärker?
//    Habe ich mein Wochenvolumen erreicht?
//    Halte ich mich an den Plan?
// ====================================================================

import { useMemo } from 'react'
import { exerciseById } from '../data'
import { analyzeSession, exerciseHistory } from '../domain/history'
import type { VolumeMuscle } from '../domain/muscles'
import type {
  BodyMetric,
  SetLog,
  TrainingPlan,
  UserProfile,
  WorkoutSession,
} from '../domain/records'
import { countedSets, setContribution } from '../domain/volume'
import { chronologically, localDayOf, mondayOf } from '../domain/week'
import { Notice, Stack } from '../ui/controls'
import { Disclosure, Row } from '../ui/Disclosure'
import { Sparkline } from '../ui/Sparkline'

export function Progress({
  profile,
  plan,
  metrics,
  sessions,
  logsBySession,
}: {
  profile: UserProfile
  plan: TrainingPlan | null
  metrics: readonly BodyMetric[]
  sessions: readonly WorkoutSession[]
  logsBySession: ReadonlyMap<string, readonly SetLog[]>
}) {
  const completed = useMemo(
    () =>
      sessions
        .filter((s) => s.status === 'completed' && s.deletedAt === null)
        .sort((a, b) => sortByCompletion(a, b)),
    [sessions],
  )

  const weights = useMemo(
    () =>
      metrics
        .filter((m) => m.deletedAt === null && m.weightKg !== null)
        .sort(chronologically((m) => m.measuredOn)),
    [metrics],
  )

  const strength = useMemo(
    () => strengthCurves(completed, logsBySession),
    [completed, logsBySession],
  )

  const thisWeek = useMemo(
    () => weeklyVolume(completed, logsBySession),
    [completed, logsBySession],
  )

  const adherence = useMemo(
    () => planAdherence(completed, sessions, profile),
    [completed, sessions, profile],
  )

  if (completed.length === 0 && weights.length < 2) {
    return (
      <div className="min-h-svh flex flex-col">
        <Header />
        <main className="px-5 pb-8">
          <Notice>
            Noch keine abgeschlossene Einheit. Nach dem ersten Training stehen hier
            Kraftverlauf, Gewicht und erreichtes Volumen.
          </Notice>
        </main>
      </div>
    )
  }

  const first = weights[0]?.weightKg ?? null
  const latest = weights.at(-1)?.weightKg ?? null
  const delta = first !== null && latest !== null ? latest - first : null

  return (
    <div className="min-h-svh flex flex-col">
      <Header />
      <main className="px-5 pb-8 flex-1">
        <Stack gap={3}>
          <Disclosure
            title="Gewicht"
            summary={latest !== null ? `${format(latest)} kg` : 'keine Daten'}
            defaultOpen
          >
            <Sparkline
              values={weights.map((m) => m.weightKg as number)}
              label={`Gewichtsverlauf über ${weights.length} Messungen`}
            />
            <div className="mt-2">
              <Row
                label="Start"
                value={first !== null ? `${format(first)} kg` : '—'}
              />
              <Row
                label="Jetzt"
                value={latest !== null ? `${format(latest)} kg` : '—'}
              />
              {delta !== null ? (
                <Row
                  label="Veränderung"
                  value={`${delta > 0 ? '+' : ''}${format(delta)} kg`}
                  hint={
                    profile.targetWeightKg !== null
                      ? `Ziel ${format(profile.targetWeightKg)} kg`
                      : undefined
                  }
                />
              ) : null}
            </div>
          </Disclosure>

          <Disclosure
            title="Kraft"
            summary={
              strength.length === 0 ? 'keine Daten' : `${strength.length} Übungen`
            }
            defaultOpen={strength.length > 0}
          >
            {strength.length === 0 ? (
              <p className="text-sm text-muted py-1">
                Ab der zweiten Einheit einer Übung zeichne ich ihren Verlauf.
              </p>
            ) : (
              <div className="space-y-4 pt-1">
                {strength.map((curve) => (
                  <div key={curve.exerciseId}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium truncate">{curve.name}</span>
                      <span className="tabular text-sm shrink-0">
                        {format(curve.latest)} kg
                        {curve.gain !== null ? (
                          <span
                            className={
                              'ml-2 text-xs ' +
                              (curve.gain > 0
                                ? 'text-success'
                                : curve.gain < 0
                                  ? 'text-warning'
                                  : 'text-muted')
                            }
                          >
                            {curve.gain > 0 ? '+' : ''}
                            {format(curve.gain)}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <Sparkline
                      values={curve.values}
                      label={`${curve.name}: geschätztes 1RM über ${curve.values.length} Einheiten`}
                      tone={curve.gain !== null && curve.gain < 0 ? 'muted' : 'primary'}
                    />
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted mt-3 leading-relaxed">
              Geschätztes Maximalgewicht aus Gewicht und Wiederholungen — nicht
              gemessen, sondern gerechnet. Für den Trend genügt das; als absolute Zahl
              ist es ein Anhaltswert.
            </p>
          </Disclosure>

          <Disclosure
            title="Volumen diese Woche"
            summary={`${format(thisWeek.total)} Sätze`}
          >
            {thisWeek.perMuscle.length === 0 ? (
              <p className="text-sm text-muted py-1">Diese Woche noch nichts trainiert.</p>
            ) : (
              <div className="space-y-1.5 pt-1">
                {thisWeek.perMuscle.map(([muscle, done]) => {
                  const target = plan?.volumeTargets[muscle] ?? null
                  const percent =
                    target !== null && target > 0
                      ? Math.min(100, (done / target) * 100)
                      : 0
                  return (
                    <div key={muscle} className="flex items-center gap-3 text-sm">
                      <span className="w-32 shrink-0 text-muted truncate">{muscle}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                        <div
                          className={
                            'h-full rounded-full ' +
                            (percent >= 100 ? 'bg-success' : 'bg-primary')
                          }
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="w-16 text-right tabular text-muted text-xs">
                        {format(done)}
                        {target !== null ? ` / ${format(target)}` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            <p className="text-xs text-muted mt-3 leading-relaxed">
              Fraktional gezählt: Ein Satz zählt für den Zielmuskel voll, für
              mittrainierte Muskeln halb.
            </p>
          </Disclosure>

          <Disclosure title="Plantreue" summary={`${adherence.percent} %`}>
            <Row label="Abgeschlossene Einheiten" value={String(adherence.done)} />
            <Row label="Geplant im Zeitraum" value={String(adherence.expected)} />
            <Row label="Abgebrochen" value={String(adherence.skipped)} />
            <p className="text-xs text-muted mt-3 leading-relaxed">
              {adherence.percent >= 80
                ? 'Das trägt. Unter 80 % würde ich einen kleineren Split vorschlagen — ein Plan, der nicht stattfindet, wirkt nicht.'
                : 'Unter 80 %: Ein kleinerer Split mit weniger Tagen bringt hier mehr als ein ambitionierter, der liegen bleibt.'}
            </p>
          </Disclosure>
        </Stack>
      </main>
    </div>
  )
}

function Header() {
  return (
    <header className="px-5 pt-8 pb-5">
      <h1 className="text-3xl tracking-tight">Fortschritt</h1>
    </header>
  )
}

// ────────────────────────────────────────────────────────────────────

interface Curve {
  exerciseId: string
  name: string
  values: number[]
  latest: number
  /** Zuwachs gegenüber der ersten Einheit. */
  gain: number | null
}

/**
 * e1RM-Verlauf je Übung, die mindestens zwei Einheiten hat.
 *
 * Sortiert nach Anzahl Datenpunkte: Übungen, die man häufig macht, sagen
 * mehr über die Entwicklung als eine, die zweimal vorkam.
 */
function strengthCurves(
  sessions: readonly WorkoutSession[],
  logsBySession: ReadonlyMap<string, readonly SetLog[]>,
): Curve[] {
  const names = new Map<string, string>()
  for (const session of sessions) {
    for (const planned of session.planned) names.set(planned.exerciseId, planned.exerciseName)
  }

  const out: Curve[] = []
  for (const [exerciseId, name] of names) {
    const { e1rms } = exerciseHistory({ exerciseId, sessions, logsBySession, limit: 20 })
    const values = e1rms.filter((v): v is number => v !== null)
    if (values.length < 2) continue
    out.push({
      exerciseId,
      name,
      values,
      latest: values[values.length - 1],
      gain: Math.round((values[values.length - 1] - values[0]) * 10) / 10,
    })
  }

  return out.sort((a, b) => b.values.length - a.values.length).slice(0, 8)
}

/**
 * Fraktionales Volumen der laufenden Woche.
 *
 * Gezählt werden nur ABGESCHLOSSENE Einheiten — eine begonnene würde das
 * Bild verzerren, weil ihre restlichen Sätze noch fehlen.
 */
function weeklyVolume(
  sessions: readonly WorkoutSession[],
  logsBySession: ReadonlyMap<string, readonly SetLog[]>,
): { perMuscle: [VolumeMuscle, number][]; total: number } {
  const week = mondayOf()
  const totals = new Map<VolumeMuscle, number>()
  let total = 0

  for (const session of sessions) {
    const day =
      session.scheduledFor ??
      (session.completedAt !== null ? localDayOf(session.completedAt) : null)
    if (day === null || mondayOf(new Date(`${day}T12:00:00`)) !== week) continue

    const logs = logsBySession.get(session.id) ?? []
    const { exercises } = analyzeSession(logs)

    for (const result of exercises) {
      const exercise = exerciseById.get(result.exerciseId)
      if (!exercise) continue
      total += countedSets(exercise, result.workingSets)

      for (const [muscle, share] of Object.entries(setContribution(exercise))) {
        if (share === undefined) continue
        const key = muscle as VolumeMuscle
        totals.set(key, (totals.get(key) ?? 0) + share * result.workingSets)
      }
    }
  }

  return {
    perMuscle: [...totals.entries()].sort((a, b) => b[1] - a[1]),
    total: Math.round(total * 10) / 10,
  }
}

/**
 * Plantreue: abgeschlossene Einheiten gegen die, die im Zeitraum vorgesehen
 * waren. Grundlage für den Vorschlag eines kleineren Splits (docs §9 Kreis 4).
 */
function planAdherence(
  completed: readonly WorkoutSession[],
  allSessions: readonly WorkoutSession[],
  profile: UserProfile,
): { done: number; skipped: number; expected: number; percent: number } {
  const done = completed.length
  const skipped = allSessions.filter(
    (session) => session.status === 'skipped' && session.deletedAt === null,
  ).length

  const firstDay = completed[0]?.scheduledFor ?? null
  if (firstDay === null) return { done, skipped, expected: 0, percent: 100 }

  const weeks = Math.max(
    1,
    Math.ceil((Date.now() - Date.parse(`${firstDay}T00:00:00`)) / (7 * 86400000)),
  )
  const expected = weeks * profile.trainingDays.length
  return {
    done,
    skipped,
    expected,
    percent: expected === 0 ? 100 : Math.round((done / expected) * 100),
  }
}

function sortByCompletion(a: WorkoutSession, b: WorkoutSession): number {
  const left = a.completedAt ?? a.createdAt
  const right = b.completedAt ?? b.createdAt
  return left < right ? -1 : left > right ? 1 : 0
}

function format(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',')
}
