import type { Equipment, Exercise } from '../types'
import equipmentJson from './equipment.json'
import exercisesJson from './exercises.json'

/** Alle Geräte aus dem Gym-Inventar. */
export const equipment = equipmentJson as Equipment[]

/** Alle Übungen, gemappt auf Geräte. */
export const exercises = exercisesJson as Exercise[]

/** Schneller Zugriff auf ein Gerät per ID. */
export const equipmentById = new Map(equipment.map((e) => [e.id, e]))

/** Schneller Zugriff auf eine Übung per ID. */
export const exerciseById = new Map(exercises.map((e) => [e.id, e]))

/**
 * Prüft, ob eine Übung mit den verfügbaren Geräten ausführbar ist.
 * Jede Gerätegruppe (UND) muss durch mindestens eine Alternative (ODER)
 * aus dem verfügbaren Set abgedeckt sein.
 */
export function isExercisePossible(ex: Exercise, availableIds: Set<string>): boolean {
  return ex.equipmentGroups.every((group) => group.some((id) => availableIds.has(id)))
}
