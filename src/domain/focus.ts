// ====================================================================
//  Schwerpunkte — der einzige Hebel, mit dem der Chat den Plan verändert
//
//  „Ich möchte mehr Fokus auf meine Arme" darf den Plan verschieben, aber
//  nicht umbauen. Drei Eigenschaften machen das sicher:
//
//  1. NUR EIN ZAHLENWERT. Ein Schwerpunkt verschiebt das Wochenvolumen eines
//     Muskels um ±2 Sätze. Er kann keine Übung erfinden, keinen Split ändern,
//     keine Vorgabe überschreiben. Alles Weitere macht der Generator wie
//     immer.
//
//  2. NULLSUMME. Mehr Arme heißt etwas weniger woanders. Das ist keine
//     Zierde: Das Wochenvolumen ist an die Erholung UND an die gewählte
//     Trainingsdauer gebunden. Würde einfach addiert, würden die Einheiten
//     länger als die geplanten 60 Minuten, und Regelkreis 3 würde die
//     Steigerung in der nächsten Woche als Überlastung wieder einsammeln.
//
//  3. ABGELEITET, NICHT GESPEICHERT. Ein Schwerpunkt ist ein Eintrag im
//     Anpassungsprotokoll. Der gespeicherte Plan bleibt unberührt, die
//     Verschiebung wird beim Planaufbau gerechnet. Damit ist sie jederzeit
//     zurücknehmbar, nachlesbar und kann nichts kaputtmachen.
//
//  Der Boden ist das Anfängervolumen aus der Tabelle: unter das minimal
//  wirksame Volumen wird kein Muskel gedrückt, egal was im Chat steht.
// ====================================================================

import type { VolumeMuscle } from './muscles'
import { VOLUME_MUSCLES } from './muscles'
import { VOLUME_TABLE } from './planning'
import type { Adjustment } from './records'

/** Um wie viele Sätze ein Schwerpunkt verschiebt. */
export const FOCUS_SETS = 2

/**
 * Wie viele Muskeln gleichzeitig betont sein dürfen.
 *
 * Bei mehr wäre es kein Schwerpunkt mehr, sondern ein neuer Plan — und die
 * Nullsumme müsste so viel Volumen abziehen, dass der Rest unter den Boden
 * fällt.
 */
export const MAX_FOCUS = 3

/** Volumen wird in halben Sätzen gerechnet (Nebenmuskeln zählen 0,5). */
const STEP = 0.5

export type FocusDirection = 'more' | 'less'

export interface Focus {
  muscle: VolumeMuscle
  direction: FocusDirection
  /** Wann gesetzt — der jüngste Eintrag pro Muskel gilt. */
  at: string
}

// ────────────────────────────────────────────────────────────────────
//  Ableitung aus dem Anpassungsprotokoll
// ────────────────────────────────────────────────────────────────────

const MUSCLES = new Set<string>(VOLUME_MUSCLES)

function isMuscle(value: string | null): value is VolumeMuscle {
  return value !== null && MUSCLES.has(value)
}

/**
 * Welche Schwerpunkte gerade gelten.
 *
 * Pro Muskel zählt der jüngste Eintrag; `applied: false` hebt ihn auf (so
 * wird „nicht mehr" protokolliert, ohne den alten Eintrag zu löschen —
 * gelöscht wird in dieser App nichts). Bei mehr als `MAX_FOCUS` betonten
 * Muskeln fallen die ältesten heraus.
 */
export function activeFocus(adjustments: readonly Adjustment[]): Focus[] {
  const newest = new Map<VolumeMuscle, Adjustment>()

  for (const adjustment of adjustments) {
    if (adjustment.scope !== 'coach_focus') continue
    if (adjustment.deletedAt !== null) continue
    if (!isMuscle(adjustment.targetId)) continue

    const previous = newest.get(adjustment.targetId)
    if (!previous || adjustment.appliedAt > previous.appliedAt) {
      newest.set(adjustment.targetId, adjustment)
    }
  }

  const active: Focus[] = []
  for (const [muscle, adjustment] of newest) {
    if (!adjustment.applied) continue
    const direction: FocusDirection = adjustment.after === 'weniger' ? 'less' : 'more'
    active.push({ muscle, direction, at: adjustment.appliedAt })
  }

  // Jüngste zuerst, damit beim Kappen die ältesten Wünsche herausfallen.
  active.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

  const up = active.filter((f) => f.direction === 'more').slice(0, MAX_FOCUS)
  const down = active.filter((f) => f.direction === 'less')
  return [...up, ...down]
}

/**
 * Welche Übungen der Nutzer im Chat abgelehnt hat.
 *
 * Geht als `excludeExerciseIds` in den Generator — dieselbe Tür, durch die
 * auch die Rotation aus Regelkreis 3 geht.
 */
export function avoidedExerciseIds(adjustments: readonly Adjustment[]): Set<string> {
  const newest = new Map<string, Adjustment>()

  for (const adjustment of adjustments) {
    if (adjustment.scope !== 'coach_avoid') continue
    if (adjustment.deletedAt !== null) continue
    if (adjustment.targetId === null) continue

    const previous = newest.get(adjustment.targetId)
    if (!previous || adjustment.appliedAt > previous.appliedAt) {
      newest.set(adjustment.targetId, adjustment)
    }
  }

  const avoided = new Set<string>()
  for (const [exerciseId, adjustment] of newest) {
    if (adjustment.applied) avoided.add(exerciseId)
  }
  return avoided
}

// ────────────────────────────────────────────────────────────────────
//  Anwendung auf das Volumenbudget
// ────────────────────────────────────────────────────────────────────

export interface FocusResult {
  targets: Partial<Record<VolumeMuscle, number>>
  /** Was tatsächlich passiert ist, in Klartext für die Anzeige. */
  notes: string[]
}

function round(value: number): number {
  return Math.round(value / STEP) * STEP
}

/** Minimal wirksames Wochenvolumen — darunter geht kein Muskel. */
function floorFor(muscle: VolumeMuscle): number {
  return VOLUME_TABLE[muscle].beginner
}

function ceilingFor(muscle: VolumeMuscle): number {
  return VOLUME_TABLE[muscle].ceiling
}

/**
 * Verschiebt das Volumenbudget nach den Schwerpunkten — als Nullsumme.
 *
 * `protected` sind Muskeln, die nichts abgeben: die betonten selbst und die
 * im Profil als wichtig markierten. Wer im Onboarding „Arme sind mir
 * wichtig" gesagt hat, soll das nicht durch einen Chatwunsch für die Brust
 * verlieren.
 */
export function applyFocus(
  targets: Partial<Record<VolumeMuscle, number>>,
  focus: readonly Focus[],
  protectedMuscles: readonly VolumeMuscle[] = [],
): FocusResult {
  if (focus.length === 0) return { targets, notes: [] }

  const next: Partial<Record<VolumeMuscle, number>> = { ...targets }
  const notes: string[] = []
  const touched = new Set<VolumeMuscle>(focus.map((f) => f.muscle))

  // ── Schritt 1: die gewünschten Verschiebungen, begrenzt durch Boden und
  //    Obergrenze. Was nicht passt, wird gekürzt und gesagt.
  let added = 0
  let freed = 0

  for (const entry of focus) {
    const current = next[entry.muscle]
    if (current === undefined) continue

    if (entry.direction === 'more') {
      const room = Math.max(0, ceilingFor(entry.muscle) - current)
      const gain = Math.min(FOCUS_SETS, room)
      if (gain <= 0) {
        notes.push(
          `${entry.muscle} liegt schon an der Obergrenze — mehr Volumen wäre nicht mehr verwertbar.`,
        )
        continue
      }
      next[entry.muscle] = round(current + gain)
      added += gain
    } else {
      const room = Math.max(0, current - floorFor(entry.muscle))
      const cut = Math.min(FOCUS_SETS, room)
      if (cut <= 0) {
        notes.push(
          `${entry.muscle} liegt schon am unteren Rand — weniger wäre kein Reiz mehr.`,
        )
        continue
      }
      next[entry.muscle] = round(current - cut)
      freed += cut
    }
  }

  // ── Schritt 2: Nullsumme. Was hinzugekommen ist und nicht durch ein
  //    „weniger" gedeckt ist, wird beim Rest abgezogen — anteilig zu dem,
  //    was jeder Muskel über seinem Boden hat.
  let owed = round(Math.max(0, added - freed))
  if (owed > 0) {
    const donors = (Object.keys(next) as VolumeMuscle[])
      .filter((muscle) => !touched.has(muscle) && !protectedMuscles.includes(muscle))
      .map((muscle) => ({
        muscle,
        room: Math.max(0, (next[muscle] ?? 0) - floorFor(muscle)),
      }))
      .filter((donor) => donor.room > 0)

    const totalRoom = donors.reduce((sum, donor) => sum + donor.room, 0)

    if (totalRoom < owed) {
      // Kann passieren, wenn der Plan ohnehin schon am Boden liegt (Diät,
      // Anfängerwoche). Dann wird der Schwerpunkt gekürzt, nicht der Boden
      // durchbrochen — und das steht im Protokoll.
      const affordable = round(totalRoom)
      const shortfall = round(owed - affordable)
      for (const entry of focus) {
        if (entry.direction !== 'more') continue
        const current = next[entry.muscle]
        if (current === undefined) continue
        next[entry.muscle] = round(Math.max(floorFor(entry.muscle), current - shortfall))
        break
      }
      notes.push(
        'Der Schwerpunkt fällt kleiner aus als gewünscht: Im übrigen Plan ist kein ' +
          'Volumen frei, das ich abziehen könnte, ohne einen Muskel unter das ' +
          'minimal wirksame Maß zu drücken.',
      )
      owed = affordable
    }

    // Reihum in halben Sätzen abziehen, beginnend bei dem Muskel mit dem
    // meisten Spielraum über seinem Boden.
    //
    // Nicht anteilig: Bei zwei abzuziehenden Sätzen und sechzehn Muskeln wäre
    // jeder Anteil kleiner als ein halber Satz, würde auf null gerundet — und
    // am Ende trüge ein einzelner Muskel die ganzen zwei Sätze. Reihum
    // verteilt es sich auf vier Muskeln zu je einem halben Satz, und das ist
    // der Unterschied zwischen „etwas verschoben" und „ein Muskel gestrichen".
    let remaining = owed
    const room = new Map<VolumeMuscle, number>(donors.map((d) => [d.muscle, d.room]))
    while (remaining > 0) {
      const available = donors
        .filter((donor) => (room.get(donor.muscle) ?? 0) >= STEP)
        .sort((a, b) => (room.get(b.muscle) ?? 0) - (room.get(a.muscle) ?? 0))
      if (available.length === 0) break
      for (const donor of available) {
        if (remaining <= 0) break
        next[donor.muscle] = round((next[donor.muscle] ?? 0) - STEP)
        room.set(donor.muscle, round((room.get(donor.muscle) ?? 0) - STEP))
        remaining = round(remaining - STEP)
      }
    }
  }

  // ── Schritt 3: erklären, was passiert ist.
  for (const entry of focus) {
    const before = targets[entry.muscle]
    const after = next[entry.muscle]
    if (before === undefined || after === undefined || before === after) continue
    const sign = after > before ? '+' : '−'
    notes.unshift(
      `${entry.muscle}: ${before} → ${after} Sätze pro Woche (${sign}${Math.abs(after - before)}).`,
    )
  }

  const donorsChanged = (Object.keys(next) as VolumeMuscle[]).filter(
    (muscle) => !touched.has(muscle) && next[muscle] !== targets[muscle],
  )
  if (donorsChanged.length > 0) {
    notes.push(
      `Zum Ausgleich etwas weniger bei: ${donorsChanged.join(', ')}. ` +
        'Das Gesamtvolumen bleibt gleich, damit die Einheiten nicht länger werden.',
    )
  }

  return { targets: next, notes }
}

/** Summe des geplanten Wochenvolumens — für die Nullsummen-Prüfung. */
export function totalSets(targets: Partial<Record<VolumeMuscle, number>>): number {
  return round(Object.values(targets).reduce((sum, value) => sum + (value ?? 0), 0))
}
