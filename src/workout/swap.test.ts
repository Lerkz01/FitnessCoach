import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { exerciseById } from '../data'
import { closeLocalDb, listRecords } from '../data/db'
import { newId, nowIso } from '../domain/ids'
import type {
  PlannedExercise,
  SetLog,
  StrengthReference,
  UserProfile,
  WorkoutSession,
} from '../domain/records'
import type { Exercise } from '../types'
import { prescriptionForSwap, swapExercise } from './swap'

function ex(id: string): Exercise {
  const found = exerciseById.get(id)
  if (!found) throw new Error(`Übung ${id} fehlt`)
  return found
}

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'p1',
    userId: 'u1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    deletedAt: null,
    displayName: 'Luca',
    sex: 'male',
    birthYear: 1998,
    heightCm: 183,
    goal: 'muscle',
    targetWeightKg: null,
    bodyFatBucket: 'mid',
    priorityMuscles: [],
    level: 'intermediate',
    trainingYears: '2to5y',
    knowsRir: true,
    trainingDays: ['mon'],
    sessionMinutes: 75,
    dailyActivity: 'light',
    injuries: [],
    blacklistedExerciseIds: [],
    disabledEquipmentIds: [],
    checkinWeekday: 'sun',
    intensity: 'demanding',
    feedbackStyle: 'rir',
    onboardingCompletedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

const REFERENZEN: StrengthReference[] = [
  {
    id: 'r1',
    userId: 'u1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    deletedAt: null,
    exerciseId: 'BRU-001',
    pattern: 'horizontal_push',
    weightKg: 80,
    reps: 5,
    recordedAt: '2026-08-01T00:00:00.000Z',
  },
]

function planned(overrides: Partial<PlannedExercise> = {}): PlannedExercise {
  return {
    exerciseId: 'BRU-001',
    exerciseName: 'Langhantel Bankdrücken flach',
    orderIndex: 0,
    sets: 4,
    targetReps: 6,
    repRangeMin: 5,
    repRangeMax: 8,
    targetSeconds: null,
    targetRir: 2,
    restSeconds: 180,
    weightKg: 72.5,
    warmups: [{ weightKg: 37.5, reps: 8 }],
    selectionReason: 'Schwere Grundübung',
    ...overrides,
  }
}

function session(exercises: PlannedExercise[]): WorkoutSession {
  const at = nowIso()
  return {
    id: newId(),
    userId: 'u1',
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    planId: null,
    label: 'Oberkörper A',
    scheduledFor: '2026-08-10',
    startedAt: at,
    completedAt: null,
    status: 'active',
    planned: exercises,
    sessionFeeling: null,
    notes: null,
  }
}

function basis() {
  return {
    profile: profile(),
    references: REFERENZEN,
    bodyweightKg: 84,
    calibrationWeek: false,
    previousSessions: [] as WorkoutSession[],
    logsBySession: new Map<string, SetLog[]>(),
  }
}

let userId: string
beforeEach(async () => {
  if (userId) await closeLocalDb(userId)
  userId = newId()
})

// ────────────────────────────────────────────────────────────────────

describe('prescriptionForSwap — die Aufgabe des Platzes bleibt', () => {
  it('übernimmt Sätze, Wiederholungen, RIR und Pause unverändert', () => {
    // Der Übungsplatz hat eine Aufgabe im Wochenvolumen. Die ändert sich
    // nicht dadurch, dass ein anderes Gerät benutzt wird.
    const original = planned()
    const { planned: neu } = prescriptionForSwap({
      original,
      replacement: ex('BRU-004'),
      ...basis(),
    })

    expect(neu.sets).toBe(original.sets)
    expect(neu.targetReps).toBe(original.targetReps)
    expect(neu.repRangeMin).toBe(original.repRangeMin)
    expect(neu.repRangeMax).toBe(original.repRangeMax)
    expect(neu.targetRir).toBe(original.targetRir)
    expect(neu.restSeconds).toBe(original.restSeconds)
    expect(neu.orderIndex).toBe(original.orderIndex)
  })

  it('setzt Kennung und Name der Ersatzübung', () => {
    const ersatz = ex('BRU-004')
    const { planned: neu } = prescriptionForSwap({
      original: planned(),
      replacement: ersatz,
      ...basis(),
    })
    expect(neu.exerciseId).toBe(ersatz.id)
    expect(neu.exerciseName).toBe(ersatz.name)
  })

  it('rechnet das Gewicht neu, statt es zu übernehmen', () => {
    // 72,5 kg Langhantelbankdrücken sind nicht 72,5 kg PRO HAND an der
    // Kurzhantel. Eine Variante derselben Langhantelübung („breiter Griff")
    // wäre als Prüfung untauglich — die bekommt zu Recht ähnliches Gewicht.
    const { planned: neu, weightSource } = prescriptionForSwap({
      original: planned({ weightKg: 72.5 }),
      replacement: ex('BRU-005'),
      ...basis(),
    })
    expect(weightSource).toBe('estimate')
    expect(neu.weightKg).not.toBe(72.5)
    expect(neu.weightKg).toBeGreaterThan(0)
    // Pro Hand deutlich weniger als die Langhantel.
    expect(neu.weightKg).toBeLessThan(72.5)
  })

  it('nimmt ein Gewicht aus der HISTORIE, wenn es eines gibt', () => {
    const ersatz = ex('BRU-005')
    const frueher = session([
      planned({ exerciseId: ersatz.id, exerciseName: ersatz.name, weightKg: 26 }),
    ])
    const abgeschlossen: WorkoutSession = {
      ...frueher,
      status: 'completed',
      completedAt: '2026-08-05T11:00:00.000Z',
    }

    const logs: SetLog[] = [1, 2, 3].map((setNumber) => ({
      id: newId(),
      userId: 'u1',
      createdAt: '2026-08-05T10:00:00.000Z',
      updatedAt: '2026-08-05T10:00:00.000Z',
      deletedAt: null,
      sessionId: abgeschlossen.id,
      exerciseId: ersatz.id,
      exerciseName: ersatz.name,
      orderIndex: 0,
      setNumber,
      isWarmup: false,
      prescribedWeightKg: 26,
      prescribedReps: 6,
      prescribedSeconds: null,
      prescribedRir: 2,
      actualWeightKg: 26,
      actualReps: 6,
      actualSeconds: null,
      feedback: 'as_planned',
      rirDelta: 0,
      abandoned: false,
      loggedAt: '2026-08-05T10:00:00.000Z',
      deviceId: 'd1',
      supersedesId: null,
    }))

    const { planned: neu, weightSource } = prescriptionForSwap({
      original: planned(),
      replacement: ersatz,
      ...basis(),
      previousSessions: [abgeschlossen],
      logsBySession: new Map([[abgeschlossen.id, logs]]),
    })

    // Ein echter Wert schlägt jede Schätzung.
    expect(weightSource).toBe('history')
    expect(neu.weightKg).toBe(26)
  })

  it('rechnet die Aufwärmsätze neu, statt die alten zu behalten', () => {
    const original = planned({ warmups: [{ weightKg: 37.5, reps: 8 }] })
    const { planned: neu } = prescriptionForSwap({
      original,
      replacement: ex('BRU-004'),
      ...basis(),
    })
    // Aufwärmsätze hängen am Arbeitsgewicht. Die alten wären falsch.
    for (const w of neu.warmups) {
      expect(w.weightKg).not.toBe(37.5)
      expect(w.weightKg).toBeLessThan(neu.weightKg ?? Infinity)
    }
  })

  it('vermerkt im Grund, dass das Gerät besetzt war', () => {
    const { planned: neu } = prescriptionForSwap({
      original: planned(),
      replacement: ex('BRU-004'),
      ...basis(),
    })
    expect(neu.selectionReason).toContain('besetzt')
    expect(neu.selectionReason).toContain('Langhantel Bankdrücken flach')
  })

  it('kommt mit einer Körpergewichtsübung als Ersatz zurecht', () => {
    const koerper = ex('BRU-032') // Liegestütze
    const { planned: neu, weightSource } = prescriptionForSwap({
      original: planned(),
      replacement: koerper,
      ...basis(),
    })
    expect(weightSource).toBe('none')
    expect(neu.weightKg).toBeNull()
    expect(neu.warmups).toEqual([])
  })
})

describe('swapExercise — schreiben', () => {
  it('ersetzt genau den betroffenen Platz in der Einheit', async () => {
    const a = planned({ orderIndex: 0 })
    const b = planned({
      exerciseId: 'RUE-001',
      exerciseName: 'Rudern',
      orderIndex: 1,
      weightKg: 60,
    })
    const s = session([a, b])

    const ergebnis = await swapExercise({
      userId,
      session: s,
      original: a,
      replacement: ex('BRU-004'),
      ...basis(),
    })

    expect(ergebnis.session.planned).toHaveLength(2)
    expect(ergebnis.session.planned[0].exerciseId).toBe('BRU-004')
    // Der andere Platz bleibt unberührt.
    expect(ergebnis.session.planned[1].exerciseId).toBe('RUE-001')
  })

  it('tauscht über den Platz, nicht über die Übungs-Kennung', async () => {
    // Käme dieselbe Übung zweimal vor, würde ein Tausch über die Kennung
    // beide Plätze ersetzen.
    const a = planned({ orderIndex: 0 })
    const b = planned({ orderIndex: 1, weightKg: 60 })
    const s = session([a, b])

    const ergebnis = await swapExercise({
      userId,
      session: s,
      original: a,
      replacement: ex('BRU-004'),
      ...basis(),
    })

    expect(ergebnis.session.planned[0].exerciseId).toBe('BRU-004')
    expect(ergebnis.session.planned[1].exerciseId).toBe('BRU-001')
  })

  it('schreibt die geänderte Einheit weg', async () => {
    const a = planned()
    const s = session([a])
    await swapExercise({
      userId,
      session: s,
      original: a,
      replacement: ex('BRU-004'),
      ...basis(),
    })

    const [gespeichert] = await listRecords(userId, 'sessions')
    expect(gespeichert.planned[0].exerciseId).toBe('BRU-004')
  })

  it('protokolliert den Tausch samt Begründung', async () => {
    const a = planned()
    const s = session([a])
    await swapExercise({
      userId,
      session: s,
      original: a,
      replacement: ex('BRU-004'),
      ...basis(),
    })

    const [eintrag] = await listRecords(userId, 'adjustments')
    expect(eintrag.scope).toBe('exercise_rotation')
    expect(eintrag.circle).toBe(1)
    expect(eintrag.before).toBe('Langhantel Bankdrücken flach')
    expect(eintrag.after).toBe(ex('BRU-004').name)
    expect(eintrag.reason).toContain('besetzt')
    expect(eintrag.applied).toBe(true)
    // Der Nutzer hat selbst gewählt — das ist Zustimmung.
    expect(eintrag.userAccepted).toBe(true)
  })

  it('meldet die Geräte der BESETZTEN Übung als gesperrt', async () => {
    // Nicht die der Ersatzübung — deren Gerät ist gerade das freie.
    const a = planned()
    const s = session([a])
    const ergebnis = await swapExercise({
      userId,
      session: s,
      original: a,
      replacement: ex('BRU-004'),
      ...basis(),
    })
    expect(ergebnis.blockedEquipmentIds).toContain('FRE-04') // Flachbank
    expect(ergebnis.blockedEquipmentIds).not.toContain('FRE-01') // Kurzhanteln
  })
})
