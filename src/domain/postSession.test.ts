import { describe, expect, it } from 'vitest'
import { equipmentById } from '../data'
import type { Equipment } from '../types'
import { analyzePostSession, type PostSessionInput } from './postSession'
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

function session(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
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
    planned: [planned()],
    sessionFeeling: 2,
    notes: null,
    ...overrides,
  }
}

function log(sessionId: string, overrides: Partial<SetLog> = {}): SetLog {
  const feedback: SetFeedback | null =
    overrides.feedback === undefined ? 'as_planned' : overrides.feedback
  return {
    id: nextId('set'),
    userId: 'u1',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    deletedAt: null,
    sessionId,
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

/** Drei gleiche Arbeitssätze für eine Einheit. */
function threeSets(sessionId: string, overrides: Partial<SetLog> = {}): SetLog[] {
  return [1, 2, 3].map((setNumber) => log(sessionId, { setNumber, ...overrides }))
}

function input(overrides: Partial<PostSessionInput> = {}): PostSessionInput {
  const current = overrides.session ?? session()
  return {
    session: current,
    logs: threeSets(current.id),
    previousSessions: [],
    logsBySession: new Map(),
    level: 'intermediate',
    goal: 'muscle',
    calibrationWeek: false,
    equipmentForExercise: () => BARBELL(),
    ...overrides,
  }
}

// ────────────────────────────────────────────────────────────────────

describe('analyzePostSession — SOFORT wirkende Änderungen', () => {
  it('leitet die neue Vorgabe für die nächste Einheit ab', () => {
    const result = analyzePostSession(input())
    expect(result.changed).toHaveLength(1)
    expect(result.changed[0].exerciseName).toBe('Bankdrücken')
    expect(result.changed[0].next.targetReps).toBe(9)
    expect(result.changed[0].reason).toBeTruthy()
  })

  it('bezieht die eben abgeschlossene Einheit in die Bestätigung ein', () => {
    // Eine frühere Einheit war schon übertroffen. Zusammen mit dieser
    // ergibt das die zweite Bestätigung — jetzt darf das Gewicht steigen.
    const previous = session({ completedAt: '2026-07-29T11:00:00.000Z' })
    const current = session({ completedAt: '2026-08-01T11:00:00.000Z' })

    const result = analyzePostSession(
      input({
        session: current,
        logs: threeSets(current.id, { actualReps: 10, feedback: 'more_left' }),
        previousSessions: [previous],
        logsBySession: new Map([
          [previous.id, threeSets(previous.id, { actualReps: 10, feedback: 'more_left' })],
        ]),
      }),
    )

    expect(result.changed[0].next.weightKg).toBe(62.5)
  })

  it('meldet keine Änderung, wenn die Vorgabe gehalten wird', () => {
    const current = session()
    const result = analyzePostSession(
      input({ session: current, logs: threeSets(current.id, { actualReps: 7 }) }),
    )
    expect(result.changed).toHaveLength(0)
  })

  it('ignoriert Übungen, die nicht im Plan der Einheit stehen', () => {
    const current = session({ planned: [] })
    const result = analyzePostSession(input({ session: current, logs: threeSets(current.id) }))
    expect(result.changed).toHaveLength(0)
    // Ausgewertet wird sie trotzdem — nur ohne neue Vorgabe.
    expect(result.exercises).toHaveLength(1)
  })
})

describe('analyzePostSession — GESCHAFFT', () => {
  it('zählt die erledigte Arbeit', () => {
    const result = analyzePostSession(input())
    const completion = result.achieved.find((a) => a.kind === 'completion')
    expect(completion?.text).toContain('3 Arbeitssätze')
  })

  it('meldet einen Rekord beim neuen Bestwert', () => {
    const previous = session({ completedAt: '2026-07-29T11:00:00.000Z' })
    const current = session({ completedAt: '2026-08-01T11:00:00.000Z' })

    const result = analyzePostSession(
      input({
        session: current,
        logs: threeSets(current.id, { actualWeightKg: 65 }),
        previousSessions: [previous],
        logsBySession: new Map([[previous.id, threeSets(previous.id)]]),
      }),
    )

    const record = result.achieved.find((a) => a.kind === 'record')
    expect(record?.text).toContain('neuer Bestwert')
  })

  it('meldet keinen Rekord ohne Vorwert', () => {
    // Die erste Einheit einer Übung ist kein Rekord — sonst wäre alles einer.
    const result = analyzePostSession(input())
    expect(result.achieved.some((a) => a.kind === 'record')).toBe(false)
  })

  it('meldet in der Einmess-Woche keine Rekorde', () => {
    const previous = session({ completedAt: '2026-07-29T11:00:00.000Z' })
    const current = session({ completedAt: '2026-08-01T11:00:00.000Z' })

    const result = analyzePostSession(
      input({
        session: current,
        logs: threeSets(current.id, { actualWeightKg: 80 }),
        previousSessions: [previous],
        logsBySession: new Map([[previous.id, threeSets(previous.id)]]),
        calibrationWeek: true,
      }),
    )

    expect(result.achieved.some((a) => a.kind === 'record')).toBe(false)
  })

  it('vergleicht die Volumenlast nur mit gleichnamigen Einheiten', () => {
    // Ein Unterkörpertag hat naturgemäß mehr Volumenlast — er darf den
    // Vergleich eines Oberkörpertages nicht verfälschen.
    const lowerBody = session({
      label: 'Unterkörper A',
      completedAt: '2026-07-30T11:00:00.000Z',
    })
    const upperBody = session({
      label: 'Oberkörper A',
      completedAt: '2026-07-29T11:00:00.000Z',
    })
    const current = session({ label: 'Oberkörper A', completedAt: '2026-08-01T11:00:00.000Z' })

    const result = analyzePostSession(
      input({
        session: current,
        logs: threeSets(current.id, { actualWeightKg: 65 }),
        previousSessions: [lowerBody, upperBody],
        logsBySession: new Map([
          [lowerBody.id, threeSets(lowerBody.id, { actualWeightKg: 200 })],
          [upperBody.id, threeSets(upperBody.id, { actualWeightKg: 60 })],
        ]),
      }),
    )

    // 65 > 60 → Steigerung gemeldet. Mit dem Unterkörpertag im Schnitt
    // wäre hier fälschlich ein Rückgang herausgekommen.
    expect(result.achieved.some((a) => a.kind === 'volume')).toBe(true)
  })
})

describe('analyzePostSession — BEOBACHTET', () => {
  it('markiert eine stagnierende Übung als Tauschkandidat', () => {
    // Vier Einheiten: die erste war die stärkste, danach kein Bestwert mehr.
    const weights = [70, 60, 60, 60]
    const sessions = weights.map((_, index) =>
      session({ completedAt: `2026-07-0${index + 1}T11:00:00.000Z` }),
    )
    const logsBySession = new Map(
      sessions.map(
        (s, index) =>
          [s.id, threeSets(s.id, { actualWeightKg: weights[index] })] as const,
      ),
    )
    const current = session({ completedAt: '2026-08-01T11:00:00.000Z' })

    const result = analyzePostSession(
      input({
        session: current,
        logs: threeSets(current.id, { actualWeightKg: 60 }),
        previousSessions: sessions,
        logsBySession,
      }),
    )

    expect(result.rotationCandidates).toContain('BRU-001')
    const observation = result.observed.find((o) => o.kind === 'stagnation')
    expect(observation?.consequence).toContain('Check-in')
  })

  it('meldet Ermüdung erst im Trend, nicht nach einer Einheit', () => {
    const single = analyzePostSession(
      input({ logs: threeSets(session().id, { feedback: 'at_limit' }) }),
    )
    expect(single.observed.some((o) => o.kind === 'fatigue')).toBe(false)
  })

  it('erkennt Ermüdung nach drei Einheiten unter Ziel', () => {
    const older = session({ completedAt: '2026-07-27T11:00:00.000Z' })
    const previous = session({ completedAt: '2026-07-29T11:00:00.000Z' })
    const current = session({ completedAt: '2026-08-01T11:00:00.000Z' })

    const result = analyzePostSession(
      input({
        session: current,
        logs: threeSets(current.id, { feedback: 'at_limit' }),
        previousSessions: [older, previous],
        logsBySession: new Map([
          [older.id, threeSets(older.id, { feedback: 'at_limit' })],
          [previous.id, threeSets(previous.id, { feedback: 'at_limit' })],
        ]),
      }),
    )

    const fatigue = result.observed.find((o) => o.kind === 'fatigue')
    expect(fatigue?.consequence).toContain('Entlastungswoche')
  })

  it('verschiebt die Volumenentscheidung ausdrücklich auf den Check-in', () => {
    const current = session()
    const result = analyzePostSession(
      input({ session: current, logs: threeSets(current.id) }),
    )
    const volume = result.observed.find((o) => o.kind === 'volume')
    expect(volume?.consequence).toContain('Check-in')
  })

  it('wertet haltende Kraft bei sinkendem Gewicht als Erfolg', () => {
    const current = session()
    const result = analyzePostSession(
      input({
        session: current,
        logs: threeSets(current.id),
        goal: 'fatloss',
        bodyweightTrendKg: [84, 83.2, 82.5],
      }),
    )
    const progress = result.observed.find((o) => o.kind === 'goal')
    expect(progress?.consequence).toContain('Auf Kurs')
  })

  it('erkennt nachgebende Kraft bei sinkendem Gewicht', () => {
    const current = session()
    const result = analyzePostSession(
      input({
        session: current,
        logs: threeSets(current.id, { actualReps: 4 }),
        goal: 'fatloss',
        bodyweightTrendKg: [84, 83.2, 82.5],
      }),
    )
    const progress = result.observed.find((o) => o.kind === 'goal')
    expect(progress?.consequence).toContain('Defizit')
  })
})

describe('analyzePostSession — Ausreißer dämpfen die Reaktion', () => {
  function withHistory(volumes: number[], currentWeight: number) {
    const sessions = volumes.map((_, index) =>
      session({ completedAt: `2026-07-1${index}T11:00:00.000Z` }),
    )
    const logsBySession = new Map(
      sessions.map(
        (s, index) => [s.id, threeSets(s.id, { actualWeightKg: volumes[index] })] as const,
      ),
    )
    const current = session({ completedAt: '2026-08-01T11:00:00.000Z' })
    return {
      session: current,
      logs: threeSets(current.id, {
        actualWeightKg: currentWeight,
        actualReps: 10,
        feedback: 'more_left' as SetFeedback,
      }),
      previousSessions: sessions,
      logsBySession,
    }
  }

  it('braucht mindestens drei Vergleichseinheiten', () => {
    const result = analyzePostSession(input(withHistory([60, 60], 200)))
    expect(result.outlier).toBe(false)
  })

  it('erkennt eine deutlich abweichende Einheit', () => {
    const result = analyzePostSession(input(withHistory([60, 60, 60, 60], 200)))
    expect(result.outlier).toBe(true)
    const observation = result.observed.find((o) => o.kind === 'outlier')
    expect(observation?.consequence).toContain('vorsichtiger')
  })

  it('verhindert die breite Anhebung bei einem Ausreißer', () => {
    // Alle Übungen übertroffen → normalerweise breite Anhebung. Weil die
    // Einheit aber ein Ausreißer ist, greift nur die normale Progression.
    const result = analyzePostSession(input(withHistory([60, 60, 60, 60], 200)))
    expect(result.quality.allowBroadIncrease).toBe(true)
    expect(result.outlier).toBe(true)
    // Nur +1 Wdh statt Gewichtssprung, weil die Bestätigung noch fehlt.
    expect(result.changed[0].next.weightKg).toBe(60)
    expect(result.changed[0].next.targetReps).toBe(9)
  })

  it('unterdrückt das Deload-Signal bei einem Ausreißer', () => {
    const sessions = [1, 2, 3, 4].map((index) =>
      session({ completedAt: `2026-07-1${index}T11:00:00.000Z` }),
    )
    const logsBySession = new Map(
      sessions.map((s) => [s.id, threeSets(s.id)] as const),
    )
    const current = session({ completedAt: '2026-08-01T11:00:00.000Z' })

    const result = analyzePostSession(
      input({
        session: current,
        // Katastrophale Einheit — aber auch ein klarer Ausreißer.
        logs: threeSets(current.id, { actualReps: 2, actualWeightKg: 20 }),
        previousSessions: sessions,
        logsBySession,
      }),
    )

    expect(result.quality.verdict).toBe('deload_signal')
    expect(result.outlier).toBe(true)
    expect(result.deloadSignal).toBe(false)
  })

  it('lässt das Deload-Signal bei einer typischen schwachen Einheit stehen', () => {
    const current = session()
    const result = analyzePostSession(
      input({ session: current, logs: threeSets(current.id, { actualReps: 3 }) }),
    )
    expect(result.deloadSignal).toBe(true)
  })
})

describe('analyzePostSession — Randfälle', () => {
  it('kommt mit einer Einheit ohne Sätze zurecht', () => {
    const current = session()
    const result = analyzePostSession(input({ session: current, logs: [] }))
    expect(result.exercises).toEqual([])
    expect(result.changed).toEqual([])
    expect(result.achieved).toEqual([])
    expect(result.outlier).toBe(false)
  })

  it('progressiert Körpergewichtsübungen ohne Gerät über die Wiederholungen', () => {
    const current = session({
      planned: [planned({ weightKg: null })],
    })
    const result = analyzePostSession(
      input({
        session: current,
        logs: threeSets(current.id, { actualWeightKg: null, prescribedWeightKg: null }),
        equipmentForExercise: () => null,
      }),
    )
    expect(result.changed[0].next.weightKg).toBeNull()
    expect(result.changed[0].next.targetReps).toBe(9)
  })
})
