// ====================================================================
//  Plan-Generator
//
//  Baut aus Profil und Volumenbudget die konkreten Trainingseinheiten.
//  Grundlage: docs/PLAN-ENGINE.md §3–§6.
//
//  Der Kern ist die AUSWAHL MIT FRAKTIONALER VERRECHNUNG: Nach jeder
//  gewählten Übung wird ihr voller Volumenbeitrag von ALLEN Muskeln
//  abgezogen — auch von den indirekt getroffenen. Dadurch merkt der
//  Generator von selbst, dass nach Klimmzügen und Rudern weniger direkte
//  Bizepsarbeit nötig ist. Genau das machen Apps falsch, die nur direkte
//  Sätze zählen: Sie überlasten systematisch Arme und Schultern.
// ====================================================================

import { equipmentById, exercises as ALL_EXERCISES, isExercisePossible } from '../data'
import type { Exercise } from '../types'
import {
  injuryVerdictAll,
  isLoadSource,
  loadEstimateOf,
  loadsLengthened,
  movementPatternOf,
  overlapScore,
  systemLoadRank,
} from './exerciseMeta'
import { muscleRegion, resolveMuscles, type VolumeMuscle } from './muscles'
import { prescribe, tierOf, type ExerciseTier } from './prescription'
import type { PlannedExercise, UserProfile } from './records'
import type { SessionTemplate } from './planning'
import { scheduleSessions, splitForDays } from './planning'
import {
  patternMaxesFromReferences,
  startingWeightFor,
  withFallbacks,
  type PatternMaxes,
} from './startingWeights'
import type { MovementPattern, StrengthReference, Weekday } from './records'
import { estimateExerciseSeconds } from './exerciseMeta'
import { exerciseVolume, setContribution } from './volume'

// ────────────────────────────────────────────────────────────────────
//  Grenzwerte
// ────────────────────────────────────────────────────────────────────

/** Max. fraktionale Sätze pro Muskel pro Einheit (docs/PLAN-ENGINE.md §4). */
const MAX_SETS_PER_MUSCLE_PER_SESSION = 10

/**
 * Ab diesem Restbedarf lohnt keine weitere Übung mehr.
 *
 * Bei 2,0 blieben kleine Muskeln systematisch unter ihrem Ziel: Nach einer
 * Grundübung mit 4 Sätzen war der Rest oft 1,5 und fiel damit durch das
 * Raster, obwohl noch Zeit im Budget war.
 */
const MIN_DEFICIT = 1.5

/** Sätze pro Übung, in denen der Generator arbeitet. */
const MIN_SETS_PER_EXERCISE = 2
const MAX_SETS_PER_EXERCISE = 4

/** Verschiedene Übungen pro Muskel pro WOCHE (docs/TRAINING-SCIENCE.md §6). */
const MAX_EXERCISES_PER_MUSCLE_PER_WEEK = 4

/** Max. schwere Grundübungen pro Einheit — Ermüdungsmanagement. */
const MAX_HEAVY_PER_SESSION = 3

/** Obergrenze Übungen pro Einheit, abgeleitet aus dem Zeitbudget. */
const MAX_EXERCISES_BY_MINUTES: Record<number, number> = {
  45: 6,
  60: 7,
  75: 9,
  90: 11,
}

/** Welche Muskeln eine Einheit mit dieser Ausrichtung bedient. */
const FOCUS_MUSCLES: Record<SessionTemplate['focus'], VolumeMuscle[]> = {
  upper: [
    'Brust',
    'Lat',
    'Oberer Rücken',
    'Vordere Schulter',
    'Seitliche Schulter',
    'Hintere Schulter',
    'Bizeps',
    'Trizeps',
    'Trapez',
    'Unterarme',
  ],
  lower: [
    'Quadrizeps',
    'Hamstrings',
    'Gesäß',
    'Adduktoren',
    'Waden',
    'Unterer Rücken',
    'Schienbein',
  ],
  push: ['Brust', 'Vordere Schulter', 'Seitliche Schulter', 'Trizeps'],
  pull: ['Lat', 'Oberer Rücken', 'Hintere Schulter', 'Bizeps', 'Trapez', 'Unterarme'],
  full: [
    'Brust',
    'Lat',
    'Oberer Rücken',
    'Quadrizeps',
    'Hamstrings',
    'Gesäß',
    'Seitliche Schulter',
    'Hintere Schulter',
    'Vordere Schulter',
    'Bizeps',
    'Trizeps',
    'Waden',
    'Unterer Rücken',
    'Trapez',
    'Adduktoren',
    'Unterarme',
    'Schienbein',
  ],
}

/** Bauch wird in jeder Einheit eingeplant, unabhängig von der Ausrichtung. */
const UBIQUITOUS: VolumeMuscle[] = ['Bauch']

/**
 * Welche Bewegungsmuster zu welcher Ausrichtung passen.
 *
 * Ohne diese Einschränkung landen Kreuzheben-Varianten am Oberkörpertag:
 * Rack Pulls haben „ob. Rücken" als Primärmuskel und wären damit für eine
 * Oberkörper-Einheit zulässig — programmatisch ist das falsch, weil die
 * Hüftstreckung dort die Beineinheit sabotiert.
 */
const FOCUS_PATTERNS: Record<SessionTemplate['focus'], MovementPattern[] | null> = {
  upper: ['horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull'],
  push: ['horizontal_push', 'vertical_push'],
  pull: ['horizontal_pull', 'vertical_pull'],
  lower: ['squat', 'hinge'],
  full: null, // alles erlaubt
}

/** Muskeln, deren Übungen ans Ende der Einheit gehören. */
const TAIL_MUSCLES: VolumeMuscle[] = ['Bauch', 'Waden', 'Unterarme', 'Schienbein']

// ────────────────────────────────────────────────────────────────────
//  Eingabe und Ausgabe
// ────────────────────────────────────────────────────────────────────

export interface GeneratorInput {
  profile: UserProfile
  /** Fraktionale Wochen-Zielsätze pro Muskel. */
  volumeTargets: Partial<Record<VolumeMuscle, number>>
  references: readonly StrengthReference[]
  bodyweightKg: number
  /** Erste Woche: konservativere Gewichte und deutlichere Korrektur. */
  calibrationWeek: boolean
  /**
   * Übungen, die derzeit nicht eingeplant werden sollen.
   *
   * Kommt aus der Rotation (docs/PLAN-ENGINE.md §9 Kreis 3d): Eine Übung,
   * die drei Einheiten lang stagniert hat, bleibt einen Block draußen. Als
   * Pool-Ausschluss umgesetzt, nicht als nachträglicher Tausch — dann
   * greifen alle übrigen Regeln (Verletzungen, Überlappung, Volumen) ohne
   * Sonderbehandlung, und der Generator wählt von sich aus die
   * nächstbeste Übung.
   */
  excludeExerciseIds?: ReadonlySet<string>
  /** Für Tests überschreibbar. */
  pool?: readonly Exercise[]
}

export interface GeneratedSession {
  weekday: Weekday
  label: string
  focus: SessionTemplate['focus']
  exercises: PlannedExercise[]
  /** Geschätzte Dauer in Minuten. */
  estimatedMinutes: number
  /** Fraktionales Volumen dieser Einheit. */
  volume: Partial<Record<VolumeMuscle, number>>
  /** Muskeln, deren Bedarf nicht gedeckt werden konnte. */
  unmetMuscles: VolumeMuscle[]
}

export interface GeneratedWeek {
  sessions: GeneratedSession[]
  /** Erreichtes Wochenvolumen gegen das Ziel. */
  weeklyVolume: Partial<Record<VolumeMuscle, number>>
  /** Hinweise für den Nutzer, z.B. wenn Verletzungen den Pool einschränken. */
  notes: string[]
}

// ────────────────────────────────────────────────────────────────────
//  Pool
// ────────────────────────────────────────────────────────────────────

export function buildPool(
  profile: UserProfile,
  all: readonly Exercise[] = ALL_EXERCISES,
): { pool: Exercise[]; notes: string[] } {
  const notes: string[] = []
  const disabled = new Set(profile.disabledEquipmentIds)
  const available = new Set(
    [...equipmentById.keys()].filter((id) => !disabled.has(id)),
  )
  const blacklist = new Set(profile.blacklistedExerciseIds)

  const pool = all.filter((exercise) => {
    // Die App plant kein Cardio (docs/PLAN-ENGINE.md §4).
    if (exercise.metric === 'cardio') return false
    // Kettlebell-Gewichte sind unbekannt — ohne Gewichtsvorgabe nicht planbar.
    if (exercise.id.startsWith('KET-')) return false
    // Explosive Ganzkörperübungen (Power Clean, High Pull, Renegade Rows,
    // Burpees) sind Athletik- und Konditionsmittel. Für Muskelaufbau,
    // Maximalkraft und Fettverlust sind sie kein sinnvolles Werkzeug —
    // sie ermüden stark, sind technisch anspruchsvoll und lassen sich
    // schlecht progressiv steigern.
    if (exercise.group === 'Ganzkörper' && profile.goal !== 'fitness') return false
    if (blacklist.has(exercise.id)) return false
    if (!isExercisePossible(exercise, available)) return false
    if (injuryVerdictAll(exercise, profile.injuries) === 'exclude') return false
    return true
  })

  const excludedByInjury = all.filter(
    (e) => e.metric !== 'cardio' && injuryVerdictAll(e, profile.injuries) === 'exclude',
  ).length
  if (excludedByInjury > 0) {
    const share = excludedByInjury / all.filter((e) => e.metric !== 'cardio').length
    if (share > 0.3) {
      notes.push(
        'Deine Beschwerdeangaben schließen einen großen Teil der Übungen aus. ' +
          'Der Plan ist deshalb schmaler — bitte lass die Beschwerden ärztlich abklären.',
      )
    }
  }

  return { pool, notes }
}

// ────────────────────────────────────────────────────────────────────
//  Volumenverteilung auf die Einheiten
// ────────────────────────────────────────────────────────────────────

export function distributeVolume(
  weekly: Partial<Record<VolumeMuscle, number>>,
  templates: readonly SessionTemplate[],
): Partial<Record<VolumeMuscle, number>>[] {
  const perSession: Partial<Record<VolumeMuscle, number>>[] = templates.map(() => ({}))

  for (const [muscleKey, weeklyTarget] of Object.entries(weekly) as [
    VolumeMuscle,
    number,
  ][]) {
    if (!weeklyTarget || weeklyTarget <= 0) continue

    // Welche Einheiten bedienen diesen Muskel?
    let indices = templates
      .map((template, index) => ({ template, index }))
      .filter(
        ({ template }) =>
          FOCUS_MUSCLES[template.focus].includes(muscleKey) ||
          UBIQUITOUS.includes(muscleKey),
      )
      .map(({ index }) => index)

    // Passt der Muskel in keine Ausrichtung, wird er gleichmäßig verteilt.
    if (indices.length === 0) indices = templates.map((_, index) => index)

    const share = Math.min(weeklyTarget / indices.length, MAX_SETS_PER_MUSCLE_PER_SESSION)
    for (const index of indices) {
      perSession[index][muscleKey] = share
    }
  }

  return perSession
}

// ────────────────────────────────────────────────────────────────────
//  Bewertungsfunktion (docs/PLAN-ENGINE.md §5.2)
// ────────────────────────────────────────────────────────────────────

interface ScoreContext {
  profile: UserProfile
  targetMuscle: VolumeMuscle
  chosen: { exercise: Exercise; sets: number }[]
  coveredRegions: Map<VolumeMuscle, Set<string>>
  usedThisWeek: Map<string, number>
  tightTime: boolean
  slotIndex: number
  /** Braucht dieser Muskel noch seine Grundübung? */
  needsCompound: boolean
  /** Übungen, für die der Nutzer im Onboarding einen Referenzwert angegeben hat. */
  referencedIds: ReadonlySet<string>
}

/** Progressionsvarianten sind keine Einstiegsübungen. */
const PROGRESSION_VARIANT = /zusatzgewicht|deficit|pause squat|negativ-|exzentrisch/i

export function scoreExercise(exercise: Exercise, context: ScoreContext): number {
  const { targetMuscle, chosen, coveredRegions, usedThisWeek, tightTime, slotIndex } = context

  const primaryMuscles = exercise.primary.flatMap((raw) => resolveMuscles(raw))
  const hitsPrimary = primaryMuscles.includes(targetMuscle)
  if (!hitsPrimary) return Number.NEGATIVE_INFINITY

  let score = 100

  // ── Stufe vor allem anderen ──
  // Ein Muskel bekommt zuerst seine Grundübung, dann Isolation. Ohne diese
  // klare Gewichtung gewinnen Fliegende gegen Bankdrücken, weil sie den
  // Bonus für gedehnte Position kassieren — das ergäbe ein Brusttraining
  // aus drei Fliegende-Varianten und keinem Drücken.
  const tier = tierOf(exercise)
  const estimate = loadEstimateOf(exercise)

  if (context.needsCompound) {
    if (tier === 'heavy_compound') score += 90
    else if (tier === 'compound') score += 60

    // Für die tragende Übung eines Muskels zählt, wie gut sie sich
    // progressiv belasten lässt und wie gut sie charakterisiert ist.
    //
    // Ohne diese Kriterien gewinnt ein Sissy Squat gegen die Kniebeuge:
    // Beide sind mehrgelenkig und beide belasten in gedehnter Position —
    // aber nur die Kniebeuge lässt sich über Jahre steigern.
    if (estimate.basis !== 'none') score += 25 // überhaupt belastbar
    if (estimate.confidence === 'explicit') score += 30 // etablierte Übung
    score += systemLoadRank(exercise) / 3
  } else if (tier === 'isolation') {
    // Ist die Grundübung erledigt, ist Isolation das passende Ergänzungsmittel.
    score += 15
  }

  // Regionale Abdeckung: eine noch nicht getroffene Unterregion ist wertvoll
  // (docs/TRAINING-SCIENCE.md §6 — regionale Hypertrophie ist real).
  //
  // Wichtig: Eine Bezeichnung OHNE Klammerzusatz gilt als Hauptregion, nicht
  // als „keine Region". Sonst bekämen nur Übungen mit zufälligem Zusatz in
  // der Quelldatei den Bonus — die schlichte „Kniebeuge" ginge leer aus.
  const regions = exercise.primary
    .filter((raw) => resolveMuscles(raw).includes(targetMuscle))
    .map((raw) => muscleRegion(raw) ?? 'haupt')
  const already = coveredRegions.get(targetMuscle) ?? new Set<string>()
  if (regions.some((region) => !already.has(region))) score += 35

  // Belastung in gedehnter Position — unterscheidet zwischen ähnlichen
  // Übungen, überstimmt aber bewusst nicht die Stufe.
  if (loadsLengthened(exercise)) score += 20

  // Grundübungen früh in der Einheit
  if (exercise.compound && slotIndex < 2) score += 20

  // Freie Varianten sind der Standard, geführte die Alternative — aber nur,
  // wenn die freie Hantel die LASTQUELLE ist. Sonst bekäme auch ein
  // Klimmzug mit Kurzhantel zwischen den Füßen diesen Bonus.
  const loadSource = exercise.equipmentIds.find(isLoadSource)
  if (loadSource && ['FRE-01', 'FRE-02', 'ARM-03', 'ARM-04'].includes(loadSource)) {
    score += 15
  }

  // Progressionsvarianten (Zusatzgewicht, Deficit) sind Steigerungsstufen,
  // keine Einstiegsübungen.
  if (PROGRESSION_VARIANT.test(exercise.name)) score -= 45

  // ── Übungen, die der Nutzer selbst genannt hat ──
  // Wer im Onboarding „Kniebeuge 100 kg × 6" angibt, trainiert die
  // Kniebeuge. Für genau diese Übungen ist das Startgewicht außerdem am
  // genauesten bekannt. Ohne diesen Bonus gewinnt der Bulgarian Split
  // Squat gegen die Kniebeuge — eine gute Übung, aber nicht die, für die
  // wir eine Zahl haben.
  if (context.referencedIds.has(exercise.id)) score += 40

  // Kein zweites schweres Muster derselben Art in einer Einheit.
  // Sonst landen Kreuzheben und Sumo-Kreuzheben zusammen an einem Tag —
  // in Summe zu viel Wirbelsäulenbelastung.
  const pattern = movementPatternOf(exercise)
  if (pattern !== null && tier === 'heavy_compound') {
    const samePatternHeavy = chosen.some(
      (entry) =>
        tierOf(entry.exercise) === 'heavy_compound' &&
        movementPatternOf(entry.exercise) === pattern,
    )
    if (samePatternHeavy) score -= 50
  }

  // Anfänger: in der Anfangsphase mehr geführte Varianten für die Technik
  if (context.profile.level === 'beginner' && !exercise.unilateral) {
    const guided = exercise.equipmentIds.some((id) => {
      const equipment = equipmentById.get(id)
      return equipment?.loadType === 'stack' || equipment?.loadType === 'plate'
    })
    if (guided) score += 18
  }

  // Abwechslung über die Woche: schon benutzte Übungen abwerten, damit
  // A- und B-Einheiten sich unterscheiden (docs/PLAN-ENGINE.md §4).
  const usedCount = usedThisWeek.get(exercise.id) ?? 0
  score -= usedCount * 35

  // Redundanz innerhalb der Einheit
  let maxOverlap = 0
  for (const entry of chosen) {
    maxOverlap = Math.max(maxOverlap, overlapScore(exercise, entry.exercise))
  }
  score -= maxOverlap * 50

  // Unilateral kostet doppelte Satzdauer
  if (exercise.unilateral && tightTime) score -= 20

  // Alte Beschwerden: nutzbar, aber nachrangig
  if (injuryVerdictAll(exercise, context.profile.injuries) === 'deprioritize') score -= 60

  return score
}

// ────────────────────────────────────────────────────────────────────
//  Auswahl einer Einheit
// ────────────────────────────────────────────────────────────────────

interface SessionState {
  usedThisWeek: Map<string, number>
  exercisesPerMuscleWeek: Map<VolumeMuscle, Set<string>>
  coveredRegions: Map<VolumeMuscle, Set<string>>
}

function maxExercisesPerMuscleInSession(dayCount: number): number {
  return dayCount >= 5 ? 3 : 2
}

function selectExercises(input: {
  pool: readonly Exercise[]
  profile: UserProfile
  targets: Partial<Record<VolumeMuscle, number>>
  state: SessionState
  dayCount: number
  focus: SessionTemplate['focus']
  referencedIds: ReadonlySet<string>
}): { chosen: { exercise: Exercise; sets: number }[]; unmet: VolumeMuscle[] } {
  const { profile, targets, state, dayCount, focus, referencedIds } = input

  // Bewegungsmuster auf die Ausrichtung der Einheit einschränken.
  const allowedPatterns = FOCUS_PATTERNS[focus]
  const pool = input.pool.filter((exercise) => {
    const pattern = movementPatternOf(exercise)
    if (pattern === null) return true // Isolation ist überall zulässig
    if (allowedPatterns === null) return true
    return allowedPatterns.includes(pattern)
  })

  const remaining = new Map<VolumeMuscle, number>(
    Object.entries(targets) as [VolumeMuscle, number][],
  )
  const chosen: { exercise: Exercise; sets: number }[] = []
  const usedIds = new Set<string>()
  const perMuscleCount = new Map<VolumeMuscle, number>()
  const unservable = new Set<VolumeMuscle>()
  /** Muskeln, die ihre Grundübung schon haben. */
  const compoundDone = new Set<VolumeMuscle>()
  /** Tatsächlich erreichtes Volumen — auch indirekt. */
  const achieved = new Map<VolumeMuscle, number>()

  const maxExercises = MAX_EXERCISES_BY_MINUTES[profile.sessionMinutes] ?? 8
  const maxPerMuscle = maxExercisesPerMuscleInSession(dayCount)
  const tightTime = profile.sessionMinutes <= 45

  let heavyCount = 0

  while (chosen.length < maxExercises) {
    // Muskel mit dem größten offenen Bedarf, der noch Kapazität hat
    let targetMuscle: VolumeMuscle | null = null
    let largest = 0
    for (const [muscle, deficit] of remaining) {
      if (deficit < MIN_DEFICIT) continue
      if (unservable.has(muscle)) continue
      if ((perMuscleCount.get(muscle) ?? 0) >= maxPerMuscle) continue
      if ((state.exercisesPerMuscleWeek.get(muscle)?.size ?? 0) >= MAX_EXERCISES_PER_MUSCLE_PER_WEEK) {
        continue
      }
      if (deficit > largest) {
        largest = deficit
        targetMuscle = muscle
      }
    }
    if (targetMuscle === null) break

    // Beste Übung für diesen Muskel
    const context: ScoreContext = {
      profile,
      targetMuscle,
      chosen,
      coveredRegions: state.coveredRegions,
      usedThisWeek: state.usedThisWeek,
      tightTime,
      slotIndex: chosen.length,
      needsCompound: !compoundDone.has(targetMuscle),
      referencedIds,
    }

    // Bereits vertretene schwere Bewegungsmuster dieser Einheit
    const heavyPatternsUsed = new Set(
      chosen
        .filter((entry) => tierOf(entry.exercise) === 'heavy_compound')
        .map((entry) => movementPatternOf(entry.exercise))
        .filter((p): p is MovementPattern => p !== null),
    )

    const eligible = pool.filter((exercise) => {
      if (usedIds.has(exercise.id)) return false
      const exerciseTier = tierOf(exercise)
      if (exerciseTier === 'heavy_compound') {
        if (heavyCount >= MAX_HEAVY_PER_SESSION) return false
        // Harte Bedingung, nicht bloß ein Punkteabzug: Zwei schwere
        // Kreuzheben-Varianten an einem Tag sind in Summe zu viel
        // Wirbelsäulenbelastung. Ein Abzug reicht nicht, weil die Übung
        // trotzdem gewinnt, wenn es für den Muskel keine Alternative gibt —
        // dann ist Isolation die bessere Wahl.
        const pattern = movementPatternOf(exercise)
        if (pattern !== null && heavyPatternsUsed.has(pattern)) return false
      }
      return scoreExercise(exercise, context) > Number.NEGATIVE_INFINITY
    })

    // Harte Regel: Solange dieser Muskel keine Grundübung hat und eine
    // verfügbar ist, wird auch eine gewählt. Der Score allein reicht nicht —
    // sonst kann Isolation die Grundübung verdrängen.
    let candidates = eligible
    if (context.needsCompound) {
      const compounds = eligible.filter((e) => tierOf(e) !== 'isolation')
      if (compounds.length > 0) candidates = compounds
    }

    let best: Exercise | null = null
    let bestScore = Number.NEGATIVE_INFINITY
    for (const exercise of candidates) {
      const score = scoreExercise(exercise, context)
      if (score > bestScore) {
        bestScore = score
        best = exercise
      }
    }

    if (best === null) {
      unservable.add(targetMuscle)
      continue
    }

    // Satzzahl aus dem Restbedarf, aber nie über der Vorgabe der Stufe:
    // Isolation bleibt bei 3 Sätzen, auch wenn der Restbedarf höher wäre.
    const perSet = setContribution(best)[targetMuscle] ?? 1
    const factor = best.unilateral ? 2 : 1
    const needed = Math.ceil(largest / (perSet * factor))
    const tierDefault = prescribe({
      exercise: best,
      goal: profile.goal,
      intensity: profile.intensity,
      sessionMinutes: profile.sessionMinutes,
    }).sets
    let sets = Math.max(
      MIN_SETS_PER_EXERCISE,
      Math.min(MAX_SETS_PER_EXERCISE, tierDefault, needed),
    )

    // Satzzahl senken, solange sie einen Muskel über die Obergrenze pro
    // Einheit treiben würde. Vollständig vermeiden lässt sich das nicht:
    // Indirektes Volumen aus Grundübungen ist nicht exakt steuerbar.
    while (sets > MIN_SETS_PER_EXERCISE) {
      const projection = exerciseVolume(best, sets)
      const overshoot = (Object.entries(projection) as [VolumeMuscle, number][]).some(
        ([muscle, amount]) =>
          (achieved.get(muscle) ?? 0) + amount > MAX_SETS_PER_MUSCLE_PER_SESSION,
      )
      if (!overshoot) break
      sets -= 1
    }

    chosen.push({ exercise: best, sets })
    usedIds.add(best.id)
    if (tierOf(best) === 'heavy_compound') heavyCount += 1
    if (tierOf(best) !== 'isolation') {
      for (const raw of best.primary) {
        for (const muscle of resolveMuscles(raw)) compoundDone.add(muscle)
      }
    }
    perMuscleCount.set(targetMuscle, (perMuscleCount.get(targetMuscle) ?? 0) + 1)

    // ── Der entscheidende Schritt ──
    // Den VOLLEN Beitrag von allen Muskeln abziehen, auch von den indirekt
    // getroffenen. Dadurch reduziert Rückenarbeit automatisch den Bedarf
    // an direkter Bizepsarbeit.
    const contribution = exerciseVolume(best, sets)
    for (const [muscle, amount] of Object.entries(contribution) as [
      VolumeMuscle,
      number,
    ][]) {
      const current = remaining.get(muscle)
      if (current !== undefined) remaining.set(muscle, current - amount)
      achieved.set(muscle, (achieved.get(muscle) ?? 0) + amount)
    }

    // Buchführung für die Woche
    state.usedThisWeek.set(best.id, (state.usedThisWeek.get(best.id) ?? 0) + 1)
    for (const raw of best.primary) {
      for (const muscle of resolveMuscles(raw)) {
        if (!state.exercisesPerMuscleWeek.has(muscle)) {
          state.exercisesPerMuscleWeek.set(muscle, new Set())
        }
        state.exercisesPerMuscleWeek.get(muscle)!.add(best.id)

        // Auch die Hauptregion wird als abgedeckt vermerkt, passend zur
        // Bewertung oben.
        const region = muscleRegion(raw) ?? 'haupt'
        if (!state.coveredRegions.has(muscle)) state.coveredRegions.set(muscle, new Set())
        state.coveredRegions.get(muscle)!.add(region)
      }
    }
  }

  const unmet = [...remaining.entries()]
    .filter(([, deficit]) => deficit >= MIN_DEFICIT)
    .map(([muscle]) => muscle)

  return { chosen, unmet }
}

// ────────────────────────────────────────────────────────────────────
//  Reihenfolge (docs/PLAN-ENGINE.md §5.4)
// ────────────────────────────────────────────────────────────────────

function orderExercises(
  chosen: { exercise: Exercise; sets: number }[],
  profile: UserProfile,
): { exercise: Exercise; sets: number }[] {
  const priority = new Set(profile.priorityMuscles)

  const isPriority = (exercise: Exercise) =>
    exercise.primary.flatMap((raw) => resolveMuscles(raw)).some((m) => priority.has(m))

  const isTail = (exercise: Exercise) =>
    exercise.primary
      .flatMap((raw) => resolveMuscles(raw))
      .some((m) => TAIL_MUSCLES.includes(m))

  const tierRank: Record<ExerciseTier, number> = {
    heavy_compound: 0,
    compound: 1,
    isolation: 2,
  }

  return [...chosen].sort((a, b) => {
    // Bauch, Waden, Griff immer ans Ende
    const tailA = isTail(a.exercise) ? 1 : 0
    const tailB = isTail(b.exercise) ? 1 : 0
    if (tailA !== tailB) return tailA - tailB

    // Prioritäts-Muskel nach vorne — was zuerst kommt, wächst am besten
    const prioA = isPriority(a.exercise) ? 0 : 1
    const prioB = isPriority(b.exercise) ? 0 : 1
    if (prioA !== prioB) return prioA - prioB

    // Danach nach Stufe
    const tA = tierRank[tierOf(a.exercise)]
    const tB = tierRank[tierOf(b.exercise)]
    if (tA !== tB) return tA - tB

    // Innerhalb der Stufe: die systemisch belastendere zuerst
    return systemLoadRank(b.exercise) - systemLoadRank(a.exercise)
  })
}

// ────────────────────────────────────────────────────────────────────
//  Zeitbudget (docs/PLAN-ENGINE.md §10)
// ────────────────────────────────────────────────────────────────────

function totalSeconds(planned: PlannedExercise[], pool: ReadonlyMap<string, Exercise>): number {
  let sum = 0
  for (const item of planned) {
    const exercise = pool.get(item.exerciseId)
    if (!exercise) continue
    sum += estimateExerciseSeconds({
      exercise,
      sets: item.sets,
      reps: item.targetReps,
      seconds: item.targetSeconds,
      restSeconds: item.restSeconds,
      warmupSets: item.warmups.length,
    })
  }
  return sum
}

/**
 * Kürzt die Einheit auf das Zeitbudget.
 *
 * Reihenfolge des Streichens nach docs/PLAN-ENGINE.md §10: erst Griff und
 * Schienbein, dann Bauch, dann die letzte Isolationsübung eines
 * Nicht-Prioritätsmuskels. Grundübungen und der Prioritätsmuskel bleiben
 * immer stehen.
 */
function trimToBudget(
  planned: PlannedExercise[],
  input: { profile: UserProfile; pool: ReadonlyMap<string, Exercise> },
): PlannedExercise[] {
  const { profile, pool } = input
  const budget = profile.sessionMinutes * 60
  const priority = new Set(profile.priorityMuscles)

  const musclesOf = (item: PlannedExercise): VolumeMuscle[] => {
    const exercise = pool.get(item.exerciseId)
    if (!exercise) return []
    return exercise.primary.flatMap((raw) => resolveMuscles(raw))
  }

  const removalRank = (item: PlannedExercise): number => {
    const exercise = pool.get(item.exerciseId)
    if (!exercise) return 0
    const muscles = musclesOf(item)
    if (muscles.some((m) => m === 'Unterarme' || m === 'Schienbein')) return 0
    if (muscles.includes('Bauch')) return 1
    if (!exercise.compound && !muscles.some((m) => priority.has(m))) return 2
    if (!exercise.compound) return 3
    return 99 // Grundübungen werden nicht gestrichen
  }

  let result = [...planned]
  while (totalSeconds(result, pool) > budget && result.length > 3) {
    // Streichbarste Übung finden; bei Gleichstand die spätere
    let candidateIndex = -1
    let candidateRank = 99
    for (let index = result.length - 1; index >= 0; index--) {
      const rank = removalRank(result[index])
      if (rank < candidateRank) {
        candidateRank = rank
        candidateIndex = index
      }
    }
    if (candidateIndex === -1 || candidateRank === 99) break
    result.splice(candidateIndex, 1)
  }

  return result.map((item, index) => ({ ...item, orderIndex: index }))
}

// ────────────────────────────────────────────────────────────────────
//  Zusammenbau
// ────────────────────────────────────────────────────────────────────

function toPlanned(input: {
  chosen: { exercise: Exercise; sets: number }[]
  profile: UserProfile
  maxes: PatternMaxes
  estimatedPatterns: ReadonlySet<MovementPattern>
  bodyweightKg: number
  calibrationWeek: boolean
}): PlannedExercise[] {
  const { chosen, profile, maxes, estimatedPatterns, bodyweightKg, calibrationWeek } = input
  const warmedMuscles = new Set<VolumeMuscle>()

  return chosen.map(({ exercise, sets }, index) => {
    const primaryMuscles = exercise.primary.flatMap((raw) => resolveMuscles(raw))
    const isFirstForMuscle = !primaryMuscles.some((m) => warmedMuscles.has(m))
    for (const muscle of primaryMuscles) warmedMuscles.add(muscle)

    const spec = prescribe({
      exercise,
      goal: profile.goal,
      intensity: profile.intensity,
      sessionMinutes: profile.sessionMinutes,
      sets,
      isFirstForMuscle,
    })

    const weight = startingWeightFor({
      exercise,
      targetReps: spec.targetReps ?? 10,
      maxes,
      estimatedPatterns,
      bodyweightKg,
      calibrationWeek,
    })

    const equipment = exercise.equipmentIds
      .map((id) => equipmentById.get(id))
      .find((e) => e && e.stepKg !== null)

    // Aufwärmsätze nur, wenn das Arbeitsgewicht sie rechtfertigt.
    //
    // Ohne diese Schwelle bekäme ein Bulgarian Split Squat mit 20 kg
    // Kurzhantel drei Aufwärmsätze ab 10 kg — sinnlos und nervig. Bei
    // einbeinigen Übungen ist Aufwärmen ohnehin kein Thema, dort begrenzt
    // die Balance und nicht die Last.
    const WARMUP_MIN_WEIGHT_KG = 30
    const warmupWorthwhile =
      weight.weightKg !== null &&
      weight.weightKg >= WARMUP_MIN_WEIGHT_KG &&
      !exercise.unilateral

    const warmups =
      warmupWorthwhile && equipment
        ? spec.warmups.map((w) => ({
            weightKg: Math.max(
              equipment.stepKg ?? 1,
              Math.round((weight.weightKg! * w.fraction) / (equipment.stepKg ?? 1)) *
                (equipment.stepKg ?? 1),
            ),
            reps: w.reps,
          }))
        : []

    return {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      orderIndex: index,
      sets: spec.sets,
      targetReps: spec.targetReps,
      repRangeMin: spec.repRangeMin,
      repRangeMax: spec.repRangeMax,
      targetSeconds: spec.targetSeconds,
      targetRir: spec.targetRir,
      restSeconds: spec.restSeconds,
      weightKg: weight.weightKg,
      warmups,
      selectionReason: reasonFor(exercise, primaryMuscles, profile, weight.confidence),
    }
  })
}

function reasonFor(
  exercise: Exercise,
  primaryMuscles: VolumeMuscle[],
  profile: UserProfile,
  confidence: 'high' | 'medium' | 'low',
): string {
  const parts: string[] = []
  const priorityHit = primaryMuscles.find((m) => profile.priorityMuscles.includes(m))
  if (priorityHit) parts.push(`Schwerpunkt ${priorityHit}`)
  else if (primaryMuscles.length > 0) parts.push(primaryMuscles[0])

  if (tierOf(exercise) === 'heavy_compound') parts.push('schwere Grundübung')
  if (loadsLengthened(exercise)) parts.push('Belastung in gedehnter Position')
  if (confidence === 'low') parts.push('Gewicht geschätzt, wird eingemessen')

  return parts.join(' · ')
}

/** Erzeugt eine komplette Trainingswoche. */
export function generateWeek(input: GeneratorInput): GeneratedWeek {
  const { profile, volumeTargets, references, bodyweightKg, calibrationWeek } = input

  const { pool: vollerPool, notes } = buildPool(profile, input.pool ?? ALL_EXERCISES)

  // Herausrotierte Übungen fallen aus dem Pool. Bleibt dadurch zu wenig
  // übrig, gilt der Ausschluss nicht — ein leerer Plan wäre schlechter als
  // eine wiederholte Übung.
  const ausgeschlossen = input.excludeExerciseIds ?? new Set<string>()
  const gefiltert = vollerPool.filter((e) => !ausgeschlossen.has(e.id))
  const pool = gefiltert.length >= vollerPool.length / 2 ? gefiltert : vollerPool
  if (pool === vollerPool && ausgeschlossen.size > 0) {
    notes.push(
      'Die Rotation hätte zu viele Übungen ausgeschlossen — ich plane diese Woche mit dem vollen Pool.',
    )
  }

  const poolById = new Map(pool.map((e) => [e.id, e]))

  const split = splitForDays(profile.trainingDays.length)
  const scheduled = scheduleSessions(split, profile.trainingDays)
  const templates = scheduled.map((s) => s.template)
  const perSessionTargets = distributeVolume(volumeTargets, templates)

  const rawMaxes = patternMaxesFromReferences({
    references,
    exerciseById: poolById.size > 0 ? new Map(ALL_EXERCISES.map((e) => [e.id, e])) : poolById,
    bodyweightKg,
  })
  const { maxes, estimated } = withFallbacks(rawMaxes, {
    bodyweightKg,
    level: profile.level,
    sex: profile.sex,
  })

  // Übungen, für die eine Referenzangabe vorliegt — sie werden bevorzugt.
  const referencedIds = new Set(references.map((r) => r.exerciseId))

  const state: SessionState = {
    usedThisWeek: new Map(),
    exercisesPerMuscleWeek: new Map(),
    coveredRegions: new Map(),
  }

  const sessions: GeneratedSession[] = []
  const weeklyVolume: Partial<Record<VolumeMuscle, number>> = {}

  scheduled.forEach((entry, index) => {
    const { chosen, unmet } = selectExercises({
      pool,
      profile,
      targets: perSessionTargets[index],
      state,
      dayCount: profile.trainingDays.length,
      focus: entry.template.focus,
      referencedIds,
    })

    const ordered = orderExercises(chosen, profile)
    let planned = toPlanned({
      chosen: ordered,
      profile,
      maxes,
      estimatedPatterns: estimated,
      bodyweightKg,
      calibrationWeek,
    })
    planned = trimToBudget(planned, { profile, pool: poolById })

    const volume: Partial<Record<VolumeMuscle, number>> = {}
    for (const item of planned) {
      const exercise = poolById.get(item.exerciseId)
      if (!exercise) continue
      const contribution = exerciseVolume(exercise, item.sets)
      for (const [muscle, amount] of Object.entries(contribution) as [
        VolumeMuscle,
        number,
      ][]) {
        volume[muscle] = (volume[muscle] ?? 0) + amount
        weeklyVolume[muscle] = (weeklyVolume[muscle] ?? 0) + amount
      }
    }

    sessions.push({
      weekday: entry.weekday,
      label: entry.template.label,
      focus: entry.template.focus,
      exercises: planned,
      estimatedMinutes: Math.round(totalSeconds(planned, poolById) / 60),
      volume,
      unmetMuscles: unmet,
    })
  })

  return { sessions, weeklyVolume, notes }
}
