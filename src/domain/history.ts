// ====================================================================
//  Historie — von den Rohdaten zur Progressionsentscheidung
//
//  Diese Schicht liegt zwischen dem append-only Satz-Log und der
//  Progressionslogik. Ihre Aufgabe:
//
//   1. Korrekturketten auflösen (`supersedesId`)
//   2. Sätze zu Übungen und Einheiten gruppieren
//   3. Die Übungs-Status-Historie bilden, die Regelkreis 2 braucht
//
//  Nichts davon wird gespeichert. Läuft die Logik später besser, wird die
//  ganze Historie einfach neu durchgerechnet (docs/ARCHITECTURE.md §1).
// ====================================================================

import type { SetLog, WorkoutSession } from './records'
import {
  bestE1rm,
  exerciseStatus,
  rirDrift,
  sessionQuality,
  targetHitRate,
  volumeLoad,
  type ExerciseAttempt,
  type ExerciseStatus,
  type SessionQuality,
  type SetOutcome,
} from './progression'

/**
 * Löst die Korrekturketten auf und gibt nur die gültigen Sätze zurück.
 *
 * Das Log ist append-only: Eine Korrektur ist eine NEUE Zeile, die per
 * `supersedesId` auf die alte zeigt. Ein überschriebener Satz darf nicht
 * mehr in die Auswertung eingehen — sonst zählt eine korrigierte Eingabe
 * doppelt.
 *
 * Sortiert wird nach `loggedAt`, bei Gleichstand nach `id`. Da die IDs
 * UUIDv7 sind (zeitsortiert), ist die Reihenfolge auch über Geräte hinweg
 * stabil und reproduzierbar.
 */
export function resolveSetLogs(logs: readonly SetLog[]): SetLog[] {
  const superseded = new Set<string>()
  for (const log of logs) {
    if (log.supersedesId !== null) superseded.add(log.supersedesId)
  }

  return logs
    .filter((log) => !superseded.has(log.id) && log.deletedAt === null)
    .sort((a, b) => {
      if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex
      if (a.setNumber !== b.setNumber) return a.setNumber - b.setNumber
      if (a.loggedAt !== b.loggedAt) return a.loggedAt < b.loggedAt ? -1 : 1
      return a.id < b.id ? -1 : 1
    })
}

/** Übersetzt einen gespeicherten Satz in die Eingabe der Progressionslogik. */
export function toOutcome(log: SetLog): SetOutcome {
  return {
    prescribedReps: log.prescribedReps,
    prescribedSeconds: log.prescribedSeconds,
    actualReps: log.actualReps,
    actualSeconds: log.actualSeconds,
    // Für Kennzahlen zählt das TATSÄCHLICH bewegte Gewicht. Weicht es von
    // der Vorgabe ab (Gerät besetzt, Kreis-1-Korrektur), ist die Vorgabe
    // für e1RM und Volumenlast bedeutungslos.
    weightKg: log.actualWeightKg ?? log.prescribedWeightKg,
    feedback: log.feedback,
    abandoned: log.abandoned,
  }
}

export interface ExerciseResult {
  exerciseId: string
  exerciseName: string
  orderIndex: number
  status: ExerciseStatus
  workingSets: number
  /** Bestes geschätztes 1RM dieser Einheit, `null` bei Körpergewicht/Zeit. */
  e1rm: number | null
  volumeLoad: number
  hitRate: number
  rirDrift: number | null
}

/**
 * Bewertet eine abgeschlossene Einheit Übung für Übung.
 *
 * Aufwärmsätze fließen NICHT ein: Sie haben keine Wiederholungsvorgabe im
 * Sinne der Progression und würden Zielerreichung und Volumenlast
 * verfälschen.
 */
export function analyzeSession(logs: readonly SetLog[]): {
  exercises: ExerciseResult[]
  quality: SessionQuality
} {
  const resolved = resolveSetLogs(logs).filter((log) => !log.isWarmup)

  const byExercise = new Map<string, SetLog[]>()
  for (const log of resolved) {
    const existing = byExercise.get(log.exerciseId)
    if (existing) existing.push(log)
    else byExercise.set(log.exerciseId, [log])
  }

  const exercises: ExerciseResult[] = []
  for (const [exerciseId, group] of byExercise) {
    const outcomes = group.map(toOutcome)
    exercises.push({
      exerciseId,
      exerciseName: group[0].exerciseName,
      orderIndex: group[0].orderIndex,
      status: exerciseStatus(outcomes),
      workingSets: outcomes.length,
      e1rm: bestE1rm(outcomes),
      volumeLoad: volumeLoad(outcomes),
      hitRate: targetHitRate(outcomes),
      rirDrift: rirDrift(outcomes),
    })
  }

  exercises.sort((a, b) => a.orderIndex - b.orderIndex)

  return {
    exercises,
    quality: sessionQuality(exercises.map((e) => e.status)),
  }
}

/**
 * Status-Historie einer Übung über mehrere Einheiten, älteste zuerst.
 *
 * Genau diese Liste erwartet `nextPrescription`. Nur abgeschlossene
 * Einheiten zählen — eine abgebrochene oder übersprungene Einheit ist kein
 * Beweis für oder gegen Fortschritt.
 */
export function exerciseHistory(input: {
  exerciseId: string
  sessions: readonly WorkoutSession[]
  logsBySession: ReadonlyMap<string, readonly SetLog[]>
  /** Ältere Einheiten als diese Anzahl sind für die Bestätigung belanglos. */
  limit?: number
}): { attempts: ExerciseAttempt[]; e1rms: (number | null)[] } {
  const { exerciseId, sessions, logsBySession, limit = 8 } = input

  const completed = sessions
    .filter((s) => s.status === 'completed' && s.deletedAt === null)
    .sort((a, b) => {
      const left = a.completedAt ?? a.scheduledFor ?? a.createdAt
      const right = b.completedAt ?? b.scheduledFor ?? b.createdAt
      if (left !== right) return left < right ? -1 : 1
      return a.id < b.id ? -1 : 1
    })

  const attempts: ExerciseAttempt[] = []
  const e1rms: (number | null)[] = []

  for (const session of completed) {
    const logs = logsBySession.get(session.id)
    if (!logs || logs.length === 0) continue

    const own = resolveSetLogs(logs).filter(
      (log) => log.exerciseId === exerciseId && !log.isWarmup,
    )
    if (own.length === 0) continue // Übung war in dieser Einheit nicht dabei

    const outcomes = own.map(toOutcome)
    attempts.push({
      status: exerciseStatus(outcomes),
      // Für die Bestätigung zählt die VORGABE, nicht das tatsächlich
      // bewegte Gewicht: Das Bestätigungsfenster fragt, ob dieselbe Vorgabe
      // wiederholt übertroffen wurde.
      weightKg: own[0].prescribedWeightKg,
      targetReps: own[0].prescribedReps,
    })
    e1rms.push(bestE1rm(outcomes))
  }

  return {
    attempts: attempts.slice(-limit),
    e1rms: e1rms.slice(-limit),
  }
}
