import { describe, expect, it } from 'vitest'
import { equipmentById } from '../data'
import type { Equipment } from '../types'
import { applyProgression } from './applyProgression'
import { RIR_DELTA } from './progression'
import type {
  PlannedExercise,
  SetFeedback,
  SetLog,
  WorkoutSession,
} from './records'

const BARBELL = (): Equipment => {
  const found = equipmentById.get('FRE-02')
  if (!found) throw new Error('FRE-02 fehlt')
  return found
}

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${String(counter).padStart(4, '0')}`
}

function planned(overrides: Partial<PlannedExercise> = {}): PlannedExercise {
  return {
    exerciseId: 'BRU-001',
    exerciseName: 'Bankdrücken',
    orderIndex: 0,
    sets: 3,
    targetReps: 8,
    repRangeMin: 6,
    repRangeMax: 10,
    targetSeconds: null,
    targetRir: 2,
    restSeconds: 150,
    weightKg: 60,
    warmups: [],
    selectionReason: null,
    ...overrides,
  }
}

function session(
  exercises: PlannedExercise[],
  overrides: Partial<WorkoutSession> = {},
): WorkoutSession {
  return {
    id: nextId('session'),
    userId: 'u1',
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T11:00:00.000Z',
    deletedAt: null,
    planId: 'p1',
    label: 'Oberkörper A',
    scheduledFor: '2026-08-01',
    startedAt: '2026-08-01T10:00:00.000Z',
    completedAt: '2026-08-01T11:00:00.000Z',
    status: 'completed',
    planned: exercises,
    sessionFeeling: 2,
    notes: null,
    ...overrides,
  }
}

function logsFor(
  sessionId: string,
  exercise: PlannedExercise,
  actual: { reps: number; feedback: SetFeedback; weightKg?: number },
): SetLog[] {
  return [1, 2, 3].map((setNumber) => ({
    id: nextId('set'),
    userId: 'u1',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    deletedAt: null,
    sessionId,
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.exerciseName,
    orderIndex: exercise.orderIndex,
    setNumber,
    isWarmup: false,
    prescribedWeightKg: exercise.weightKg,
    prescribedReps: exercise.targetReps,
    prescribedSeconds: exercise.targetSeconds,
    prescribedRir: exercise.targetRir,
    actualWeightKg: actual.weightKg ?? exercise.weightKg,
    actualReps: actual.reps,
    actualSeconds: null,
    feedback: actual.feedback,
    rirDelta: RIR_DELTA[actual.feedback],
    abandoned: false,
    loggedAt: '2026-08-01T10:00:00.000Z',
    deviceId: 'd1',
    supersedesId: null,
  }))
}

function base() {
  return {
    level: 'intermediate' as const,
    goal: 'muscle' as const,
    calibrationWeek: false,
    equipmentForExercise: () => BARBELL(),
  }
}

// ────────────────────────────────────────────────────────────────────

describe('applyProgression', () => {
  it('lässt eine nie trainierte Übung bei der Schätzung des Generators', () => {
    const [applied] = applyProgression({
      exercises: [planned()],
      sessions: [],
      logsBySession: new Map(),
      ...base(),
    })
    expect(applied.weightKg).toBe(60)
    expect(applied.targetReps).toBe(8)
    expect(applied.prescriptionSource).toBe('estimate')
  })

  it('übernimmt die gesteigerte Vorgabe aus der letzten Einheit', () => {
    // Genau die Lücke, die ein Durchlauf im Browser gezeigt hat: Der
    // Abschlussbildschirm meldete „6 statt 5 Wdh", die nächste Einheit stand
    // trotzdem wieder auf 5.
    const exercise = planned({ targetReps: 5, repRangeMin: 5, repRangeMax: 8 })
    const past = session([exercise])

    const [applied] = applyProgression({
      exercises: [planned({ targetReps: 5, repRangeMin: 5, repRangeMax: 8 })],
      sessions: [past],
      logsBySession: new Map([
        [past.id, logsFor(past.id, exercise, { reps: 5, feedback: 'as_planned' })],
      ]),
      ...base(),
    })

    expect(applied.targetReps).toBe(6)
    expect(applied.prescriptionSource).toBe('progression')
    expect(applied.progressionReason).toContain('erfüllt')
  })

  it('hält die zuletzt genutzte Vorgabe, statt auf die Schätzung zurückzufallen', () => {
    // Bei KNAPP beschließt die Progression keine Änderung. Ohne diese Regel
    // würde die Vorgabe still auf die Erstschätzung zurückgesetzt — der
    // Nutzer verlöre seinen ganzen Fortschritt an dieser Übung.
    const trained = planned({ weightKg: 80, targetReps: 9 })
    const past = session([trained])

    const [applied] = applyProgression({
      exercises: [planned({ weightKg: 60, targetReps: 8 })],
      sessions: [past],
      logsBySession: new Map([
        // 9 Wdh getroffen, aber am Limit → KNAPP → halten
        [past.id, logsFor(past.id, trained, { reps: 9, feedback: 'at_limit' })],
      ]),
      ...base(),
    })

    expect(applied.weightKg).toBe(80)
    expect(applied.targetReps).toBe(9)
    expect(applied.prescriptionSource).toBe('held')
  })

  it('erhöht das Gewicht nach zwei Bestätigungen', () => {
    const first = planned({ weightKg: 60, targetReps: 8 })
    const second = planned({ weightKg: 60, targetReps: 9 })
    const older = session([first], { completedAt: '2026-07-29T11:00:00.000Z' })
    const newer = session([second], { completedAt: '2026-08-01T11:00:00.000Z' })

    const [applied] = applyProgression({
      exercises: [planned()],
      sessions: [older, newer],
      logsBySession: new Map([
        [older.id, logsFor(older.id, first, { reps: 11, feedback: 'more_left' })],
        [newer.id, logsFor(newer.id, second, { reps: 12, feedback: 'more_left' })],
      ]),
      ...base(),
    })

    expect(applied.weightKg).toBe(62.5)
    expect(applied.prescriptionSource).toBe('progression')
  })

  it('nutzt die JÜNGSTE Einheit, die diese Übung enthielt', () => {
    const old = planned({ weightKg: 50, targetReps: 8 })
    const recent = planned({ weightKg: 70, targetReps: 8 })
    const older = session([old], { completedAt: '2026-07-01T11:00:00.000Z' })
    const newer = session([recent], { completedAt: '2026-08-01T11:00:00.000Z' })

    // Reihenfolge absichtlich verdreht
    const [applied] = applyProgression({
      exercises: [planned()],
      sessions: [newer, older],
      logsBySession: new Map([
        [older.id, logsFor(older.id, old, { reps: 8, feedback: 'as_planned' })],
        [newer.id, logsFor(newer.id, recent, { reps: 8, feedback: 'as_planned' })],
      ]),
      ...base(),
    })

    expect(applied.weightKg).toBe(70)
  })

  it('ignoriert abgebrochene Einheiten', () => {
    const trained = planned({ weightKg: 80, targetReps: 8 })
    const skipped = session([trained], { status: 'skipped', completedAt: null })

    const [applied] = applyProgression({
      exercises: [planned()],
      sessions: [skipped],
      logsBySession: new Map([
        [skipped.id, logsFor(skipped.id, trained, { reps: 8, feedback: 'as_planned' })],
      ]),
      ...base(),
    })

    // Eine halbe Einheit ist kein Beweis — es bleibt bei der Schätzung.
    expect(applied.weightKg).toBe(60)
    expect(applied.prescriptionSource).toBe('estimate')
  })

  it('lässt die Vorgabe nicht unter einen geänderten Wiederholungsbereich fallen', () => {
    const trained = planned({ weightKg: 60, targetReps: 6, repRangeMin: 6, repRangeMax: 10 })
    const past = session([trained])

    const [applied] = applyProgression({
      // Neuer Bereich, z.B. weil sich das Ziel geändert hat
      exercises: [planned({ repRangeMin: 10, repRangeMax: 15, targetReps: 10 })],
      sessions: [past],
      logsBySession: new Map([
        [past.id, logsFor(past.id, trained, { reps: 6, feedback: 'as_planned' })],
      ]),
      ...base(),
    })

    expect(applied.targetReps).toBeGreaterThanOrEqual(10)
  })

  it('behandelt mehrere Übungen unabhängig voneinander', () => {
    const bench = planned({ exerciseId: 'BRU-001', weightKg: 60, targetReps: 8 })
    const row = planned({
      exerciseId: 'RUE-001',
      exerciseName: 'Rudern',
      orderIndex: 1,
      weightKg: 50,
      targetReps: 8,
    })
    const past = session([bench, row])

    const applied = applyProgression({
      exercises: [planned({ exerciseId: 'BRU-001' }), planned({ exerciseId: 'RUE-001', exerciseName: 'Rudern', orderIndex: 1, weightKg: 50 })],
      sessions: [past],
      logsBySession: new Map([
        [
          past.id,
          [
            ...logsFor(past.id, bench, { reps: 8, feedback: 'as_planned' }),
            ...logsFor(past.id, row, { reps: 5, feedback: 'at_limit' }),
          ],
        ],
      ]),
      ...base(),
    })

    // Bankdrücken erfüllt → +1 Wdh
    expect(applied[0].targetReps).toBe(9)
    // Rudern verfehlt → halten
    expect(applied[1].targetReps).toBe(8)
    expect(applied[1].prescriptionSource).toBe('held')
  })
})
