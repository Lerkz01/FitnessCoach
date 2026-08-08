// ====================================================================
//  Ernährungsvorgabe
//
//  Grundlage: docs/TRAINING-SCIENCE.md §10 und docs/ONBOARDING.md Teil 4.
//
//  Wichtig zum Verständnis: Alles hier ist ein STARTPUNKT. Der wahre
//  Bedarf ergibt sich erst aus dem Gewichtsverlauf (Regelkreis 3+4). Die
//  Formel überbrückt nur die ersten zwei bis drei Wochen, bis echte Daten
//  vorliegen — deshalb wird sie nie als präzise ausgegeben.
// ====================================================================

import type { DailyActivity, Goal, Level, Sex } from './records'

/** Energiegehalt eines Kilogramms Körperfett (kcal). */
const KCAL_PER_KG_FAT = 7700

/** Aktivitätsfaktoren OHNE Training (docs/ONBOARDING.md Screen 13). */
const BASE_ACTIVITY: Record<DailyActivity, number> = {
  sedentary: 1.2,
  light: 1.35,
  active: 1.5,
  very_active: 1.65,
}

/** Zuschlag pro Trainingseinheit pro Woche. */
const PER_SESSION_FACTOR = 0.025

/** Protein in g/kg — im Defizit höher, für Muskelschutz und Sättigung. */
const PROTEIN_PER_KG: Record<Goal, number> = {
  muscle: 1.8,
  strength: 1.8,
  fatloss: 2.2,
  fitness: 1.8,
}

/** Untergrenze Fett in g/kg (Hormonfunktion). */
const FAT_MIN_PER_KG = 0.8

/** Anteil der Kalorien aus Fett, wenn die Untergrenze nicht bindet. */
const FAT_SHARE = 0.25

/** Kalorienüberschuss beim Aufbau, nach Level (docs/TRAINING-SCIENCE.md §10). */
const SURPLUS_BY_LEVEL: Record<Level, number> = {
  beginner: 350,
  intermediate: 275,
  advanced: 200,
}

/** Zielrate beim Aufbau in % Körpergewicht pro Woche. */
const GAIN_RATE_BY_LEVEL: Record<Level, number> = {
  beginner: 0.375, // Mitte von 0,25–0,5 %
  intermediate: 0.175, // Mitte von 0,1–0,25 %
  advanced: 0.1,
}

/**
 * Grundumsatz nach Mifflin-St Jeor.
 *
 * Bei `unspecified` wird der Mittelwert beider Formeln genommen — das ist
 * die ehrlichste Behandlung einer fehlenden Angabe (docs/ONBOARDING.md
 * Screen 3).
 */
export function mifflinStJeor(input: {
  sex: Sex
  weightKg: number
  heightCm: number
  age: number
}): number {
  const { sex, weightKg, heightCm, age } = input
  const shared = 10 * weightKg + 6.25 * heightCm - 5 * age
  const offset = sex === 'male' ? 5 : sex === 'female' ? -161 : (5 - 161) / 2
  return shared + offset
}

/**
 * Aktivitätsfaktor aus Alltag UND Trainingsfrequenz.
 *
 * Bewusst getrennt: Die üblichen Rechner mischen beides in einen
 * Dropdown-Wert. Da die App die Trainingstage kennt, ist die getrennte
 * Rechnung genauer und nachvollziehbar.
 */
export function activityFactor(
  dailyActivity: DailyActivity,
  sessionsPerWeek: number,
): number {
  return BASE_ACTIVITY[dailyActivity] + PER_SESSION_FACTOR * sessionsPerWeek
}

/** Geschätzter Gesamtumsatz. */
export function estimateTdee(input: {
  sex: Sex
  weightKg: number
  heightCm: number
  age: number
  dailyActivity: DailyActivity
  sessionsPerWeek: number
}): number {
  const bmr = mifflinStJeor(input)
  return bmr * activityFactor(input.dailyActivity, input.sessionsPerWeek)
}

/**
 * Zielrate der Gewichtsveränderung in % Körpergewicht pro Woche.
 * Negativ = Abnahme.
 *
 * Bei Fettverlust entscheidet der Körperfettanteil, ob am oberen (0,7 %)
 * oder unteren Ende (0,5 %) angesetzt wird: Wer mehr Reserven hat, kann
 * schneller abnehmen, ohne Muskeln zu riskieren.
 */
export function targetRatePercentPerWeek(input: {
  goal: Goal
  level: Level
  bodyFatBucket?: string | null
}): number {
  switch (input.goal) {
    case 'fatloss':
      return -(hasHigherBodyFat(input.bodyFatBucket) ? 0.7 : 0.5)
    case 'muscle':
      return GAIN_RATE_BY_LEVEL[input.level]
    case 'strength':
    case 'fitness':
      return 0
  }
}

/**
 * Grobe Einordnung des Körperfett-Buckets. Die Buckets sind Zeichenketten
 * wie `"20-24"` oder `"lt10"` (docs/ONBOARDING.md Screen 6); relevant ist
 * nur, ob genug Reserven für die schnellere Rate da sind.
 */
function hasHigherBodyFat(bucket?: string | null): boolean {
  if (!bucket) return false
  const firstNumber = bucket.match(/\d+/)
  if (!firstNumber) return false
  return Number.parseInt(firstNumber[0], 10) >= 20
}

/**
 * Makro-Aufteilung für eine gegebene Kalorienzahl.
 *
 * Bewusst als eigene Funktion: Die Wochenanpassung (Regelkreis 3b) verändert
 * nur die Kalorien und muss die Makros danach mit GENAU derselben Regel neu
 * aufteilen. Zwei Kopien der Reihenfolge würden irgendwann auseinanderlaufen —
 * und dann unterschritte die Anpassung womöglich das Fett-Minimum.
 *
 * Reihenfolge nach docs/TRAINING-SCIENCE.md §10: Protein zuerst, dann Fett mit
 * Untergrenze, Kohlenhydrate als Rest.
 */
export function macrosFor(input: {
  kcal: number
  weightKg: number
  goal: Goal
}): { proteinG: number; fatG: number; carbsG: number } {
  const { kcal, weightKg, goal } = input

  // Protein zuerst — an das Körpergewicht gekoppelt, nicht an die Kalorien.
  const proteinG = Math.round(PROTEIN_PER_KG[goal] * weightKg)

  // Fett: Anteil der Kalorien, aber nie unter der Untergrenze
  const fatFromShare = (kcal * FAT_SHARE) / 9
  const fatFloor = FAT_MIN_PER_KG * weightKg
  const fatG = Math.round(Math.max(fatFromShare, fatFloor))

  // Kohlenhydrate als Rest
  const remaining = kcal - proteinG * 4 - fatG * 9
  const carbsG = Math.max(0, Math.round(remaining / 4))

  return { proteinG, fatG, carbsG }
}

export interface NutritionPlan {
  maintenanceKcal: number
  kcal: number
  proteinG: number
  fatG: number
  carbsG: number
  targetRatePercentPerWeek: number
  /** Erwartete Veränderung in kg pro Woche — für die Zusammenfassung. */
  expectedKgPerWeek: number
  /** Begründung, wie sie in der App angezeigt wird (docs/UI-UX.md §9). */
  reason: string
}

/**
 * Vollständige Ernährungsvorgabe.
 *
 * Reihenfolge der Makros nach docs/TRAINING-SCIENCE.md §10:
 * Protein zuerst, dann Fett mit Untergrenze, Kohlenhydrate als Rest.
 */
export function buildNutritionPlan(input: {
  sex: Sex
  weightKg: number
  heightCm: number
  age: number
  dailyActivity: DailyActivity
  sessionsPerWeek: number
  goal: Goal
  level: Level
  bodyFatBucket?: string | null
}): NutritionPlan {
  const maintenance = Math.round(estimateTdee(input))
  const rate = targetRatePercentPerWeek(input)
  const { weightKg, goal, level } = input

  let kcal = maintenance
  let reason: string

  if (goal === 'fatloss') {
    const kgPerWeek = (Math.abs(rate) / 100) * weightKg
    const dailyDeficit = Math.round((kgPerWeek * KCAL_PER_KG_FAT) / 7)
    kcal = maintenance - dailyDeficit
    reason =
      `Erhaltungsbedarf ${maintenance} kcal − ${dailyDeficit} kcal Defizit. ` +
      `Zielrate ${format(rate)} % Körpergewicht pro Woche — langsam genug, ` +
      `um die Muskelmasse zu schützen.`
  } else if (goal === 'muscle') {
    const surplus = SURPLUS_BY_LEVEL[level]
    kcal = maintenance + surplus
    reason =
      `Erhaltungsbedarf ${maintenance} kcal + ${surplus} kcal Überschuss. ` +
      `Größere Überschüsse erhöhen vor allem die Fettmasse, nicht die Muskelrate.`
  } else if (goal === 'strength') {
    kcal = maintenance
    reason =
      `Erhaltungsbedarf ${maintenance} kcal. Für Maximalkraft steht die ` +
      `Leistung im Vordergrund, nicht die Gewichtsveränderung.`
  } else {
    kcal = maintenance
    reason = `Erhaltungsbedarf ${maintenance} kcal — Gewicht halten.`
  }

  const { proteinG, fatG, carbsG } = macrosFor({ kcal, weightKg, goal })
  const expectedKgPerWeek = (rate / 100) * weightKg

  return {
    maintenanceKcal: maintenance,
    kcal: Math.round(kcal),
    proteinG,
    fatG,
    carbsG,
    targetRatePercentPerWeek: rate,
    expectedKgPerWeek: Math.round(expectedKgPerWeek * 100) / 100,
    reason,
  }
}

function format(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',')
}

/** Alter aus dem Geburtsjahr — bewusst grob, das genügt für die Formel. */
export function ageFromBirthYear(birthYear: number, at: Date = new Date()): number {
  return at.getFullYear() - birthYear
}
