// ====================================================================
//  Fraktionale Volumenzählung
//
//  Grundlage: Pelland et al. (2025) — für die Vorhersage von Hypertrophie
//  ist die "fraktionale" Zählweise entscheidend: direkte Sätze zählen 1,0,
//  indirekte (mittrainierte) 0,5.
//  Siehe docs/TRAINING-SCIENCE.md §1 und docs/PLAN-ENGINE.md §3.
//
//  Praktische Bedeutung: 4 Sätze Klimmzüge zählen 4,0 für den Lat und
//  2,0 für den Bizeps. Die App weiß dadurch, dass der Bizeps nach dem
//  Rückentag schon versorgt ist — und plant weniger direkte Armarbeit.
// ====================================================================

import type { Exercise } from '../types'
import { resolveMuscles, type VolumeMuscle } from './muscles'

/** Gewichtung nach docs/TRAINING-SCIENCE.md §1. */
export const PRIMARY_WEIGHT = 1.0
export const SECONDARY_WEIGHT = 0.5

/** Fraktionale Sätze pro Volumen-Muskel. Fehlender Eintrag = 0. */
export type VolumeMap = Partial<Record<VolumeMuscle, number>>

/**
 * Beitrag EINES Satzes, getrennt nach direkt und indirekt.
 *
 * Zwei Regeln, die sich beim Prüfen der echten Datenbank als notwendig
 * erwiesen haben:
 *
 * 1. **Eine Bezeichnung, mehrere Muskeln → aufteilen.**
 *    "vord. + seitl. Schulter" ist EIN Eintrag über zwei Muskeln; die
 *    Verteilung ist unbekannt, also je die Hälfte. Zwei getrennte
 *    Einträge (`["Brust", "Lat"]` beim Überzug) sind dagegen zwei bewusst
 *    genannte Ziele und bekommen jeweils das volle Gewicht — Volumen wird
 *    ja PRO MUSKEL geführt, nicht als globales Budget.
 *
 * 2. **Mehrere Bezeichnungen auf denselben Muskel → Maximum, nicht Summe.**
 *    Stehen "Brust (oben)" und "Brust (mittel)" beide als primär, ist das
 *    trotzdem nur EIN Satz Brustarbeit. Ohne diese Regel würde das
 *    Volumen systematisch überschätzt.
 */
function contributionParts(exercise: Exercise): {
  direct: VolumeMap
  combined: VolumeMap
} {
  if (exercise.metric === 'cardio') {
    // Die App plant kein Cardio (docs/PLAN-ENGINE.md §4). Außerdem steht in
    // der Cardio-Tabelle der Quelldatei in der letzten Spalte "Hinweis"
    // statt "Sekundär" — daraus darf kein Krafttrainings-Volumen entstehen.
    return { direct: {}, combined: {} }
  }

  const collect = (names: readonly string[], weight: number): VolumeMap => {
    const out: VolumeMap = {}
    for (const raw of names) {
      const muscles = resolveMuscles(raw)
      if (muscles.length === 0) continue // bewusst ignoriert (siehe muscles.ts)
      const share = weight / muscles.length
      for (const m of muscles) {
        out[m] = Math.max(out[m] ?? 0, share) // Regel 2
      }
    }
    return out
  }

  const direct = collect(exercise.primary, PRIMARY_WEIGHT)
  const indirect = collect(exercise.secondary, SECONDARY_WEIGHT)

  // Ein Muskel, der primär UND sekundär genannt ist, zählt als primär.
  const combined: VolumeMap = { ...direct }
  for (const [m, v] of Object.entries(indirect) as [VolumeMuscle, number][]) {
    combined[m] = Math.max(combined[m] ?? 0, v)
  }

  return { direct, combined }
}

/** Fraktionaler Volumenbeitrag EINES Satzes dieser Übung. */
export function setContribution(exercise: Exercise): VolumeMap {
  return contributionParts(exercise).combined
}

/**
 * Wie viele Sätze zählt ein geplanter/geloggter Eintrag?
 *
 * Unilaterale Übungen zählen BEIDE SEITEN (docs/TRAINING-SCIENCE.md §1):
 * 3 Sätze einarmig = 6 gezählte Sätze. Aufwärmsätze zählen nie.
 */
export function countedSets(exercise: Exercise, sets: number, isWarmup = false): number {
  if (isWarmup) return 0
  return exercise.unilateral ? sets * 2 : sets
}

/** Volumenbeitrag mehrerer Sätze derselben Übung. */
export function exerciseVolume(
  exercise: Exercise,
  sets: number,
  isWarmup = false,
): VolumeMap {
  const counted = countedSets(exercise, sets, isWarmup)
  if (counted === 0) return {}

  const per = setContribution(exercise)
  const out: VolumeMap = {}
  for (const [muscle, share] of Object.entries(per) as [VolumeMuscle, number][]) {
    out[muscle] = share * counted
  }
  return out
}

/** Addiert mehrere Volumen-Verteilungen. */
export function sumVolume(maps: Iterable<VolumeMap>): VolumeMap {
  const out: VolumeMap = {}
  for (const map of maps) {
    for (const [muscle, value] of Object.entries(map) as [VolumeMuscle, number][]) {
      out[muscle] = (out[muscle] ?? 0) + value
    }
  }
  return out
}

/** Ein Eintrag für die Volumenrechnung — geplant oder tatsächlich geloggt. */
export interface VolumeEntry {
  exercise: Exercise
  sets: number
  isWarmup?: boolean
}

/** Gesamtvolumen einer Einheit oder Woche. */
export function totalVolume(entries: Iterable<VolumeEntry>): VolumeMap {
  const maps: VolumeMap[] = []
  for (const e of entries) {
    maps.push(exerciseVolume(e.exercise, e.sets, e.isWarmup ?? false))
  }
  return sumVolume(maps)
}

/**
 * Rundet auf eine Nachkommastelle — nur für die Anzeige.
 * Intern wird immer mit dem vollen Wert gerechnet, damit sich
 * Rundungsfehler nicht über eine Woche aufsummieren.
 */
export function forDisplay(map: VolumeMap): VolumeMap {
  const out: VolumeMap = {}
  for (const [muscle, value] of Object.entries(map) as [VolumeMuscle, number][]) {
    out[muscle] = Math.round(value * 10) / 10
  }
  return out
}

/**
 * Anteil des Volumens, der aus INDIREKTER Arbeit stammt.
 * Der Fortschritts-Screen zeigt das in anderer Farbe (docs/UI-UX.md §8) —
 * es macht sichtbar, warum weniger direkte Armarbeit geplant wird.
 */
export function directVsIndirect(entries: Iterable<VolumeEntry>): {
  direct: VolumeMap
  indirect: VolumeMap
} {
  const directMaps: VolumeMap[] = []
  const indirectMaps: VolumeMap[] = []

  for (const { exercise, sets, isWarmup } of entries) {
    const counted = countedSets(exercise, sets, isWarmup ?? false)
    if (counted === 0) continue

    const { direct, combined } = contributionParts(exercise)

    const d: VolumeMap = {}
    const i: VolumeMap = {}
    for (const [m, total] of Object.entries(combined) as [VolumeMuscle, number][]) {
      const directShare = direct[m] ?? 0
      if (directShare > 0) d[m] = directShare * counted
      // Der indirekte Rest ist die Differenz — so ergibt direkt + indirekt
      // per Konstruktion genau das Gesamtvolumen, auch wenn ein Muskel
      // primär und sekundär genannt ist.
      const indirectShare = total - directShare
      if (indirectShare > 0) i[m] = indirectShare * counted
    }

    directMaps.push(d)
    indirectMaps.push(i)
  }

  return { direct: sumVolume(directMaps), indirect: sumVolume(indirectMaps) }
}
