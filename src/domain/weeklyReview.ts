// ====================================================================
//  Regelkreis 3 — die Wochenauswertung nach dem Check-in
//
//  Hier laufen die Fäden zusammen, die einzeln nichts aussagen:
//
//    Leistung   aus den Satz-Logs (e1RM je Übung)
//    Erholung   aus dem Check-in (Energie, Schlaf, Gelenke, RIR-Drift)
//    Körper     aus der Gewichts- und Taillen-Zeitreihe
//    Umsetzung  aus der Kalorien-Frage des Check-ins
//
//  Vier Entscheidungen entstehen daraus (docs/PLAN-ENGINE.md §9, Kreis 3):
//
//    a) Wochenvolumen je Muskel
//    b) Kalorien und Makros
//    c) Deload
//    d) Übungsrotation
//
//  Grundsatz wie überall: Es wird nichts gespeichert, was sich berechnen
//  lässt. Diese Funktion ist eine reine Ableitung aus den Rohdaten und kann
//  jederzeit neu gerechnet werden.
// ====================================================================

import { exerciseById } from '../data'
import { exerciseHistory } from './history'
import type { VolumeMuscle } from './muscles'
import { macrosFor } from './nutrition'
import { rirDrift, stagnationCount } from './progression'
import type {
  BodyMetric,
  CheckIn,
  NutritionTarget,
  SetLog,
  UserProfile,
  WorkoutSession,
} from './records'
import { VOLUME_TABLE } from './planning'
import { chronologically } from './week'
import { setContribution } from './volume'

// ────────────────────────────────────────────────────────────────────
//  Kennwerte
// ────────────────────────────────────────────────────────────────────

/** Ein Wochensprung im Volumen ist nie größer als das (docs §9 Kreis 3a). */
const MAX_WEEKLY_VOLUME_GROWTH = 0.2

/** Kalorienschritt einer Anpassung. */
const KCAL_STEP = 200

/**
 * Unterhalb dieser Abweichung von der Zielrate wird nichts geändert.
 *
 * Wochengewichte schwanken durch Wasser, Salz und Darminhalt um mehrere
 * hundert Gramm. Ohne Totband würde die App jede Woche nachstellen und die
 * Vorgabe pendeln lassen.
 */
const RATE_DEADBAND = 0.5

/** Ab so vielen Wochen ohne e1RM-Fortschritt ist eine Übung Tauschkandidat. */
const ROTATION_STAGNATION_WEEKS = 3

/** Ab so vielen Signalen wird ein Deload vorgeschlagen bzw. dringend. */
const DELOAD_SUGGEST = 2
const DELOAD_URGENT = 4

/**
 * Schwere Grundübungen werden NICHT rotiert.
 *
 * Sie sind der Kraftmaßstab: Wird die Bank getauscht, ist der e1RM-Verlauf
 * wertlos und die Progression verliert ihren Anker (docs §9 Kreis 3d).
 */
const ANCHOR_PATTERNS = [
  'bankdrücken',
  'kniebeuge',
  'kreuzheben',
  'klimmzug',
  'chin-up',
  'pull-up',
  'überkopfdrücken',
  'schulterdrücken',
]

// ────────────────────────────────────────────────────────────────────
//  Ein- und Ausgabe
// ────────────────────────────────────────────────────────────────────

export type Performance = 'rising' | 'stagnant' | 'falling' | 'unknown'

export interface VolumeChange {
  muscle: VolumeMuscle
  before: number
  after: number
  performance: Performance
  reason: string
}

export interface NutritionChange {
  /** `null` = keine Änderung. */
  next: {
    kcal: number
    proteinG: number
    fatG: number
    carbsG: number
  } | null
  reason: string
  /** true = Änderung bewusst unterdrückt, weil die Umsetzung fehlte. */
  blocked: boolean
}

export interface DeloadProposal {
  signals: string[]
  recommendation: 'none' | 'suggest' | 'urgent'
  /** Wie eine Entlastungswoche aussieht, wenn sie angenommen wird. */
  shape: string
}

export interface RotationProposal {
  exerciseId: string
  exerciseName: string
  weeksStagnant: number
  reason: string
}

export interface WeeklyReview {
  recovery: { ok: boolean; reasons: string[] }
  volume: VolumeChange[]
  nutrition: NutritionChange
  deload: DeloadProposal
  rotations: RotationProposal[]
  /** Klartext-Hinweise, die keine Änderung auslösen. */
  notes: string[]
}

export interface WeeklyReviewInput {
  profile: UserProfile
  /** Der eben abgegebene Check-in. */
  checkin: CheckIn
  /** Frühere Check-ins, älteste zuerst. */
  previousCheckins: readonly CheckIn[]
  /**
   * Läuft die Einmess-Phase noch?
   *
   * Dann werden die Zielsätze NICHT erhöht. In der Einmess-Woche sind die
   * Gewichte absichtlich konservativ angesetzt, also ist eine Steigerung
   * dort ein korrigierter Schätzfehler und kein Fortschritt — dieselbe
   * Unterscheidung, die Regelkreis 1 trifft. Volumen darauf zu erhöhen
   * bringt zusätzliche Ermüdung für einen Scheinfortschritt.
   */
  calibrationWeek?: boolean
  /** Aktuelle Wochen-Zielsätze je Muskel. */
  volumeTargets: Partial<Record<VolumeMuscle, number>>
  /** Startwerte der Zielsätze — Obergrenze bei Fettverlust. */
  startingVolumeTargets?: Partial<Record<VolumeMuscle, number>>
  nutrition: NutritionTarget | null
  metrics: readonly BodyMetric[]
  sessions: readonly WorkoutSession[]
  logsBySession: ReadonlyMap<string, readonly SetLog[]>
}

// ────────────────────────────────────────────────────────────────────

export function weeklyReview(input: WeeklyReviewInput): WeeklyReview {
  const notes: string[] = []

  const completed = input.sessions
    .filter((s) => s.status === 'completed' && s.deletedAt === null)
    .sort((a, b) => sortByCompletion(a, b))

  const drift = overallRirDrift(completed, input.logsBySession)
  const recovery = assessRecovery(input.checkin, drift)

  const performance = performancePerMuscle({
    sessions: completed,
    logsBySession: input.logsBySession,
  })

  const volume = adjustVolume({
    profile: input.profile,
    targets: input.volumeTargets,
    starting: input.startingVolumeTargets ?? input.volumeTargets,
    performance,
    recoveryOk: recovery.ok,
    calibrationWeek: input.calibrationWeek ?? false,
  })

  if (input.calibrationWeek) {
    notes.push(
      'Erste Woche: Die Gewichte waren bewusst vorsichtig angesetzt. Was jetzt wie ein Sprung aussieht, ist meine Schätzung, die sich einnordet — deshalb lasse ich das Volumen noch, wie es ist.',
    )
  }

  const nutrition = adjustNutrition({
    profile: input.profile,
    checkin: input.checkin,
    previousCheckins: input.previousCheckins,
    nutrition: input.nutrition,
    metrics: input.metrics,
    performance,
    notes,
  })

  const deload = assessDeload({
    checkin: input.checkin,
    previousCheckins: input.previousCheckins,
    drift,
    performance,
    sessions: completed,
    logsBySession: input.logsBySession,
  })

  const rotations = findRotations({
    sessions: completed,
    logsBySession: input.logsBySession,
    volumeRaised: volume.some((change) => change.after > change.before),
  })

  return { recovery, volume, nutrition, deload, rotations, notes }
}

// ────────────────────────────────────────────────────────────────────
//  Erholung
// ────────────────────────────────────────────────────────────────────

function assessRecovery(
  checkin: CheckIn,
  drift: number | null,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []

  // Energie: 1 = sehr frisch … 5 = ausgelaugt. „Normal" ist 3.
  if (checkin.energy !== null && checkin.energy > 3) reasons.push('Energie unter normal')
  if (checkin.sleep === 'bad') reasons.push('Schlaf schlecht')
  if (checkin.joints === 'limiting') reasons.push('Gelenke stören beim Training')
  if (drift !== null && drift <= -1) reasons.push('alles fühlt sich schwerer an als geplant')

  return { ok: reasons.length === 0, reasons }
}

/** Mittlere RIR-Abweichung der letzten zwei Einheiten. */
function overallRirDrift(
  sessions: readonly WorkoutSession[],
  logsBySession: ReadonlyMap<string, readonly SetLog[]>,
): number | null {
  const recent = sessions.slice(-2)
  const values: number[] = []
  for (const session of recent) {
    const logs = logsBySession.get(session.id) ?? []
    const working = logs.filter((log) => !log.isWarmup)
    const drift = rirDrift(
      working.map((log) => ({
        prescribedReps: log.prescribedReps,
        prescribedSeconds: log.prescribedSeconds,
        actualReps: log.actualReps,
        actualSeconds: log.actualSeconds,
        weightKg: log.actualWeightKg,
        feedback: log.feedback,
        abandoned: log.abandoned,
      })),
    )
    if (drift !== null) values.push(drift)
  }
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

// ────────────────────────────────────────────────────────────────────
//  Leistung je Muskel
// ────────────────────────────────────────────────────────────────────

interface ExerciseTrend {
  exerciseId: string
  exerciseName: string
  performance: Performance
  stagnantSessions: number
}

/**
 * Leistungstrend je Übung, aus dem e1RM-Verlauf.
 *
 * `rising` heißt: In der letzten Einheit stand ein neuer Bestwert.
 * `falling` heißt: Der Wert ist gefallen UND es gab schon vorher keinen
 * Fortschritt — ein einzelner schwacher Tag ist noch kein Abfall.
 */
export function exerciseTrends(input: {
  sessions: readonly WorkoutSession[]
  logsBySession: ReadonlyMap<string, readonly SetLog[]>
}): ExerciseTrend[] {
  const ids = new Map<string, string>()
  for (const session of input.sessions) {
    for (const planned of session.planned) ids.set(planned.exerciseId, planned.exerciseName)
  }

  const out: ExerciseTrend[] = []
  for (const [exerciseId, exerciseName] of ids) {
    const { e1rms } = exerciseHistory({
      exerciseId,
      sessions: input.sessions,
      logsBySession: input.logsBySession,
    })
    const values = e1rms.filter((value): value is number => value !== null)
    if (values.length === 0) {
      out.push({ exerciseId, exerciseName, performance: 'unknown', stagnantSessions: 0 })
      continue
    }

    const stagnant = stagnationCount(e1rms)
    const latest = values[values.length - 1]
    // Bestwert OHNE die letzte Einheit — nur so ist „steigt" gleichbedeutend
    // mit „hat einen neuen Bestwert gesetzt". Gegen das Maximum inklusive
    // der letzten Einheit zu vergleichen würde ein Plateau als Anstieg lesen.
    const bestBefore = Math.max(...values.slice(0, -1))

    let performance: Performance
    if (values.length < 2) performance = 'unknown'
    else if (latest > bestBefore) performance = 'rising'
    else if (stagnant >= 2 && latest < bestBefore) performance = 'falling'
    else performance = 'stagnant'

    out.push({ exerciseId, exerciseName, performance, stagnantSessions: stagnant })
  }
  return out
}

/**
 * Rechnet die Übungstrends auf Muskeln um.
 *
 * Zugeordnet wird nur über DIREKTE Beiträge: Der Trizeps steigt nicht, weil
 * das Bankdrücken steigt — sonst würde jede Grundübung dem halben Oberkörper
 * Fortschritt zuschreiben und das Volumen überall gleichzeitig anheben.
 */
export function performancePerMuscle(input: {
  sessions: readonly WorkoutSession[]
  logsBySession: ReadonlyMap<string, readonly SetLog[]>
}): Map<VolumeMuscle, Performance> {
  const trends = exerciseTrends(input)
  const byMuscle = new Map<VolumeMuscle, Performance[]>()

  for (const trend of trends) {
    if (trend.performance === 'unknown') continue
    const exercise = exerciseById.get(trend.exerciseId)
    if (!exercise) continue

    for (const [muscle, share] of Object.entries(setContribution(exercise))) {
      if ((share ?? 0) < 1) continue // nur direkte Arbeit
      const list = byMuscle.get(muscle as VolumeMuscle)
      if (list) list.push(trend.performance)
      else byMuscle.set(muscle as VolumeMuscle, [trend.performance])
    }
  }

  const out = new Map<VolumeMuscle, Performance>()
  for (const [muscle, values] of byMuscle) {
    // Ein Abfall wiegt schwerer als ein Anstieg: Bei gemischtem Bild wird
    // vorsichtig entschieden.
    if (values.includes('falling')) out.set(muscle, 'falling')
    else if (values.filter((v) => v === 'rising').length * 2 >= values.length)
      out.set(muscle, 'rising')
    else out.set(muscle, 'stagnant')
  }
  return out
}

// ────────────────────────────────────────────────────────────────────
//  a) Volumen
// ────────────────────────────────────────────────────────────────────

function adjustVolume(input: {
  profile: UserProfile
  targets: Partial<Record<VolumeMuscle, number>>
  starting: Partial<Record<VolumeMuscle, number>>
  performance: ReadonlyMap<VolumeMuscle, Performance>
  recoveryOk: boolean
  calibrationWeek: boolean
}): VolumeChange[] {
  const { profile, targets, starting, performance, recoveryOk } = input
  const out: VolumeChange[] = []

  for (const [key, before] of Object.entries(targets)) {
    const muscle = key as VolumeMuscle
    if (before === undefined) continue

    const trend = performance.get(muscle) ?? 'unknown'
    let after = before
    let reason: string

    if (input.calibrationWeek && trend !== 'falling') {
      // Nach unten korrigiert wird auch in der Einmess-Woche: Ein echter
      // Leistungsabfall ist ein Warnsignal, unabhängig von der Schätzung.
      reason = 'Einmess-Phase — ich warte auf verlässliche Daten, bevor ich mehr auflege'
    } else if (trend === 'falling') {
      after = before * 0.8
      reason = 'Leistung fällt — Volumen zurück, damit die Erholung nachkommt'
    } else if (!recoveryOk) {
      reason =
        trend === 'stagnant'
          ? 'Stagnation, aber die Erholung trägt kein Mehr — Volumen halten'
          : 'Erholung trägt kein Mehr — Volumen halten'
    } else if (trend === 'rising') {
      after = before + 1
      reason = 'Leistung steigt und die Erholung trägt — ein Satz mehr'
    } else if (trend === 'stagnant') {
      // Stagnation bei guter Erholung heißt: Der Reiz reicht nicht.
      after = before + 2
      reason = 'Stagnation bei guter Erholung — mehr Reiz nötig'
    } else {
      reason = 'Noch keine Daten für diesen Muskel — unverändert'
    }

    after = capVolume({ before, after, muscle, profile, starting })

    out.push({
      muscle,
      before: round(before),
      after: round(after),
      performance: trend,
      reason,
    })
  }

  return out.sort((a, b) => b.after - a.after)
}

function capVolume(input: {
  before: number
  after: number
  muscle: VolumeMuscle
  profile: UserProfile
  starting: Partial<Record<VolumeMuscle, number>>
}): number {
  const { before, muscle, profile, starting } = input
  let after = input.after
  if (after <= before) return Math.max(0, after)

  // Wochensprung begrenzen
  after = Math.min(after, before * (1 + MAX_WEEKLY_VOLUME_GROWTH))

  const row = VOLUME_TABLE[muscle]
  if (row) {
    // Bei Fettverlust ist der Startwert die Obergrenze: In der Diät geht es
    // um Erhalt, nicht um Aufbau (docs §3).
    const ceiling =
      profile.goal === 'fatloss'
        ? (starting[muscle] ?? row.diet ?? row.ceiling)
        : row.ceiling
    after = Math.min(after, ceiling)
  }

  return after
}

// ────────────────────────────────────────────────────────────────────
//  b) Kalorien und Makros
// ────────────────────────────────────────────────────────────────────

function adjustNutrition(input: {
  profile: UserProfile
  checkin: CheckIn
  previousCheckins: readonly CheckIn[]
  nutrition: NutritionTarget | null
  metrics: readonly BodyMetric[]
  performance: ReadonlyMap<VolumeMuscle, Performance>
  notes: string[]
}): NutritionChange {
  const { profile, checkin, nutrition, notes } = input

  if (!nutrition) {
    return { next: null, reason: 'Noch keine Ernährungsvorgabe vorhanden.', blocked: false }
  }

  // DIE Sperre aus docs §7: Ohne Umsetzung darf nicht nachgestellt werden.
  // Sonst verstellt sich die Vorgabe immer weiter, bis sie absurd ist.
  if (checkin.calorieAdherence !== 'good') {
    notes.push(
      checkin.calorieAdherence === 'none'
        ? 'Kalorien nicht verfolgt — ich ändere die Vorgabe nicht. Sie ist nur so gut wie ihre Umsetzung.'
        : 'Kalorien nur teilweise getroffen — ich warte mit einer Änderung, bis eine Woche sauber umgesetzt ist.',
    )
    return {
      next: null,
      reason: 'Ohne umgesetzte Vorgabe wäre jede Änderung geraten.',
      blocked: true,
    }
  }

  const weights = weeklyWeights(input.checkin, input.previousCheckins)
  if (weights.length < 2) {
    return {
      next: null,
      reason:
        'Für einen Trend brauche ich zwei Wochendurchschnitte. Nach dem nächsten Check-in kann ich rechnen.',
      blocked: false,
    }
  }

  const current = weights[weights.length - 1]
  const previous = weights[weights.length - 2]
  const actualRate = ((current - previous) / previous) * 100
  const targetRate = nutrition.targetRatePercentPerWeek

  const strengthFalling = [...input.performance.values()].filter((p) => p === 'falling').length

  let delta = 0
  let reason: string

  if (profile.goal === 'fatloss' && strengthFalling >= 2) {
    // Kraftverlust in der Diät ist das Warnsignal überhaupt: Es zeigt, dass
    // das Defizit an die Muskulatur geht.
    delta = KCAL_STEP
    reason = `Kraft fällt in ${strengthFalling} Muskelgruppen — das Defizit geht an die Muskulatur. Kalorien rauf.`
  } else if (targetRate === 0) {
    // Ziel ist Halten: gemessen wird gegen 0, mit dem Totband als Grenze.
    if (Math.abs(actualRate) < RATE_DEADBAND) {
      return {
        next: null,
        reason: `Gewicht stabil (${format(actualRate)} % diese Woche) — passt.`,
        blocked: false,
      }
    }
    delta = actualRate > 0 ? -KCAL_STEP : KCAL_STEP
    reason = `Gewicht läuft mit ${format(actualRate)} % pro Woche weg, obwohl es halten soll.`
  } else {
    const ratio = actualRate / targetRate
    // Innerhalb der halben Zielrate ist alles Rauschen.
    if (Math.abs(ratio - 1) < RATE_DEADBAND) {
      return {
        next: null,
        reason: `${format(actualRate)} % pro Woche — im Zielbereich, keine Änderung.`,
        blocked: false,
      }
    }
    const tooSlow = ratio < 1
    const gaining = targetRate > 0
    // Aufbau zu langsam → mehr; Diät zu langsam → weniger.
    delta = tooSlow === gaining ? KCAL_STEP : -KCAL_STEP
    reason =
      `${format(actualRate)} % statt ${format(targetRate)} % pro Woche — ` +
      (tooSlow ? 'zu langsam' : 'zu schnell') +
      '.'
  }

  const kcal = nutrition.kcal + delta
  const macros = macrosFor({ kcal, weightKg: current, goal: profile.goal })

  return {
    next: { kcal, ...macros },
    reason: `${reason} ${delta > 0 ? '+' : ''}${delta} kcal.`,
    blocked: false,
  }
}

/**
 * Wochendurchschnitte des Gewichts, älteste zuerst.
 *
 * AUSSCHLIESSLICH aus Check-ins. Kein Rückfall auf die Messreihe: Dort
 * stehen Tageswerte, und ein Tageswert schwankt durch Wasser, Salz und
 * Darminhalt um mehr, als eine Woche Fortschritt ausmacht (docs §7.1). Einen
 * Wochenschnitt gegen einen Tageswert zu rechnen ergibt eine Rate, die vor
 * allem Rauschen misst — und danach würde die App die Kalorien verstellen.
 *
 * Die Folge ist gewollt: In der ersten Woche gibt es keine Kalorienänderung.
 */
function weeklyWeights(checkin: CheckIn, previous: readonly CheckIn[]): number[] {
  return [...previous, checkin]
    .filter((entry) => entry.deletedAt === null && entry.weightKgAvg !== null)
    .sort(chronologically((entry) => entry.weekOf))
    .map((entry) => entry.weightKgAvg as number)
}

// ────────────────────────────────────────────────────────────────────
//  c) Deload
// ────────────────────────────────────────────────────────────────────

function assessDeload(input: {
  checkin: CheckIn
  previousCheckins: readonly CheckIn[]
  drift: number | null
  performance: ReadonlyMap<VolumeMuscle, Performance>
  sessions: readonly WorkoutSession[]
  logsBySession: ReadonlyMap<string, readonly SetLog[]>
}): DeloadProposal {
  const { checkin, previousCheckins, drift, performance } = input
  const signals: string[] = []

  const falling = [...performance.values()].filter((p) => p === 'falling').length
  if (falling >= 2) signals.push(`Leistungsabfall in ${falling} Muskelgruppen`)

  if (drift !== null && drift < -1) signals.push('alles fühlt sich schwerer an als geplant')

  const last = previousCheckins.at(-1) ?? null
  // Zwei Wochen in Folge — ein einzelner schlechter Wert ist Tagesform.
  if (twoInARow(checkin, last, (entry) => entry.energy !== null && entry.energy >= 5)) {
    signals.push('zwei Wochen in Folge ausgelaugt')
  }
  if (twoInARow(checkin, last, (entry) => entry.sleep === 'bad')) {
    signals.push('zwei Wochen in Folge schlechter Schlaf')
  }
  if (twoInARow(checkin, last, (entry) => entry.motivation === 'low')) {
    signals.push('zwei Wochen in Folge wenig Lust aufs Training')
  }
  if (checkin.joints === 'limiting') signals.push('Gelenke stören beim Training')

  const recommendation =
    signals.length >= DELOAD_URGENT
      ? 'urgent'
      : signals.length >= DELOAD_SUGGEST
        ? 'suggest'
        : 'none'

  return {
    signals,
    recommendation,
    shape: 'Volumen etwa halbieren, Last auf ~90 %, zwei Wiederholungen mehr Reserve. Übungen bleiben.',
  }
}

function twoInARow(
  current: CheckIn,
  previous: CheckIn | null,
  predicate: (entry: CheckIn) => boolean,
): boolean {
  return predicate(current) && previous !== null && predicate(previous)
}

// ────────────────────────────────────────────────────────────────────
//  d) Übungsrotation
// ────────────────────────────────────────────────────────────────────

function findRotations(input: {
  sessions: readonly WorkoutSession[]
  logsBySession: ReadonlyMap<string, readonly SetLog[]>
  volumeRaised: boolean
}): RotationProposal[] {
  // Erst tauschen, wenn das Volumen schon erhöht wurde: Sonst wird eine
  // Übung ausgewechselt, die nur zu wenig Reiz bekam (docs §9 Kreis 3d).
  if (!input.volumeRaised) return []

  return exerciseTrends(input)
    .filter(
      (trend) =>
        trend.stagnantSessions >= ROTATION_STAGNATION_WEEKS && !isAnchor(trend.exerciseName),
    )
    .map((trend) => ({
      exerciseId: trend.exerciseId,
      exerciseName: trend.exerciseName,
      weeksStagnant: trend.stagnantSessions,
      reason: `Seit ${trend.stagnantSessions} Einheiten kein Bestwert, obwohl das Volumen erhöht wurde.`,
    }))
}

function isAnchor(exerciseName: string): boolean {
  const lower = exerciseName.toLowerCase()
  return ANCHOR_PATTERNS.some((pattern) => lower.includes(pattern))
}

// ────────────────────────────────────────────────────────────────────

function sortByCompletion(a: WorkoutSession, b: WorkoutSession): number {
  const left = a.completedAt ?? a.createdAt
  const right = b.completedAt ?? b.createdAt
  return left < right ? -1 : left > right ? 1 : 0
}

function round(value: number): number {
  return Math.round(value * 2) / 2
}

function format(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',')
}
