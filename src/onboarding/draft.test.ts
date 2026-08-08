import { beforeEach, describe, expect, it } from 'vitest'
import { listRecords, outboxCount } from '../data/db'
import { newId } from '../domain/ids'
import {
  completeOnboarding,
  emptyDraft,
  REFERENCE_PATTERNS,
  summarize,
  type OnboardingDraft,
} from './draft'
import { STEPS } from './steps'

let userId: string

beforeEach(() => {
  userId = newId()
})

/** Vollständig ausgefüllter Entwurf wie nach dem letzten Bildschirm. */
function filledDraft(overrides: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {
    ...emptyDraft(),
    displayName: 'Luca',
    sex: 'male',
    birthYear: 2000,
    heightCm: 180,
    weightKg: 78,
    goal: 'muscle',
    targetWeightKg: 84,
    bodyFatBucket: '15-19',
    priorityMuscles: ['Brust', 'Lat'],
    level: 'intermediate',
    trainingYears: '2to5y',
    knowsRir: true,
    trainingDays: ['mon', 'tue', 'thu', 'fri'],
    sessionMinutes: 75,
    dailyActivity: 'light',
    injuries: [{ region: 'shoulder', severity: 'history' }],
    blacklistedExerciseIds: ['RUE-058'],
    wantsReferences: true,
    references: REFERENCE_PATTERNS.map((p, index) => ({
      pattern: p.pattern,
      exerciseId: p.options[0].exerciseId,
      weightKg: 60 + index * 10,
      reps: 8,
      skipped: false,
    })),
    maxPullups: 12,
    maxPushups: 40,
    maxDips: 15,
    checkinWeekday: 'sun',
    ...overrides,
  }
}

describe('Schrittfolge', () => {
  it('hat die 20 Bildschirme aus der Spezifikation', () => {
    expect(STEPS).toHaveLength(20)
  })

  it('vergibt eindeutige Kennungen', () => {
    const ids = STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('lässt bei leerem Entwurf nur die freiwilligen Schritte weiter', () => {
    const leer = emptyDraft()
    const blockiert = STEPS.filter((s) => !s.canContinue(leer)).map((s) => s.id)

    // Genau die Schritte mit Pflichtangabe müssen blockieren.
    expect(blockiert).toEqual([
      'name',
      'sex',
      'body',
      'goal',
      'level',
      'years',
      'rir',
      'days',
      'duration',
      'activity',
      'refIntro',
      'checkin',
    ])
  })

  it('lässt bei vollständigem Entwurf jeden Schritt weiter', () => {
    const voll = filledDraft()
    for (const step of STEPS) {
      expect(step.canContinue(voll), step.id).toBe(true)
    }
  })
})

describe('Plausibilitätsgrenzen', () => {
  const bodyStep = STEPS.find((s) => s.id === 'body')!

  it('lehnt unplausible Körperdaten ab', () => {
    expect(bodyStep.canContinue(filledDraft({ heightCm: 90 }))).toBe(false)
    expect(bodyStep.canContinue(filledDraft({ heightCm: 260 }))).toBe(false)
    expect(bodyStep.canContinue(filledDraft({ weightKg: 20 }))).toBe(false)
    expect(bodyStep.canContinue(filledDraft({ weightKg: 300 }))).toBe(false)
    expect(bodyStep.canContinue(filledDraft({ birthYear: 2024 }))).toBe(false) // zu jung
    expect(bodyStep.canContinue(filledDraft({ birthYear: 1900 }))).toBe(false) // zu alt
  })

  it('akzeptiert plausible Werte', () => {
    expect(bodyStep.canContinue(filledDraft())).toBe(true)
  })

  const daysStep = STEPS.find((s) => s.id === 'days')!

  it('verlangt 3 bis 6 Trainingstage', () => {
    expect(daysStep.canContinue(filledDraft({ trainingDays: ['mon', 'wed'] }))).toBe(false)
    expect(daysStep.canContinue(filledDraft({ trainingDays: ['mon', 'wed', 'fri'] }))).toBe(true)
    expect(
      daysStep.canContinue(
        filledDraft({ trainingDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] }),
      ),
    ).toBe(true)
  })
})

describe('summarize', () => {
  it('rechnet die Zusammenfassung aus einem vollständigen Entwurf', () => {
    const summary = summarize(filledDraft())!
    expect(summary.splitLabelText).toContain('Ober-/Unterkörper')
    expect(summary.sessionsPerWeek).toBe(4)
    expect(summary.kcal).toBeGreaterThan(2600)
    expect(summary.usedReferences).toBe(6)
  })

  it('stellt Prioritäts-Muskeln vorne dar', () => {
    const summary = summarize(filledDraft({ priorityMuscles: ['Waden'] }))!
    // Waden haben ein kleines Budget, müssen als Priorität aber oben stehen.
    expect(summary.startVolumeExample[0].muscle).toBe('Waden')
  })

  it('gibt null zurück, solange Pflichtangaben fehlen', () => {
    expect(summarize(emptyDraft())).toBeNull()
    expect(summarize(filledDraft({ weightKg: null }))).toBeNull()
  })
})

describe('completeOnboarding', () => {
  it('legt Profil, Startgewicht, Plan und Ernährungsvorgabe an', async () => {
    await completeOnboarding(userId, filledDraft())

    const profiles = await listRecords(userId, 'profiles')
    const metrics = await listRecords(userId, 'bodyMetrics')
    const plans = await listRecords(userId, 'plans')
    const targets = await listRecords(userId, 'nutritionTargets')

    expect(profiles).toHaveLength(1)
    expect(metrics).toHaveLength(1)
    expect(plans).toHaveLength(1)
    expect(targets).toHaveLength(1)

    expect(profiles[0].displayName).toBe('Luca')
    expect(profiles[0].onboardingCompletedAt).not.toBeNull()
  })

  it('speichert das Gewicht NUR in der Zeitreihe, nicht im Profil', async () => {
    await completeOnboarding(userId, filledDraft())

    const [profile] = await listRecords(userId, 'profiles')
    const [metric] = await listRecords(userId, 'bodyMetrics')

    // Zwei Wahrheiten für dasselbe Gewicht wären eine sichere Quelle
    // für Widersprüche.
    expect('weightKg' in profile).toBe(false)
    expect(metric.weightKg).toBe(78)
    expect(metric.source).toBe('onboarding')
  })

  it('übernimmt die Feedback-Sprache aus der RIR-Antwort', async () => {
    await completeOnboarding(userId, filledDraft({ knowsRir: true }))
    const [mitRir] = await listRecords(userId, 'profiles')
    expect(mitRir.feedbackStyle).toBe('rir')

    const anderer = newId()
    await completeOnboarding(anderer, filledDraft({ knowsRir: false }))
    const [ohneRir] = await listRecords(anderer, 'profiles')
    expect(ohneRir.feedbackStyle).toBe('words')
  })

  it('setzt die Intensität auf die Voreinstellung „fordernd"', async () => {
    await completeOnboarding(userId, filledDraft())
    const [profile] = await listRecords(userId, 'profiles')
    expect(profile.intensity).toBe('demanding')
  })

  it('schreibt das Volumenbudget in den Plan', async () => {
    await completeOnboarding(userId, filledDraft({ priorityMuscles: ['Brust'] }))
    const [plan] = await listRecords(userId, 'plans')

    expect(plan.splitType).toBe('4_upper_lower')
    expect(plan.version).toBe(1)
    // 13 (fortgeschritten) + 3 (Priorität)
    expect(plan.volumeTargets['Brust']).toBe(16)
    expect(plan.volumeTargets['Quadrizeps']).toBe(13)
    expect(plan.reason).toContain('Onboarding')
  })

  it('speichert alle angegebenen Referenzwerte', async () => {
    await completeOnboarding(userId, filledDraft())
    const refs = await listRecords(userId, 'strengthReferences')
    // 6 Referenzübungen + Liegestütze + Dips (Klimmzug ist schon dabei)
    expect(refs.length).toBeGreaterThanOrEqual(6)
    expect(refs.some((r) => r.exerciseId === 'BRU-001' && r.reps === 8)).toBe(true)
  })

  it('speichert keine zwei widersprüchlichen Werte für dieselbe Übung', async () => {
    // Klimmzug als Referenzübung UND als Maximum angegeben: Die
    // Referenzangabe gewinnt, ein Maximalversuch wäre als Arbeitsgewicht
    // zu schwer.
    const draft = filledDraft({
      references: REFERENCE_PATTERNS.map((p) => ({
        pattern: p.pattern,
        // Für das senkrechte Ziehen bewusst den Klimmzug wählen
        exerciseId: p.pattern === 'vertical_pull' ? 'RUE-012' : p.options[0].exerciseId,
        weightKg: p.pattern === 'vertical_pull' ? null : 60,
        reps: 8,
        skipped: false,
      })),
      maxPullups: 12,
    })

    await completeOnboarding(userId, draft)

    const refs = await listRecords(userId, 'strengthReferences')
    const klimmzuege = refs.filter((r) => r.exerciseId === 'RUE-012')
    expect(klimmzuege).toHaveLength(1)
    expect(klimmzuege[0].reps).toBe(8) // die Referenzangabe, nicht das Maximum
  })

  it('überspringt Referenzwerte, die als unbekannt markiert sind', async () => {
    const draft = filledDraft({
      wantsReferences: false,
      references: REFERENCE_PATTERNS.map((p) => ({
        pattern: p.pattern,
        exerciseId: p.options[0].exerciseId,
        weightKg: null,
        reps: null,
        skipped: true,
      })),
      maxPullups: null,
      maxPushups: null,
      maxDips: null,
    })

    await completeOnboarding(userId, draft)
    expect(await listRecords(userId, 'strengthReferences')).toHaveLength(0)
    // Profil und Plan entstehen trotzdem — die App läuft im Einmess-Modus.
    expect(await listRecords(userId, 'profiles')).toHaveLength(1)
    expect(await listRecords(userId, 'plans')).toHaveLength(1)
  })

  it('merkt alles zur Übertragung in die Cloud vor', async () => {
    await completeOnboarding(userId, filledDraft())
    // Profil + Gewicht + Plan + Ernährung + Referenzwerte
    expect(await outboxCount(userId)).toBeGreaterThanOrEqual(4)
  })

  it('bricht bei unvollständigem Entwurf ab, statt ein halbes Profil anzulegen', async () => {
    await expect(completeOnboarding(userId, emptyDraft())).rejects.toThrow(/unvollständig/)
    expect(await listRecords(userId, 'profiles')).toHaveLength(0)
  })
})
