// ====================================================================
//  Gerätegerechte Gewichtsberechnung
//
//  Harte Regel aus gym-geraete.md: Vorgeschlagene Gewichte müssen immer
//  auf eine real einstellbare Stufe des Geräts gerundet werden.
//  Keine "37 kg" an einem Steckgewicht mit 5-kg-Blöcken.
//
//  Sonderfall FRE-11 (unterstützte Klimmzug-/Dip-Maschine): INVERTIERT —
//  mehr Gewicht bedeutet weniger Widerstand. Ohne Sonderbehandlung würde
//  die App den Nutzer rückwärts progressieren lassen.
//  Siehe docs/PLAN-ENGINE.md §6 und §11.
// ====================================================================

import type { Equipment, Exercise } from '../types'

/** Kleinste Kurzhantel-Abstufung wechselt bei 10 kg (gym-geraete.md §1). */
const DUMBBELL_STEP_BELOW_10 = 1
const DUMBBELL_STEP_FROM_10 = 2
const DUMBBELL_SWITCH_AT = 10

/** Kurzhanteln gibt es von 1 bis 60 kg. */
const DUMBBELL_MIN = 1
const DUMBBELL_MAX = 60

/** ID der Kurzhantel-"Geräte" — dort gilt die gestaffelte Schrittweite. */
const DUMBBELL_ID = 'FRE-01'

/** Unterstützte Klimmzug-/Dip-Maschine: mehr Gewicht = leichter. */
export const INVERTED_EQUIPMENT_ID = 'FRE-11'

/**
 * Schrittweite eines Geräts an einer bestimmten Laststelle.
 *
 * Bei Kurzhanteln ist die Schrittweite lastabhängig, deshalb wird das
 * aktuelle Gewicht mit übergeben. `null` = Gerät kennt kein Gewicht
 * (Körpergewicht, Cardio, Zubehör).
 */
export function stepAt(equipment: Equipment, weightKg: number): number | null {
  if (equipment.stepKg === null) return null
  if (equipment.id === DUMBBELL_ID) {
    return weightKg < DUMBBELL_SWITCH_AT ? DUMBBELL_STEP_BELOW_10 : DUMBBELL_STEP_FROM_10
  }
  return equipment.stepKg
}

/**
 * Rundet ein Wunschgewicht auf eine real einstellbare Stufe.
 *
 * Standard ist Abrunden: Ein etwas zu leichter Satz wird von der
 * Sofortkorrektur (Regelkreis 1) sauber nachgezogen, ein zu schwerer
 * kostet Vertrauen und ist ein Verletzungsrisiko.
 */
export function roundToStep(
  equipment: Equipment,
  desiredKg: number,
  mode: 'down' | 'nearest' | 'up' = 'down',
): number | null {
  const step = stepAt(equipment, desiredKg)
  if (step === null) return null

  // Gleitkomma-Toleranz: 100 × 1,1 ergibt in JavaScript 110.00000000000001.
  // Ohne Epsilon würde ceil() daraus 115 statt 110 machen — bei 2,5-kg-Stufen
  // tritt das ständig auf und erzeugt systematisch zu hohe Vorgaben.
  const EPSILON = 1e-9
  const quotient = desiredKg / step

  const raw =
    mode === 'down'
      ? Math.floor(quotient + EPSILON)
      : mode === 'up'
        ? Math.ceil(quotient - EPSILON)
        : Math.round(quotient)

  let result = raw * step

  // Restliche Gleitkomma-Artefakte aus der Multiplikation entfernen
  // (z.B. 3 × 2,5 = 7.500000000000001).
  result = Math.round(result * 1000) / 1000

  if (equipment.id === DUMBBELL_ID) {
    // An der 10-kg-Grenze kann das Abrunden mit Schrittweite 2 unter 10
    // landen (z.B. 10,5 → 10). Auf das Kurzhantel-Raster korrigieren.
    result = snapDumbbell(result, mode)
    result = clamp(result, DUMBBELL_MIN, DUMBBELL_MAX)
  }

  if (equipment.maxKg !== null) result = Math.min(result, equipment.maxKg)

  // Bei invertierten Geräten ist 0 gültig und bedeutet "ohne Unterstützung".
  if (equipment.inverted) return Math.max(result, 0)

  // Sonst nie unter eine Stufe fallen — 0 kg ist keine gültige Vorgabe.
  return Math.max(result, step)
}

function snapDumbbell(kg: number, mode: 'down' | 'nearest' | 'up'): number {
  if (kg < DUMBBELL_SWITCH_AT) {
    return Math.round(kg) // 1-kg-Raster
  }
  // Ab 10 kg nur gerade Werte
  if (kg % DUMBBELL_STEP_FROM_10 === 0) return kg
  return mode === 'up' ? kg + 1 : kg - 1
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Verändert ein Gewicht um n Stufen — die Grundoperation der Progression.
 *
 * `steps` ist immer im Sinne von SCHWERER (positiv) bzw. LEICHTER (negativ)
 * gemeint, nicht im Sinne der Gerätebeschriftung. Bei invertierten Geräten
 * wird die Richtung deshalb intern umgedreht: "eine Stufe schwerer" heißt
 * dort WENIGER Unterstützungsgewicht.
 */
export function adjustBySteps(
  equipment: Equipment,
  currentKg: number,
  steps: number,
): number | null {
  const step = stepAt(equipment, currentKg)
  if (step === null) return null

  const direction = equipment.inverted ? -1 : 1
  const target = currentKg + steps * step * direction

  // Bei invertierten Geräten ist 0 gültig und bedeutet "ohne Unterstützung".
  if (equipment.inverted) {
    const rounded = Math.round(target / step) * step
    const capped = equipment.maxKg !== null ? Math.min(rounded, equipment.maxKg) : rounded
    return Math.max(capped, 0)
  }

  return roundToStep(equipment, target, steps >= 0 ? 'up' : 'down')
}

/**
 * Prozentuale Änderung, auf Gerätestufen gerundet — für Deloads
 * und Rückschritte ("Gewicht −10 %", docs/PLAN-ENGINE.md §9).
 */
export function adjustByPercent(
  equipment: Equipment,
  currentKg: number,
  percent: number,
): number | null {
  const factor = 1 + percent / 100
  // Bei invertierten Geräten heißt "leichter" MEHR Unterstützung.
  const target = equipment.inverted ? currentKg * (2 - factor) : currentKg * factor
  const mode = percent >= 0 ? 'up' : 'down'
  if (equipment.inverted) {
    const step = stepAt(equipment, currentKg)
    if (step === null) return null
    return Math.max(Math.round(target / step) * step, 0)
  }
  return roundToStep(equipment, target, mode)
}

/**
 * Ist das Gewicht bei diesem Gerät invertiert beschriftet?
 * Die Oberfläche muss das anzeigen ("Unterstützung 30 kg — weniger =
 * schwerer"), sonst progressiert der Nutzer versehentlich rückwärts.
 */
export function isInverted(equipment: Equipment): boolean {
  return equipment.inverted
}

/** Beschriftung des Gewichtsfeldes für die Oberfläche (docs/UI-UX.md §5.2). */
export function weightLabel(equipment: Equipment): {
  label: string
  hint: string | null
} {
  if (equipment.inverted) {
    return {
      label: 'Unterstützung',
      hint: 'weniger Unterstützung = schwerer',
    }
  }
  return { label: 'Gewicht', hint: null }
}

// --------------------------------------------------------------------
//  1RM-Schätzung
// --------------------------------------------------------------------

/**
 * Obergrenze für die 1RM-Schätzung (docs/ONBOARDING.md Teil 6).
 * Oberhalb von 12 Wiederholungen wird Epley unzuverlässig.
 */
export const E1RM_MAX_REPS = 12

/**
 * Geschätztes 1RM nach Epley: 1RM ≈ Gewicht × (1 + Wdh / 30)
 *
 * Gibt `null` zurück, wenn die Wiederholungszahl außerhalb des
 * verlässlichen Bereichs liegt — eine Schätzung mit bekannt großem
 * Fehler ist schlechter als keine.
 */
export function estimate1RM(weightKg: number, reps: number): number | null {
  if (reps < 1 || reps > E1RM_MAX_REPS) return null
  if (weightKg <= 0) return null
  return weightKg * (1 + reps / 30)
}

/**
 * Umkehrung: Welches Gewicht ist für n Wiederholungen zu erwarten?
 * Grundlage der Gewichtsvorgabe (docs/PLAN-ENGINE.md §6).
 */
export function weightForReps(oneRepMaxKg: number, reps: number): number {
  return oneRepMaxKg / (1 + reps / 30)
}

/**
 * Das Erstwochen-Sicherheitspolster (docs/PLAN-ENGINE.md §6, §2):
 * In der Einmess-Woche wird bewusst 8 % unter der Schätzung angesetzt.
 */
export const CALIBRATION_FACTOR = 0.92

/**
 * Wählt die Übungs-Referenz für die Gewichtsvorgabe: das erste Gerät der
 * Übung, das überhaupt ein Gewicht kennt.
 */
export function loadBearingEquipment(
  exercise: Exercise,
  equipmentById: ReadonlyMap<string, Equipment>,
): Equipment | null {
  for (const id of exercise.equipmentIds) {
    const eq = equipmentById.get(id)
    if (eq && eq.stepKg !== null) return eq
  }
  return null
}
