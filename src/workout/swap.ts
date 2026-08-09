// ====================================================================
//  Übung mitten in der Einheit tauschen
//
//  Leitgedanke: Der ÜBUNGSPLATZ behält seine Aufgabe, nur die Last wird
//  übersetzt.
//
//  Steht im Plan „4 × 6 bei RIR 2, 150 s Pause", dann ist das die Aufgabe
//  dieses Platzes im Wochenvolumen — unabhängig davon, an welchem Gerät sie
//  erledigt wird. Sätze, Wiederholungen, RIR und Pause bleiben deshalb
//  unverändert. Neu berechnet werden nur:
//
//    · das Gewicht, denn 60 kg Langhantelbankdrücken sind nicht 60 kg an
//      der Brustpresse
//    · die Aufwärmsätze, weil sie am Arbeitsgewicht hängen
//
//  Das Gewicht kommt, wenn möglich, aus der eigenen HISTORIE: Wer die
//  Ersatzübung schon einmal gemacht hat, hat einen echten Wert — der ist
//  jeder Schätzung überlegen. Erst wenn nichts vorliegt, wird über die
//  Bewegungsmuster-Koeffizienten geschätzt.
// ====================================================================

import { equipmentById, exerciseById } from '../data'
import { putRecord } from '../data/db'
import { blockedEquipmentFor } from '../domain/alternatives'
import { exerciseHistory } from '../domain/history'
import { newId, nowIso } from '../domain/ids'
import { tierOf, warmupsFor } from '../domain/prescription'
import type {
  Adjustment,
  PlannedExercise,
  SetLog,
  StrengthReference,
  UserProfile,
  WorkoutSession,
} from '../domain/records'
import {
  patternMaxesFromReferences,
  startingWeightFor,
  withFallbacks,
} from '../domain/startingWeights'
import { roundToStep, loadBearingEquipment } from '../domain/weights'
import type { Exercise } from '../types'
import { requestUpload } from '../sync/active'

export interface SwapInput {
  userId: string
  session: WorkoutSession
  /** Der Platz, der getauscht wird. */
  original: PlannedExercise
  replacement: Exercise
  profile: UserProfile
  references: readonly StrengthReference[]
  bodyweightKg: number
  calibrationWeek: boolean
  /** Frühere Einheiten — für ein echtes Gewicht aus der Historie. */
  previousSessions: readonly WorkoutSession[]
  logsBySession: ReadonlyMap<string, readonly SetLog[]>
}

export interface SwapResult {
  session: WorkoutSession
  planned: PlannedExercise
  /** Woher das Gewicht kommt — die Oberfläche sagt es dem Nutzer. */
  weightSource: 'history' | 'estimate' | 'none'
  /** Geräte, die für den Rest der Einheit gesperrt bleiben. */
  blockedEquipmentIds: string[]
}

/**
 * Baut die Vorgabe für die Ersatzübung.
 *
 * Rein rechnend, ohne Nebeneffekt — dadurch kann die Oberfläche das
 * Ergebnis anzeigen, bevor etwas geschrieben wird.
 */
export function prescriptionForSwap(input: Omit<SwapInput, 'userId' | 'session'>): {
  planned: PlannedExercise
  weightSource: SwapResult['weightSource']
} {
  const { original, replacement, profile } = input

  const equipment = loadBearingEquipment(replacement, equipmentById)

  // ── Gewicht, erste Wahl: die eigene Historie ──
  const history = exerciseHistory({
    exerciseId: replacement.id,
    sessions: input.previousSessions,
    logsBySession: input.logsBySession,
  })
  const zuletzt = [...history.attempts].reverse().find((a) => a.weightKg !== null)

  let weightKg: number | null = null
  let weightSource: SwapResult['weightSource'] = 'none'

  if (zuletzt?.weightKg != null) {
    weightKg = zuletzt.weightKg
    weightSource = 'history'
  } else if (equipment) {
    // ── Zweite Wahl: über die Bewegungsmuster schätzen ──
    const rohMaxes = patternMaxesFromReferences({
      references: input.references,
      exerciseById,
      bodyweightKg: input.bodyweightKg,
    })
    const { maxes, estimated } = withFallbacks(rohMaxes, {
      bodyweightKg: input.bodyweightKg,
      level: profile.level,
      sex: profile.sex,
    })

    const geschaetzt = startingWeightFor({
      exercise: replacement,
      targetReps: original.targetReps ?? 8,
      maxes,
      estimatedPatterns: estimated,
      bodyweightKg: input.bodyweightKg,
      calibrationWeek: input.calibrationWeek,
    })
    weightKg = geschaetzt.weightKg
    weightSource = geschaetzt.weightKg === null ? 'none' : 'estimate'
  }

  // Auf eine real einstellbare Stufe runden. Ein Wert aus der Historie ist
  // das schon, ein geschätzter auch — aber ein anderes Gerät kann eine
  // andere Schrittweite haben.
  if (weightKg !== null && equipment) {
    weightKg = roundToStep(equipment, weightKg, 'down') ?? weightKg
  }

  const tier = tierOf(replacement)
  const targetReps = original.targetReps

  const planned: PlannedExercise = {
    exerciseId: replacement.id,
    exerciseName: replacement.name,
    // Der Platz in der Einheit bleibt derselbe.
    orderIndex: original.orderIndex,
    // Aufgabe des Platzes: unverändert.
    sets: original.sets,
    targetReps,
    repRangeMin: original.repRangeMin,
    repRangeMax: original.repRangeMax,
    targetSeconds: replacement.metric === 'time' ? (original.targetSeconds ?? 45) : null,
    targetRir: original.targetRir,
    restSeconds: original.restSeconds,
    weightKg,
    // Aufwärmsätze hängen am Arbeitsgewicht und müssen neu gerechnet werden.
    warmups:
      weightKg === null
        ? []
        : warmupsFor(tier, targetReps ?? 8)
            .map((spec) => ({
              weightKg: equipment
                ? (roundToStep(equipment, weightKg * spec.fraction, 'down') ?? null)
                : null,
              reps: spec.reps,
            }))
            .filter((w) => w.weightKg !== null && w.weightKg > 0),
    selectionReason: `Ersatz für ${original.exerciseName} — Gerät war besetzt`,
  }

  return { planned, weightSource }
}

/**
 * Führt den Tausch aus: Vorgabe berechnen, Einheit anpassen, protokollieren.
 *
 * Die eingefrorene Vorgabe der Einheit wird hier ABSICHTLICH verändert. Das
 * ist kein Widerspruch zum Grundsatz „die Vorgabe steht beim Start fest":
 * `session.planned` hält fest, was tatsächlich verordnet WAR, und nach dem
 * Tausch ist das die Ersatzübung. Ohne diese Änderung würde die
 * Nach-Training-Analyse die neuen Sätze keiner Vorgabe zuordnen können und
 * für die Ersatzübung gar keine Progression berechnen.
 *
 * Der ursprüngliche Zustand geht nicht verloren — er steht im
 * Anpassungsprotokoll, wo die Begründung ohnehin hingehört.
 */
export async function swapExercise(input: SwapInput): Promise<SwapResult> {
  const { userId, session, original, replacement } = input
  const at = nowIso()

  const { planned, weightSource } = prescriptionForSwap(input)

  const updated: WorkoutSession = {
    ...session,
    // Getauscht wird über `orderIndex`, nicht über die Übungs-Kennung: Der
    // Platz in der Einheit ist die Identität. Über die Kennung würde eine
    // Übung, die zweimal vorkommt, an beiden Stellen ersetzt.
    planned: session.planned.map((entry) =>
      entry.orderIndex === original.orderIndex ? planned : entry,
    ),
  }
  await putRecord(userId, 'sessions', updated)

  const adjustment: Adjustment = {
    id: newId(),
    userId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    appliedAt: at,
    scope: 'exercise_rotation',
    circle: 1,
    targetId: replacement.id,
    targetLabel: replacement.name,
    before: original.exerciseName,
    after: replacement.name,
    reason:
      weightSource === 'history'
        ? 'Gerät besetzt. Gewicht aus deiner Historie für diese Übung.'
        : weightSource === 'estimate'
          ? 'Gerät besetzt. Gewicht aus deinen Referenzwerten umgerechnet.'
          : 'Gerät besetzt. Körpergewichtsübung, kein Gewicht nötig.',
    applied: true,
    // Der Nutzer hat sie selbst gewählt — das ist Zustimmung.
    userAccepted: true,
  }
  await putRecord(userId, 'adjustments', adjustment)
  requestUpload()

  // Gesperrt bleibt das Gerät der BESETZTEN Übung. Fehlt sie in der
  // Datenbank, wird nichts gesperrt — auf die Ersatzübung auszuweichen wäre
  // falsch, denn deren Gerät ist gerade das freie.
  const besetzte = exerciseById.get(original.exerciseId)

  return {
    session: updated,
    planned,
    weightSource,
    blockedEquipmentIds: besetzte ? blockedEquipmentFor(besetzte) : [],
  }
}
