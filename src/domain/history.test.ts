import { describe, expect, it } from 'vitest'
import { analyzeSession, exerciseHistory, resolveSetLogs, toOutcome } from './history'
import type { SetFeedback, SetLog, WorkoutSession } from './records'
import { RIR_DELTA } from './progression'

let counter = 0
/** Aufsteigende, sortierbare Test-IDs — ersetzt UUIDv7 deterministisch. */
function id(prefix = 'set'): string {
  counter += 1
  return `${prefix}-${String(counter).padStart(4, '0')}`
}

function log(overrides: Partial<SetLog> = {}): SetLog {
  const feedback: SetFeedback | null = overrides.feedback ?? 'as_planned'
  return {
    id: id(),
    userId: 'u1',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    deletedAt: null,
    sessionId: 's1',
    exerciseId: 'BRU-001',
    exerciseName: 'Bankdrücken',
    orderIndex: 0,
    setNumber: 1,
    isWarmup: false,
    prescribedWeightKg: 60,
    prescribedReps: 8,
    prescribedSeconds: null,
    prescribedRir: 2,
    actualWeightKg: 60,
    actualReps: 8,
    actualSeconds: null,
    feedback,
    rirDelta: feedback === null ? null : RIR_DELTA[feedback],
    abandoned: false,
    loggedAt: '2026-08-01T10:00:00.000Z',
    deviceId: 'd1',
    supersedesId: null,
    ...overrides,
  }
}

function session(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: id('session'),
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
    planned: [],
    sessionFeeling: 2,
    notes: null,
    ...overrides,
  }
}

describe('resolveSetLogs — Korrekturketten auflösen', () => {
  it('behält einen unkorrigierten Satz', () => {
    const only = log()
    expect(resolveSetLogs([only]).map((l) => l.id)).toEqual([only.id])
  })

  it('verwirft den korrigierten Satz und behält die Korrektur', () => {
    // Der Kern der append-only Ablage: Ohne dieses Verhalten würde ein
    // korrigierter Satz doppelt in Volumen und Zielerreichung eingehen.
    const original = log({ actualReps: 8 })
    const correction = log({ actualReps: 6, supersedesId: original.id })

    const resolved = resolveSetLogs([original, correction])
    expect(resolved).toHaveLength(1)
    expect(resolved[0].id).toBe(correction.id)
    expect(resolved[0].actualReps).toBe(6)
  })

  it('löst eine mehrstufige Korrekturkette auf', () => {
    const first = log({ actualReps: 8 })
    const second = log({ actualReps: 7, supersedesId: first.id })
    const third = log({ actualReps: 5, supersedesId: second.id })

    const resolved = resolveSetLogs([first, second, third])
    expect(resolved).toHaveLength(1)
    expect(resolved[0].actualReps).toBe(5)
  })

  it('ist unabhängig von der Eingabereihenfolge', () => {
    const original = log({ actualReps: 8 })
    const correction = log({ actualReps: 6, supersedesId: original.id })
    // Beim Nachladen aus der Cloud kann die Korrektur zuerst ankommen.
    const resolved = resolveSetLogs([correction, original])
    expect(resolved.map((l) => l.actualReps)).toEqual([6])
  })

  it('verwirft weich gelöschte Sätze', () => {
    const kept = log()
    const removed = log({ deletedAt: '2026-08-01T12:00:00.000Z' })
    expect(resolveSetLogs([kept, removed]).map((l) => l.id)).toEqual([kept.id])
  })

  it('sortiert nach Übungsreihenfolge und Satznummer', () => {
    const logs = [
      log({ orderIndex: 1, setNumber: 2 }),
      log({ orderIndex: 0, setNumber: 2 }),
      log({ orderIndex: 1, setNumber: 1 }),
      log({ orderIndex: 0, setNumber: 1 }),
    ]
    expect(resolveSetLogs(logs).map((l) => `${l.orderIndex}.${l.setNumber}`)).toEqual([
      '0.1',
      '0.2',
      '1.1',
      '1.2',
    ])
  })
})

describe('toOutcome — Vorgabe und Realität trennen', () => {
  it('nutzt das tatsächlich bewegte Gewicht, nicht die Vorgabe', () => {
    // Gerät besetzt oder Kreis-1-Korrektur: Für e1RM und Volumenlast zählt
    // ausschließlich, was wirklich auf der Stange lag.
    const outcome = toOutcome(log({ prescribedWeightKg: 60, actualWeightKg: 65 }))
    expect(outcome.weightKg).toBe(65)
  })

  it('fällt auf die Vorgabe zurück, wenn kein Ist-Gewicht erfasst wurde', () => {
    expect(toOutcome(log({ actualWeightKg: null })).weightKg).toBe(60)
  })
})

describe('analyzeSession — Auswertung einer Einheit', () => {
  it('gruppiert nach Übung und bewertet jede einzeln', () => {
    const logs = [
      log({ exerciseId: 'BRU-001', orderIndex: 0, setNumber: 1 }),
      log({ exerciseId: 'BRU-001', orderIndex: 0, setNumber: 2 }),
      log({ exerciseId: 'BRU-001', orderIndex: 0, setNumber: 3, actualReps: 5 }),
      log({ exerciseId: 'RUE-001', exerciseName: 'Rudern', orderIndex: 1, setNumber: 1 }),
      log({ exerciseId: 'RUE-001', exerciseName: 'Rudern', orderIndex: 1, setNumber: 2 }),
    ]

    const { exercises } = analyzeSession(logs)
    expect(exercises).toHaveLength(2)
    expect(exercises[0].exerciseId).toBe('BRU-001')
    expect(exercises[0].status).toBe('VERFEHLT')
    expect(exercises[0].workingSets).toBe(3)
    expect(exercises[1].exerciseName).toBe('Rudern')
    expect(exercises[1].status).toBe('ERFUELLT')
  })

  it('schließt Aufwärmsätze aus', () => {
    const logs = [
      log({ isWarmup: true, actualWeightKg: 20, actualReps: 10, setNumber: 0 }),
      log({ setNumber: 1 }),
      log({ setNumber: 2 }),
    ]
    const { exercises } = analyzeSession(logs)
    expect(exercises[0].workingSets).toBe(2)
    // 2 × 60 kg × 8 Wdh = 960; die 20 kg des Aufwärmsatzes fehlen zu Recht.
    expect(exercises[0].volumeLoad).toBe(960)
  })

  it('zählt einen korrigierten Satz nur einmal', () => {
    const original = log({ setNumber: 1, actualReps: 8 })
    const logs = [
      original,
      log({ setNumber: 1, actualReps: 6, supersedesId: original.id }),
      log({ setNumber: 2 }),
    ]
    const { exercises } = analyzeSession(logs)
    expect(exercises[0].workingSets).toBe(2)
    expect(exercises[0].volumeLoad).toBe(60 * 6 + 60 * 8)
  })

  it('leitet die Einheits-Qualität aus allen Übungen ab', () => {
    const strong = (exerciseId: string, orderIndex: number) =>
      [1, 2, 3].map((setNumber) =>
        log({
          exerciseId,
          orderIndex,
          setNumber,
          actualReps: 10,
          feedback: 'more_left',
        }),
      )

    const { quality } = analyzeSession([...strong('A', 0), ...strong('B', 1)])
    expect(quality.verdict).toBe('zu_leicht')
    expect(quality.allowBroadIncrease).toBe(true)
  })

  it('sortiert die Übungen in Trainingsreihenfolge', () => {
    const logs = [
      log({ exerciseId: 'C', orderIndex: 2 }),
      log({ exerciseId: 'A', orderIndex: 0 }),
      log({ exerciseId: 'B', orderIndex: 1 }),
    ]
    expect(analyzeSession(logs).exercises.map((e) => e.exerciseId)).toEqual(['A', 'B', 'C'])
  })

  it('kommt mit einer leeren Einheit zurecht', () => {
    const { exercises, quality } = analyzeSession([])
    expect(exercises).toEqual([])
    expect(quality.allowVolumeIncrease).toBe(false)
  })
})

describe('exerciseHistory — Verlauf über mehrere Einheiten', () => {
  it('gibt die Status in zeitlicher Reihenfolge zurück, älteste zuerst', () => {
    const first = session({ completedAt: '2026-08-01T11:00:00.000Z' })
    const second = session({ completedAt: '2026-08-04T11:00:00.000Z' })

    const history = exerciseHistory({
      exerciseId: 'BRU-001',
      sessions: [second, first], // absichtlich verdreht
      logsBySession: new Map([
        [first.id, [log({ sessionId: first.id, actualReps: 5 })]],
        [second.id, [log({ sessionId: second.id })]],
      ]),
    })

    expect(history.attempts.map((a) => a.status)).toEqual(['VERFEHLT', 'ERFUELLT'])
  })

  it('ignoriert nicht abgeschlossene Einheiten', () => {
    const done = session({ completedAt: '2026-08-01T11:00:00.000Z' })
    const skipped = session({ status: 'skipped', completedAt: '2026-08-04T11:00:00.000Z' })
    const active = session({ status: 'active', completedAt: null })

    const history = exerciseHistory({
      exerciseId: 'BRU-001',
      sessions: [done, skipped, active],
      logsBySession: new Map([
        [done.id, [log({ sessionId: done.id })]],
        [skipped.id, [log({ sessionId: skipped.id, actualReps: 3 })]],
        [active.id, [log({ sessionId: active.id, actualReps: 3 })]],
      ]),
    })

    expect(history.attempts.map((a) => a.status)).toEqual(['ERFUELLT'])
  })

  it('überspringt Einheiten ohne diese Übung', () => {
    const withIt = session({ completedAt: '2026-08-01T11:00:00.000Z' })
    const without = session({ completedAt: '2026-08-04T11:00:00.000Z' })

    const history = exerciseHistory({
      exerciseId: 'BRU-001',
      sessions: [withIt, without],
      logsBySession: new Map([
        [withIt.id, [log({ sessionId: withIt.id })]],
        [without.id, [log({ sessionId: without.id, exerciseId: 'BEI-001' })]],
      ]),
    })

    expect(history.attempts.map((a) => a.status)).toHaveLength(1)
  })

  it('begrenzt die Historie auf die letzten Einheiten', () => {
    const sessions = Array.from({ length: 12 }, (_, index) =>
      session({ completedAt: `2026-08-${String(index + 1).padStart(2, '0')}T11:00:00.000Z` }),
    )
    const logsBySession = new Map(
      sessions.map((s) => [s.id, [log({ sessionId: s.id })]] as const),
    )

    const history = exerciseHistory({
      exerciseId: 'BRU-001',
      sessions,
      logsBySession,
      limit: 3,
    })

    expect(history.attempts.map((a) => a.status)).toHaveLength(3)
    expect(history.e1rms).toHaveLength(3)
  })

  it('liefert den e1RM-Verlauf für die Stagnationsprüfung', () => {
    const first = session({ completedAt: '2026-08-01T11:00:00.000Z' })
    const second = session({ completedAt: '2026-08-04T11:00:00.000Z' })

    const history = exerciseHistory({
      exerciseId: 'BRU-001',
      sessions: [first, second],
      logsBySession: new Map([
        [first.id, [log({ sessionId: first.id, actualWeightKg: 60, actualReps: 8 })]],
        [second.id, [log({ sessionId: second.id, actualWeightKg: 65, actualReps: 8 })]],
      ]),
    })

    expect(history.e1rms).toEqual([76, 82.3])
  })

  it('gibt eine leere Historie zurück, wenn nichts vorliegt', () => {
    const history = exerciseHistory({
      exerciseId: 'BRU-001',
      sessions: [],
      logsBySession: new Map(),
    })
    expect(history.attempts.map((a) => a.status)).toEqual([])
  })
})
