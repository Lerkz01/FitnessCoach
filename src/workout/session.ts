// ====================================================================
//  Trainingseinheit — anlegen, mitschreiben, abschließen
//
//  Diese Schicht steht zwischen Oberfläche und Ablage. Ihre Regeln:
//
//   1. Jeder Satz wird SOFORT geschrieben, nicht am Ende der Einheit.
//      Stürzt die App zwischen Satz 2 und 3 ab, sind Satz 1 und 2 da.
//   2. Jeder Schreibvorgang landet in derselben Transaktion auf der
//      Sync-Warteschlange und löst einen Upload-Versuch aus. Besteht
//      Internet, ist der Satz Sekunden später in der Cloud; besteht keines,
//      wartet er dort, bis wieder eine Verbindung da ist.
//   3. Korrekturen überschreiben nichts. Sie sind neue Zeilen mit
//      `supersedesId` — das macht die Synchronisation konfliktfrei und die
//      Historie nachvollziehbar.
//   4. Die Vorgabe der Einheit wird beim Start EINGEFROREN. Nur so lässt
//      sich hinterher ehrlich vergleichen, was geplant war und was passierte.
// ====================================================================

import { putRecord } from '../data/db'
import { newId, nowIso, deviceId, today } from '../domain/ids'
import { RIR_DELTA } from '../domain/progression'
import type {
  PlannedExercise,
  SessionKind,
  SetFeedback,
  SetLog,
  WorkoutSession,
} from '../domain/records'
import { requestUpload } from '../sync/active'

/**
 * Legt eine Einheit an und schreibt sie sofort weg.
 *
 * Der Datensatz entsteht beim START, nicht beim Abschluss: Wer die App
 * mitten im Training schließt, findet die begonnene Einheit wieder.
 */
export async function startSession(input: {
  userId: string
  planId: string | null
  label: string
  exercises: readonly PlannedExercise[]
  scheduledFor?: string | null
  /** `calibration` = Einmess-Einheit, nicht für die Progression auswertbar. */
  kind?: SessionKind
}): Promise<WorkoutSession> {
  const now = nowIso()
  const session: WorkoutSession = {
    id: newId(),
    userId: input.userId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    planId: input.planId,
    kind: input.kind ?? 'plan',
    label: input.label,
    scheduledFor: input.scheduledFor ?? today(),
    startedAt: now,
    completedAt: null,
    status: 'active',
    // Eingefrorene Vorgabe — bewusst eine Kopie.
    planned: input.exercises.map((exercise) => ({ ...exercise })),
    sessionFeeling: null,
    notes: null,
  }

  await putRecord(input.userId, 'sessions', session)
  requestUpload()
  return session
}

export interface LogSetInput {
  userId: string
  session: WorkoutSession
  exercise: PlannedExercise
  setNumber: number
  isWarmup: boolean
  /**
   * Was für DIESEN Satz vorgegeben war. Weicht es von der Einheits-Vorgabe
   * ab, weil Regelkreis 1 korrigiert hat oder das Gerät besetzt war, gilt
   * der übergebene Wert — der Satz muss festhalten, was tatsächlich
   * verlangt wurde.
   */
  prescribedWeightKg?: number | null
  prescribedReps?: number | null
  prescribedSeconds?: number | null

  actualWeightKg: number | null
  actualReps: number | null
  actualSeconds?: number | null
  feedback: SetFeedback | null
  abandoned?: boolean
}

/** Schreibt einen Satz und stößt den Upload an. */
export async function logSet(input: LogSetInput): Promise<SetLog> {
  const log = buildSetLog(input, null)
  await putRecord(input.userId, 'setLogs', log)
  requestUpload()
  return log
}

/**
 * Korrigiert einen bereits geschriebenen Satz.
 *
 * Erzeugt eine NEUE Zeile, die per `supersedesId` auf die alte zeigt. Die
 * alte bleibt liegen — sie wird bei der Auswertung übersprungen
 * (`resolveSetLogs`), ist aber im Export noch nachvollziehbar.
 */
export async function correctSet(
  input: LogSetInput & { supersedesId: string },
): Promise<SetLog> {
  const log = buildSetLog(input, input.supersedesId)
  await putRecord(input.userId, 'setLogs', log)
  requestUpload()
  return log
}

function buildSetLog(input: LogSetInput, supersedesId: string | null): SetLog {
  const now = nowIso()
  const { exercise } = input

  // Vorgabe: der ausdrücklich übergebene Wert, sonst die der Einheit.
  const prescribedWeightKg =
    input.prescribedWeightKg !== undefined ? input.prescribedWeightKg : exercise.weightKg
  const prescribedReps =
    input.prescribedReps !== undefined ? input.prescribedReps : exercise.targetReps
  const prescribedSeconds =
    input.prescribedSeconds !== undefined ? input.prescribedSeconds : exercise.targetSeconds

  return {
    id: newId(),
    userId: input.userId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    sessionId: input.session.id,
    exerciseId: exercise.exerciseId,
    // Redundant, damit der Export ohne Übungsdatenbank lesbar bleibt.
    exerciseName: exercise.exerciseName,
    orderIndex: exercise.orderIndex,
    setNumber: input.setNumber,
    isWarmup: input.isWarmup,

    prescribedWeightKg,
    // Aufwärmsätze haben keine Progressionsvorgabe. Sie als Arbeitssatz zu
    // führen würde Zielerreichung und Volumenlast verfälschen.
    prescribedReps: input.isWarmup ? null : prescribedReps,
    prescribedSeconds: input.isWarmup ? null : prescribedSeconds,
    prescribedRir: input.isWarmup ? null : exercise.targetRir,

    actualWeightKg: input.actualWeightKg,
    actualReps: input.actualReps,
    actualSeconds: input.actualSeconds ?? null,
    feedback: input.feedback,
    rirDelta: input.feedback === null ? null : RIR_DELTA[input.feedback],

    abandoned: input.abandoned ?? false,

    loggedAt: now,
    deviceId: deviceId(),
    supersedesId,
  }
}

/** Schließt die Einheit ab. */
export async function completeSession(input: {
  userId: string
  session: WorkoutSession
  sessionFeeling?: 1 | 2 | 3 | 4 | null
  notes?: string | null
}): Promise<WorkoutSession> {
  const updated: WorkoutSession = {
    ...input.session,
    completedAt: nowIso(),
    status: 'completed',
    sessionFeeling: input.sessionFeeling ?? input.session.sessionFeeling,
    notes: input.notes ?? input.session.notes,
  }
  await putRecord(input.userId, 'sessions', updated)
  requestUpload()
  return updated
}

/**
 * Bricht die Einheit ab.
 *
 * Bereits geloggte Sätze bleiben erhalten und zählen — trainiert ist
 * trainiert. Nur die Einheit selbst wird nicht als abgeschlossen gewertet
 * und geht deshalb nicht in die Progressionshistorie ein: Eine halbe
 * Einheit ist kein Beweis für oder gegen Fortschritt.
 */
export async function abandonSession(input: {
  userId: string
  session: WorkoutSession
  notes?: string | null
}): Promise<WorkoutSession> {
  const updated: WorkoutSession = {
    ...input.session,
    status: 'skipped',
    completedAt: null,
    notes: input.notes ?? input.session.notes,
  }
  await putRecord(input.userId, 'sessions', updated)
  requestUpload()
  return updated
}

// ────────────────────────────────────────────────────────────────────
//  Ablauf einer Übung
// ────────────────────────────────────────────────────────────────────

export interface SetSlot {
  setNumber: number
  isWarmup: boolean
  weightKg: number | null
  reps: number | null
  seconds: number | null
}

/**
 * Die Satzfolge einer Übung: erst Aufwärmsätze, dann Arbeitssätze.
 *
 * Aufwärmsätze werden mit `setNumber` 0, −1, … geführt, damit die
 * Arbeitssätze bei 1 beginnen und die Nummerierung stabil bleibt, wenn ein
 * Aufwärmsatz übersprungen wird.
 */
export function setSlots(exercise: PlannedExercise): SetSlot[] {
  const slots: SetSlot[] = []

  exercise.warmups.forEach((warmup, index) => {
    slots.push({
      // Subtraktion statt unärem Minus: `-(n - 1 - index)` erzeugt beim
      // letzten Aufwärmsatz die negative Null.
      setNumber: index - (exercise.warmups.length - 1),
      isWarmup: true,
      weightKg: warmup.weightKg,
      reps: warmup.reps,
      seconds: null,
    })
  })

  for (let number = 1; number <= exercise.sets; number++) {
    slots.push({
      setNumber: number,
      isWarmup: false,
      weightKg: exercise.weightKg,
      reps: exercise.targetReps,
      seconds: exercise.targetSeconds,
    })
  }

  return slots
}

/**
 * Schreibt ein in der Einmessphase gefundenes Gewicht in die Vorgabe.
 *
 * Bewusst in die Einheit und nicht in einen neuen Datensatz: `applyProgression`
 * nimmt beim nächsten Planaufbau die zuletzt genutzte Vorgabe, wenn keine
 * Progressionsentscheidung vorliegt. Damit greift der Messwert über einen Weg,
 * der schon existiert und geprüft ist — statt über einen zweiten, der
 * irgendwann davon abweichen würde.
 */
export async function recordFoundWeight(input: {
  userId: string
  session: WorkoutSession
  exerciseId: string
  weightKg: number
}): Promise<WorkoutSession> {
  const updated: WorkoutSession = {
    ...input.session,
    planned: input.session.planned.map((planned) =>
      planned.exerciseId === input.exerciseId
        ? { ...planned, weightKg: input.weightKg }
        : planned,
    ),
  }
  await putRecord(input.userId, 'sessions', updated)
  requestUpload()
  return updated
}
