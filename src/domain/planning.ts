// ====================================================================
//  Ableitung von Split und Volumenbudget
//
//  Grundlage: docs/PLAN-ENGINE.md §3 und §4.
//
//  Beides wird ABGELEITET, nicht abgefragt. Der Nutzer wählt nur seine
//  Trainingstage; welcher Split daraus folgt und wie viel Volumen pro
//  Muskel angesetzt wird, entscheidet der Motor.
// ====================================================================

import type { VolumeMuscle } from './muscles'
import type { Goal, Level, SplitType, Weekday } from './records'
import { WEEKDAYS } from './records'

/**
 * Wochen-Zielsätze pro Muskel (fraktional gezählt).
 *
 * Tabelle aus docs/PLAN-ENGINE.md §3. Große Muskeln brauchen mehr direktes
 * Volumen, kleine bekommen viel indirekt — die vordere Schulter etwa hat
 * bewusst ein niedriges Budget, weil sie aus jedem Drückmuster mitversorgt
 * wird.
 */
interface VolumeRow {
  beginner: number
  intermediate: number
  advanced: number
  ceiling: number
  diet: number
}

export const VOLUME_TABLE: Record<VolumeMuscle, VolumeRow> = {
  Brust: { beginner: 9, intermediate: 13, advanced: 15, ceiling: 22, diet: 9 },
  Lat: { beginner: 9, intermediate: 13, advanced: 15, ceiling: 22, diet: 9 },
  'Oberer Rücken': { beginner: 9, intermediate: 13, advanced: 15, ceiling: 22, diet: 9 },
  Quadrizeps: { beginner: 9, intermediate: 13, advanced: 15, ceiling: 22, diet: 9 },
  Hamstrings: { beginner: 8, intermediate: 11, advanced: 13, ceiling: 18, diet: 8 },
  Gesäß: { beginner: 8, intermediate: 11, advanced: 13, ceiling: 20, diet: 8 },
  'Seitliche Schulter': { beginner: 7, intermediate: 10, advanced: 12, ceiling: 20, diet: 7 },
  'Hintere Schulter': { beginner: 6, intermediate: 9, advanced: 11, ceiling: 18, diet: 6 },
  'Vordere Schulter': { beginner: 5, intermediate: 7, advanced: 8, ceiling: 12, diet: 5 },
  Bizeps: { beginner: 7, intermediate: 10, advanced: 12, ceiling: 18, diet: 7 },
  Trizeps: { beginner: 7, intermediate: 10, advanced: 12, ceiling: 18, diet: 7 },
  Waden: { beginner: 7, intermediate: 10, advanced: 12, ceiling: 16, diet: 7 },
  Bauch: { beginner: 6, intermediate: 8, advanced: 10, ceiling: 14, diet: 6 },
  Trapez: { beginner: 4, intermediate: 6, advanced: 8, ceiling: 12, diet: 4 },
  'Unterer Rücken': { beginner: 4, intermediate: 6, advanced: 7, ceiling: 10, diet: 4 },
  Adduktoren: { beginner: 3, intermediate: 4, advanced: 6, ceiling: 10, diet: 3 },
  Unterarme: { beginner: 2, intermediate: 3, advanced: 4, ceiling: 8, diet: 2 },
  Schienbein: { beginner: 0, intermediate: 2, advanced: 2, ceiling: 6, diet: 0 },
}

/** Kraft sättigt früher — deshalb weniger Volumen, dafür schwerere Lasten. */
const STRENGTH_FACTOR = 0.8

/** Zuschlag für einen als wichtig markierten Muskel. */
const PRIORITY_BONUS = 3

export interface VolumePlan {
  /** Startvolumen pro Muskel für die erste Woche. */
  start: Partial<Record<VolumeMuscle, number>>
  /** Obergrenze, über die die wöchentliche Steigerung nie hinausgeht. */
  ceiling: Partial<Record<VolumeMuscle, number>>
}

/**
 * Startvolumen und Obergrenze pro Muskel.
 *
 * Bei Ziel Fettverlust ist die Obergrenze GLEICH dem Startwert: Im Defizit
 * geht es um Erhalt, nicht um Aufbau (docs/TRAINING-SCIENCE.md §10).
 */
export function buildVolumePlan(input: {
  level: Level
  goal: Goal
  priorityMuscles: readonly VolumeMuscle[]
}): VolumePlan {
  const { level, goal, priorityMuscles } = input
  const start: Partial<Record<VolumeMuscle, number>> = {}
  const ceiling: Partial<Record<VolumeMuscle, number>> = {}

  for (const [muscle, row] of Object.entries(VOLUME_TABLE) as [VolumeMuscle, VolumeRow][]) {
    let base = goal === 'fatloss' ? row.diet : row[level]
    let cap = goal === 'fatloss' ? row.diet : row.ceiling

    if (goal === 'strength') {
      base = Math.round(base * STRENGTH_FACTOR)
      cap = Math.round(cap * STRENGTH_FACTOR)
    }

    if (priorityMuscles.includes(muscle)) {
      base += PRIORITY_BONUS
      cap += PRIORITY_BONUS
    }

    // Nie über die Obergrenze starten (kann bei Prioritäten in der Diät auftreten).
    start[muscle] = Math.min(base, cap)
    ceiling[muscle] = cap
  }

  return { start, ceiling }
}

// ────────────────────────────────────────────────────────────────────
//  Split
// ────────────────────────────────────────────────────────────────────

export interface SessionTemplate {
  label: string
  /** Grobe Ausrichtung — steuert die Verteilung über die Woche. */
  focus: 'upper' | 'lower' | 'push' | 'pull' | 'full'
}

const SPLITS: Record<SplitType, SessionTemplate[]> = {
  '3_fullbody': [
    { label: 'Ganzkörper A', focus: 'full' },
    { label: 'Ganzkörper B', focus: 'full' },
    { label: 'Ganzkörper C', focus: 'full' },
  ],
  '4_upper_lower': [
    { label: 'Oberkörper A', focus: 'upper' },
    { label: 'Unterkörper A', focus: 'lower' },
    { label: 'Oberkörper B', focus: 'upper' },
    { label: 'Unterkörper B', focus: 'lower' },
  ],
  '5_ppl_ul': [
    { label: 'Push', focus: 'push' },
    { label: 'Pull', focus: 'pull' },
    { label: 'Beine', focus: 'lower' },
    { label: 'Oberkörper', focus: 'upper' },
    { label: 'Unterkörper', focus: 'lower' },
  ],
  '6_ppl': [
    { label: 'Push A', focus: 'push' },
    { label: 'Pull A', focus: 'pull' },
    { label: 'Beine A', focus: 'lower' },
    { label: 'Push B', focus: 'push' },
    { label: 'Pull B', focus: 'pull' },
    { label: 'Beine B', focus: 'lower' },
  ],
}

/** Split aus der Anzahl der Trainingstage (docs/PLAN-ENGINE.md §4). */
export function splitForDays(dayCount: number): SplitType {
  if (dayCount <= 3) return '3_fullbody'
  if (dayCount === 4) return '4_upper_lower'
  if (dayCount === 5) return '5_ppl_ul'
  return '6_ppl'
}

export function sessionTemplates(split: SplitType): SessionTemplate[] {
  return SPLITS[split]
}

/** Lesbare Bezeichnung für die Zusammenfassung. */
export function splitLabel(split: SplitType): string {
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

export interface ScheduledSession {
  weekday: Weekday
  template: SessionTemplate
}

/** Sortiert Wochentage in kalendarischer Reihenfolge ab Montag. */
export function sortWeekdays(days: readonly Weekday[]): Weekday[] {
  return [...days].sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b))
}

/**
 * Verteilt die Einheiten auf die gewählten Wochentage.
 *
 * Regel aus docs/PLAN-ENGINE.md §4: keine zwei Einheiten mit derselben
 * Ausrichtung an aufeinanderfolgenden Tagen. Die Reihenfolge der Vorlagen
 * wechselt die Ausrichtung bereits ab; falls doch zwei gleiche
 * aufeinandertreffen, wird die spätere Einheit mit der nächsten passenden
 * getauscht.
 */
export function scheduleSessions(
  split: SplitType,
  trainingDays: readonly Weekday[],
): ScheduledSession[] {
  const days = sortWeekdays(trainingDays)
  const templates = [...sessionTemplates(split)]

  // Mehr Tage als Vorlagen (z.B. 2 Tage gewählt): Vorlagen wiederholen.
  while (templates.length < days.length) {
    templates.push(templates[templates.length % sessionTemplates(split).length])
  }

  const ordered = avoidBackToBackSameFocus(templates.slice(0, days.length), days)

  return days.map((weekday, index) => ({ weekday, template: ordered[index] }))
}

function isAdjacent(a: Weekday, b: Weekday): boolean {
  return Math.abs(WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b)) === 1
}

function avoidBackToBackSameFocus(
  templates: SessionTemplate[],
  days: Weekday[],
): SessionTemplate[] {
  const result = [...templates]

  for (let i = 1; i < result.length; i++) {
    if (!isAdjacent(days[i - 1], days[i])) continue
    if (result[i].focus !== result[i - 1].focus) continue

    // Nächste Einheit mit anderer Ausrichtung nach vorne holen.
    const swapWith = result.findIndex(
      (t, index) => index > i && t.focus !== result[i - 1].focus,
    )
    if (swapWith !== -1) {
      const temp = result[i]
      result[i] = result[swapWith]
      result[swapWith] = temp
    }
  }

  return result
}
