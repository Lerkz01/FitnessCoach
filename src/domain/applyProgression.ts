// ====================================================================
//  Progression auf die geplante Einheit anwenden
//
//  Der Generator entscheidet, WELCHE Übungen in einer Einheit stehen. Er
//  kennt dabei keine Historie — seine Gewichte sind Erstschätzungen aus den
//  Referenzangaben des Onboardings.
//
//  Diese Datei schließt den Kreis: Für jede Übung, die schon einmal
//  trainiert wurde, wird die Vorgabe durch das Ergebnis der Progression
//  ersetzt.
//
//  OHNE diese Schicht ist die gesamte Progressionslogik wirkungslos. Genau
//  das war der Fall: Der Abschlussbildschirm zeigte „6 statt 5 Wdh", und die
//  nächste Einheit stand wieder auf 5 — weil die Woche jedes Mal frisch aus
//  dem Plan erzeugt wurde.
//
//  Bewusst über DENSELBEN Weg wie der Abschlussbildschirm
//  (`analyzePostSession`): Was die App angekündigt hat, muss exakt das sein,
//  was sie dann vorgibt. Zwei getrennte Rechenwege würden irgendwann
//  auseinanderlaufen — etwa bei der Ausreißer-Erkennung, die eine breite
//  Anhebung unterdrückt.
// ====================================================================

import type { Equipment } from '../types'
import { analyzePostSession, type PostSessionAnalysis } from './postSession'
import type {
  Goal,
  Level,
  PlannedExercise,
  SetLog,
  WorkoutSession,
} from './records'

export interface ApplyProgressionInput {
  exercises: readonly PlannedExercise[]
  /** Alle Einheiten des Nutzers, abgeschlossene und andere. */
  sessions: readonly WorkoutSession[]
  logsBySession: ReadonlyMap<string, readonly SetLog[]>
  level: Level
  goal: Goal
  calibrationWeek: boolean
  equipmentForExercise: (exerciseId: string) => Equipment | null
  bodyweightTrendKg?: readonly number[]
}

export interface AppliedExercise extends PlannedExercise {
  /**
   * Woher die Vorgabe kommt. Die Oberfläche kann das anzeigen — es macht
   * den Unterschied zwischen „geschätzt" und „aus deinen Daten" sichtbar.
   */
  prescriptionSource: 'estimate' | 'progression' | 'held'
  /** Begründung der Progression, falls es eine gibt. */
  progressionReason: string | null
}

export function applyProgression(input: ApplyProgressionInput): AppliedExercise[] {
  const completed = input.sessions
    .filter((session) => session.status === 'completed' && session.deletedAt === null)
    .sort((a, b) => {
      const left = a.completedAt ?? a.createdAt
      const right = b.completedAt ?? b.createdAt
      // Jüngste zuerst — gesucht ist immer die letzte Ausführung.
      return left < right ? 1 : left > right ? -1 : 0
    })

  // Die Analyse einer Einheit wird nur einmal gerechnet, auch wenn mehrere
  // Übungen daraus stammen.
  const cache = new Map<string, PostSessionAnalysis>()
  const analysisFor = (session: WorkoutSession): PostSessionAnalysis => {
    const hit = cache.get(session.id)
    if (hit) return hit
    const result = analyzePostSession({
      session,
      logs: input.logsBySession.get(session.id) ?? [],
      previousSessions: completed.filter((other) => other.id !== session.id),
      logsBySession: input.logsBySession,
      level: input.level,
      goal: input.goal,
      calibrationWeek: input.calibrationWeek,
      equipmentForExercise: input.equipmentForExercise,
      bodyweightTrendKg: input.bodyweightTrendKg,
    })
    cache.set(session.id, result)
    return result
  }

  return input.exercises.map((exercise) => {
    const last = completed.find((session) =>
      session.planned.some((planned) => planned.exerciseId === exercise.exerciseId),
    )

    // Einmess-Einheit: Das GEFUNDENE Gewicht steht in der Vorgabe dieser
    // Einheit (der Trainingsbildschirm schreibt es dort hinein). Es zu
    // übernehmen ist genau der Zweck der Phase.
    //
    // Die Progression darf sie dagegen NICHT auswerten: Tastsätze laufen mit
    // zwölf Wiederholungen bei bewusst zu leichtem Gewicht. Für die
    // Doppelprogression sähe das aus wie eine glänzend übertroffene Vorgabe —
    // und die nächste Einheit stünde auf einem Gewicht, das nie jemand
    // bewegt hat.
    if (last && last.kind === 'calibration') {
      const gemessen = last.planned.find(
        (planned) => planned.exerciseId === exercise.exerciseId,
      )
      return {
        ...exercise,
        weightKg: gemessen?.weightKg ?? exercise.weightKg,
        prescriptionSource: 'held',
        progressionReason: 'Gewicht aus der Einmessphase.',
      }
    }

    // Noch nie trainiert: Es bleibt bei der Schätzung des Generators.
    if (!last) {
      return { ...exercise, prescriptionSource: 'estimate', progressionReason: null }
    }

    const previous = last.planned.find(
      (planned) => planned.exerciseId === exercise.exerciseId,
    )
    const analysis = analysisFor(last)
    const change = analysis.changed.find(
      (entry) => entry.exerciseId === exercise.exerciseId,
    )

    if (change) {
      return {
        ...exercise,
        weightKg: change.next.weightKg,
        // Untergrenze absichern: Ändert sich der Wiederholungsbereich, weil
        // sich Ziel oder Level geändert haben, darf die Vorgabe nicht unter
        // den neuen Rahmen fallen.
        targetReps:
          change.next.targetReps === null
            ? null
            : Math.max(change.next.targetReps, exercise.repRangeMin ?? change.next.targetReps),
        targetSeconds: change.next.targetSeconds,
        prescriptionSource: 'progression',
        progressionReason: change.reason,
      }
    }

    // Keine Änderung beschlossen: Die zuletzt genutzte Vorgabe HALTEN — nicht
    // auf die Erstschätzung des Generators zurückfallen. Sonst würde jede
    // gehaltene Vorgabe stillschweigend zurückgesetzt.
    if (!previous) {
      return { ...exercise, prescriptionSource: 'estimate', progressionReason: null }
    }
    return {
      ...exercise,
      weightKg: previous.weightKg,
      targetReps: previous.targetReps,
      targetSeconds: previous.targetSeconds,
      prescriptionSource: 'held',
      progressionReason: 'Gleiche Vorgabe wie letztes Mal',
    }
  })
}
