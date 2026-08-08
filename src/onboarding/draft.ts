// ====================================================================
//  Onboarding-Entwurf
//
//  Sammelt die Antworten der 20 Bildschirme (docs/ONBOARDING.md) und
//  erzeugt daraus am Ende die echten Datensätze.
//
//  Der Entwurf wird nach jeder Änderung lokal gesichert: Ein Abbruch
//  mitten drin darf nichts verlieren (docs/ONBOARDING.md Designprinzip 5).
// ====================================================================

import { putRecord } from '../data/db'
import { deviceId, newId, nowIso, today } from '../domain/ids'
import type { VolumeMuscle } from '../domain/muscles'
import { ageFromBirthYear, buildNutritionPlan } from '../domain/nutrition'
import { buildVolumePlan, splitForDays } from '../domain/planning'
import {
  baseFields,
  type BodyMetric,
  type DailyActivity,
  type Goal,
  type InjuryFlag,
  type Level,
  type MovementPattern,
  type NutritionTarget,
  type SessionMinutes,
  type Sex,
  type StrengthReference,
  type TrainingPlan,
  type TrainingYears,
  type UserProfile,
  type Weekday,
} from '../domain/records'

/** Eine abgefragte Referenzübung (docs/ONBOARDING.md Teil 6). */
export interface ReferenceEntry {
  pattern: MovementPattern
  /** Gewählte Variante — es gibt je zwei zur Auswahl. */
  exerciseId: string
  weightKg: number | null
  reps: number | null
  /** true = „kenne ich nicht" */
  skipped: boolean
}

export interface OnboardingDraft {
  displayName: string
  sex: Sex | null
  birthYear: number | null
  heightCm: number | null
  weightKg: number | null

  goal: Goal | null
  targetWeightKg: number | null
  bodyFatBucket: string | null
  priorityMuscles: VolumeMuscle[]

  level: Level | null
  trainingYears: TrainingYears | null
  knowsRir: boolean | null

  trainingDays: Weekday[]
  sessionMinutes: SessionMinutes | null
  dailyActivity: DailyActivity | null

  injuries: InjuryFlag[]
  blacklistedExerciseIds: string[]

  wantsReferences: boolean | null
  references: ReferenceEntry[]
  maxPullups: number | null
  maxPushups: number | null
  maxDips: number | null

  checkinWeekday: Weekday | null
}

/** Die sechs Referenzmuster mit je zwei Varianten zur Auswahl. */
export const REFERENCE_PATTERNS: {
  pattern: MovementPattern
  title: string
  options: { exerciseId: string; label: string }[]
  /** Klimmzüge werden nur mit Wiederholungen erfasst. */
  bodyweightOnly?: boolean
}[] = [
  {
    pattern: 'horizontal_push',
    title: 'Drücken waagerecht',
    options: [
      { exerciseId: 'BRU-001', label: 'Langhantel Bankdrücken flach' },
      { exerciseId: 'BRU-005', label: 'Kurzhantel Bankdrücken flach' },
    ],
  },
  {
    pattern: 'squat',
    title: 'Kniebeugen',
    options: [
      { exerciseId: 'QUA-012', label: 'Langhantel Kniebeuge' },
      { exerciseId: 'QUA-006', label: 'Beinpresse 45°' },
    ],
  },
  {
    pattern: 'vertical_pull',
    title: 'Ziehen senkrecht',
    options: [
      { exerciseId: 'RUE-001', label: 'Latzug breit Obergriff' },
      { exerciseId: 'RUE-012', label: 'Klimmzug (nur Wiederholungen)' },
    ],
  },
  {
    pattern: 'horizontal_pull',
    title: 'Ziehen waagerecht',
    options: [
      { exerciseId: 'RUE-023', label: 'Rudermaschine mit Brustpolster' },
      { exerciseId: 'RUE-037', label: 'Langhantelrudern vorgebeugt' },
    ],
  },
  {
    pattern: 'vertical_push',
    title: 'Drücken senkrecht',
    options: [
      { exerciseId: 'SCH-005', label: 'Langhantel Schulterdrücken' },
      { exerciseId: 'SCH-001', label: 'Schulterdrückmaschine' },
    ],
  },
  {
    pattern: 'hinge',
    title: 'Hüftstreckung',
    options: [
      { exerciseId: 'RUE-058', label: 'Kreuzheben konventionell' },
      { exerciseId: 'RUE-061', label: 'Rumänisches Kreuzheben' },
    ],
  },
]

export function emptyDraft(): OnboardingDraft {
  return {
    displayName: '',
    sex: null,
    birthYear: null,
    heightCm: null,
    weightKg: null,
    goal: null,
    targetWeightKg: null,
    bodyFatBucket: null,
    priorityMuscles: [],
    level: null,
    trainingYears: null,
    knowsRir: null,
    trainingDays: [],
    sessionMinutes: null,
    dailyActivity: null,
    injuries: [],
    blacklistedExerciseIds: [],
    wantsReferences: null,
    references: REFERENCE_PATTERNS.map((p) => ({
      pattern: p.pattern,
      exerciseId: p.options[0].exerciseId,
      weightKg: null,
      reps: null,
      skipped: false,
    })),
    maxPullups: null,
    maxPushups: null,
    maxDips: null,
    checkinWeekday: null,
  }
}

// ── Zwischenspeichern ───────────────────────────────────────────────

const DRAFT_KEY = 'fitness-coach.onboardingDraft'

export function saveDraft(draft: OnboardingDraft, step: number): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, step }))
  } catch {
    // Kein Speicher verfügbar (privater Modus) — dann eben ohne Sicherung.
  }
}

export function loadDraft(): { draft: OnboardingDraft; step: number } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { draft: OnboardingDraft; step: number }
    // Fehlende Felder aus einer älteren Fassung ergänzen.
    return { draft: { ...emptyDraft(), ...parsed.draft }, step: parsed.step ?? 0 }
  } catch {
    return null
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // nichts zu tun
  }
}

// ── Plausibilität ───────────────────────────────────────────────────

export const LIMITS = {
  age: { min: 14, max: 90 },
  heightCm: { min: 120, max: 220 },
  weightKg: { min: 30, max: 250 },
  reps: { min: 1, max: 20 },
}

export function ageOf(draft: OnboardingDraft): number | null {
  return draft.birthYear === null ? null : ageFromBirthYear(draft.birthYear)
}

// ── Abschluss ───────────────────────────────────────────────────────

export interface OnboardingSummary {
  splitLabelText: string
  sessionsPerWeek: number
  startVolumeExample: { muscle: VolumeMuscle; sets: number }[]
  kcal: number
  proteinG: number
  fatG: number
  carbsG: number
  maintenanceKcal: number
  expectedKgPerWeek: number
  reason: string
  usedReferences: number
}

/**
 * Rechnet die Zusammenfassung für den letzten Bildschirm.
 * Reine Berechnung — schreibt nichts.
 */
export function summarize(draft: OnboardingDraft): OnboardingSummary | null {
  const age = ageOf(draft)
  if (
    draft.sex === null ||
    draft.goal === null ||
    draft.level === null ||
    draft.dailyActivity === null ||
    age === null ||
    draft.heightCm === null ||
    draft.weightKg === null ||
    draft.trainingDays.length === 0
  ) {
    return null
  }

  const sessionsPerWeek = draft.trainingDays.length
  const split = splitForDays(sessionsPerWeek)
  const volume = buildVolumePlan({
    level: draft.level,
    goal: draft.goal,
    priorityMuscles: draft.priorityMuscles,
  })
  const nutrition = buildNutritionPlan({
    sex: draft.sex,
    weightKg: draft.weightKg,
    heightCm: draft.heightCm,
    age,
    dailyActivity: draft.dailyActivity,
    sessionsPerWeek,
    goal: draft.goal,
    level: draft.level,
    bodyFatBucket: draft.bodyFatBucket,
  })

  // Für die Anzeige: Prioritäten zuerst, dann die größten Budgets.
  const entries = Object.entries(volume.start) as [VolumeMuscle, number][]
  const sorted = entries.sort((a, b) => {
    const priorityA = draft.priorityMuscles.includes(a[0]) ? 1 : 0
    const priorityB = draft.priorityMuscles.includes(b[0]) ? 1 : 0
    if (priorityA !== priorityB) return priorityB - priorityA
    return b[1] - a[1]
  })

  return {
    splitLabelText: splitLabelFor(split),
    sessionsPerWeek,
    startVolumeExample: sorted.slice(0, 5).map(([muscle, sets]) => ({ muscle, sets })),
    kcal: nutrition.kcal,
    proteinG: nutrition.proteinG,
    fatG: nutrition.fatG,
    carbsG: nutrition.carbsG,
    maintenanceKcal: nutrition.maintenanceKcal,
    expectedKgPerWeek: nutrition.expectedKgPerWeek,
    reason: nutrition.reason,
    usedReferences: draft.references.filter((r) => !r.skipped && r.reps !== null).length,
  }
}

function splitLabelFor(split: ReturnType<typeof splitForDays>): string {
  switch (split) {
    case '3_fullbody':
      return 'Ganzkörper A/B/C'
    case '4_upper_lower':
      return 'Ober-/Unterkörper, 2× pro Woche'
    case '5_ppl_ul':
      return 'Push/Pull/Beine + Ober-/Unterkörper'
    case '6_ppl':
      return 'Push/Pull/Beine, 2× pro Woche'
  }
}

/**
 * Schreibt Profil, Startgewicht, Plan und Ernährungsvorgabe.
 *
 * Alle vier entstehen zusammen, damit die App nach dem Onboarding
 * vollständig arbeitsfähig ist — und nicht in einem halben Zustand.
 */
export async function completeOnboarding(
  userId: string,
  draft: OnboardingDraft,
): Promise<UserProfile> {
  const age = ageOf(draft)
  if (
    draft.sex === null ||
    draft.goal === null ||
    draft.level === null ||
    draft.trainingYears === null ||
    draft.dailyActivity === null ||
    draft.sessionMinutes === null ||
    draft.checkinWeekday === null ||
    draft.knowsRir === null ||
    age === null ||
    draft.birthYear === null ||
    draft.heightCm === null ||
    draft.weightKg === null
  ) {
    throw new Error('Onboarding unvollständig — Profil kann nicht angelegt werden.')
  }

  const at = nowIso()
  const day = today()

  const profile: UserProfile = {
    ...baseFields(userId, newId(), at),
    displayName: draft.displayName.trim() || 'Profil',
    sex: draft.sex,
    birthYear: draft.birthYear,
    heightCm: draft.heightCm,
    goal: draft.goal,
    targetWeightKg: draft.targetWeightKg,
    bodyFatBucket: draft.bodyFatBucket,
    priorityMuscles: draft.priorityMuscles,
    level: draft.level,
    trainingYears: draft.trainingYears,
    knowsRir: draft.knowsRir,
    trainingDays: draft.trainingDays,
    sessionMinutes: draft.sessionMinutes,
    dailyActivity: draft.dailyActivity,
    injuries: draft.injuries,
    blacklistedExerciseIds: draft.blacklistedExerciseIds,
    disabledEquipmentIds: [],
    checkinWeekday: draft.checkinWeekday,
    intensity: 'demanding',
    feedbackStyle: draft.knowsRir ? 'rir' : 'words',
    onboardingCompletedAt: at,
  }
  await putRecord(userId, 'profiles', profile)

  // Startgewicht als erster Punkt der Zeitreihe — das Gewicht lebt
  // ausschließlich hier, nie im Profil.
  const metric: BodyMetric = {
    ...baseFields(userId, newId(), at),
    measuredOn: day,
    weightKg: draft.weightKg,
    waistCm: null,
    chestCm: null,
    hipCm: null,
    armCm: null,
    thighCm: null,
    calfCm: null,
    bodyFatBucket: draft.bodyFatBucket,
    source: 'onboarding',
  }
  await putRecord(userId, 'bodyMetrics', metric)

  // Referenzwerte, soweit angegeben
  const recorded = new Set<string>()
  for (const entry of draft.references) {
    if (entry.skipped || entry.reps === null) continue
    const reference: StrengthReference = {
      ...baseFields(userId, newId(), at),
      exerciseId: entry.exerciseId,
      pattern: entry.pattern,
      weightKg: entry.weightKg,
      reps: entry.reps,
      recordedAt: at,
    }
    await putRecord(userId, 'strengthReferences', reference)
    recorded.add(entry.exerciseId)
  }

  // Körpergewichtsübungen als Referenz.
  //
  // Wählt jemand Klimmzüge als Referenzübung UND gibt sein Maximum an,
  // gäbe es zwei widersprüchliche Werte für dieselbe Übung. In dem Fall
  // gewinnt die Referenzangabe: Sie beschreibt einen Satz, den man sicher
  // schafft — genau das braucht die Gewichtsvorgabe. Ein Maximalversuch
  // wäre als Arbeitsgewicht zu schwer.
  const bodyweight: { exerciseId: string; reps: number | null; pattern: MovementPattern }[] = [
    { exerciseId: 'RUE-012', reps: draft.maxPullups, pattern: 'vertical_pull' },
    { exerciseId: 'BRU-032', reps: draft.maxPushups, pattern: 'horizontal_push' },
    { exerciseId: 'TRI-002', reps: draft.maxDips, pattern: 'horizontal_push' },
  ]
  for (const item of bodyweight) {
    if (item.reps === null) continue
    if (recorded.has(item.exerciseId)) continue
    const reference: StrengthReference = {
      ...baseFields(userId, newId(), at),
      exerciseId: item.exerciseId,
      pattern: item.pattern,
      weightKg: null,
      reps: item.reps,
      recordedAt: at,
    }
    await putRecord(userId, 'strengthReferences', reference)
    recorded.add(item.exerciseId)
  }

  const volume = buildVolumePlan({
    level: draft.level,
    goal: draft.goal,
    priorityMuscles: draft.priorityMuscles,
  })
  const plan: TrainingPlan = {
    ...baseFields(userId, newId(), at),
    version: 1,
    splitType: splitForDays(draft.trainingDays.length),
    trainingDays: draft.trainingDays,
    volumeTargets: volume.start,
    activeFrom: day,
    activeUntil: null,
    reason: 'Erstellt aus dem Onboarding',
  }
  await putRecord(userId, 'plans', plan)

  const nutrition = buildNutritionPlan({
    sex: draft.sex,
    weightKg: draft.weightKg,
    heightCm: draft.heightCm,
    age,
    dailyActivity: draft.dailyActivity,
    sessionsPerWeek: draft.trainingDays.length,
    goal: draft.goal,
    level: draft.level,
    bodyFatBucket: draft.bodyFatBucket,
  })
  const target: NutritionTarget = {
    ...baseFields(userId, newId(), at),
    effectiveFrom: day,
    kcal: nutrition.kcal,
    proteinG: nutrition.proteinG,
    fatG: nutrition.fatG,
    carbsG: nutrition.carbsG,
    maintenanceKcal: nutrition.maintenanceKcal,
    targetRatePercentPerWeek: nutrition.targetRatePercentPerWeek,
    reason: nutrition.reason,
  }
  await putRecord(userId, 'nutritionTargets', target)

  clearDraft()
  // Geräte-Kennung anlegen, damit spätere Sätze zuordenbar sind.
  deviceId()

  return profile
}
