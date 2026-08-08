// ====================================================================
//  Vorgaben pro Übung: Sätze, Wiederholungen, RIR, Pausen, Aufwärmen
//
//  Grundlage: docs/PLAN-ENGINE.md §6, abgeleitet aus
//  docs/TRAINING-SCIENCE.md §3 (Last/Wiederholungen), §4 (Nähe zum
//  Versagen) und §5 (Satzpausen).
//
//  Zwei Dinge, die hier nicht verhandelbar sind:
//   · Die Zielwiederholung ist eine KONKRETE ZAHL, kein Bereich — sonst
//     ist der Satz-Status nicht eindeutig auswertbar (§6).
//   · Bei schweren Grundübungen wird nie Muskelversagen vorgegeben. Nicht
//     aus Vorsicht, sondern weil es für Kraft nichts bringt und das
//     Volumen der Folgeübungen kostet (§4).
// ====================================================================

import { systemLoadRank } from './exerciseMeta'
import type { VolumeMuscle } from './muscles'
import { resolveMuscles } from './muscles'
import type { Exercise } from '../types'
import type { Goal, Intensity, SessionMinutes } from './records'

/** Grobe Einordnung, die Vorgaben und Reihenfolge steuert. */
export type ExerciseTier = 'heavy_compound' | 'compound' | 'isolation'

/** Ab diesem Systemlast-Rang gilt eine Grundübung als schwer. */
const HEAVY_THRESHOLD = 60

export function tierOf(exercise: Exercise): ExerciseTier {
  if (!exercise.compound) return 'isolation'
  return systemLoadRank(exercise) >= HEAVY_THRESHOLD ? 'heavy_compound' : 'compound'
}

interface TierSpec {
  sets: number
  repMin: number
  repMax: number
  rir: number
  restSeconds: number
}

/** Vorgaben je Ziel und Stufe (docs/PLAN-ENGINE.md §6). */
const SPEC: Record<Goal, Record<ExerciseTier, TierSpec>> = {
  muscle: {
    heavy_compound: { sets: 4, repMin: 5, repMax: 10, rir: 2, restSeconds: 150 },
    compound: { sets: 3, repMin: 8, repMax: 12, rir: 1, restSeconds: 120 },
    isolation: { sets: 3, repMin: 10, repMax: 15, rir: 1, restSeconds: 75 },
  },
  strength: {
    heavy_compound: { sets: 5, repMin: 3, repMax: 6, rir: 2, restSeconds: 180 },
    compound: { sets: 4, repMin: 5, repMax: 8, rir: 2, restSeconds: 150 },
    isolation: { sets: 3, repMin: 8, repMax: 12, rir: 1, restSeconds: 90 },
  },
  fatloss: {
    // Volumen sinkt, aber die LAST bleibt schwer — sie ist das Signal für
    // Muskelerhalt (docs/TRAINING-SCIENCE.md §3, §10).
    heavy_compound: { sets: 3, repMin: 5, repMax: 10, rir: 2, restSeconds: 150 },
    compound: { sets: 3, repMin: 8, repMax: 12, rir: 1, restSeconds: 120 },
    isolation: { sets: 2, repMin: 10, repMax: 15, rir: 1, restSeconds: 75 },
  },
  fitness: {
    heavy_compound: { sets: 3, repMin: 6, repMax: 12, rir: 2, restSeconds: 150 },
    compound: { sets: 3, repMin: 8, repMax: 12, rir: 1, restSeconds: 120 },
    isolation: { sets: 3, repMin: 10, repMax: 15, rir: 1, restSeconds: 75 },
  },
}

/**
 * Muskeln, die höhere Wiederholungen vertragen und dort besser anschlagen.
 * Waden und Bauch arbeiten im Alltag ohnehin in hohen Wiederholungszahlen.
 */
const HIGH_REP_MUSCLES: Partial<Record<VolumeMuscle, { repMin: number; repMax: number }>> = {
  Waden: { repMin: 10, repMax: 20 },
  Bauch: { repMin: 12, repMax: 20 },
  Unterarme: { repMin: 12, repMax: 20 },
  Schienbein: { repMin: 15, repMax: 25 },
}

/** Kürzere Pausen bei knappem Zeitbudget — nie unter 60 s (§5). */
const REST_FLOOR = 60

function restForBudget(base: number, minutes: SessionMinutes, tier: ExerciseTier): number {
  if (minutes > 45) return base
  // Bei 45 Minuten zuerst die Isolationspausen kürzen: Dort kostet die
  // Kürzung am wenigsten Leistung (docs/PLAN-ENGINE.md §5).
  const shortened = tier === 'isolation' ? base - 15 : base - 30
  return Math.max(REST_FLOOR, shortened)
}

/**
 * Verschiebt den Ziel-RIR gemäß Intensitätsvoreinstellung.
 *
 * Untergrenze bei schweren Grundübungen ist 1 — Versagen bleibt dort
 * ausgeschlossen (docs/PLAN-ENGINE.md §11).
 */
function rirForIntensity(base: number, intensity: Intensity, tier: ExerciseTier): number {
  const shift = intensity === 'moderate' ? 1 : intensity === 'very_demanding' ? -1 : 0
  const floor = tier === 'heavy_compound' ? 1 : 0
  return Math.max(floor, base + shift)
}

export interface WarmupSpec {
  /** Anteil des Arbeitsgewichts. */
  fraction: number
  reps: number
}

/**
 * Aufwärmsätze nur vor der ersten schweren Grundübung einer Muskelgruppe
 * (docs/PLAN-ENGINE.md §6). Sie zählen nie ins Volumen.
 */
export function warmupsFor(tier: ExerciseTier, targetReps: number): WarmupSpec[] {
  if (tier !== 'heavy_compound') return []
  const sets: WarmupSpec[] = [
    { fraction: 0.5, reps: 8 },
    { fraction: 0.7, reps: 5 },
  ]
  // Bei niedrigen Wiederholungen liegt das Arbeitsgewicht hoch — dann ein
  // dritter Aufwärmsatz näher am Ziel.
  if (targetReps <= 6) sets.push({ fraction: 0.85, reps: 3 })
  return sets
}

export interface Prescription {
  tier: ExerciseTier
  sets: number
  /** Konkrete Zielzahl, nicht der Bereich. */
  targetReps: number | null
  repRangeMin: number | null
  repRangeMax: number | null
  /** Bei zeitbasierten Übungen statt Wiederholungen. */
  targetSeconds: number | null
  targetRir: number
  restSeconds: number
  warmups: WarmupSpec[]
  /** Beim letzten Satz einer Isolationsübung ist Versagen erwünscht (§2). */
  lastSetToFailure: boolean
}

export interface PrescriptionInput {
  exercise: Exercise
  goal: Goal
  intensity: Intensity
  sessionMinutes: SessionMinutes
  /** Überschreibt die Standard-Satzzahl, wenn das Volumen es verlangt. */
  sets?: number
  /** Erste schwere Grundübung für diesen Muskel in der Einheit? */
  isFirstForMuscle?: boolean
}

/** Zeitbasierte Übungen (Planks, Carries) progressieren über die Dauer. */
const TIME_DEFAULTS = { sets: 3, seconds: 40, restSeconds: 60 }

export function prescribe(input: PrescriptionInput): Prescription {
  const { exercise, goal, intensity, sessionMinutes } = input
  const tier = tierOf(exercise)
  const base = SPEC[goal][tier]

  if (exercise.metric === 'time') {
    return {
      tier,
      sets: input.sets ?? TIME_DEFAULTS.sets,
      targetReps: null,
      repRangeMin: null,
      repRangeMax: null,
      targetSeconds: TIME_DEFAULTS.seconds,
      targetRir: rirForIntensity(base.rir, intensity, tier),
      restSeconds: restForBudget(TIME_DEFAULTS.restSeconds, sessionMinutes, tier),
      warmups: [],
      lastSetToFailure: false,
    }
  }

  // Wiederholungsbereich, ggf. für hochwiederholungsfreundliche Muskeln
  let repMin = base.repMin
  let repMax = base.repMax
  const primaryMuscle = firstMuscle(exercise)
  const override = primaryMuscle ? HIGH_REP_MUSCLES[primaryMuscle] : undefined
  if (override && tier === 'isolation') {
    repMin = override.repMin
    repMax = override.repMax
  }

  const targetReps = repMin // Die Zielzahl wandert über die Wochen nach oben
  const targetRir = rirForIntensity(base.rir, intensity, tier)

  return {
    tier,
    sets: input.sets ?? base.sets,
    targetReps,
    repRangeMin: repMin,
    repRangeMax: repMax,
    targetSeconds: null,
    targetRir,
    restSeconds: restForBudget(base.restSeconds, sessionMinutes, tier),
    warmups: (input.isFirstForMuscle ?? true) ? warmupsFor(tier, targetReps) : [],
    // Nur bei Isolation, und nur wenn die Intensität es zulässt.
    lastSetToFailure: tier === 'isolation' && targetRir <= 1,
  }
}

function firstMuscle(exercise: Exercise): VolumeMuscle | null {
  for (const raw of exercise.primary) {
    const muscles = resolveMuscles(raw)
    if (muscles.length > 0) return muscles[0]
  }
  return null
}
