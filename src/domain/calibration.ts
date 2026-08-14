// ====================================================================
//  Einmessphase — die ersten Einheiten dienen dem Finden der Gewichte
//
//  Das Problem: Der Generator schätzt Startgewichte aus sechs
//  Referenzangaben und Bewegungsmuster-Koeffizienten. Für eine Langhantel
//  ist das brauchbar. Für eine Maschine ist es Raten — „50 kg" auf dem
//  Steckgewicht eines Herstellers sind nicht 50 kg beim nächsten, und für
//  die meisten Geräte im Studio ist der Umrechnungsfaktor unbekannt.
//
//  Der naive Ausweg wäre, jedes Gewicht in der ersten Einheit hart
//  einzumessen. Das ist zu langsam: Ein Plan hat rund 30 verschiedene
//  Übungen, und wer sie alle mit Steigerungssätzen abklopft, verbringt drei
//  Wochen mit Messen.
//
//  Der Weg hier: Die ERSTE RUNDE DURCH DEN SPLIT ist die Einmessphase.
//  Dieselben Übungen, die der Plan ohnehin gewählt hätte — aber statt
//  „4 × 5 @ 72,5 kg" heißt die Vorgabe „finde dein Gewicht für 5 Wdh.".
//  Nach einer Runde ist jede Übung des Plans einmal mit einem ECHTEN
//  Gewicht geloggt, und ab Woche zwei trainiert man auf gemessenen Zahlen
//  statt auf Schätzungen.
//
//  Warum das reicht, ohne neue Speicherung: Das gefundene Gewicht wird in
//  die Vorgabe der Einheit geschrieben. `applyProgression` nimmt bei
//  fehlender Progressionsentscheidung die ZULETZT GENUTZTE Vorgabe — damit
//  greift der Messwert über den Weg, der schon existiert.
// ====================================================================

import type { Equipment } from '../types'
import type { PlannedExercise, SetFeedback, Weekday } from './records'
import { adjustByPercent, isInverted, roundToStep } from './weights'

/**
 * Wie viele Einheiten die Einmessphase höchstens dauert.
 *
 * Obergrenze, damit sie nicht bei einem sechstägigen Split zur zweiten
 * Woche wird. Der eigentliche Maßstab ist eine Runde durch den Split.
 */
export const MAX_CALIBRATION_SESSIONS = 5

/**
 * Sätze je Übung zum Herantasten.
 *
 * Drei reichen in der Simulation für jede realistische Ausgangslage: Der
 * erste sitzt bewusst unter der Schätzung, der zweite wird aus dem Ergebnis
 * gerechnet, der dritte bestätigt oder korrigiert. Über die Kraftspanne von
 * 40 bis 160 kg 1RM landet das Verfahren damit auf 0 bis 2 kg genau.
 *
 * Mehr Tastsätze würden die Einheit lang und ermüdend machen — und was nach
 * drei Sätzen noch daneben liegt, holt Regelkreis 1 in der nächsten Einheit
 * in einem Satz.
 */
export const PROBE_SETS = 3

/**
 * Wo der erste Satz startet, als Anteil der Schätzung.
 *
 * Darunter, aber nicht weit. Ein zu schwerer erster Satz kostet Vertrauen
 * und ist ein Risiko — beim Einmessen fehlt genau die Erfahrung, die einen
 * zu schweren Satz rechtzeitig abbrechen lässt. Ein VIEL zu leichter kostet
 * aber einen ganzen Tastsatz, weil das Verfahren pro Satz nur um etwa ein
 * Fünftel klettert.
 */
export const FIRST_PROBE_SHARE = 0.85

/**
 * Wiederholungsziel eines Tastsatzes, mindestens so viele.
 *
 * Hier liegt der Kern des Verfahrens. Die Rückmeldung nach einem Satz kennt
 * nur drei Stufen („wie geplant / mehr drin / am Limit"), und „mehr drin"
 * lässt sich nur als etwa zwei Wiederholungen Reserve deuten. Bei einem Satz
 * mit fünf Wiederholungen trägt das fast keine Auskunft — der erste Entwurf
 * kam damit pro Tastsatz 2,5 % vom Fleck und hätte einen um 30 % zu tiefen
 * Start nie eingeholt.
 *
 * Bei zwölf Wiederholungen trägt die ZAHL DER GESCHAFFTEN WIEDERHOLUNGEN
 * selbst die Auskunft: Wer bei 40 kg zwölf Wiederholungen macht und noch
 * Reserve hat, verrät damit sein Arbeitsgewicht. Ein Tastsatz mit hohem
 * Wiederholungsziel ist ein Maximalversuch in Verkleidung — und braucht
 * dafür keine neue Bedienung.
 */
export const PROBE_REPS = 12

/** Pause zwischen Tastsätzen — sie sind nicht maximal. */
export const PROBE_REST_SECONDS = 90

// ────────────────────────────────────────────────────────────────────
//  Wie lange die Phase läuft
// ────────────────────────────────────────────────────────────────────

/**
 * Wie viele Einmess-Einheiten dieser Split braucht: eine pro Trainingstag,
 * damit jede Übung des Plans einmal vorkommt.
 */
export function calibrationSessionsNeeded(trainingDays: readonly Weekday[]): number {
  return Math.min(Math.max(1, trainingDays.length), MAX_CALIBRATION_SESSIONS)
}

export interface CalibrationState {
  /** Läuft die Phase noch? */
  active: boolean
  done: number
  needed: number
}

export function calibrationState(input: {
  trainingDays: readonly Weekday[]
  /** Abgeschlossene Einheiten, die als Einmessung gelaufen sind. */
  completedCalibrationSessions: number
}): CalibrationState {
  const needed = calibrationSessionsNeeded(input.trainingDays)
  const done = input.completedCalibrationSessions
  return { active: done < needed, done, needed }
}

// ────────────────────────────────────────────────────────────────────
//  Die Vorgabe einer Einmess-Einheit
// ────────────────────────────────────────────────────────────────────

/**
 * Macht aus einer geplanten Übung eine Einmess-Übung.
 *
 * Was bleibt: Übung, Reihenfolge, Ziel-Wiederholungen, RIR. Was sich
 * ändert: weniger Sätze, kein Aufwärmsatz (der erste Tastsatz IST das
 * Aufwärmen), kürzere Pause, und das Startgewicht liegt bewusst zu tief.
 */
export function toCalibrationExercise(
  exercise: PlannedExercise,
  equipment: Equipment | null,
): PlannedExercise {
  // Körpergewichts- und Zeitübungen gibt es nichts einzumessen — sie laufen
  // unverändert, nur mit den Sätzen der Einmess-Einheit.
  const messbar = exercise.weightKg !== null && equipment !== null

  const start = messbar
    ? (adjustByPercent(
        equipment,
        exercise.weightKg as number,
        (FIRST_PROBE_SHARE - 1) * 100,
      ) ?? exercise.weightKg)
    : exercise.weightKg

  // Höheres Wiederholungsziel als im Plan — siehe PROBE_REPS. Die Zahl der
  // geschafften Wiederholungen ist das Messinstrument.
  const tastReps =
    exercise.targetReps === null
      ? null
      : Math.max(
          exercise.targetReps,
          exercise.repRangeMax ?? exercise.targetReps,
          PROBE_REPS,
        )

  return {
    ...exercise,
    sets: messbar ? PROBE_SETS : Math.min(exercise.sets, PROBE_SETS),
    targetReps: messbar ? tastReps : exercise.targetReps,
    // Das echte Ziel bleibt erhalten — darauf wird gerechnet.
    probeForReps: messbar ? exercise.targetReps : null,
    weightKg: start,
    warmups: [],
    restSeconds: PROBE_REST_SECONDS,
    selectionReason: messbar
      ? `Einmessen: Tastsatz. Mach so viele Wiederholungen, wie sauber gehen — ` +
        `höchstens ${tastReps}. Aus der Zahl rechne ich dein Arbeitsgewicht.`
      : exercise.selectionReason,
  }
}

// ────────────────────────────────────────────────────────────────────
//  Der nächste Tastsatz
// ────────────────────────────────────────────────────────────────────

/** Wie weit der Satz vom Ziel abweichen darf, um als getroffen zu gelten. */
const CLOSE_ENOUGH_REPS = 1

/**
 * Wie weit ein Tastsatz höchstens springen darf, als Faktor.
 *
 * Oberhalb von etwa zwölf Wiederholungen überschätzt die Epley-Formel
 * deutlich. Ohne Deckel würde aus „25 Wiederholungen mit 20 kg" ein Sprung
 * auf ein Gewicht, das gefährlich sein kann. Ein Drittel pro Satz genügt:
 * drei Tastsätze kommen damit auf mehr als das Doppelte.
 */
const MAX_JUMP = 1.33

/** Und nach unten, aus demselben Grund in der anderen Richtung. */
const MAX_DROP = 0.6

/** Epley-Koeffizient — dieselbe Formel wie in weights.ts. */
const EPLEY = 0.0333

/**
 * Sprung, wenn der Tastsatz an seiner Wiederholungsgrenze endete und noch
 * Reserve da war.
 *
 * Dieser Fall ist grundsätzlich anders als die übrigen: Wer das
 * Wiederholungsziel von zwölf erreicht UND „mehr drin" meldet, hat nur eine
 * UNTERGRENZE geliefert. Wie viel mehr drin war — zwei Wiederholungen oder
 * dreißig — sagt die Rückmeldung nicht.
 *
 * Die Epley-Formel darauf anzuwenden ist deshalb falsch: Sie rechnet mit
 * einer angenommenen Reserve von zwei Wiederholungen und kommt auf ein Plus
 * von neun Prozent. An einer Maschine mit 10-kg-Stufen bewegt sich das
 * Gewicht damit überhaupt nicht — bei 40 kg wären 43,8 kg gerechnet, gerundet
 * wieder 40 kg. Genau das ist in der Simulation passiert: drei Tastsätze, kein
 * Millimeter Fortschritt, Ergebnis 28 kg unter dem richtigen Wert.
 *
 * Ein fester Sprung von einem Fünftel löst das: Drei Tastsätze kommen damit
 * auf plus 73 %, und die Stufe bewegt sich auch bei grobem Steckgewicht.
 */
const CAPPED_PROBE_JUMP = 1.2

export interface ProbeResult {
  /** Gewicht für den nächsten Satz. `null` = keins mehr nötig. */
  nextWeightKg: number | null
  /** Ist das Gewicht gefunden? */
  found: boolean
  /** Das gefundene Arbeitsgewicht — nur gesetzt, wenn `found`. */
  foundWeightKg: number | null
  /** Ein Satz Klartext für die Anzeige. */
  message: string
}

/**
 * Wie viele Wiederholungen Reserve die Rückmeldung bedeutet.
 *
 * Drei Stufen sind grob. Zusammen mit der Zahl der geschafften
 * Wiederholungen genügt es aber — die Zahl trägt die Hauptlast.
 */
function reserveFor(feedback: SetFeedback | null, targetRir: number): number {
  if (feedback === 'more_left') return targetRir + 2
  if (feedback === 'at_limit') return Math.max(0, targetRir - 2)
  return targetRir
}

/**
 * Rechnet aus einem Tastsatz das nächste Gewicht.
 *
 * Weg: Belastbarkeit des Satzes bestimmen (geschaffte Wiederholungen plus
 * gemeldete Reserve) und über das Epley-Verhältnis auf die Zielbelastbarkeit
 * umrechnen.
 *
 * BEWUSST ohne Umweg über ein 1RM: `estimate1RM` gibt oberhalb von zwölf
 * Wiederholungen `null` zurück — und genau dort steht ein Tastsatz, der zu
 * leicht angesetzt war. Der erste Entwurf hat in dem Fall einfach das
 * aktuelle Gewicht als „gefunden" genommen. Bei einem Satz mit 33
 * Wiederholungen Reserve hätte er damit 42,5 kg statt der richtigen 75 kg
 * festgeschrieben.
 */
export function probeNext(input: {
  weightKg: number
  actualReps: number
  feedback: SetFeedback | null
  /** Ziel-Wiederholungen der ECHTEN Vorgabe, nicht die des Tastsatzes. */
  targetReps: number
  targetRir: number
  /** Wiederholungsziel DES TASTSATZES — nötig, um den Deckel zu erkennen. */
  probeReps: number
  equipment: Equipment
  /** Der wievielte Tastsatz war das (1-basiert)? */
  probeNumber: number
}): ProbeResult {
  const { weightKg, actualReps, targetReps, targetRir, equipment } = input

  // Der Tastsatz endete an seiner Wiederholungsgrenze und es war noch Reserve
  // da: Wir kennen nur eine Untergrenze, nicht die Belastbarkeit. Siehe
  // CAPPED_PROBE_JUMP.
  const gedeckelt = actualReps >= input.probeReps && input.feedback === 'more_left'

  const belastbarkeit = actualReps + reserveFor(input.feedback, targetRir)
  const zielBelastbarkeit = targetReps + targetRir

  let faktor = gedeckelt
    ? CAPPED_PROBE_JUMP
    : (1 + EPLEY * belastbarkeit) / (1 + EPLEY * zielBelastbarkeit)
  faktor = Math.min(MAX_JUMP, Math.max(MAX_DROP, faktor))

  // Die Umkehrung muss hier ausdrücklich stehen: An einer unterstützten
  // Klimmzugmaschine bedeutet MEHR Gewicht MEHR Hilfe, also leichter. Ein
  // blindes `weightKg * 1.2` würde dort in die falsche Richtung tasten — und
  // weil die Startgewichte solcher Geräte ohnehin die unzuverlässigsten sind,
  // wäre der Fehler genau da am größten.
  const gewuenscht = isInverted(equipment)
    ? weightKg * (2 - faktor)
    : weightKg * faktor

  // Zur NÄCHSTEN Stufe runden, nicht auf- und nicht abrunden. Aufrunden würde
  // bei einer Maschine mit 10-kg-Stufen um eine ganze Stufe überschießen (68
  // gewünscht, 80 gestellt) — ein zu schwerer Tastsatz ist beim Einmessen das
  // Letzte, was passieren darf. Abrunden würde beim Klettern jeden Satz
  // bremsen und am Ende einen ganzen Tastsatz kosten.
  const gerundet = roundToStep(equipment, gewuenscht, 'nearest')
  const naechstes = gerundet ?? weightKg

  const trifft =
    Math.abs(actualReps - targetReps) <= CLOSE_ENOUGH_REPS &&
    input.feedback === 'as_planned'

  // „Das Gewicht bewegt sich nicht mehr" zählt nur, wenn der Satz nicht
  // offensichtlich zu leicht war. Sonst gilt ein Satz mit viel Reserve als
  // gefunden, bloß weil die Gerätestufe grob ist — genau daran ist der erste
  // Entwurf gescheitert.
  const steckt = naechstes === weightKg && !gedeckelt && input.feedback !== 'more_left'

  if (trifft || steckt) {
    return {
      nextWeightKg: null,
      found: true,
      foundWeightKg: naechstes,
      message: trifft
        ? `Gefunden: ${format(naechstes)} kg für ${targetReps} Wiederholungen.`
        : `${format(naechstes)} kg ist die passende Stufe — genauer geht es an diesem Gerät nicht.`,
    }
  }

  // Letzter erlaubter Tastsatz: nehmen, was wir haben.
  if (input.probeNumber >= PROBE_SETS) {
    return {
      nextWeightKg: null,
      found: true,
      foundWeightKg: naechstes,
      message:
        `Ich nehme ${format(naechstes)} kg. Ganz genau ist das noch nicht — ` +
        'die nächste Einheit feilt in einem Satz daran.',
    }
  }

  const richtung = naechstes > weightKg ? 'höher' : 'niedriger'
  return {
    nextWeightKg: naechstes,
    found: false,
    foundWeightKg: null,
    message: `Nächster Satz ${richtung}: ${format(naechstes)} kg.`,
  }
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
