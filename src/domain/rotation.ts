// ====================================================================
//  Welche Übungen sind gerade herausrotiert?
//
//  Abgeleitet aus dem Anpassungsprotokoll, nicht als eigener Zustand
//  gespeichert (docs/ARCHITECTURE.md §1). Der Protokolleintrag IST die
//  Wahrheit: Er sagt, wann welche Übung gegen welche getauscht wurde und
//  warum.
//
//  Warum eine Frist und kein Dauerausschluss: Rotation dient der
//  Re-Sensibilisierung. Eine Übung, die vor einem halben Jahr stagnierte,
//  ist heute wieder ein brauchbarer Reiz — sie für immer zu verbannen würde
//  den Übungspool über die Jahre leerräumen.
// ====================================================================

import type { Adjustment } from './records'

/**
 * Wie lange eine herausrotierte Übung draußen bleibt.
 *
 * Sechs Wochen entsprechen der Länge eines Blocks (docs/PLAN-ENGINE.md §9,
 * Kreis 4). Kürzer wäre sinnlos — die Stagnation entstand über drei Wochen,
 * ein zweiwöchiger Ausschluss ändert daran nichts.
 */
export const ROTATION_WEEKS = 6

/**
 * Übungen, die derzeit nicht eingeplant werden sollen.
 *
 * Gezählt werden nur ANGEWANDTE Rotationen. Ein reiner Vorschlag, den der
 * Nutzer nie zu Gesicht bekam oder abgelehnt hat, darf den Plan nicht
 * verändern.
 */
export function rotatedOutExerciseIds(
  adjustments: readonly Adjustment[],
  at: Date = new Date(),
): Set<string> {
  const grenze = at.getTime() - ROTATION_WEEKS * 7 * 24 * 60 * 60 * 1000
  const out = new Set<string>()

  for (const entry of adjustments) {
    if (entry.deletedAt !== null) continue
    if (entry.scope !== 'exercise_rotation') continue
    if (!entry.applied) continue
    // Der Tausch mitten in der Einheit („Gerät besetzt") ist Kreis 1 und
    // sperrt nichts für die Zukunft — dort war das Gerät belegt, nicht die
    // Übung verbraucht.
    if (entry.circle !== 3) continue
    if (entry.targetId === null) continue

    const zeitpunkt = Date.parse(entry.appliedAt)
    if (Number.isNaN(zeitpunkt) || zeitpunkt < grenze) continue

    out.add(entry.targetId)
  }

  return out
}
