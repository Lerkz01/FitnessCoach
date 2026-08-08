import { describe, expect, it } from 'vitest'
import type { VolumeMuscle } from './muscles'
import { RIR_DELTA } from './progression'
import type {
  BodyMetric,
  CheckIn,
  NutritionTarget,
  PlannedExercise,
  SetFeedback,
  SetLog,
  UserProfile,
  WorkoutSession,
} from './records'
import { performancePerMuscle, weeklyReview, type WeeklyReviewInput } from './weeklyReview'

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${String(counter).padStart(4, '0')}`
}

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'p1',
    userId: 'u1',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
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
    trainingDays: ['mon', 'tue', 'thu', 'fri'],
    sessionMinutes: 75,
    dailyActivity: 'light',
    injuries: [],
    blacklistedExerciseIds: [],
    disabledEquipmentIds: [],
    checkinWeekday: 'sun',
    intensity: 'demanding',
    feedbackStyle: 'rir',
    onboardingCompletedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function checkin(overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    id: nextId('checkin'),
    userId: 'u1',
    createdAt: '2026-08-09T09:00:00.000Z',
    updatedAt: '2026-08-09T09:00:00.000Z',
    deletedAt: null,
    weekOf: '2026-08-03',
    weightKgAvg: 84,
    looks: 0,
    energy: 2,
    sleep: 'good',
    joints: 'none',
    motivation: 'normal',
    calorieAdherence: 'good',
    submittedAt: '2026-08-09T09:00:00.000Z',
    notes: null,
    ...overrides,
  }
}

function nutrition(overrides: Partial<NutritionTarget> = {}): NutritionTarget {
  return {
    id: 'n1',
    userId: 'u1',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    deletedAt: null,
    effectiveFrom: '2026-07-01',
    kcal: 3000,
    proteinG: 151,
    fatG: 83,
    carbsG: 412,
    maintenanceKcal: 2700,
    targetRatePercentPerWeek: 0.25,
    reason: 'Aufbau',
    ...overrides,
  }
}

function planned(overrides: Partial<PlannedExercise> = {}): PlannedExercise {
  return {
    exerciseId: 'BRU-001',
    exerciseName: 'Langhantel Bankdrücken flach',
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
  completedAt: string,
): WorkoutSession {
  return {
    id: nextId('session'),
    userId: 'u1',
    createdAt: completedAt,
    updatedAt: completedAt,
    deletedAt: null,
    planId: 'plan1',
    label: 'Oberkörper A',
    scheduledFor: completedAt.slice(0, 10),
    startedAt: completedAt,
    completedAt,
    status: 'completed',
    planned: exercises,
    sessionFeeling: 2,
    notes: null,
  }
}

function logs(
  sessionId: string,
  exercise: PlannedExercise,
  actual: { weightKg: number; reps: number; feedback?: SetFeedback },
): SetLog[] {
  const feedback = actual.feedback ?? 'as_planned'
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
    prescribedSeconds: null,
    prescribedRir: exercise.targetRir,
    actualWeightKg: actual.weightKg,
    actualReps: actual.reps,
    actualSeconds: null,
    feedback,
    rirDelta: RIR_DELTA[feedback],
    abandoned: false,
    loggedAt: '2026-08-01T10:00:00.000Z',
    deviceId: 'd1',
    supersedesId: null,
  }))
}

/**
 * Baut einen Verlauf für EINE Übung: je Eintrag eine Einheit mit dem
 * angegebenen Arbeitsgewicht.
 */
function historyFor(
  exercise: PlannedExercise,
  weights: number[],
  feedback: SetFeedback = 'as_planned',
) {
  const sessions: WorkoutSession[] = []
  const map = new Map<string, SetLog[]>()
  weights.forEach((weightKg, index) => {
    const day = String(index + 1).padStart(2, '0')
    const s = session([{ ...exercise, weightKg }], `2026-08-${day}T11:00:00.000Z`)
    sessions.push(s)
    map.set(s.id, logs(s.id, { ...exercise, weightKg }, { weightKg, reps: 8, feedback }))
  })
  return { sessions, logsBySession: map }
}

function input(overrides: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput {
  return {
    profile: profile(),
    checkin: checkin(),
    previousCheckins: [],
    volumeTargets: { Brust: 13 },
    nutrition: nutrition(),
    metrics: [],
    sessions: [],
    logsBySession: new Map(),
    ...overrides,
  }
}

// ────────────────────────────────────────────────────────────────────

describe('Erholung', () => {
  it('gilt als in Ordnung bei guten Werten', () => {
    const review = weeklyReview(input())
    expect(review.recovery.ok).toBe(true)
    expect(review.recovery.reasons).toEqual([])
  })

  it('erkennt schlechten Schlaf, müde Energie und Gelenkprobleme', () => {
    const review = weeklyReview(
      input({ checkin: checkin({ energy: 4, sleep: 'bad', joints: 'limiting' }) }),
    )
    expect(review.recovery.ok).toBe(false)
    expect(review.recovery.reasons).toHaveLength(3)
  })

  it('wertet ein leichtes Ziehen nicht als Störung', () => {
    const review = weeklyReview(input({ checkin: checkin({ joints: 'mild' }) }))
    expect(review.recovery.ok).toBe(true)
  })
})

describe('Leistung je Muskel', () => {
  it('rechnet nur DIREKTE Beiträge auf den Muskel', () => {
    // Bankdrücken steigt. Die Brust steigt mit — der Trizeps NICHT, sonst
    // würde jede Grundübung dem halben Oberkörper Fortschritt zuschreiben
    // und das Volumen überall gleichzeitig anheben.
    const { sessions, logsBySession } = historyFor(planned(), [60, 65, 70])
    const map = performancePerMuscle({ sessions, logsBySession })

    expect(map.get('Brust')).toBe('rising')
    expect(map.get('Trizeps')).toBeUndefined()
  })

  it('erkennt Stagnation', () => {
    const { sessions, logsBySession } = historyFor(planned(), [60, 60, 60])
    expect(performancePerMuscle({ sessions, logsBySession }).get('Brust')).toBe('stagnant')
  })

  it('erkennt einen Abfall erst nach mehreren Einheiten ohne Fortschritt', () => {
    const einmalSchwach = historyFor(planned(), [60, 70, 65])
    expect(
      performancePerMuscle(einmalSchwach).get('Brust'),
      'ein schwacher Tag ist noch kein Abfall',
    ).toBe('stagnant')

    const echterAbfall = historyFor(planned(), [70, 65, 60])
    expect(performancePerMuscle(echterAbfall).get('Brust')).toBe('falling')
  })

  it('gibt bei einer einzigen Einheit keinen Trend aus', () => {
    const { sessions, logsBySession } = historyFor(planned(), [60])
    expect(performancePerMuscle({ sessions, logsBySession }).size).toBe(0)
  })
})

describe('Kreis 3a — Volumen', () => {
  it('gibt einen Satz mehr, wenn die Leistung steigt und die Erholung trägt', () => {
    const { sessions, logsBySession } = historyFor(planned(), [60, 65, 70])
    const review = weeklyReview(input({ sessions, logsBySession }))
    const brust = review.volume.find((v) => v.muscle === 'Brust')
    expect(brust?.after).toBe(14)
    expect(brust?.reason).toContain('Leistung steigt')
  })

  it('gibt bei Stagnation zwei Sätze mehr — der Reiz reicht nicht', () => {
    const { sessions, logsBySession } = historyFor(planned(), [60, 60, 60])
    const review = weeklyReview(input({ sessions, logsBySession }))
    expect(review.volume.find((v) => v.muscle === 'Brust')?.after).toBe(15)
  })

  it('hält das Volumen, wenn die Erholung nicht trägt', () => {
    const { sessions, logsBySession } = historyFor(planned(), [60, 60, 60])
    const review = weeklyReview(
      input({ sessions, logsBySession, checkin: checkin({ sleep: 'bad' }) }),
    )
    const brust = review.volume.find((v) => v.muscle === 'Brust')
    expect(brust?.after).toBe(13)
    expect(brust?.reason).toContain('Erholung')
  })

  it('nimmt bei fallender Leistung 20 Prozent zurück', () => {
    const { sessions, logsBySession } = historyFor(planned(), [70, 65, 60])
    const review = weeklyReview(input({ sessions, logsBySession }))
    // 13 × 0,8 = 10,4 → auf halbe Sätze gerundet
    expect(review.volume.find((v) => v.muscle === 'Brust')?.after).toBe(10.5)
  })

  it('begrenzt den Wochensprung auf 20 Prozent', () => {
    // Bei 5 Sätzen wären +2 ein Sprung von 40 Prozent — zu viel auf einmal.
    const { sessions, logsBySession } = historyFor(planned(), [60, 60, 60])
    const review = weeklyReview(input({ sessions, logsBySession, volumeTargets: { Brust: 5 } }))
    expect(review.volume.find((v) => v.muscle === 'Brust')?.after).toBe(6)
  })

  it('überschreitet die Level-Obergrenze nicht', () => {
    const { sessions, logsBySession } = historyFor(planned(), [60, 65, 70])
    const review = weeklyReview(input({ sessions, logsBySession, volumeTargets: { Brust: 22 } }))
    expect(review.volume.find((v) => v.muscle === 'Brust')?.after).toBe(22)
  })

  it('lässt bei Fettverlust den Startwert als Obergrenze gelten', () => {
    // In der Diät geht es um Erhalt, nicht um Aufbau.
    const { sessions, logsBySession } = historyFor(planned(), [60, 65, 70])
    const review = weeklyReview(
      input({
        sessions,
        logsBySession,
        profile: profile({ goal: 'fatloss' }),
        volumeTargets: { Brust: 9 },
        startingVolumeTargets: { Brust: 9 },
      }),
    )
    expect(review.volume.find((v) => v.muscle === 'Brust')?.after).toBe(9)
  })

  it('erhöht in der Einmess-Woche nicht, auch wenn die Leistung steigt', () => {
    // Dort sind die Gewichte absichtlich vorsichtig angesetzt. Eine
    // Steigerung ist der korrigierte Schätzfehler, nicht Fortschritt —
    // Volumen darauf zu erhöhen bringt Ermüdung für einen Scheingewinn.
    const { sessions, logsBySession } = historyFor(planned(), [60, 65, 70])
    const review = weeklyReview(input({ sessions, logsBySession, calibrationWeek: true }))
    const brust = review.volume.find((v) => v.muscle === 'Brust')

    expect(brust?.after).toBe(13)
    expect(brust?.reason).toContain('Einmess')
    expect(review.notes.join(' ')).toContain('vorsichtig')
  })

  it('korrigiert auch in der Einmess-Woche nach unten', () => {
    // Ein echter Leistungsabfall ist ein Warnsignal, unabhängig davon, wie
    // gut die Startschätzung war.
    const { sessions, logsBySession } = historyFor(planned(), [70, 65, 60])
    const review = weeklyReview(input({ sessions, logsBySession, calibrationWeek: true }))
    expect(review.volume.find((v) => v.muscle === 'Brust')?.after).toBe(10.5)
  })

  it('lässt Muskeln ohne Daten unverändert', () => {
    const review = weeklyReview(input({ volumeTargets: { Waden: 8 } }))
    const waden = review.volume.find((v) => v.muscle === 'Waden')
    expect(waden?.after).toBe(8)
    expect(waden?.performance).toBe('unknown')
  })
})

describe('Kreis 3b — Kalorien', () => {
  const zweiWochen = (kg: [number, number]) => ({
    previousCheckins: [checkin({ weekOf: '2026-07-27', weightKgAvg: kg[0] })],
    checkin: checkin({ weekOf: '2026-08-03', weightKgAvg: kg[1] }),
  })

  it('ändert NICHTS, wenn die Kalorien nicht verfolgt wurden', () => {
    // Die wichtigste Sperre der ganzen Ernährungslogik: Ohne Umsetzung
    // würde sich die Vorgabe Woche für Woche weiter verstellen, bis sie
    // absurd ist (docs/PLAN-ENGINE.md §7).
    const review = weeklyReview(
      input({
        ...zweiWochen([84, 84]),
        checkin: checkin({
          weekOf: '2026-08-03',
          weightKgAvg: 84,
          calorieAdherence: 'none',
        }),
      }),
    )
    expect(review.nutrition.next).toBeNull()
    expect(review.nutrition.blocked).toBe(true)
    expect(review.notes.join(' ')).toContain('nicht verfolgt')
  })

  it('ändert auch bei teilweiser Umsetzung nichts', () => {
    const review = weeklyReview(
      input({
        ...zweiWochen([84, 84]),
        checkin: checkin({
          weekOf: '2026-08-03',
          weightKgAvg: 84,
          calorieAdherence: 'partial',
        }),
      }),
    )
    expect(review.nutrition.blocked).toBe(true)
  })

  it('erhöht die Kalorien, wenn der Aufbau zu langsam läuft', () => {
    // Ziel +0,25 %/Woche = +0,21 kg. Tatsächlich +0,05 kg → deutlich zu wenig.
    const review = weeklyReview(input(zweiWochen([84, 84.05])))
    expect(review.nutrition.next?.kcal).toBe(3200)
    expect(review.nutrition.reason).toContain('zu langsam')
  })

  it('senkt die Kalorien, wenn der Aufbau zu schnell läuft', () => {
    const review = weeklyReview(input(zweiWochen([84, 84.9])))
    expect(review.nutrition.next?.kcal).toBe(2800)
    expect(review.nutrition.reason).toContain('zu schnell')
  })

  it('ändert innerhalb des Totbands nichts', () => {
    // +0,21 kg entspricht genau der Zielrate.
    const review = weeklyReview(input(zweiWochen([84, 84.21])))
    expect(review.nutrition.next).toBeNull()
    expect(review.nutrition.blocked).toBe(false)
    expect(review.nutrition.reason).toContain('Zielbereich')
  })

  it('teilt die Makros nach der Änderung mit derselben Regel neu auf', () => {
    const review = weeklyReview(input(zweiWochen([84, 84.05])))
    const next = review.nutrition.next
    expect(next).not.toBeNull()
    // Protein hängt am Körpergewicht, nicht an den Kalorien.
    expect(next?.proteinG).toBe(Math.round(1.8 * 84.05))
    // Fett-Untergrenze 0,8 g/kg wird nie unterschritten.
    expect(next?.fatG).toBeGreaterThanOrEqual(Math.round(0.8 * 84.05))
  })

  it('erhöht in der Diät die Kalorien, wenn die Kraft nachgibt', () => {
    // Kraftverlust im Defizit ist das Warnsignal überhaupt.
    const brust = historyFor(planned(), [70, 65, 60])
    const beine = historyFor(
      planned({ exerciseId: 'QUA-001', exerciseName: 'Beinstrecker', orderIndex: 1 }),
      [70, 65, 60],
    )
    const sessions = [...brust.sessions, ...beine.sessions]
    const logsBySession = new Map([...brust.logsBySession, ...beine.logsBySession])

    const review = weeklyReview(
      input({
        ...zweiWochen([84, 83.5]),
        profile: profile({ goal: 'fatloss' }),
        nutrition: nutrition({ kcal: 2200, targetRatePercentPerWeek: -0.5 }),
        sessions,
        logsBySession,
      }),
    )

    expect(review.nutrition.next?.kcal).toBe(2400)
    expect(review.nutrition.reason).toContain('Muskulatur')
  })

  it('wartet mit einer Änderung, solange nur eine Woche vorliegt', () => {
    const review = weeklyReview(input())
    expect(review.nutrition.next).toBeNull()
    expect(review.nutrition.reason).toContain('Woche')
  })

  it('kommt ohne Ernährungsvorgabe zurecht', () => {
    const review = weeklyReview(input({ nutrition: null }))
    expect(review.nutrition.next).toBeNull()
  })
})

describe('Kreis 3c — Deload', () => {
  it('schlägt nichts vor, wenn alles passt', () => {
    expect(weeklyReview(input()).deload.recommendation).toBe('none')
  })

  it('braucht zwei Wochen in Folge, nicht einen schlechten Tag', () => {
    const einmal = weeklyReview(input({ checkin: checkin({ energy: 5 }) }))
    expect(einmal.deload.signals).toEqual([])

    const zweimal = weeklyReview(
      input({
        previousCheckins: [checkin({ weekOf: '2026-07-27', energy: 5 })],
        checkin: checkin({ energy: 5 }),
      }),
    )
    expect(zweimal.deload.signals).toContain('zwei Wochen in Folge ausgelaugt')
  })

  it('schlägt bei zwei Signalen einen Deload vor', () => {
    const review = weeklyReview(
      input({
        previousCheckins: [checkin({ weekOf: '2026-07-27', energy: 5, sleep: 'bad' })],
        checkin: checkin({ energy: 5, sleep: 'bad' }),
      }),
    )
    expect(review.deload.recommendation).toBe('suggest')
  })

  it('empfiehlt bei vier Signalen dringend', () => {
    const review = weeklyReview(
      input({
        previousCheckins: [
          checkin({ weekOf: '2026-07-27', energy: 5, sleep: 'bad', motivation: 'low' }),
        ],
        checkin: checkin({
          energy: 5,
          sleep: 'bad',
          motivation: 'low',
          joints: 'limiting',
        }),
      }),
    )
    expect(review.deload.recommendation).toBe('urgent')
    expect(review.deload.signals.length).toBeGreaterThanOrEqual(4)
  })

  it('beschreibt, wie eine Entlastungswoche aussieht', () => {
    expect(weeklyReview(input()).deload.shape).toContain('Volumen')
  })
})

describe('Kreis 3d — Übungsrotation', () => {
  const stagniert = () =>
    historyFor(
      planned({ exerciseId: 'SCH-015', exerciseName: 'Kurzhantel Seitheben stehend' }),
      [12, 12, 12, 12],
    )

  it('schlägt erst dann einen Tausch vor, wenn das Volumen schon erhöht wurde', () => {
    // Sonst wird eine Übung ausgewechselt, die nur zu wenig Reiz bekam.
    const { sessions, logsBySession } = stagniert()
    const ohneErhoehung = weeklyReview(
      input({
        sessions,
        logsBySession,
        volumeTargets: { 'Seitliche Schulter': 10 },
        checkin: checkin({ sleep: 'bad' }),
      }),
    )
    expect(ohneErhoehung.rotations).toEqual([])

    const mitErhoehung = weeklyReview(
      input({ sessions, logsBySession, volumeTargets: { 'Seitliche Schulter': 10 } }),
    )
    expect(mitErhoehung.rotations.map((r) => r.exerciseId)).toContain('SCH-015')
  })

  it('rotiert schwere Grundübungen nicht — sie sind der Kraftmaßstab', () => {
    const { sessions, logsBySession } = historyFor(planned(), [70, 70, 70, 70])
    const review = weeklyReview(input({ sessions, logsBySession }))
    expect(review.rotations.map((r) => r.exerciseName)).not.toContain(
      'Langhantel Bankdrücken flach',
    )
  })

  it('begründet den Vorschlag mit der Anzahl stagnierender Einheiten', () => {
    const { sessions, logsBySession } = stagniert()
    const review = weeklyReview(
      input({ sessions, logsBySession, volumeTargets: { 'Seitliche Schulter': 10 } }),
    )
    expect(review.rotations[0]?.weeksStagnant).toBeGreaterThanOrEqual(3)
    expect(review.rotations[0]?.reason).toContain('Volumen')
  })
})

describe('Zusammenspiel', () => {
  it('liefert bei leerer Datenlage nichts Kaputtes', () => {
    const review = weeklyReview(
      input({ volumeTargets: {}, nutrition: null, checkin: checkin({ weightKgAvg: null }) }),
    )
    expect(review.volume).toEqual([])
    expect(review.rotations).toEqual([])
    expect(review.deload.recommendation).toBe('none')
  })

  it('sortiert die Volumenänderungen nach Größe', () => {
    const targets: Partial<Record<VolumeMuscle, number>> = {
      Brust: 13,
      Waden: 8,
      Bauch: 10,
    }
    const review = weeklyReview(input({ volumeTargets: targets }))
    const values = review.volume.map((v) => v.after)
    expect(values).toEqual([...values].sort((a, b) => b - a))
  })

  it('rechnet die Rate NICHT aus der Tages-Messreihe', () => {
    // Ein Wochenschnitt gegen einen Tageswert gerechnet misst vor allem
    // Rauschen. Im Browser führte genau das zu „−0,47 % — zu langsam,
    // +200 kcal", obwohl das Gewicht von 84,0 auf 84,4 kg GESTIEGEN war:
    // Das Onboarding datiert auf den Tag der Einrichtung, der Check-in auf
    // den Wochenanfang — die Reihe war verdreht.
    const metrics: BodyMetric[] = [metric('2026-07-27', 84), metric('2026-08-03', 84.05)]
    const review = weeklyReview(input({ metrics }))
    expect(review.nutrition.next).toBeNull()
    expect(review.nutrition.reason).toContain('zwei Wochendurchschnitte')
  })

  it('rechnet ab dem zweiten Check-in', () => {
    const review = weeklyReview(
      input({
        previousCheckins: [checkin({ weekOf: '2026-07-27', weightKgAvg: 84 })],
        checkin: checkin({ weekOf: '2026-08-03', weightKgAvg: 84.05 }),
      }),
    )
    expect(review.nutrition.next?.kcal).toBe(3200)
  })
})

function metric(measuredOn: string, weightKg: number): BodyMetric {
  return {
    id: nextId('metric'),
    userId: 'u1',
    createdAt: `${measuredOn}T08:00:00.000Z`,
    updatedAt: `${measuredOn}T08:00:00.000Z`,
    deletedAt: null,
    measuredOn,
    weightKg,
    waistCm: null,
    chestCm: null,
    hipCm: null,
    armCm: null,
    thighCm: null,
    calfCm: null,
    bodyFatBucket: null,
    source: 'checkin',
  }
}
