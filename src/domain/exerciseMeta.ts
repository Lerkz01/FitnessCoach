// ====================================================================
//  Übungs-Metadaten
//
//  Die Übungsdatenbank aus gym-uebungen.md kennt Geräte und Muskeln, aber
//  nicht, was der Plan-Generator zusätzlich braucht:
//
//   · Bewegungsmuster und Last-Koeffizient → Startgewichte (ONBOARDING §6)
//   · Belastung in gedehnter Position       → Übungsauswahl (SCIENCE §6)
//   · Verletzungs-Zuordnung                 → Übungsausschluss (ONBOARDING §14)
//   · Systemlast                            → Reihenfolge (PLAN-ENGINE §5.4)
//   · Überlappung                           → Redundanz-Strafe (PLAN-ENGINE §5.2)
//
//  Bewusst als FUNKTIONEN mit Ausnahmetabelle, nicht als generierte Datei:
//  So bleibt jede Einordnung im Code nachvollziehbar und testbar, und es
//  gibt keinen zweiten Datenstand, der auseinanderlaufen kann.
//
//  Ehrlich zur Genauigkeit: Die Koeffizienten sind Schätzungen. Deshalb
//  trägt jeder eine KONFIDENZ — bei „estimated" korrigiert die App
//  aggressiver ein (siehe PLAN-ENGINE §9, Regelkreis 1).
// ====================================================================

import type { Exercise } from '../types'
import { resolveMuscles, type VolumeMuscle } from './muscles'
import type { InjuryFlag, InjuryRegion, MovementPattern } from './records'

// ────────────────────────────────────────────────────────────────────
//  1. Bewegungsmuster und Last-Koeffizienten
// ────────────────────────────────────────────────────────────────────

/**
 * Wie das Startgewicht einer Übung geschätzt wird.
 *
 * `pattern`: Vielfaches der Referenzübung desselben Bewegungsmusters.
 *            Beispiel: Schrägbankdrücken ≈ 0,85 × Flachbankdrücken.
 *
 * `bodyweight`: Anteil des Körpergewichts. Für Isolationsübungen, für die
 *            es keine Referenzangabe gibt — dort korreliert die Kraft
 *            besser mit dem Körpergewicht als mit einer Grundübung.
 *
 * `none`: Körpergewichtsübungen und Zeit-Übungen ohne Zusatzlast.
 *
 * Der Koeffizient ergibt immer das **am Gerät einzustellende Gewicht**.
 * Bei Kurzhanteln also pro Hantel, bei Kabelzügen die Stapeleinstellung.
 */
export interface LoadEstimate {
  basis: 'pattern' | 'bodyweight' | 'none'
  pattern: MovementPattern | null
  coefficient: number
  confidence: 'explicit' | 'estimated'
}

const NO_LOAD: LoadEstimate = {
  basis: 'none',
  pattern: null,
  coefficient: 0,
  confidence: 'explicit',
}

/**
 * Explizite Werte für die häufig genutzten Übungen.
 *
 * Referenzübungen (Koeffizient 1,0) sind die aus dem Onboarding:
 *   BRU-001 Langhantel Bankdrücken flach     → horizontal_push
 *   QUA-012 Langhantel Kniebeuge             → squat
 *   RUE-001 Latzug breit Obergriff           → vertical_pull
 *   RUE-023 Rudermaschine mit Brustpolster   → horizontal_pull
 *   SCH-005 Langhantel Schulterdrücken       → vertical_push
 *   RUE-058 Kreuzheben konventionell         → hinge
 *
 * Maschinen können über 1,0 liegen: Eine Beinpresse bewegt durch die
 * andere Hebelwirkung ein Mehrfaches der Kniebeugenlast.
 */
const EXPLICIT: Record<string, { pattern: MovementPattern; coefficient: number }> = {
  // ── Drücken waagerecht ──
  'BRU-001': { pattern: 'horizontal_push', coefficient: 1.0 }, // Referenz
  'BRU-002': { pattern: 'horizontal_push', coefficient: 0.85 }, // Schrägbank LH
  'BRU-003': { pattern: 'horizontal_push', coefficient: 1.05 }, // Negativbank LH
  'BRU-004': { pattern: 'horizontal_push', coefficient: 0.95 }, // breiter Griff
  'BRU-005': { pattern: 'horizontal_push', coefficient: 0.38 }, // KH flach, pro Hantel
  'BRU-006': { pattern: 'horizontal_push', coefficient: 0.33 }, // KH Schrägbank
  'BRU-007': { pattern: 'horizontal_push', coefficient: 0.4 }, // KH Negativbank
  'BRU-015': { pattern: 'horizontal_push', coefficient: 1.05 }, // Smith flach
  'BRU-016': { pattern: 'horizontal_push', coefficient: 0.9 }, // Smith Schrägbank
  'BRU-020': { pattern: 'horizontal_push', coefficient: 1.1 }, // Chest Press geführt
  'BRU-022': { pattern: 'horizontal_push', coefficient: 0.95 }, // Incline Press geführt
  'TRI-006': { pattern: 'horizontal_push', coefficient: 0.75 }, // enges Bankdrücken

  // ── Kniebeugen ──
  'QUA-012': { pattern: 'squat', coefficient: 1.0 }, // Referenz
  'QUA-013': { pattern: 'squat', coefficient: 0.8 }, // Frontkniebeuge
  'QUA-006': { pattern: 'squat', coefficient: 2.0 }, // Beinpresse 45°
  'QUA-007': { pattern: 'squat', coefficient: 1.9 },
  'QUA-008': { pattern: 'squat', coefficient: 1.8 },
  'QUA-004': { pattern: 'squat', coefficient: 1.6 }, // Beinpresse horizontal
  'QUA-010': { pattern: 'squat', coefficient: 1.5 }, // V-Squat
  'QUA-016': { pattern: 'squat', coefficient: 1.1 }, // Smith Kniebeuge
  'QUA-018': { pattern: 'squat', coefficient: 1.15 }, // Smith Hack Squat
  'QUA-025': { pattern: 'squat', coefficient: 0.22 }, // Bulgarian, KH pro Hand
  'QUA-019': { pattern: 'squat', coefficient: 0.3 }, // Goblet Squat
  'QUA-015': { pattern: 'squat', coefficient: 0.9 }, // Box Squat

  // ── Ziehen senkrecht ──
  'RUE-001': { pattern: 'vertical_pull', coefficient: 1.0 }, // Referenz
  'RUE-002': { pattern: 'vertical_pull', coefficient: 0.95 },
  'RUE-003': { pattern: 'vertical_pull', coefficient: 0.95 },
  'RUE-004': { pattern: 'vertical_pull', coefficient: 0.95 },
  'RUE-010': { pattern: 'vertical_pull', coefficient: 1.1 }, // Lat Pulldown Dual
  'RUE-008': { pattern: 'vertical_pull', coefficient: 0.35 }, // Straight-Arm Pulldown

  // ── Ziehen waagerecht ──
  'RUE-023': { pattern: 'horizontal_pull', coefficient: 1.0 }, // Referenz
  'RUE-024': { pattern: 'horizontal_pull', coefficient: 1.0 },
  'RUE-025': { pattern: 'horizontal_pull', coefficient: 1.0 },
  'RUE-029': { pattern: 'horizontal_pull', coefficient: 0.95 }, // Kabelrudern eng
  'RUE-030': { pattern: 'horizontal_pull', coefficient: 0.9 },
  'RUE-033': { pattern: 'horizontal_pull', coefficient: 1.05 }, // High Row Dual
  'RUE-035': { pattern: 'horizontal_pull', coefficient: 0.95 }, // T-Bar eng
  'RUE-037': { pattern: 'horizontal_pull', coefficient: 0.9 }, // LH-Rudern
  'RUE-040': { pattern: 'horizontal_pull', coefficient: 0.35 }, // KH-Rudern pro Hand
  'RUE-042': { pattern: 'horizontal_pull', coefficient: 0.28 },

  // ── Drücken senkrecht ──
  'SCH-005': { pattern: 'vertical_push', coefficient: 1.0 }, // Referenz
  'SCH-006': { pattern: 'vertical_push', coefficient: 0.9 }, // stehend
  'SCH-001': { pattern: 'vertical_push', coefficient: 1.15 }, // Maschine
  'SCH-003': { pattern: 'vertical_push', coefficient: 1.15 },
  'SCH-008': { pattern: 'vertical_push', coefficient: 0.36 }, // KH pro Hantel
  'SCH-009': { pattern: 'vertical_push', coefficient: 0.32 },
  'SCH-010': { pattern: 'vertical_push', coefficient: 0.3 }, // Arnold Press
  'SCH-012': { pattern: 'vertical_push', coefficient: 1.05 }, // Smith

  // ── Hüftstreckung ──
  'RUE-058': { pattern: 'hinge', coefficient: 1.0 }, // Referenz
  'RUE-059': { pattern: 'hinge', coefficient: 1.0 }, // Sumo
  'RUE-060': { pattern: 'hinge', coefficient: 1.15 }, // Rack Pulls
  'RUE-061': { pattern: 'hinge', coefficient: 0.75 }, // RDL Langhantel
  'RUE-062': { pattern: 'hinge', coefficient: 0.3 }, // RDL Kurzhantel pro Hand
  'RUE-064': { pattern: 'hinge', coefficient: 0.95 }, // Smith Kreuzheben
  'RUE-065': { pattern: 'hinge', coefficient: 0.45 }, // Good Mornings
  'HAM-001': { pattern: 'hinge', coefficient: 0.4 }, // Beinbeuger liegend
  'GES-001': { pattern: 'hinge', coefficient: 1.2 }, // Hip Thrust Maschine
  'GES-003': { pattern: 'hinge', coefficient: 1.1 }, // Hip Thrust Langhantel
}

/**
 * Anteil des Körpergewichts für Isolationsübungen ohne Referenz.
 * Schlüssel sind Zielmuskel-Gruppen; die Werte sind Erfahrungswerte für
 * ein Arbeitsgewicht im mittleren Wiederholungsbereich.
 */
const BODYWEIGHT_SHARE: Partial<Record<VolumeMuscle, number>> = {
  'Seitliche Schulter': 0.1, // Seitheben pro Hantel
  'Hintere Schulter': 0.12,
  'Vordere Schulter': 0.12,
  Bizeps: 0.18,
  Trizeps: 0.22,
  Waden: 0.9, // Wadenheben trägt viel
  Bauch: 0.15,
  Unterarme: 0.12,
  Adduktoren: 0.45,
  Gesäß: 0.5,
  Hamstrings: 0.4,
  Quadrizeps: 0.5,
  Brust: 0.25, // Fliegende, Butterfly
  Lat: 0.3,
  'Oberer Rücken': 0.3,
  Trapez: 0.5,
  'Unterer Rücken': 0.4,
  Schienbein: 0.1,
}

/** Vorhandene Referenz-Bewegungsmuster mit ihrer Referenzübung. */
export const PATTERN_REFERENCE: Record<MovementPattern, string> = {
  horizontal_push: 'BRU-001',
  vertical_push: 'SCH-005',
  horizontal_pull: 'RUE-023',
  vertical_pull: 'RUE-001',
  squat: 'QUA-012',
  hinge: 'RUE-058',
}

/** Bewegungsmuster einer Übung, falls sie eines der sechs abdeckt. */
export function movementPatternOf(exercise: Exercise): MovementPattern | null {
  return EXPLICIT[exercise.id]?.pattern ?? guessPattern(exercise)
}

function guessPattern(exercise: Exercise): MovementPattern | null {
  if (!exercise.compound) return null
  const name = exercise.name.toLowerCase()

  if (/bankdrücken|chest press|liegestütz|push-up|dips|floor press/.test(name)) {
    return 'horizontal_push'
  }
  if (/schulterdrücken|military|push press|overhead press|pike push/.test(name)) {
    return 'vertical_push'
  }
  if (/klimmzug|chin-up|latzug|pulldown|pull-up/.test(name)) return 'vertical_pull'
  if (/rudern|row/.test(name)) return 'horizontal_pull'
  if (/kniebeuge|squat|beinpresse|ausfallschritt|lunge|step-up/.test(name)) return 'squat'
  if (/kreuzheben|deadlift|hip thrust|glute bridge|good morning|pull-through/.test(name)) {
    return 'hinge'
  }
  return null
}

/**
 * Wie das Gewicht dieser Übung geschätzt wird.
 *
 * Reihenfolge: explizite Tabelle → Muster-Schätzung → Körpergewichtsanteil
 * → keine Last. Nur die erste Stufe gilt als gesichert.
 */
/**
 * Geräte, die nur POSITIONIEREN, aber keine Last beitragen: Bänke, Racks,
 * Ablagen, Stepbretter, Klimmzugstangen, Fußschlaufen.
 *
 * Wichtig für die Gewichtserkennung: Eine Bank oder ein Rack ist in der
 * Datenbank als `plate` geführt, weil dort eine Langhantel eingehängt wird.
 * Steht in einer Übung NUR so ein Gerät ohne Lastquelle, ist es eine
 * Körpergewichtsübung — sonst hätte etwa der Sissy Squat ein Gewicht
 * bekommen, das an ihm gar nicht einstellbar ist.
 */
const POSITIONING_ONLY = new Set([
  'BODY',
  'FRE-03', // verstellbare Bänke
  'FRE-04', // Flachbank mit Ablage
  'FRE-05', // Schrägbank mit Ablage
  'FRE-06', // Negativbank mit Ablage
  'FRE-07', // Squat Racks
  'FRE-10', // Klimmzugstangen
  'FRE-12', // Stepbretter
  'FRE-14', // Fußschlaufen
  'LEG-11', // 45°-Hyperextension
  'ABS-03', // Beinheben-Station
])

/** Trägt dieses Gerät tatsächlich die Last? */
export function isLoadSource(equipmentId: string): boolean {
  return !POSITIONING_ONLY.has(equipmentId)
}

export function loadEstimateOf(exercise: Exercise): LoadEstimate {
  // Körpergewichts- und Zeitübungen ohne einstellbares Gewicht
  if (exercise.metric === 'cardio') return NO_LOAD
  const hasLoadSource = exercise.equipmentIds.some(isLoadSource)
  if (!hasLoadSource) return NO_LOAD

  const explicit = EXPLICIT[exercise.id]
  if (explicit) {
    return {
      basis: 'pattern',
      pattern: explicit.pattern,
      coefficient: explicit.coefficient,
      confidence: 'explicit',
    }
  }

  const pattern = guessPattern(exercise)
  if (pattern) {
    // Regelbasierte Schätzung nach Gerätetyp: geführte Maschinen bewegen
    // mehr Gewicht, unilaterale Varianten deutlich weniger.
    //
    // Der unilaterale Wert ist bewusst niedrig (0,18): Einbeinige Übungen
    // sind meist durch Balance und Beweglichkeit begrenzt, nicht durch die
    // Kraft der Zielmuskulatur. Eine Schätzung aus der Kniebeugenlast
    // überschätzt sie sonst massiv.
    let coefficient = exercise.unilateral ? 0.18 : 0.8
    if (exercise.equipmentIds.includes('FRE-01') && !exercise.unilateral) coefficient = 0.35
    if (exercise.equipmentIds.includes('FRE-08')) coefficient = 1.0 // Smith
    return { basis: 'pattern', pattern, coefficient, confidence: 'estimated' }
  }

  // Isolation: Anteil des Körpergewichts über den Hauptzielmuskel
  const primaryMuscle = firstResolvedMuscle(exercise)
  const share = primaryMuscle ? BODYWEIGHT_SHARE[primaryMuscle] : undefined
  if (share !== undefined) {
    const adjusted = exercise.unilateral ? share * 0.6 : share
    return {
      basis: 'bodyweight',
      pattern: null,
      coefficient: adjusted,
      confidence: 'estimated',
    }
  }

  return NO_LOAD
}

function firstResolvedMuscle(exercise: Exercise): VolumeMuscle | null {
  for (const raw of exercise.primary) {
    const muscles = resolveMuscles(raw)
    if (muscles.length > 0) return muscles[0]
  }
  return null
}

// ────────────────────────────────────────────────────────────────────
//  2. Belastung in gedehnter Position
// ────────────────────────────────────────────────────────────────────

/**
 * Wird der Zielmuskel unter Last gedehnt?
 *
 * Grundlage: docs/TRAINING-SCIENCE.md §6 — die gedehnte Phase ist der
 * hypertrophisch priorisierte Teil der Bewegung. Solche Übungen bekommen
 * in der Bewertungsfunktion einen Bonus.
 */
const LENGTHENED_EXPLICIT = new Set([
  'BRU-010', // KH Fliegende flach
  'BRU-011', // KH Fliegende Schrägbank
  'BRU-013', // KH Überzüge
  'BRU-026', // Cable Crossover tief→hoch
  'BRU-031', // Cable Pullover
  'BIZ-010', // Schrägbank-Curls
  'BIZ-020', // Kabelcurls hinter dem Körper
  'BIZ-011', // Spider Curls
  'TRI-012', // KH Trizepsdrücken über Kopf
  'TRI-013',
  'TRI-014', // SZ über Kopf
  'TRI-019', // Kabel Overhead Extension
  'TRI-020',
  'TRI-008', // Skullcrusher
  'TRI-010', // Skullcrusher Schrägbank
  'RUE-061', // Rumänisches Kreuzheben
  'RUE-062',
  'RUE-063',
  'HAM-001', // Beinbeuger liegend
  'HAM-016',
  'HAM-010', // Nordic Curls
  'HAM-011', // Glute-Ham Raise
  'QUA-025', // Bulgarian Split Squat
  'QUA-026',
  'QUA-029', // Sissy Squat
  'QUA-031', // Cyclist Squat, Fersen erhöht
  'WAD-001', // Wadenheben stehend
  'WAD-003', // Wadenheben sitzend
  'WAD-005',
  'SCH-017', // Seitheben auf Schrägbank
  'RUE-051', // Reverse Fly auf Schrägbank
  'ABS-009', // hängendes Beinheben
  'BRU-038', // Liegestütze auf Kurzhanteln
])

const LENGTHENED_KEYWORDS =
  /fliegende|überzug|pullover|über kopf|overhead|rumänisch|skullcrusher|french press|schrägbank-curl|spider|sissy|bulgarian|nordic|glute-ham|deficit|fersen erhöht|hängend/i

export function loadsLengthened(exercise: Exercise): boolean {
  if (LENGTHENED_EXPLICIT.has(exercise.id)) return true
  return LENGTHENED_KEYWORDS.test(exercise.name)
}

// ────────────────────────────────────────────────────────────────────
//  3. Verletzungs-Zuordnung
// ────────────────────────────────────────────────────────────────────

/**
 * Regeln pro Körperregion.
 *
 * `muscles`: Übungen, die diese Muskeln primär belasten, sind betroffen.
 * `keywords`: Bewegungen, die die Region typischerweise reizen.
 *
 * Bei `severity: 'acute'` wird ausgeschlossen, bei `'history'` nur
 * depriorisiert (docs/ONBOARDING.md Screen 14).
 */
const INJURY_RULES: Record<
  InjuryRegion,
  { muscles?: VolumeMuscle[]; keywords?: RegExp }
> = {
  knee: {
    keywords:
      /kniebeuge|squat|beinpresse|beinstrecker|ausfallschritt|lunge|step-up|sissy|leg extension|sprung|jump|burpee|thruster/i,
  },
  shoulder: {
    keywords:
      /schulterdrücken|military|push press|overhead|über kopf|dips|aufrechtes rudern|breiter griff|butterfly|fliegende|snatch|clean|arnold|pike push/i,
  },
  lower_back: {
    keywords:
      /kreuzheben|deadlift|good morning|hyperextension|rückenstrecker|vorgebeugt|rack pull|pendlay|zercher|clean|snatch|high pull|kniebeuge|squat|shrug/i,
  },
  elbow: {
    keywords:
      /skullcrusher|french press|enges bankdrücken|dips|curl|pushdown|kickback|jm press|trizeps/i,
  },
  wrist: {
    keywords:
      /handgelenk|frontkniebeuge|front squat|aufrechtes rudern|klimmzug|dead hang|farmer|pinch|zercher|reverse curl|griff/i,
  },
  hip: {
    keywords:
      /kniebeuge|squat|ausfallschritt|lunge|adduktor|abduktor|sumo|cossack|curtsy|hip thrust|glute bridge|kreuzheben/i,
  },
  neck: { keywords: /shrug|aufrechtes rudern|nacken|hinter dem kopf|bridge|farmer/i },
  ankle: {
    keywords:
      /waden|calf|sprung|jump|ausfallschritt|lunge|step-up|burpee|kniebeuge|squat|zehenspitzen/i,
  },
}

/** Zusätzliche Muskel-Zuordnung, wo der Name allein nicht reicht. */
const INJURY_MUSCLES: Partial<Record<InjuryRegion, VolumeMuscle[]>> = {
  lower_back: ['Unterer Rücken'],
  wrist: ['Unterarme'],
  ankle: ['Waden', 'Schienbein'],
  hip: ['Adduktoren'],
  neck: ['Trapez'],
}

export type InjuryVerdict = 'exclude' | 'deprioritize' | null

/** Beurteilt eine Übung gegen EINE Beschwerdeangabe. */
export function injuryVerdict(exercise: Exercise, injury: InjuryFlag): InjuryVerdict {
  const rule = INJURY_RULES[injury.region]
  let affected = false

  if (rule.keywords?.test(exercise.name)) affected = true

  if (!affected) {
    const muscles = INJURY_MUSCLES[injury.region] ?? rule.muscles ?? []
    if (muscles.length > 0) {
      const primary = exercise.primary.flatMap((raw) => resolveMuscles(raw))
      if (primary.some((m) => muscles.includes(m))) affected = true
    }
  }

  if (!affected) return null
  return injury.severity === 'acute' ? 'exclude' : 'deprioritize'
}

/** Strengstes Urteil über alle Beschwerdeangaben. */
export function injuryVerdictAll(
  exercise: Exercise,
  injuries: readonly InjuryFlag[],
): InjuryVerdict {
  let worst: InjuryVerdict = null
  for (const injury of injuries) {
    const verdict = injuryVerdict(exercise, injury)
    if (verdict === 'exclude') return 'exclude'
    if (verdict === 'deprioritize') worst = 'deprioritize'
  }
  return worst
}

// ────────────────────────────────────────────────────────────────────
//  4. Systemlast
// ────────────────────────────────────────────────────────────────────

/**
 * Wie stark belastet die Übung den gesamten Organismus?
 *
 * Steuert die Reihenfolge der schweren Grundübungen: Was am meisten
 * ermüdet, kommt zuerst — solange die Technik frisch ist
 * (docs/PLAN-ENGINE.md §5.4).
 *
 * 0 = kaum systemische Last (Wadenheben) … 100 = maximal (Kreuzheben)
 */
const HIGH_LOAD_KEYWORDS =
  /kreuzheben|deadlift|kniebeuge|squat|clean|snatch|push press|thruster|zercher|good morning|pendlay|rack pull/i

const MID_LOAD_KEYWORDS =
  /bankdrücken|chest press|schulterdrücken|military|rudern|row|klimmzug|chin-up|latzug|pulldown|dips|beinpresse|hip thrust|lunge|ausfallschritt/i

export function systemLoadRank(exercise: Exercise): number {
  if (exercise.metric === 'cardio') return 0

  let rank = exercise.compound ? 40 : 10
  if (HIGH_LOAD_KEYWORDS.test(exercise.name)) rank = 90
  else if (MID_LOAD_KEYWORDS.test(exercise.name)) rank = 60

  // Freie Langhantelvarianten fordern mehr Stabilisation als geführte.
  if (exercise.equipmentIds.includes('FRE-02')) rank += 8
  if (exercise.equipmentIds.includes('FRE-07')) rank += 4
  // Unilateral kostet Zeit, aber weniger systemische Last pro Satz.
  if (exercise.unilateral) rank -= 10

  return Math.max(0, Math.min(100, rank))
}

// ────────────────────────────────────────────────────────────────────
//  5. Überlappung
// ────────────────────────────────────────────────────────────────────

/**
 * Wie stark überlappen zwei Übungen?  0 = gar nicht, 1 = identisch.
 *
 * Wird aus `primary`/`secondary` berechnet — keine Handarbeit nötig.
 * Der Generator bestraft damit redundante Auswahl innerhalb einer
 * Einheit (docs/PLAN-ENGINE.md §5.2).
 */
export function overlapScore(a: Exercise, b: Exercise): number {
  const weights = (exercise: Exercise): Map<VolumeMuscle, number> => {
    const map = new Map<VolumeMuscle, number>()
    const add = (raw: string, weight: number) => {
      const muscles = resolveMuscles(raw)
      if (muscles.length === 0) return
      const share = weight / muscles.length
      for (const m of muscles) map.set(m, Math.max(map.get(m) ?? 0, share))
    }
    for (const raw of exercise.primary) add(raw, 1)
    for (const raw of exercise.secondary) add(raw, 0.5)
    return map
  }

  const wa = weights(a)
  const wb = weights(b)
  if (wa.size === 0 || wb.size === 0) return 0

  // Kosinus-Ähnlichkeit der Muskelvektoren
  let dot = 0
  let normA = 0
  let normB = 0
  const allMuscles = new Set([...wa.keys(), ...wb.keys()])
  for (const muscle of allMuscles) {
    const va = wa.get(muscle) ?? 0
    const vb = wb.get(muscle) ?? 0
    dot += va * vb
    normA += va * va
    normB += vb * vb
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ────────────────────────────────────────────────────────────────────
//  6. Zeitbedarf
// ────────────────────────────────────────────────────────────────────

/** Sekunden pro Wiederholung — Anhaltswert für kontrollierte Ausführung. */
const SECONDS_PER_REP = 3.5

/** Rüstzeit pro Übung: Gerät suchen, einstellen, Gewicht auflegen. */
const SETUP_SECONDS_MACHINE = 40
const SETUP_SECONDS_FREE = 70

/**
 * Geschätzte Dauer einer Übung in Sekunden.
 *
 * Wird gebraucht, damit das Zeitbudget aus dem Onboarding überhaupt
 * greifen kann (docs/PLAN-ENGINE.md §6 — bisher offener Punkt).
 */
export function estimateExerciseSeconds(input: {
  exercise: Exercise
  sets: number
  reps: number | null
  seconds: number | null
  restSeconds: number
  warmupSets: number
}): number {
  const { exercise, sets, reps, seconds, restSeconds, warmupSets } = input

  const perSetWork =
    seconds !== null ? seconds : (reps ?? 10) * SECONDS_PER_REP
  // Unilateral: beide Seiten hintereinander
  const workPerSet = exercise.unilateral ? perSetWork * 2 : perSetWork

  const freeWeight = exercise.equipmentIds.some((id) =>
    ['FRE-01', 'FRE-02', 'FRE-04', 'FRE-05', 'FRE-06', 'FRE-07', 'ARM-03', 'ARM-04'].includes(
      id,
    ),
  )
  const setup = freeWeight ? SETUP_SECONDS_FREE : SETUP_SECONDS_MACHINE

  // Aufwärmsätze mit kürzeren Pausen
  const warmupTime = warmupSets * (perSetWork * 0.6 + 50)
  // Nach dem letzten Satz keine Pause mehr
  const workTime = sets * workPerSet + Math.max(0, sets - 1) * restSeconds

  return Math.round(setup + warmupTime + workTime)
}
