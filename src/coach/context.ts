// ====================================================================
//  Der Trainingskontext für den Chat
//
//  Das Modell weiß nichts über diese Person, außer was hier steht. Deshalb
//  drei Grundsätze:
//
//  1. NUR ROHE TATSACHEN, KEINE DEUTUNG. Was hier steht, sind Zahlen aus der
//     Datenbank. Würde ich sie schon vorinterpretieren („macht gute
//     Fortschritte"), wäre die Deutung nicht mehr überprüfbar — und das
//     Modell würde meine Vermutung als Tatsache weitergeben.
//
//  2. KOMPAKT. Der Kontext geht bei JEDER Nachricht mit. Ein aufgeblähter
//     Kontext kostet bei jeder Frage Geld und verdrängt am Ende die Frage
//     selbst. Ziel sind wenige tausend Zeichen, nicht der ganze Verlauf.
//
//  3. KEINE PERSONENDATEN, DIE NICHT GEBRAUCHT WERDEN. Kein Name, keine
//     E-Mail-Adresse, keine Konto-ID. Für Trainingsberatung braucht es
//     Gewicht, Größe, Alter und Verlauf — nicht die Identität.
// ====================================================================

import type { GeneratedWeek } from '../domain/generator'
import { activeFocus, avoidedExerciseIds } from '../domain/focus'
import { exerciseHistory, resolveSetLogs } from '../domain/history'
import type { VolumeMuscle } from '../domain/muscles'
import { VOLUME_MUSCLES } from '../domain/muscles'
import type {
  Adjustment,
  BodyMetric,
  CheckIn,
  NutritionTarget,
  SetLog,
  TrainingPlan,
  UserProfile,
  Weekday,
  WorkoutSession,
} from '../domain/records'
import { splitLabel } from '../domain/planning'
import { localDayOf } from '../domain/week'

const WEEKDAY: Record<Weekday, string> = {
  mon: 'Montag',
  tue: 'Dienstag',
  wed: 'Mittwoch',
  thu: 'Donnerstag',
  fri: 'Freitag',
  sat: 'Samstag',
  sun: 'Sonntag',
}

const GOAL: Record<string, string> = {
  muscle: 'Muskelaufbau',
  strength: 'Kraft',
  fatloss: 'Fettabbau',
  fitness: 'allgemeine Fitness',
}

const LEVEL: Record<string, string> = {
  beginner: 'Anfänger',
  intermediate: 'Fortgeschritten',
  advanced: 'Weit fortgeschritten',
}

/**
 * Alle Aufzählungswerte in Klartext.
 *
 * Ohne diese Übersetzung stünde „Erfahrung 2to5y" und „Beschwerden: shoulder
 * (history)" im Kontext — und das Modell würde diese Rohwerte im Gespräch
 * weiterverwenden. Der Nutzer soll nicht die Datenbankschlüssel der App zu
 * lesen bekommen.
 */
const YEARS: Record<string, string> = {
  lt6m: 'unter 6 Monate',
  '6to12m': '6 bis 12 Monate',
  '1to2y': '1 bis 2 Jahre',
  '2to5y': '2 bis 5 Jahre',
  gt5y: 'über 5 Jahre',
}

const REGION: Record<string, string> = {
  knee: 'Knie',
  shoulder: 'Schulter',
  lower_back: 'unterer Rücken',
  elbow: 'Ellbogen',
  wrist: 'Handgelenk',
  hip: 'Hüfte',
  neck: 'Nacken',
  ankle: 'Sprunggelenk',
}

const SEVERITY: Record<string, string> = {
  acute: 'akut',
  history: 'früher gehabt',
}

const SLEEP: Record<string, string> = { good: 'gut', ok: 'in Ordnung', bad: 'schlecht' }

const JOINTS: Record<string, string> = {
  none: 'keine Beschwerden',
  mild: 'leichte Beschwerden',
  limiting: 'einschränkend',
}

const MOTIVATION: Record<string, string> = { high: 'hoch', normal: 'normal', low: 'niedrig' }

const ADHERENCE: Record<string, string> = {
  good: 'eingehalten',
  partial: 'teilweise eingehalten',
  none: 'nicht eingehalten',
}

function label(map: Record<string, string>, value: string | null): string {
  if (value === null) return 'keine Angabe'
  return map[value] ?? value
}

export interface CoachContextInput {
  profile: UserProfile
  plan: TrainingPlan | null
  nutrition: NutritionTarget | null
  week: GeneratedWeek | null
  sessions: readonly WorkoutSession[]
  setLogs: readonly SetLog[]
  checkins: readonly CheckIn[]
  metrics: readonly BodyMetric[]
  adjustments: readonly Adjustment[]
  today: Weekday
  /** Heutiges Datum, damit das Modell nicht raten muss. */
  todayIso: string
}

function kg(value: number | null): string {
  if (value === null) return '—'
  return `${Number.isInteger(value) ? value : value.toFixed(1)} kg`
}

/** Wie viele Einheiten der Verlauf zurückblickt. Mehr bringt nichts. */
const HISTORY_SESSIONS = 6

export function buildCoachContext(input: CoachContextInput): string {
  const { profile, plan, nutrition, week } = input
  const lines: string[] = []

  lines.push('# Aktueller Stand dieser Person')
  lines.push('')
  lines.push(`Heute ist ${WEEKDAY[input.today]}, ${input.todayIso}.`)
  lines.push('')

  // ── Profil ──
  lines.push('## Profil')
  lines.push(
    `Ziel ${GOAL[profile.goal] ?? profile.goal} · Stufe ${
      LEVEL[profile.level] ?? profile.level
    } · ${profile.trainingDays.length} Trainingstage (${profile.trainingDays
      .map((day) => WEEKDAY[day])
      .join(', ')}) · ${profile.sessionMinutes} Minuten pro Einheit`,
  )
  // Das Körpergewicht steht bewusst nicht im Profil, sondern nur als
  // Zeitreihe — deshalb kommt es weiter unten aus den Messwerten.
  lines.push(
    `${profile.heightCm} cm · Jahrgang ${profile.birthYear} · ` +
      `Trainingserfahrung ${label(YEARS, profile.trainingYears)}`,
  )
  if (profile.priorityMuscles.length > 0) {
    lines.push(
      `Im Onboarding als wichtig markiert: ${profile.priorityMuscles.join(', ')}. ` +
        'Diese Muskeln geben bei einem Schwerpunkt kein Volumen ab.',
    )
  }
  const injuries = profile.injuries
  if (injuries.length > 0) {
    lines.push(
      `Beschwerden: ${injuries
        .map(
          (flag) =>
            `${label(REGION, flag.region)} (${label(SEVERITY, flag.severity)})`,
        )
        .join(', ')}. Übungen, die darauf gehen, sind schon aus dem Plan heraus.`,
    )
  }
  lines.push('')

  // ── Gewicht ──
  const weights = [...input.metrics]
    .filter((metric) => metric.deletedAt === null && metric.weightKg !== null)
    .sort((a, b) => (a.measuredOn < b.measuredOn ? -1 : 1))
  if (weights.length > 0) {
    const latest = weights[weights.length - 1]
    lines.push('## Gewichtsverlauf')
    const recent = weights.slice(-5)
    lines.push(
      recent
        .map((metric) => `${metric.measuredOn}: ${kg(metric.weightKg)}`)
        .join(' · '),
    )
    if (weights.length >= 2) {
      const first = weights[0]
      const delta = (latest.weightKg as number) - (first.weightKg as number)
      lines.push(
        `Seit ${first.measuredOn} insgesamt ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg.`,
      )
    }
    lines.push('')
  }

  // ── Ernährung ──
  if (nutrition) {
    lines.push('## Ernährungsziel')
    lines.push(
      `${nutrition.kcal} kcal · ${nutrition.proteinG} g Protein · ` +
        `${nutrition.carbsG} g Kohlenhydrate · ${nutrition.fatG} g Fett`,
    )
    lines.push(
      'Die App gibt nur diese Ziele vor und zählt nichts mit. Es gibt kein ' +
        'Essenstagebuch in der App.',
    )
    lines.push('')
  }

  // ── Volumenbudget ──
  if (plan) {
    lines.push('## Wochenvolumen (geplante Sätze pro Muskel)')
    lines.push(`Split: ${splitLabel(plan.splitType)}`)
    const budget = (Object.keys(plan.volumeTargets) as VolumeMuscle[])
      .filter((muscle) => (plan.volumeTargets[muscle] ?? 0) > 0)
      .map((muscle) => `${muscle} ${plan.volumeTargets[muscle]}`)
      .join(' · ')
    lines.push(budget)
    lines.push(
      'Das sind die Werte VOR den Schwerpunkten. Nebenmuskeln zählen mit 0,5 ' +
        'Sätzen, deshalb kommen halbe Werte vor.',
    )
    lines.push('')
  }

  lines.push('## Muskelnamen, die die App kennt')
  lines.push(VOLUME_MUSCLES.join(' · '))
  lines.push(
    'Nur diese Namen sind in set_focus gültig. „Arme" ist kein Muskel — ' +
      'gemeint sind Bizeps und Trizeps.',
  )
  lines.push('')

  // ── Aktive Wünsche ──
  const focus = activeFocus(input.adjustments)
  const avoided = avoidedExerciseIds(input.adjustments)
  lines.push('## Schon geäußerte Wünsche')
  if (focus.length === 0 && avoided.size === 0) {
    lines.push('Keine. Der Plan läuft unverändert.')
  } else {
    for (const entry of focus) {
      lines.push(
        `Schwerpunkt: ${entry.muscle} → ${
          entry.direction === 'more' ? 'mehr' : 'weniger'
        } (seit ${localDayOf(entry.at)})`,
      )
    }
    if (avoided.size > 0) {
      lines.push(`Abgelehnte Übungen: ${[...avoided].join(', ')}`)
    }
  }
  lines.push('')

  // ── Die Woche ──
  if (week) {
    lines.push('## Diese Trainingswoche')
    for (const session of week.sessions) {
      const heute = session.weekday === input.today ? ' ← heute' : ''
      lines.push(
        `### ${WEEKDAY[session.weekday]} — ${session.label} ` +
          `(ca. ${session.estimatedMinutes} min)${heute}`,
      )
      for (const exercise of session.exercises) {
        const menge =
          exercise.targetSeconds !== null
            ? `${exercise.targetSeconds} s`
            : `${exercise.targetReps} Wdh.`
        const last =
          exercise.weightKg !== null ? ` @ ${kg(exercise.weightKg)}` : ' (Körpergewicht)'
        lines.push(
          `- [${exercise.exerciseId}] ${exercise.exerciseName}: ` +
            `${exercise.sets} × ${menge}${last}, RIR ${exercise.targetRir}`,
        )
      }
      if (session.unmetMuscles.length > 0) {
        lines.push(
          `  (nicht voll abgedeckt: ${session.unmetMuscles.join(', ')} — ` +
            'dafür fehlen passende Geräte oder die Zeit)',
        )
      }
    }
    if (week.notes.length > 0) {
      lines.push(`Hinweise des Generators: ${week.notes.join(' · ')}`)
    }
    lines.push('')
  } else {
    lines.push('## Diese Trainingswoche')
    lines.push('Es konnte kein Plan erzeugt werden.')
    lines.push('')
  }

  // ── Verlauf ──
  const completed = [...input.sessions]
    .filter((session) => session.status === 'completed' && session.deletedAt === null)
    .sort((a, b) => {
      const left = a.completedAt ?? a.createdAt
      const right = b.completedAt ?? b.createdAt
      return left < right ? 1 : -1
    })

  lines.push('## Abgeschlossene Einheiten')
  if (completed.length === 0) {
    lines.push('Noch keine. Die Person hat gerade erst angefangen.')
  } else {
    const logsBySession = new Map<string, SetLog[]>()
    for (const log of resolveSetLogs([...input.setLogs])) {
      const list = logsBySession.get(log.sessionId) ?? []
      list.push(log)
      logsBySession.set(log.sessionId, list)
    }

    lines.push(`Insgesamt ${completed.length}. Die letzten:`)
    for (const session of completed.slice(0, HISTORY_SESSIONS)) {
      const logs = logsBySession.get(session.id) ?? []
      const working = logs.filter((log) => !log.isWarmup)
      lines.push(
        `- ${localDayOf(session.completedAt ?? session.createdAt)} ${session.label}: ` +
          `${working.length} Arbeitssätze`,
      )
    }
    lines.push('')

    // Verlauf je Übung der aktuellen Woche — das ist die Information, mit der
    // man „warum steigt das Gewicht nicht" beantworten kann.
    if (week) {
      const seen = new Set<string>()
      const rows: string[] = []
      for (const session of week.sessions) {
        for (const exercise of session.exercises) {
          if (seen.has(exercise.exerciseId)) continue
          seen.add(exercise.exerciseId)
          const history = exerciseHistory({
            exerciseId: exercise.exerciseId,
            sessions: completed,
            logsBySession,
          })
          if (history.attempts.length === 0) continue
          const status = history.attempts
            .slice(-4)
            .map((attempt) => `${attempt.status}@${attempt.weightKg ?? '—'}kg`)
            .join(' → ')
          rows.push(`- ${exercise.exerciseName}: ${status}`)
        }
      }
      if (rows.length > 0) {
        lines.push('## Verlauf je Übung (älteste zuerst, letzte vier Einheiten)')
        lines.push(
          'erfuellt = Vorgabe getroffen · knapp = an der Grenze · ' +
            'verfehlt = nicht geschafft. Für eine Gewichtssteigerung muss die ' +
            'Vorgabe zweimal getragen haben.',
        )
        lines.push(...rows)
        lines.push('')
      }
    }
  }

  // ── Letzter Check-in ──
  const lastCheckin = [...input.checkins]
    .filter((checkin) => checkin.deletedAt === null)
    .sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1))[0]
  if (lastCheckin) {
    lines.push('## Letzter Wochen-Check-in')
    lines.push(
      `Woche ab ${lastCheckin.weekOf}: Schlaf ${label(SLEEP, lastCheckin.sleep)} · ` +
        `Gelenke ${label(JOINTS, lastCheckin.joints)} · ` +
        `Motivation ${label(MOTIVATION, lastCheckin.motivation)} · ` +
        `Kalorien ${label(ADHERENCE, lastCheckin.calorieAdherence)}`,
    )
    if (lastCheckin.weightKgAvg !== null) {
      lines.push(`Wochendurchschnitt Gewicht: ${kg(lastCheckin.weightKgAvg)}`)
    }
    if (lastCheckin.notes) lines.push(`Notiz: ${lastCheckin.notes}`)
    lines.push('')
  }

  // ── Letzte automatische Anpassungen ──
  const recent = [...input.adjustments]
    .filter((adjustment) => adjustment.deletedAt === null && adjustment.applied)
    .sort((a, b) => (a.appliedAt < b.appliedAt ? 1 : -1))
    .slice(0, 8)
  if (recent.length > 0) {
    lines.push('## Was die App zuletzt selbst angepasst hat')
    for (const adjustment of recent) {
      lines.push(
        `- ${localDayOf(adjustment.appliedAt)} ${adjustment.targetLabel ?? adjustment.scope}: ` +
          `${adjustment.before} → ${adjustment.after} (${adjustment.reason})`,
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}
