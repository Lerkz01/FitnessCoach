// ====================================================================
//  Regelkreis 4 — Block-Review alle 4 bis 6 Wochen
//
//  Die Kreise 1 bis 3 optimieren INNERHALB eines Plans: Gewicht pro Satz,
//  Vorgabe pro Übung, Volumen pro Woche. Keiner von ihnen stellt den Plan
//  selbst in Frage. Genau das fehlte — die App konnte fünf Wochen lang
//  fleißig ein Trainingsprogramm verfeinern, das von Anfang an nicht in den
//  Alltag passte.
//
//  Was dieser Kreis anders macht:
//
//  1. ER MISST DIE WIRKLICHKEIT, NICHT DIE ABSICHT. Wie viele Einheiten
//     wurden wirklich gemacht? Wie lange dauerten sie wirklich? Welcher
//     Muskel ist wirklich stärker geworden? Alles aus geloggten Daten, nichts
//     aus der Planung.
//
//  2. ER SCHLÄGT VOR UND ÄNDERT NICHT. Split, Trainingstage und Prioritäten
//     sind Entscheidungen über den Alltag eines Menschen, nicht über eine
//     Zahl. Sie automatisch zu verschieben wäre eine Anmaßung — und ein
//     falscher Vorschlag kostet dann eine ganze Blockperiode. Der Review
//     legt die Befunde hin, entschieden wird im Profil oder im Chat.
//
//  3. ER SAGT AUCH, WENN NICHTS ZU TUN IST. Ein Review, der immer etwas
//     findet, wird zum Rauschen. „Der Plan passt" ist ein Ergebnis.
// ====================================================================

import { exerciseHistory, resolveSetLogs } from './history'
import type { VolumeMuscle } from './muscles'
import { resolveMuscles } from './muscles'
import type { CheckIn, SetLog, UserProfile, WorkoutSession } from './records'
import type { VolumeMap } from './volume'
import { localDayOf, mondayOf, weeksBetween } from './week'

/** Nach so vielen Wochen ist ein Block vorbei. */
export const BLOCK_WEEKS = 5

/**
 * Ab welcher Einhaltequote der Plan als „passt" gilt.
 *
 * Unter 70 % ist nicht die Disziplin das Problem, sondern der Plan: Vier
 * Trainingstage, von denen regelmäßig nur zwei stattfinden, sind ein
 * Zweitageplan mit schlechtem Gewissen. Und die Progression rechnet mit
 * Einheiten, die nicht kommen.
 */
const ADHERENCE_OK = 0.7

/**
 * Wie weit die tatsächliche Dauer über der geplanten liegen darf.
 *
 * 15 % sind Umbauen, Warten, Trinken. Darüber ist die Einheit zu voll — und
 * das ist ein Planungsfehler, nicht Trödeln: Die Zeitschätzung des Generators
 * entscheidet mit, wie viele Übungen hineinkommen.
 */
const DURATION_TOLERANCE = 1.15

/** Wie viele Wochen ohne Verbesserung als Stagnation gelten. */
const STAGNATION_WEEKS = 3

export type FindingKind =
  | 'adherence'
  | 'duration'
  | 'stagnation'
  | 'progress'
  | 'maintenance'
  | 'ok'

export interface BlockFinding {
  kind: FindingKind
  /** `action` = es gibt etwas zu entscheiden. `info` = nur zur Kenntnis. */
  severity: 'info' | 'action'
  title: string
  /** Die Zahlen, auf denen der Befund beruht. */
  detail: string
  /** Was die App vorschlägt. `null` = nichts zu tun. */
  suggestion: string | null
}

export interface BlockReview {
  /** Wie viele Wochen der Block umfasst. */
  weeks: number
  sessionsExpected: number
  sessionsDone: number
  /** 0 bis 1. */
  adherence: number
  /** Mittlere tatsächliche Dauer in Minuten, `null` ohne Datenlage. */
  medianMinutes: number | null
  plannedMinutes: number
  findings: BlockFinding[]
}

export interface BlockReviewInput {
  profile: UserProfile
  sessions: readonly WorkoutSession[]
  setLogs: readonly SetLog[]
  checkins: readonly CheckIn[]
  /** Wochenvolumen laut Plan. */
  volumeTargets: Partial<Record<VolumeMuscle, number>>
  /** Wann der laufende Block begonnen hat, `YYYY-MM-DD` (Montag). */
  blockStartMonday: string
  /** Heute, `YYYY-MM-DD`. */
  today: string
  /** Übungs-ID → Volumenbeitrag pro Satz. Aus der Übungsdatenbank. */
  volumeForExercise: (exerciseId: string, sets: number) => VolumeMap
}

// ────────────────────────────────────────────────────────────────────
//  Fällig?
// ────────────────────────────────────────────────────────────────────

export function blockReviewDue(input: {
  blockStartMonday: string
  today: string
}): boolean {
  return weeksBetween(input.blockStartMonday, mondayOf(new Date(input.today))) >= BLOCK_WEEKS
}

// ────────────────────────────────────────────────────────────────────

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

export function blockReview(input: BlockReviewInput): BlockReview {
  const { profile } = input
  const weeks = Math.max(
    1,
    weeksBetween(input.blockStartMonday, mondayOf(new Date(input.today))),
  )

  const imBlock = input.sessions.filter((session) => {
    if (session.deletedAt !== null) return false
    const tag = localDayOf(session.completedAt ?? session.createdAt)
    return tag >= input.blockStartMonday && tag <= input.today
  })

  const fertig = imBlock.filter((session) => session.status === 'completed')

  // ── Einhaltung ──
  const sessionsExpected = weeks * profile.trainingDays.length
  const sessionsDone = fertig.length
  const adherence = sessionsExpected === 0 ? 1 : sessionsDone / sessionsExpected

  // ── Dauer ──
  //
  // Median statt Mittelwert: Eine einzige Einheit, bei der jemand die App
  // offen liegen gelassen hat, würde den Mittelwert nach oben ziehen und
  // einen Planungsfehler behaupten, den es nicht gibt.
  const dauern = fertig
    .map((session) => {
      if (!session.startedAt || !session.completedAt) return null
      const minuten =
        (Date.parse(session.completedAt) - Date.parse(session.startedAt)) / 60000
      // Über drei Stunden ist keine Einheit, sondern eine vergessene App.
      return minuten > 0 && minuten < 180 ? minuten : null
    })
    .filter((value): value is number => value !== null)

  const medianMinutes = median(dauern)

  // ── Fortschritt je Muskel ──
  const logsBySession = new Map<string, SetLog[]>()
  for (const log of resolveSetLogs([...input.setLogs])) {
    const list = logsBySession.get(log.sessionId) ?? []
    list.push(log)
    logsBySession.set(log.sessionId, list)
  }

  /** Übungen, die im Block wirklich trainiert wurden. */
  const trainierteUebungen = new Set<string>()
  for (const session of fertig) {
    for (const log of logsBySession.get(session.id) ?? []) {
      if (!log.isWarmup) trainierteUebungen.add(log.exerciseId)
    }
  }

  /** Je Muskel: hat sich in diesem Block irgendetwas verbessert? */
  const besserGeworden = new Map<VolumeMuscle, boolean>()
  const geleistetesVolumen: Partial<Record<VolumeMuscle, number>> = {}

  for (const exerciseId of trainierteUebungen) {
    const history = exerciseHistory({
      exerciseId,
      sessions: fertig,
      logsBySession,
      limit: 20,
    })
    const werte = history.e1rms.filter((value): value is number => value !== null)
    const stieg =
      werte.length >= 2 && werte[werte.length - 1] > Math.max(...werte.slice(0, -1))

    // Welche Muskeln betrifft diese Übung? Über den Volumenbeitrag, damit
    // Haupt- und Nebenmuskeln dieselbe Quelle haben wie das Budget.
    const beitrag = input.volumeForExercise(exerciseId, 1)
    for (const raw of Object.keys(beitrag) as VolumeMuscle[]) {
      for (const muscle of resolveMuscles(raw)) {
        if (stieg) besserGeworden.set(muscle, true)
        else if (!besserGeworden.has(muscle)) besserGeworden.set(muscle, false)
      }
    }
  }

  // Tatsächlich geleistetes Wochenvolumen je Muskel.
  for (const session of fertig) {
    const logs = (logsBySession.get(session.id) ?? []).filter((log) => !log.isWarmup)
    const perExercise = new Map<string, number>()
    for (const log of logs) {
      perExercise.set(log.exerciseId, (perExercise.get(log.exerciseId) ?? 0) + 1)
    }
    for (const [exerciseId, sets] of perExercise) {
      const beitrag = input.volumeForExercise(exerciseId, sets)
      for (const [muscle, value] of Object.entries(beitrag) as [VolumeMuscle, number][]) {
        geleistetesVolumen[muscle] = (geleistetesVolumen[muscle] ?? 0) + value
      }
    }
  }

  // ── Befunde ──
  const findings: BlockFinding[] = []

  if (sessionsExpected > 0 && adherence < ADHERENCE_OK) {
    const fehlend = sessionsExpected - sessionsDone
    findings.push({
      kind: 'adherence',
      severity: 'action',
      title: 'Der Plan hat mehr Tage, als du trainierst',
      detail:
        `${sessionsDone} von ${sessionsExpected} Einheiten in ${weeks} Wochen ` +
        `(${Math.round(adherence * 100)} %). ${fehlend} sind ausgefallen.`,
      suggestion:
        `Setz die Trainingstage im Profil auf ${Math.max(
          2,
          Math.round(sessionsDone / weeks),
        )}. ` +
        'Das ist kein Rückschritt: Die App verteilt dasselbe Volumen auf weniger ' +
        'Tage, und die Progression rechnet dann mit Einheiten, die wirklich ' +
        'stattfinden. Vier geplante Tage, von denen zwei ausfallen, sind schlechter ' +
        'als zwei geplante Tage, die kommen.',
    })
  }

  if (medianMinutes !== null && medianMinutes > profile.sessionMinutes * DURATION_TOLERANCE) {
    findings.push({
      kind: 'duration',
      severity: 'action',
      title: 'Die Einheiten dauern länger als geplant',
      detail:
        `Im Mittel ${Math.round(medianMinutes)} Minuten statt der eingestellten ` +
        `${profile.sessionMinutes} (aus ${dauern.length} Einheiten).`,
      suggestion:
        `Stell die Dauer im Profil auf ${
          Math.ceil(medianMinutes / 15) * 15
        } Minuten. Dann packt der Generator von Anfang an so viel hinein, wie ` +
        'wirklich hineinpasst — statt Übungen zu planen, die am Ende wegfallen.',
    })
  } else if (
    medianMinutes !== null &&
    medianMinutes < profile.sessionMinutes * 0.7 &&
    dauern.length >= 3
  ) {
    findings.push({
      kind: 'duration',
      severity: 'info',
      title: 'Du bist schneller als geplant',
      detail:
        `Im Mittel ${Math.round(medianMinutes)} Minuten bei eingestellten ` +
        `${profile.sessionMinutes}.`,
      suggestion:
        `Wenn du magst, stell die Dauer auf ${
          Math.ceil(medianMinutes / 15) * 15
        } Minuten — dann nutzt die App die Zeit für mehr Volumen. Wenn dir die ` +
        'kurze Einheit lieber ist, lass es so.',
    })
  }

  const stagniert = [...besserGeworden.entries()]
    .filter(([muscle, besser]) => !besser && (input.volumeTargets[muscle] ?? 0) > 0)
    .map(([muscle]) => muscle)

  if (weeks >= STAGNATION_WEEKS && stagniert.length > 0) {
    // Nur die drei mit dem größten Budget nennen. Eine Liste von zwölf
    // Muskeln ist kein Befund, sondern eine Tabelle.
    const wichtigste = stagniert
      .sort((a, b) => (input.volumeTargets[b] ?? 0) - (input.volumeTargets[a] ?? 0))
      .slice(0, 3)
    findings.push({
      kind: 'stagnation',
      severity: 'action',
      title: 'Diese Muskeln sind im ganzen Block nicht stärker geworden',
      detail: wichtigste
        .map(
          (muscle) =>
            `${muscle}: geplant ${input.volumeTargets[muscle]} Sätze/Woche, ` +
            `geleistet ${((geleistetesVolumen[muscle] ?? 0) / weeks).toFixed(1)}`,
        )
        .join(' · '),
      suggestion:
        'Zwei Möglichkeiten, und die Zahlen oben sagen welche: Liegt das geleistete ' +
        'Volumen deutlich unter dem geplanten, fehlt die Ausführung — dann hilft ' +
        'kein höheres Ziel. Passt es zusammen, ist das Volumen zu niedrig: Setz den ' +
        'Muskel im Profil als Schwerpunkt oder sag es im Coach-Chat.',
    })
  }

  // ── Erhaltungsbedarf aus echten Daten ──
  //
  // Der interessante Fall: wenig Volumen UND trotzdem stärker geworden. Dann
  // ist der Erhaltungsbedarf dieses Muskels niedriger als die Tabelle
  // annimmt, und das freie Volumen kann woanders arbeiten. Das kann keine
  // Formel wissen — nur die eigenen Daten.
  const guenstig = [...besserGeworden.entries()]
    .filter(([muscle, besser]) => {
      if (!besser) return false
      const geplant = input.volumeTargets[muscle] ?? 0
      const geleistet = (geleistetesVolumen[muscle] ?? 0) / weeks
      return geplant > 0 && geleistet > 0 && geleistet < geplant * 0.75
    })
    .map(([muscle]) => muscle)

  if (weeks >= STAGNATION_WEEKS && guenstig.length > 0) {
    findings.push({
      kind: 'maintenance',
      severity: 'info',
      title: 'Hier reicht weniger, als der Plan vorsieht',
      detail: guenstig
        .map(
          (muscle) =>
            `${muscle}: geplant ${input.volumeTargets[muscle]}, geleistet ` +
            `${((geleistetesVolumen[muscle] ?? 0) / weeks).toFixed(1)} Sätze/Woche — ` +
            'trotzdem stärker geworden',
        )
        .join(' · '),
      suggestion:
        'Dieses Volumen ist frei. Sag im Coach-Chat „weniger ' +
        `${guenstig[0]}", dann wandert es zu einem Muskel, der es braucht.`,
    })
  }

  const gewachsen = [...besserGeworden.entries()]
    .filter(([, besser]) => besser)
    .map(([muscle]) => muscle)

  if (gewachsen.length > 0) {
    findings.push({
      kind: 'progress',
      severity: 'info',
      title: 'Stärker geworden',
      detail: `${gewachsen.length} von ${besserGeworden.size} Muskeln: ${gewachsen
        .slice(0, 6)
        .join(', ')}${gewachsen.length > 6 ? ' …' : ''}`,
      suggestion: null,
    })
  }

  if (findings.every((finding) => finding.severity === 'info')) {
    findings.unshift({
      kind: 'ok',
      severity: 'info',
      title: 'Der Plan passt',
      detail:
        `${sessionsDone} von ${sessionsExpected} Einheiten, im Mittel ` +
        `${medianMinutes === null ? '—' : Math.round(medianMinutes)} Minuten.`,
      suggestion: null,
    })
  }

  return {
    weeks,
    sessionsExpected,
    sessionsDone,
    adherence,
    medianMinutes,
    plannedMinutes: profile.sessionMinutes,
    findings,
  }
}

/** Nutzt der Review überhaupt Daten? Ohne Einheiten ist er sinnlos. */
export function blockReviewUseful(sessionsDone: number): boolean {
  return sessionsDone >= 4
}

/**
 * Wann der laufende Block begonnen hat.
 *
 * Der jüngste durchgesehene Block-Review setzt den Anfang; gab es keinen, ist
 * es der Montag der Woche, in der das Onboarding fertig wurde. Abgeleitet
 * statt gespeichert — dieselbe Regel wie bei allem anderen in dieser App.
 */
export function currentBlockStart(input: {
  adjustments: readonly { scope: string; appliedAt: string; deletedAt: string | null }[]
  onboardingCompletedAt: string | null
}): string {
  const letzter = input.adjustments
    .filter((entry) => entry.scope === 'block_review' && entry.deletedAt === null)
    .map((entry) => entry.appliedAt)
    .sort()
    .at(-1)

  const anker = letzter ?? input.onboardingCompletedAt
  if (!anker) return mondayOf(new Date())
  return mondayOf(new Date(anker))
}
