// ====================================================================
//  Datenmodell
//
//  Grundprinzip (docs/ARCHITECTURE.md §1):
//    Gespeichert werden nur ROHDATEN. Alles Abgeleitete (e1RM, Volumen,
//    Progressionsstand, Diagramme) wird berechnet, nie gespeichert.
//
//  Deshalb enthält dieses Modell keinen einzigen Zustandsdatensatz wie
//  "Bankdrücken steht auf Progressionsstufe 7". Eine künftige App braucht
//  nur diese Rohdaten und rechnet alles neu — und wenn wir die
//  Progressionslogik verbessern, können wir die Historie neu durchrechnen.
//
//  Alle Zeitstempel sind ISO 8601 in UTC. Alle Kalendertage `YYYY-MM-DD`
//  in lokaler Zeit. Alle Gewichte in Kilogramm, alle Längen in Zentimetern,
//  alle Dauern in Sekunden.
// ====================================================================

import type { VolumeMuscle } from './muscles'

/** Basis aller synchronisierten Datensätze. */
export interface BaseRecord {
  /** UUIDv7, auf dem Gerät erzeugt (siehe ids.ts). */
  id: string
  /** Profil-Zugehörigkeit. Die Trennung wird zusätzlich per RLS erzwungen. */
  userId: string
  createdAt: string
  updatedAt: string
  /** Weiches Löschen — damit Löschungen synchronisierbar sind. */
  deletedAt: string | null
}

// ────────────────────────────────────────────────────────────────────
//  Aufzählungen
// ────────────────────────────────────────────────────────────────────

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export const WEEKDAYS: readonly Weekday[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
]

/** Nur für die Kalorienformel relevant (docs/ONBOARDING.md Screen 3). */
export type Sex = 'male' | 'female' | 'unspecified'

export type Goal = 'muscle' | 'strength' | 'fatloss' | 'fitness'

export type Level = 'beginner' | 'intermediate' | 'advanced'

export type TrainingYears = 'lt6m' | '6to12m' | '1to2y' | '2to5y' | 'gt5y'

export type DailyActivity = 'sedentary' | 'light' | 'active' | 'very_active'

export type SessionMinutes = 45 | 60 | 75 | 90

/** Voreinstellung ist `demanding` (docs/PLAN-ENGINE.md §2). */
export type Intensity = 'moderate' | 'demanding' | 'very_demanding'

/** Beschriftung der Abgleich-Buttons (docs/UI-UX.md §5.3). */
export type FeedbackStyle = 'words' | 'rir'

export type InjuryRegion =
  | 'knee'
  | 'shoulder'
  | 'lower_back'
  | 'elbow'
  | 'wrist'
  | 'hip'
  | 'neck'
  | 'ankle'

export interface InjuryFlag {
  region: InjuryRegion
  /** `acute` schließt Übungen hart aus, `history` depriorisiert nur. */
  severity: 'acute' | 'history'
}

// ────────────────────────────────────────────────────────────────────
//  Profil
// ────────────────────────────────────────────────────────────────────

/**
 * Die Onboarding-Antworten und alle Einstellungen.
 *
 * Bewusst NICHT hier: das Körpergewicht. Es ändert sich fortlaufend und
 * lebt deshalb ausschließlich als Zeitreihe in `BodyMetric` — sonst gäbe
 * es zwei Wahrheiten für denselben Wert.
 */
export interface UserProfile extends BaseRecord {
  displayName: string
  sex: Sex
  birthYear: number
  heightCm: number

  goal: Goal
  targetWeightKg: number | null
  /** Verbaler Bereich statt Zahl (docs/ONBOARDING.md Screen 6). */
  bodyFatBucket: string | null
  /** Maximal 2 (docs/ONBOARDING.md Screen 7). */
  priorityMuscles: VolumeMuscle[]

  level: Level
  trainingYears: TrainingYears
  knowsRir: boolean

  trainingDays: Weekday[]
  sessionMinutes: SessionMinutes
  dailyActivity: DailyActivity

  injuries: InjuryFlag[]
  blacklistedExerciseIds: string[]
  /** Dauerhaft nicht verfügbare Geräte (Einstellungen, nicht Onboarding). */
  disabledEquipmentIds: string[]

  checkinWeekday: Weekday

  intensity: Intensity
  feedbackStyle: FeedbackStyle

  onboardingCompletedAt: string | null
}

/**
 * Referenzwerte aus dem Onboarding (Teil 6) — Grundlage der Startgewichte.
 * Optional: Fehlt alles, läuft die App in den Einmess-Modus.
 */
export interface StrengthReference extends BaseRecord {
  /** Übungs-ID aus der Datenbank, auf die sich der Wert bezieht. */
  exerciseId: string
  pattern: MovementPattern
  weightKg: number | null
  reps: number
  recordedAt: string
}

export type MovementPattern =
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'

// ────────────────────────────────────────────────────────────────────
//  Plan
// ────────────────────────────────────────────────────────────────────

export type SplitType = '3_fullbody' | '4_upper_lower' | '5_ppl_ul' | '6_ppl'

/**
 * Ein Planstand. Jede Neuberechnung erzeugt eine neue Version mit
 * Begründung — der Verlauf bleibt damit nachvollziehbar.
 */
export interface TrainingPlan extends BaseRecord {
  version: number
  splitType: SplitType
  trainingDays: Weekday[]
  /** Fraktionale Wochen-Zielsätze pro Muskel (docs/PLAN-ENGINE.md §3). */
  volumeTargets: Partial<Record<VolumeMuscle, number>>
  activeFrom: string
  activeUntil: string | null
  reason: string
}

/** Ein Aufwärmsatz — zählt nie ins Volumen. */
export interface PlannedWarmup {
  weightKg: number | null
  reps: number
}

/**
 * Die Vorgabe für eine Übung innerhalb einer Einheit.
 *
 * `targetReps` ist eine konkrete Zahl, `repRangeMin/Max` nur der Rahmen
 * für die Progression — siehe docs/PLAN-ENGINE.md §6: Ein Bereich als
 * Vorgabe wäre mehrdeutig auswertbar.
 */
export interface PlannedExercise {
  exerciseId: string
  /** Redundant gespeichert, damit der Export ohne Übungs-DB lesbar bleibt. */
  exerciseName: string
  orderIndex: number
  sets: number
  targetReps: number | null
  repRangeMin: number | null
  repRangeMax: number | null
  targetSeconds: number | null
  targetRir: number
  restSeconds: number
  weightKg: number | null
  warmups: PlannedWarmup[]
  /** Grund, warum diese Übung an dieser Stelle steht (Transparenz). */
  selectionReason: string | null
}

// ────────────────────────────────────────────────────────────────────
//  Training
// ────────────────────────────────────────────────────────────────────

export type SessionStatus = 'planned' | 'active' | 'completed' | 'skipped'

export interface WorkoutSession extends BaseRecord {
  planId: string | null
  /** z.B. "Oberkörper A" */
  label: string
  scheduledFor: string | null
  startedAt: string | null
  completedAt: string | null
  status: SessionStatus
  /** Die Vorgabe der Einheit, wie sie beim Start feststand. */
  planned: PlannedExercise[]
  /** Gesamteinschätzung am Ende, 1 = gut … 4 = schlecht. */
  sessionFeeling: 1 | 2 | 3 | 4 | null
  notes: string | null
}

/**
 * Abgleich der tatsächlichen mit der geplanten Anstrengung
 * (docs/PLAN-ENGINE.md §9 — Vergleich statt Bewertung).
 */
export type SetFeedback = 'as_planned' | 'more_left' | 'at_limit'

/**
 * DER Kern-Datensatz. Append-only: Korrekturen sind neue Zeilen mit
 * `supersedesId`, nie Überschreibungen. Genau das macht die
 * Synchronisation konfliktfrei.
 */
export interface SetLog extends BaseRecord {
  sessionId: string
  exerciseId: string
  /** Redundant, damit der Export selbsterklärend bleibt. */
  exerciseName: string
  orderIndex: number
  setNumber: number
  isWarmup: boolean

  // ── Vorgabe (was die App gesagt hat) ──
  prescribedWeightKg: number | null
  prescribedReps: number | null
  prescribedSeconds: number | null
  prescribedRir: number | null

  // ── Realität (was tatsächlich passiert ist) ──
  actualWeightKg: number | null
  actualReps: number | null
  actualSeconds: number | null
  feedback: SetFeedback | null
  /** Abweichung vom Ziel-RIR, abgeleitet aus `feedback`. */
  rirDelta: number | null

  /** Satz abgebrochen — gilt als Ausfall, nicht als 0 Wiederholungen. */
  abandoned: boolean

  loggedAt: string
  deviceId: string
  /** Falls dieser Satz eine frühere Eingabe korrigiert. */
  supersedesId: string | null
}

// ────────────────────────────────────────────────────────────────────
//  Rückmeldungen
// ────────────────────────────────────────────────────────────────────

export type LooksChange = -2 | -1 | 0 | 1 | 2
export type SleepQuality = 'good' | 'ok' | 'bad'
export type JointStatus = 'none' | 'mild' | 'limiting'
export type Motivation = 'high' | 'normal' | 'low'
/** Ohne diese Angabe darf die App die Kalorien nicht anpassen (§7). */
export type CalorieAdherence = 'good' | 'partial' | 'none'

export interface CheckIn extends BaseRecord {
  /** Montag der betreffenden Woche, `YYYY-MM-DD`. */
  weekOf: string
  /** Wochendurchschnitt, nicht Tageswert (§7). */
  weightKgAvg: number | null
  looks: LooksChange | null
  /** 1 = sehr frisch … 5 = ausgelaugt. */
  energy: 1 | 2 | 3 | 4 | 5 | null
  sleep: SleepQuality | null
  joints: JointStatus | null
  motivation: Motivation | null
  calorieAdherence: CalorieAdherence | null
  submittedAt: string
  notes: string | null
}

/**
 * Körperdaten als Zeitreihe — Gewicht, Umfänge, Körperfett-Schätzung.
 * Der Taillenumfang ist der aussagekräftigste Einzelwert (§7.2).
 */
export interface BodyMetric extends BaseRecord {
  measuredOn: string
  weightKg: number | null
  waistCm: number | null
  chestCm: number | null
  hipCm: number | null
  armCm: number | null
  thighCm: number | null
  calfCm: number | null
  bodyFatBucket: string | null
  source: 'onboarding' | 'checkin' | 'monthly' | 'manual'
}

// ────────────────────────────────────────────────────────────────────
//  Ernährung
// ────────────────────────────────────────────────────────────────────

export interface NutritionTarget extends BaseRecord {
  effectiveFrom: string
  kcal: number
  proteinG: number
  fatG: number
  carbsG: number
  /** Geschätzter Erhaltungsbedarf, auf dem die Vorgabe beruht. */
  maintenanceKcal: number
  /** Zielrate der Gewichtsveränderung in Prozent pro Woche. */
  targetRatePercentPerWeek: number
  /** Warum diese Zahlen — Pflichtfeld für die Anzeige (docs/UI-UX.md §9). */
  reason: string
}

// ────────────────────────────────────────────────────────────────────
//  Anpassungsprotokoll
// ────────────────────────────────────────────────────────────────────

export type AdjustmentScope =
  | 'set_correction'
  | 'exercise_progression'
  | 'session_wide'
  | 'volume'
  | 'nutrition'
  | 'deload'
  | 'exercise_rotation'
  | 'plan_rebuild'
  /** Wunsch aus dem Coach-Chat: Schwerpunkt auf einem Muskel. */
  | 'coach_focus'
  /** Wunsch aus dem Coach-Chat: diese Übung bitte nicht. */
  | 'coach_avoid'

/**
 * Jede automatische Anpassung wird protokolliert — mit Begründung.
 *
 * Das ist gleichzeitig die Datenquelle für die Transparenz-Screens
 * ("Für nächstes Mal", "Das habe ich angepasst") und der Prüfpfad, mit
 * dem sich die Coaching-Logik im Nachhinein überprüfen lässt.
 */
export interface Adjustment extends BaseRecord {
  appliedAt: string
  scope: AdjustmentScope
  /**
   * Welcher Regelkreis hat gehandelt (docs/PLAN-ENGINE.md §1).
   *
   * 5 ist kein Regelkreis im engeren Sinn, sondern der Coach-Chat: eine
   * Änderung, die der Nutzer selbst angestoßen hat. Bewusst unterscheidbar,
   * damit im Protokoll sichtbar bleibt, was die App entschieden hat und was
   * gewünscht war.
   */
  circle: 1 | 2 | 3 | 4 | 5
  /** Übungs-ID, Muskelname oder null bei globalen Änderungen. */
  targetId: string | null
  targetLabel: string | null
  before: string
  after: string
  reason: string
  /** false = nur vorgeschlagen und noch nicht angewandt. */
  applied: boolean
  /** Hat der Nutzer zugestimmt? null = wurde nicht gefragt. */
  userAccepted: boolean | null
}

// ────────────────────────────────────────────────────────────────────
//  Sammeltyp
// ────────────────────────────────────────────────────────────────────

/** Alle synchronisierten Datensatzarten. */
export const RECORD_KINDS = [
  'profiles',
  'strengthReferences',
  'plans',
  'sessions',
  'setLogs',
  'checkins',
  'bodyMetrics',
  'nutritionTargets',
  'adjustments',
] as const

export type RecordKind = (typeof RECORD_KINDS)[number]

/** Zuordnung Datensatzart → Typ. */
export interface RecordTypes {
  profiles: UserProfile
  strengthReferences: StrengthReference
  plans: TrainingPlan
  sessions: WorkoutSession
  setLogs: SetLog
  checkins: CheckIn
  bodyMetrics: BodyMetric
  nutritionTargets: NutritionTarget
  adjustments: Adjustment
}

export type AnyRecord = RecordTypes[RecordKind]

/** Erzeugt die Basisfelder für einen neuen Datensatz. */
export function baseFields(userId: string, id: string, at: string): BaseRecord {
  return { id, userId, createdAt: at, updatedAt: at, deletedAt: null }
}
