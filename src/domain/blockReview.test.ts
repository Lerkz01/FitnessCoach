import { describe, expect, it } from 'vitest'
import {
  BLOCK_WEEKS,
  blockReview,
  blockReviewDue,
  blockReviewUseful,
  type BlockReviewInput,
} from './blockReview'
import { newId, nowIso } from './ids'
import { baseFields, type SetLog, type UserProfile, type WorkoutSession } from './records'

const START = '2026-07-06' // ein Montag
const TODAY = '2026-08-10' // fünf Wochen später

function profile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    ...baseFields('u', newId(), nowIso()),
    displayName: 'Test',
    sex: 'male',
    birthYear: 2000,
    heightCm: 180,
    goal: 'muscle',
    targetWeightKg: null,
    bodyFatBucket: null,
    priorityMuscles: [],
    level: 'intermediate',
    trainingYears: '2to5y',
    knowsRir: true,
    trainingDays: ['mon', 'wed', 'fri', 'sat'],
    sessionMinutes: 60,
    dailyActivity: 'light',
    injuries: [],
    blacklistedExerciseIds: [],
    disabledEquipmentIds: [],
    checkinWeekday: 'sun',
    intensity: 'demanding',
    feedbackStyle: 'rir',
    onboardingCompletedAt: nowIso(),
    ...over,
  }
}

/** Eine abgeschlossene Einheit mit einer echten Dauer. */
function session(input: {
  id: string
  day: string
  minutes: number
  status?: WorkoutSession['status']
}): WorkoutSession {
  const start = `${input.day}T18:00:00.000Z`
  const end = new Date(Date.parse(start) + input.minutes * 60000).toISOString()
  return {
    ...baseFields('u', input.id, start),
    planId: null,
    kind: 'plan',
    label: 'Ganzkörper',
    scheduledFor: input.day,
    startedAt: start,
    completedAt: input.status === 'skipped' ? null : end,
    status: input.status ?? 'completed',
    planned: [],
    sessionFeeling: null,
    notes: null,
  }
}

/** Ein Arbeitssatz. `weightKg` steuert, ob sich etwas verbessert. */
function log(input: {
  sessionId: string
  exerciseId: string
  setNumber: number
  weightKg: number
  reps: number
}): SetLog {
  return {
    ...baseFields('u', newId(), nowIso()),
    sessionId: input.sessionId,
    exerciseId: input.exerciseId,
    exerciseName: input.exerciseId,
    orderIndex: 0,
    setNumber: input.setNumber,
    isWarmup: false,
    prescribedWeightKg: input.weightKg,
    prescribedReps: input.reps,
    prescribedSeconds: null,
    prescribedRir: 2,
    actualWeightKg: input.weightKg,
    actualReps: input.reps,
    actualSeconds: null,
    feedback: 'as_planned',
    rirDelta: 0,
    abandoned: false,
    loggedAt: nowIso(),
    deviceId: 'test',
    supersedesId: null,
  } as SetLog
}

function input(over: Partial<BlockReviewInput> = {}): BlockReviewInput {
  return {
    profile: profile(),
    sessions: [],
    setLogs: [],
    checkins: [],
    volumeTargets: { Brust: 13, Lat: 13, Quadrizeps: 13 },
    blockStartMonday: START,
    today: TODAY,
    // Eine Übung, ein Muskel — damit die Tests über das prüfen, was sie
    // prüfen wollen, und nicht über die Muskel-Taxonomie.
    volumeForExercise: (exerciseId, sets) =>
      exerciseId === 'BRU-001'
        ? { Brust: sets }
        : exerciseId === 'RUE-001'
          ? { Lat: sets }
          : { Quadrizeps: sets },
    ...over,
  }
}

/** Baut `count` Einheiten über den Block, mit gleichmäßigem Abstand. */
function sessionsOverBlock(count: number, minutes: number): WorkoutSession[] {
  const out: WorkoutSession[] = []
  for (let index = 0; index < count; index++) {
    const day = new Date(Date.parse(`${START}T00:00:00.000Z`) + index * 2 * 86400000)
    out.push({
      ...session({
        id: `s${index}`,
        day: day.toISOString().slice(0, 10),
        minutes,
      }),
    })
  }
  return out
}

describe('blockReviewDue', () => {
  it('ist nach BLOCK_WEEKS fällig', () => {
    expect(blockReviewDue({ blockStartMonday: START, today: TODAY })).toBe(true)
  })

  it('ist vorher nicht fällig', () => {
    expect(blockReviewDue({ blockStartMonday: START, today: '2026-07-27' })).toBe(false)
  })

  it('rechnet mit ganzen Wochen ab Montag', () => {
    // Mitten in der fünften Woche ist der Block noch nicht um.
    const mitte = new Date(Date.parse(`${START}T00:00:00.000Z`) + (BLOCK_WEEKS * 7 - 3) * 86400000)
    expect(
      blockReviewDue({
        blockStartMonday: START,
        today: mitte.toISOString().slice(0, 10),
      }),
    ).toBe(false)
  })
})

describe('blockReview — Einhaltung', () => {
  it('meldet einen Plan, der zu viele Tage hat', () => {
    // 4 Tage × 5 Wochen = 20 erwartet, 8 gemacht → 40 %.
    const review = blockReview(input({ sessions: sessionsOverBlock(8, 55) }))
    expect(review.sessionsExpected).toBe(20)
    expect(review.sessionsDone).toBe(8)
    const befund = review.findings.find((f) => f.kind === 'adherence')
    expect(befund?.severity).toBe('action')
    // Der Vorschlag muss eine ZAHL nennen, nicht „trainiere mehr".
    expect(befund?.suggestion).toMatch(/Trainingstage im Profil auf 2/)
  })

  it('meldet nichts, wenn der Plan eingehalten wird', () => {
    const review = blockReview(input({ sessions: sessionsOverBlock(18, 55) }))
    expect(review.findings.find((f) => f.kind === 'adherence')).toBeUndefined()
  })

  it('zählt abgebrochene Einheiten nicht als gemacht', () => {
    const sessions = [
      ...sessionsOverBlock(4, 55),
      session({ id: 'x1', day: '2026-07-20', minutes: 30, status: 'skipped' }),
      session({ id: 'x2', day: '2026-07-21', minutes: 30, status: 'skipped' }),
    ]
    const review = blockReview(input({ sessions }))
    expect(review.sessionsDone).toBe(4)
  })

  it('ignoriert Einheiten außerhalb des Blocks', () => {
    const review = blockReview(
      input({
        sessions: [
          ...sessionsOverBlock(6, 55),
          // Zwei Monate vor dem Block.
          session({ id: 'alt1', day: '2026-05-04', minutes: 55 }),
          session({ id: 'alt2', day: '2026-05-06', minutes: 55 }),
        ],
      }),
    )
    expect(review.sessionsDone).toBe(6)
  })
})

describe('blockReview — Dauer', () => {
  it('meldet zu lange Einheiten mit einem konkreten Vorschlag', () => {
    // 90 Minuten bei eingestellten 60.
    const review = blockReview(input({ sessions: sessionsOverBlock(18, 90) }))
    expect(review.medianMinutes).toBe(90)
    const befund = review.findings.find((f) => f.kind === 'duration')
    expect(befund?.severity).toBe('action')
    expect(befund?.suggestion).toMatch(/auf 90 Minuten/)
  })

  it('akzeptiert einen Aufschlag für Umbauen und Warten', () => {
    // 66 Minuten bei 60 — innerhalb der Toleranz von 15 %.
    const review = blockReview(input({ sessions: sessionsOverBlock(18, 66) }))
    expect(review.findings.find((f) => f.kind === 'duration')).toBeUndefined()
  })

  it('lässt sich von einer vergessenen App nicht täuschen', () => {
    // Median statt Mittelwert: 17 normale Einheiten und eine, bei der die App
    // fünf Stunden offen lag. Der Mittelwert läge bei 71 Minuten und würde
    // einen Planungsfehler behaupten, den es nicht gibt.
    const sessions = [
      ...sessionsOverBlock(17, 55),
      session({ id: 'vergessen', day: '2026-08-03', minutes: 300 }),
    ]
    const review = blockReview(input({ sessions }))
    expect(review.medianMinutes).toBe(55)
    expect(review.findings.find((f) => f.kind === 'duration')).toBeUndefined()
  })

  it('sagt auch, wenn viel Zeit übrig ist', () => {
    const review = blockReview(input({ sessions: sessionsOverBlock(18, 35) }))
    const befund = review.findings.find((f) => f.kind === 'duration')
    // Kein Handlungsdruck — nur ein Angebot.
    expect(befund?.severity).toBe('info')
    expect(befund?.suggestion).toMatch(/Wenn dir die/)
  })

  it('braucht mindestens drei Einheiten für die Kurz-Meldung', () => {
    const review = blockReview(input({ sessions: sessionsOverBlock(2, 20) }))
    expect(
      review.findings.find((f) => f.kind === 'duration' && f.severity === 'info'),
    ).toBeUndefined()
  })
})

describe('blockReview — Fortschritt', () => {
  /** Baut Sätze, bei denen das Gewicht steigt oder nicht. */
  function logsFor(sessions: readonly WorkoutSession[], exerciseId: string, steigt: boolean) {
    return sessions.flatMap((entry, index) =>
      [1, 2, 3].map((setNumber) =>
        log({
          sessionId: entry.id,
          exerciseId,
          setNumber,
          weightKg: steigt ? 50 + index * 2.5 : 50,
          reps: 8,
        }),
      ),
    )
  }

  it('erkennt einen Muskel, der im Block nicht stärker wurde', () => {
    const sessions = sessionsOverBlock(18, 55)
    const review = blockReview(
      input({
        sessions,
        setLogs: [
          ...logsFor(sessions, 'BRU-001', false),
          ...logsFor(sessions, 'RUE-001', true),
        ],
      }),
    )
    const befund = review.findings.find((f) => f.kind === 'stagnation')
    expect(befund).toBeDefined()
    expect(befund?.detail).toMatch(/Brust/)
    expect(befund?.detail).not.toMatch(/Lat/)
  })

  it('nennt geplantes UND geleistetes Volumen — sonst ist der Befund nicht deutbar', () => {
    // DAS ist der Kern: „Brust stagniert" allein sagt nicht, ob das Volumen
    // zu niedrig war oder die Einheiten ausgefallen sind. Erst beide Zahlen
    // machen daraus eine Entscheidung.
    const sessions = sessionsOverBlock(18, 55)
    const review = blockReview(
      input({ sessions, setLogs: logsFor(sessions, 'BRU-001', false) }),
    )
    const befund = review.findings.find((f) => f.kind === 'stagnation')
    expect(befund?.detail).toMatch(/geplant \d+ Sätze\/Woche/)
    expect(befund?.detail).toMatch(/geleistet [\d.]+/)
  })

  it('meldet Fortschritt als eigenen Befund', () => {
    const sessions = sessionsOverBlock(18, 55)
    const review = blockReview(
      input({ sessions, setLogs: logsFor(sessions, 'BRU-001', true) }),
    )
    const befund = review.findings.find((f) => f.kind === 'progress')
    expect(befund?.severity).toBe('info')
    expect(befund?.suggestion).toBeNull()
  })

  it('findet freies Volumen: wenig geleistet und trotzdem stärker', () => {
    // Nur zwei Einheiten mit dieser Übung, aber steigend. Geplant sind 13
    // Sätze pro Woche, geleistet 6 Sätze in 5 Wochen — also 1,2. Das ist
    // der interessante Fall: Der Erhaltungsbedarf ist niedriger als die
    // Tabelle annimmt, und keine Formel könnte das wissen.
    const alle = sessionsOverBlock(18, 55)
    const zwei = alle.slice(0, 2)
    const review = blockReview(
      input({ sessions: alle, setLogs: logsFor(zwei, 'BRU-001', true) }),
    )
    const befund = review.findings.find((f) => f.kind === 'maintenance')
    expect(befund).toBeDefined()
    expect(befund?.detail).toMatch(/trotzdem stärker geworden/)
  })
})

describe('blockReview — kein Rauschen', () => {
  it('sagt „der Plan passt", wenn nichts zu entscheiden ist', () => {
    const sessions = sessionsOverBlock(18, 58)
    const review = blockReview(
      input({
        sessions,
        setLogs: sessions.flatMap((entry, index) =>
          ['BRU-001', 'RUE-001', 'QUA-001'].flatMap((exerciseId) =>
            [1, 2, 3].map((setNumber) =>
              log({
                sessionId: entry.id,
                exerciseId,
                setNumber,
                weightKg: 50 + index * 2.5,
                reps: 8,
              }),
            ),
          ),
        ),
      }),
    )
    expect(review.findings[0].kind).toBe('ok')
    expect(review.findings.every((f) => f.severity === 'info')).toBe(true)
  })

  it('setzt „der Plan passt" NICHT, wenn es etwas zu tun gibt', () => {
    const review = blockReview(input({ sessions: sessionsOverBlock(6, 95) }))
    expect(review.findings.find((f) => f.kind === 'ok')).toBeUndefined()
    expect(review.findings.some((f) => f.severity === 'action')).toBe(true)
  })

  it('kommt ohne jede Einheit klar', () => {
    const review = blockReview(input())
    expect(review.sessionsDone).toBe(0)
    expect(review.medianMinutes).toBeNull()
    expect(review.findings.length).toBeGreaterThan(0)
  })
})

describe('blockReviewUseful', () => {
  it('braucht Datenlage, um überhaupt etwas zu sagen', () => {
    expect(blockReviewUseful(0)).toBe(false)
    expect(blockReviewUseful(3)).toBe(false)
    expect(blockReviewUseful(4)).toBe(true)
  })
})
