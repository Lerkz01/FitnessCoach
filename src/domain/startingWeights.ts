// ====================================================================
//  Startgewichte
//
//  Aufgabe: Aus den 6 Referenzangaben des Onboardings ein Arbeitsgewicht
//  für JEDE der 381 Übungen ableiten (docs/ONBOARDING.md Teil 6).
//
//  Weg in drei Stufen:
//   1. Referenzangabe → geschätztes 1RM des Bewegungsmusters
//   2. 1RM × Koeffizient der Zielübung → Arbeitsgewicht bei n Wdh.
//   3. Auf eine real einstellbare Gerätestufe runden
//
//  Fehlt eine Referenz, greift ein Körpergewichtsvielfaches als Rückfall.
//  Das ist eine grobe Schätzung — sie wird deshalb als solche markiert und
//  in der ersten Einheit eingemessen (Regelkreis 1).
// ====================================================================

import { equipmentById } from '../data'
import type { Exercise } from '../types'
import { loadEstimateOf, PATTERN_REFERENCE } from './exerciseMeta'
import type { Level, MovementPattern, Sex, StrengthReference } from './records'
import {
  CALIBRATION_FACTOR,
  estimate1RM,
  loadBearingEquipment,
  roundToStep,
  weightForReps,
} from './weights'

/**
 * Geschätztes 1RM je Bewegungsmuster, in Kilogramm der REFERENZÜBUNG.
 * `null` = keine Angabe, es greift der Rückfall.
 */
export type PatternMaxes = Partial<Record<MovementPattern, number>>

/**
 * Rückfall-Vielfache des Körpergewichts für ein 1RM.
 *
 * Bewusst konservativ angesetzt: Ein zu leichter erster Satz ist harmlos
 * und wird sofort korrigiert, ein zu schwerer kostet Vertrauen und ist ein
 * Verletzungsrisiko (docs/PLAN-ENGINE.md §2).
 */
const BODYWEIGHT_MULTIPLE: Record<MovementPattern, Record<Level, number>> = {
  squat: { beginner: 0.7, intermediate: 1.15, advanced: 1.6 },
  hinge: { beginner: 0.9, intermediate: 1.4, advanced: 1.95 },
  horizontal_push: { beginner: 0.5, intermediate: 0.85, advanced: 1.2 },
  vertical_push: { beginner: 0.32, intermediate: 0.52, advanced: 0.72 },
  horizontal_pull: { beginner: 0.45, intermediate: 0.7, advanced: 0.95 },
  vertical_pull: { beginner: 0.45, intermediate: 0.7, advanced: 0.95 },
}

/**
 * Anpassung der Rückfall-Schätzung nach Geschlecht.
 *
 * Betrifft ausschließlich die ABSOLUTE Startschätzung — relative Zuwächse
 * und das gesamte Programm sind identisch (docs/TRAINING-SCIENCE.md §11).
 * Der Wert wird nach der ersten Einheit ohnehin durch echte Daten ersetzt.
 */
const SEX_FACTOR: Record<Sex, { upper: number; lower: number }> = {
  male: { upper: 1, lower: 1 },
  female: { upper: 0.62, lower: 0.75 },
  unspecified: { upper: 0.81, lower: 0.88 },
}

const LOWER_BODY_PATTERNS: MovementPattern[] = ['squat', 'hinge']

/**
 * Klimmzüge lassen sich nicht direkt in ein Latzug-1RM umrechnen.
 * Anhaltswert: Wer bei eigenem Körpergewicht n saubere Wiederholungen
 * schafft, zieht am Latzug etwa (0,55 + 0,035 · n) × Körpergewicht als 1RM.
 */
function pulldownMaxFromPullups(reps: number, bodyweightKg: number): number {
  const factor = Math.min(1.25, 0.55 + 0.035 * reps)
  return factor * bodyweightKg
}

/** Übungen, deren Referenzangabe reine Wiederholungen mit Körpergewicht ist. */
const BODYWEIGHT_REFERENCE_IDS = new Set(['RUE-012', 'RUE-014', 'BRU-032', 'TRI-002'])

/**
 * Rechnet die Referenzangaben in 1RM-Werte je Bewegungsmuster um.
 *
 * Wurde eine andere Variante als die Referenzübung angegeben, wird über
 * deren Koeffizienten zurückgerechnet: 1RM_Muster = 1RM_Angabe / Koeffizient.
 */
export function patternMaxesFromReferences(input: {
  references: readonly StrengthReference[]
  exerciseById: ReadonlyMap<string, Exercise>
  bodyweightKg: number
}): PatternMaxes {
  const { references, exerciseById, bodyweightKg } = input
  const out: PatternMaxes = {}

  for (const reference of references) {
    const exercise = exerciseById.get(reference.exerciseId)
    if (!exercise) continue

    // Körpergewichtsübungen: nur Wiederholungen bekannt
    if (reference.weightKg === null && BODYWEIGHT_REFERENCE_IDS.has(reference.exerciseId)) {
      if (reference.exerciseId === 'RUE-012' || reference.exerciseId === 'RUE-014') {
        const estimate = pulldownMaxFromPullups(reference.reps, bodyweightKg)
        out.vertical_pull = Math.max(out.vertical_pull ?? 0, estimate)
      }
      // Liegestütze und Dips sind als 1RM-Grundlage zu unzuverlässig —
      // sie fließen nur in die Wiederholungsvorgabe ein, nicht ins Gewicht.
      continue
    }

    if (reference.weightKg === null || reference.weightKg <= 0) continue

    const oneRepMax = estimate1RM(reference.weightKg, reference.reps)
    if (oneRepMax === null) continue

    const estimate = loadEstimateOf(exercise)
    const pattern = estimate.pattern ?? reference.pattern
    const coefficient = estimate.basis === 'pattern' ? estimate.coefficient : 1

    if (coefficient <= 0) continue
    const patternMax = oneRepMax / coefficient
    out[pattern] = Math.max(out[pattern] ?? 0, patternMax)
  }

  return out
}

/** Füllt fehlende Muster mit Körpergewichtsvielfachen auf. */
export function withFallbacks(
  maxes: PatternMaxes,
  input: { bodyweightKg: number; level: Level; sex: Sex },
): { maxes: PatternMaxes; estimated: Set<MovementPattern> } {
  const { bodyweightKg, level, sex } = input
  const filled: PatternMaxes = { ...maxes }
  const estimated = new Set<MovementPattern>()

  for (const pattern of Object.keys(PATTERN_REFERENCE) as MovementPattern[]) {
    if (filled[pattern] !== undefined && filled[pattern]! > 0) continue
    const multiple = BODYWEIGHT_MULTIPLE[pattern][level]
    const factor = LOWER_BODY_PATTERNS.includes(pattern)
      ? SEX_FACTOR[sex].lower
      : SEX_FACTOR[sex].upper
    filled[pattern] = bodyweightKg * multiple * factor
    estimated.add(pattern)
  }

  return { maxes: filled, estimated }
}

export interface StartingWeight {
  /** `null` = Körpergewichtsübung ohne einstellbare Last. */
  weightKg: number | null
  /**
   * Wie verlässlich der Wert ist. `low` = konservativ geschätzt, die App
   * korrigiert in der ersten Einheit deutlicher (Regelkreis 1).
   */
  confidence: 'high' | 'medium' | 'low'
}

export interface StartingWeightInput {
  exercise: Exercise
  targetReps: number
  maxes: PatternMaxes
  estimatedPatterns: ReadonlySet<MovementPattern>
  bodyweightKg: number
  /** In der Einmess-Woche wird zusätzlich Sicherheitsabstand gelassen. */
  calibrationWeek: boolean
}

/**
 * Arbeitsgewicht für eine Übung, gerundet auf eine real einstellbare Stufe.
 */
export function startingWeightFor(input: StartingWeightInput): StartingWeight {
  const { exercise, targetReps, maxes, estimatedPatterns, bodyweightKg, calibrationWeek } =
    input

  const estimate = loadEstimateOf(exercise)
  if (estimate.basis === 'none') return { weightKg: null, confidence: 'high' }

  const equipment = loadBearingEquipment(exercise, equipmentById)
  if (!equipment) return { weightKg: null, confidence: 'high' }

  let raw: number
  let confidence: StartingWeight['confidence']

  if (estimate.basis === 'pattern' && estimate.pattern) {
    const patternMax = maxes[estimate.pattern]
    if (patternMax === undefined || patternMax <= 0) {
      return { weightKg: null, confidence: 'low' }
    }
    const exerciseMax = patternMax * estimate.coefficient
    raw = weightForReps(exerciseMax, targetReps)

    const patternEstimated = estimatedPatterns.has(estimate.pattern)
    confidence =
      estimate.confidence === 'explicit' && !patternEstimated
        ? 'high'
        : patternEstimated
          ? 'low'
          : 'medium'
  } else {
    // Isolation über den Körpergewichtsanteil. Der Anteil ist auf einen
    // mittleren Wiederholungsbereich (~12) kalibriert; für andere
    // Zielzahlen wird linear über die Epley-Beziehung umgerechnet.
    const referenceReps = 12
    const atReference = bodyweightKg * estimate.coefficient
    const pseudoMax = atReference * (1 + referenceReps / 30)
    raw = weightForReps(pseudoMax, targetReps)
    confidence = 'low'
  }

  if (calibrationWeek) raw *= CALIBRATION_FACTOR

  raw = applyPlausibilityCap(raw, equipment.id, bodyweightKg)

  const rounded = roundToStep(equipment, raw, 'down')
  return { weightKg: rounded, confidence }
}

/**
 * Obergrenze pro Hand bei Kurzhanteln, als Anteil des Körpergewichts.
 *
 * Nötig, weil die Körpergewichtsanteile pro MUSKEL definiert sind, nicht
 * pro Gerät: Der Wadenanteil von 0,9 ist für die Wadenmaschine gedacht,
 * ergab an der Kurzhantel aber 60 kg pro Hand für einen Farmer's Walk.
 * Eine geräteseitige Plausibilitätsgrenze fängt solche Ausreißer ab,
 * unabhängig davon, welcher Muskel gerade das Ziel ist.
 */
const DUMBBELL_MAX_SHARE_OF_BODYWEIGHT = 0.45

function applyPlausibilityCap(
  weightKg: number,
  equipmentId: string,
  bodyweightKg: number,
): number {
  if (equipmentId === 'FRE-01') {
    return Math.min(weightKg, bodyweightKg * DUMBBELL_MAX_SHARE_OF_BODYWEIGHT)
  }
  return weightKg
}
