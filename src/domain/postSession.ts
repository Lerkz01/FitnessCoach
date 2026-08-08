// ====================================================================
//  Nach-Training-Analyse
//
//  Ausdrückliche Nutzeranforderung: Nach JEDER Einheit wird analysiert,
//  was angepasst werden muss, um das Ziel schneller zu erreichen.
//
//  Läuft vollständig LOKAL — also auch offline — direkt beim Abschließen
//  der Einheit. Reine Berechnung aus Rohdaten, jederzeit reproduzierbar
//  (docs/PLAN-ENGINE.md §9, „Die Nach-Training-Analyse").
//
//  Die zentrale Trennung dieser Datei:
//
//    SOFORT      Vorgaben fürs nächste Mal, breite Anhebung, Rekorde
//    BEIM CHECK-IN   Wochenvolumen, Kalorien, Rotation, Deload
//    NUR BEOBACHTET  Stagnation, Ermüdung, Ausreißer, Zieltrend
//
//  Ohne diese Trennung wäre die Progressionsbremse wirkungslos: Ein guter
//  oder schlechter Tag würde den ganzen Plan umwerfen — genau das soll
//  nicht passieren.
// ====================================================================

import type { Equipment } from '../types'
import { analyzeSession, exerciseHistory, type ExerciseResult } from './history'
import type { Goal, Level, PlannedExercise, SetLog, WorkoutSession } from './records'
import {
  nextPrescription,
  stagnationCount,
  type NextPrescription,
  type SessionQuality,
} from './progression'

// ────────────────────────────────────────────────────────────────────

/** Ab so vielen Einheiten ohne e1RM-Bestwert ist die Übung ein Tauschkandidat. */
const STAGNATION_THRESHOLD = 3

/** Ab dieser Abweichung vom eigenen Schnitt gilt eine Einheit als Ausreißer. */
const OUTLIER_DEVIATION = 0.25

/** So viele Einheiten schaut die Ermüdungsprüfung zurück. */
const FATIGUE_WINDOW = 3

export interface PostSessionInput {
  session: WorkoutSession
  /** Die Sätze DIESER Einheit. */
  logs: readonly SetLog[]
  /** Früher abgeschlossene Einheiten — für Verlauf, Rekorde, Ausreißer. */
  previousSessions: readonly WorkoutSession[]
  logsBySession: ReadonlyMap<string, readonly SetLog[]>
  level: Level
  goal: Goal
  calibrationWeek: boolean
  /**
   * Gerät, über das die Last dieser Übung eingestellt wird.
   * `null` = Körpergewicht, dann progressiert nur die Wiederholungszahl.
   */
  equipmentForExercise: (exerciseId: string) => Equipment | null
  /** Körpergewicht als Wochenmittel, älteste zuerst — nur für Fettverlust. */
  bodyweightTrendKg?: readonly number[]
}

export interface Achievement {
  kind: 'record' | 'volume' | 'completion'
  text: string
}

export interface Change {
  exerciseId: string
  exerciseName: string
  /** Kurztext für den Abschluss-Screen. */
  text: string
  reason: string
  next: NextPrescription
}

export interface Observation {
  kind: 'stagnation' | 'fatigue' | 'outlier' | 'goal' | 'volume'
  text: string
  /** Was daraus folgt — und wann. Wichtig fürs Vertrauen. */
  consequence: string
}

export interface PostSessionAnalysis {
  exercises: ExerciseResult[]
  quality: SessionQuality
  /** GESCHAFFT */
  achieved: Achievement[]
  /** GEÄNDERT — wirkt sofort auf die nächste Einheit. */
  changed: Change[]
  /** BEOBACHTET — gesehen, aber bewusst noch keine Änderung. */
  observed: Observation[]
  /** War diese Einheit untypisch? Dann nicht überreagieren. */
  outlier: boolean
  /** Zählt für die Deload-Entscheidung beim Check-in. */
  deloadSignal: boolean
  /** Übungen, die beim Check-in zum Tausch vorgeschlagen werden. */
  rotationCandidates: string[]
}

// ────────────────────────────────────────────────────────────────────

export function analyzePostSession(input: PostSessionInput): PostSessionAnalysis {
  const { session, logs, previousSessions, logsBySession, goal } = input

  // ── Prüfung 1 + 2: Übungs-Status und Einheits-Qualität ──
  const { exercises, quality } = analyzeSession(logs)

  const plannedById = new Map<string, PlannedExercise>(
    session.planned.map((planned) => [planned.exerciseId, planned]),
  )

  const achieved: Achievement[] = []
  const changed: Change[] = []
  const observed: Observation[] = []
  const rotationCandidates: string[] = []

  // ── Prüfung 8: Ausreißer zuerst — er dämpft alles Weitere ──
  const outlier = isOutlier({ exercises, previousSessions, logsBySession, session })

  for (const result of exercises) {
    const history = exerciseHistory({
      exerciseId: result.exerciseId,
      sessions: previousSessions,
      logsBySession,
    })

    // ── Prüfung 6: Rekord ──
    // In der Einmess-Woche ist jede Einheit ein „Rekord" — das zu feiern
    // wäre bedeutungslos. Ein Rekord braucht außerdem einen Vorwert.
    const previousBest = maxOf(history.e1rms)
    if (
      !input.calibrationWeek &&
      previousBest !== null &&
      result.e1rm !== null &&
      result.e1rm > previousBest
    ) {
      achieved.push({
        kind: 'record',
        text: `${result.exerciseName}: neuer Bestwert ${formatKg(result.e1rm)} kg geschätztes 1RM (vorher ${formatKg(previousBest)} kg)`,
      })
    }

    // ── Prüfung 1 → Vorgabe fürs nächste Mal (wirkt SOFORT) ──
    const planned = plannedById.get(result.exerciseId)
    if (planned) {
      const next = nextPrescription({
        current: {
          weightKg: planned.weightKg,
          targetReps: planned.targetReps,
          repRangeMin: planned.repRangeMin,
          repRangeMax: planned.repRangeMax,
          targetSeconds: planned.targetSeconds,
        },
        // Die Historie muss die EBEN abgeschlossene Einheit enthalten —
        // sie ist der jüngste und wichtigste Datenpunkt.
        history: [
          ...history.attempts,
          {
            status: result.status,
            weightKg: planned.weightKg,
            targetReps: planned.targetReps,
          },
        ],
        level: input.level,
        equipment: input.equipmentForExercise(result.exerciseId),
        calibrationWeek: input.calibrationWeek,
        // Ein Ausreißer darf keine breite Anhebung auslösen.
        sessionWasTooEasy: quality.allowBroadIncrease && !outlier,
      })

      if (next.changed) {
        changed.push({
          exerciseId: result.exerciseId,
          exerciseName: result.exerciseName,
          text: describeChange(next),
          reason: next.reason,
          next,
        })
      }
    }

    // ── Prüfung 5: Stagnation (nur BEOBACHTET) ──
    const stagnation = stagnationCount([...history.e1rms, result.e1rm])
    if (stagnation >= STAGNATION_THRESHOLD) {
      rotationCandidates.push(result.exerciseId)
      observed.push({
        kind: 'stagnation',
        text: `${result.exerciseName}: seit ${stagnation} Einheiten kein neuer Bestwert`,
        consequence: 'Tauschvorschlag beim nächsten Check-in',
      })
    }
  }

  // ── GESCHAFFT: erledigte Arbeit ──
  const totalSets = exercises.reduce((sum, e) => sum + e.workingSets, 0)
  const totalVolume = exercises.reduce((sum, e) => sum + e.volumeLoad, 0)
  if (totalSets > 0) {
    achieved.push({
      kind: 'completion',
      text: `${totalSets} Arbeitssätze in ${exercises.length} Übungen`,
    })
  }

  const previousVolume = lastSessionVolume({ previousSessions, logsBySession, session })
  if (previousVolume !== null && previousVolume > 0 && totalVolume > previousVolume) {
    const percent = Math.round(((totalVolume - previousVolume) / previousVolume) * 100)
    achieved.push({
      kind: 'volume',
      text: `Volumenlast ${percent} % über der letzten vergleichbaren Einheit`,
    })
  }

  // ── Prüfung 4: Ermüdungs-Trend (nur BEOBACHTET) ──
  const fatigue = fatigueTrend({ exercises, previousSessions, logsBySession })
  if (fatigue !== null) observed.push(fatigue)

  // ── Prüfung 7: Zielfortschritt (nur BEOBACHTET) ──
  const progress = goalProgress({
    goal,
    exercises,
    previousVolume,
    bodyweightTrendKg: input.bodyweightTrendKg,
  })
  if (progress !== null) observed.push(progress)

  // ── Prüfung 3: Wochenvolumen wartet auf den Check-in ──
  if (quality.allowVolumeIncrease && !outlier) {
    observed.push({
      kind: 'volume',
      text: 'Die Einheit trägt das aktuelle Volumen gut',
      consequence:
        'Volumenerhöhung entscheide ich beim Check-in — dazu brauche ich die Erholungsdaten',
    })
  }

  if (outlier) {
    observed.push({
      kind: 'outlier',
      text: 'Diese Einheit weicht deutlich von deinem Schnitt ab',
      consequence: 'Ich werte sie vorsichtiger und ändere nichts auf breiter Front',
    })
  }

  return {
    exercises,
    quality,
    achieved,
    changed,
    observed,
    outlier,
    deloadSignal: quality.verdict === 'deload_signal' && !outlier,
    rotationCandidates,
  }
}

// ────────────────────────────────────────────────────────────────────
//  Hilfsfunktionen
// ────────────────────────────────────────────────────────────────────

function describeChange(next: NextPrescription): string {
  if (next.targetSeconds !== null) return `${next.targetSeconds} Sekunden`
  const parts: string[] = []
  if (next.weightKg !== null) parts.push(`${formatKg(next.weightKg)} kg`)
  if (next.targetReps !== null) parts.push(`${next.targetReps} Wdh`)
  return parts.join(' × ')
}

function formatKg(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',')
}

function maxOf(values: readonly (number | null)[]): number | null {
  let best: number | null = null
  for (const value of values) {
    if (value === null) continue
    if (best === null || value > best) best = value
  }
  return best
}

/**
 * Frühere Einheiten mit derselben Bezeichnung, jüngste zuerst.
 *
 * Der Vergleich muss auf gleichnamige Einheiten beschränkt sein: Die
 * Volumenlast eines Unterkörpertages ist naturgemäß höher als die eines
 * Oberkörpertages — ein Vergleich über alle Einheiten wäre wertlos.
 */
function comparableSessions(input: {
  previousSessions: readonly WorkoutSession[]
  session: WorkoutSession
}): WorkoutSession[] {
  return input.previousSessions
    .filter(
      (s) =>
        s.id !== input.session.id &&
        s.status === 'completed' &&
        s.deletedAt === null &&
        s.label === input.session.label,
    )
    .sort((a, b) => {
      const left = a.completedAt ?? a.createdAt
      const right = b.completedAt ?? b.createdAt
      return left < right ? 1 : left > right ? -1 : 0
    })
}

function sessionVolume(
  logsBySession: ReadonlyMap<string, readonly SetLog[]>,
  sessionId: string,
): number | null {
  const logs = logsBySession.get(sessionId)
  if (!logs || logs.length === 0) return null
  const { exercises } = analyzeSession(logs)
  return exercises.reduce((sum, e) => sum + e.volumeLoad, 0)
}

function lastSessionVolume(input: {
  previousSessions: readonly WorkoutSession[]
  logsBySession: ReadonlyMap<string, readonly SetLog[]>
  session: WorkoutSession
}): number | null {
  const [previous] = comparableSessions(input)
  return previous ? sessionVolume(input.logsBySession, previous.id) : null
}

function isOutlier(input: {
  exercises: readonly ExerciseResult[]
  previousSessions: readonly WorkoutSession[]
  logsBySession: ReadonlyMap<string, readonly SetLog[]>
  session: WorkoutSession
}): boolean {
  const total = input.exercises.reduce((sum, e) => sum + e.volumeLoad, 0)
  if (total === 0) return false

  // Mit weniger als drei Vergleichswerten gibt es keinen belastbaren
  // Schnitt — dann ist eine Abweichung nicht feststellbar, nur geraten.
  const volumes = comparableSessions(input)
    .slice(0, 6)
    .map((s) => sessionVolume(input.logsBySession, s.id))
    .filter((v): v is number => v !== null && v > 0)

  if (volumes.length < 3) return false

  const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length
  return Math.abs(total - mean) / mean > OUTLIER_DEVIATION
}

/**
 * Ermüdung zeigt sich nicht in einer Einheit, sondern im Trend: Die Sätze
 * fühlen sich schwerer an als vorgegeben, obwohl die Vorgabe gleich blieb.
 */
function fatigueTrend(input: {
  exercises: readonly ExerciseResult[]
  previousSessions: readonly WorkoutSession[]
  logsBySession: ReadonlyMap<string, readonly SetLog[]>
}): Observation | null {
  const current = averageDrift(input.exercises)
  if (current === null || current >= 0) return null

  const recent = input.previousSessions
    .filter((s) => s.status === 'completed' && s.deletedAt === null)
    .sort((a, b) => {
      const left = a.completedAt ?? a.createdAt
      const right = b.completedAt ?? b.createdAt
      return left < right ? 1 : left > right ? -1 : 0
    })
    .slice(0, FATIGUE_WINDOW - 1)
    .map((s) => {
      const logs = input.logsBySession.get(s.id)
      return logs ? averageDrift(analyzeSession(logs).exercises) : null
    })

  if (recent.length < FATIGUE_WINDOW - 1) return null
  if (!recent.every((drift) => drift !== null && drift < 0)) return null

  return {
    kind: 'fatigue',
    text: `Rückmeldung ${FATIGUE_WINDOW} Einheiten in Folge unter Ziel — es fühlt sich schwerer an als geplant`,
    consequence: 'Hält das an, schlage ich beim Check-in eine Entlastungswoche vor',
  }
}

function averageDrift(exercises: readonly ExerciseResult[]): number | null {
  const drifts = exercises.map((e) => e.rirDrift).filter((d): d is number => d !== null)
  if (drifts.length === 0) return null
  return drifts.reduce((a, b) => a + b, 0) / drifts.length
}

/**
 * Prüfung 7 — die Leitmetrik hängt am Ziel (docs/PLAN-ENGINE.md §9).
 *
 * Besonders wichtig beim Fettverlust: Dort ist HALTENDE Kraft bei sinkendem
 * Körpergewicht der Erfolg. Steigende Kraft zu erwarten wäre die falsche
 * Messlatte und würde den Nutzer unnötig entmutigen.
 */
function goalProgress(input: {
  goal: Goal
  exercises: readonly ExerciseResult[]
  /** Volumenlast der letzten gleichnamigen Einheit, `null` wenn es keine gibt. */
  previousVolume: number | null
  bodyweightTrendKg?: readonly number[]
}): Observation | null {
  const { goal, exercises } = input

  if (goal === 'fatloss') {
    const trend = input.bodyweightTrendKg ?? []
    if (trend.length < 2) return null
    const losing = trend[trend.length - 1] < trend[0]
    if (!losing) return null

    const holding = exercises.some((e) => e.status !== 'VERFEHLT')
    return {
      kind: 'goal',
      text: holding
        ? 'Kraft hält bei sinkendem Körpergewicht — genau das ist das Ziel'
        : 'Kraft gibt bei sinkendem Körpergewicht nach',
      consequence: holding
        ? 'Auf Kurs: Der Gewichtsverlust geht zu Lasten von Fett, nicht Muskel'
        : 'Beim Check-in prüfe ich, ob das Defizit oder das Volumen zu hoch ist',
    }
  }

  if (goal === 'strength') {
    const rising = exercises.filter((e) => e.status === 'UEBERTROFFEN').length
    if (rising === 0) return null
    return {
      kind: 'goal',
      text: `${rising} Hauptübung${rising === 1 ? '' : 'en'} über Plan`,
      consequence: 'Der Kraftaufbau läuft — ich behalte den e1RM-Trend im Blick',
    }
  }

  if (goal === 'muscle') {
    // Leitmetrik ist der Volumenlast-Trend. Ohne Vergleichseinheit gibt es
    // keinen Trend — dann wird auch nichts behauptet.
    const previous = input.previousVolume
    if (previous === null || previous <= 0) return null

    const current = exercises.reduce((sum, e) => sum + e.volumeLoad, 0)
    if (current >= previous) {
      return {
        kind: 'goal',
        text: 'Volumenlast über der letzten vergleichbaren Einheit',
        consequence: 'Auf Kurs für Muskelaufbau — mehr Arbeit bei gleicher Vorgabe',
      }
    }
    // Ein einzelner Rückgang ist normal (Tagesform, Rotation im Bereich).
    // Erst der Trend zählt, deshalb hier keine Meldung.
    return null
  }

  return null
}
