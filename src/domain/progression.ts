// ====================================================================
//  Progressionslogik — Regelkreise 1, 2 und 2b
//
//  Grundlage: docs/PLAN-ENGINE.md §9.
//
//  Leitsatz:
//    Ein guter Satz ist Rauschen.
//    Eine gute Übung ist ein Signal.
//    Eine gute Einheit ist ein Auftrag.
//
//  Alles hier ist REIN BERECHNEND und arbeitet auf Rohdaten. Kein
//  Progressionszustand wird gespeichert — der Verlauf wird aus den
//  geloggten Sätzen abgeleitet. Dadurch kann die Historie jederzeit mit
//  verbesserter Logik neu durchgerechnet werden.
// ====================================================================

import type { Equipment } from '../types'
import type { Level, SetFeedback } from './records'
import { adjustByPercent, adjustBySteps, estimate1RM } from './weights'

// ────────────────────────────────────────────────────────────────────
//  Das Feedback-Signal
// ────────────────────────────────────────────────────────────────────

/**
 * Abweichung vom Ziel-RIR, abgeleitet aus dem Abgleich.
 *
 * Gefragt wird nicht „wie hart war das?", sondern ob die tatsächliche
 * Anstrengung zur VORGABE passte. Ein Vergleich ist kognitiv leichter als
 * eine absolute Einschätzung und liefert genau diese Abweichung
 * (docs/UI-UX.md §5.3).
 */
export const RIR_DELTA: Record<SetFeedback, number> = {
  as_planned: 0,
  more_left: 1.5,
  at_limit: -1.5,
}

export function rirDeltaOf(feedback: SetFeedback | null): number | null {
  return feedback === null ? null : RIR_DELTA[feedback]
}

// ────────────────────────────────────────────────────────────────────
//  Satz-Status
// ────────────────────────────────────────────────────────────────────

export type SetStatus = 'getroffen' | 'uebertroffen' | 'verfehlt' | 'hart'

/** Ein geloggter Arbeitssatz, reduziert auf das für die Logik Nötige. */
export interface SetOutcome {
  prescribedReps: number | null
  prescribedSeconds: number | null
  actualReps: number | null
  actualSeconds: number | null
  weightKg: number | null
  feedback: SetFeedback | null
  abandoned: boolean
}

export function setStatus(set: SetOutcome): SetStatus {
  // Ein abgebrochener Satz gilt als Ausfall, nicht als 0 Wiederholungen.
  if (set.abandoned) return 'verfehlt'

  const target = set.prescribedSeconds ?? set.prescribedReps
  const actual = set.actualSeconds ?? set.actualReps
  if (target === null || actual === null) return 'verfehlt'

  if (actual < target) return 'verfehlt'

  const delta = rirDeltaOf(set.feedback)
  if (delta === null) return 'getroffen' // ohne Abgleich neutral bewerten
  if (delta > 0) return 'uebertroffen'
  if (delta < 0) return 'hart'
  return 'getroffen'
}

// ────────────────────────────────────────────────────────────────────
//  Übungs-Status
// ────────────────────────────────────────────────────────────────────

export type ExerciseStatus = 'UEBERTROFFEN' | 'ERFUELLT' | 'KNAPP' | 'VERFEHLT'

/** Ab dieser Unterschreitung gilt eine Übung als deutlich verfehlt. */
const CLEARLY_MISSED_BY = 3

/**
 * Beurteilt eine Übung aus ALLEN ihren Arbeitssätzen.
 *
 * Entscheidend: Es zählen alle Sätze. Ein starker erster Satz gefolgt von
 * zwei mittelmäßigen ergibt `ERFUELLT`, nicht `UEBERTROFFEN` — genau so wie
 * es sein soll (docs/PLAN-ENGINE.md §9).
 */
export function exerciseStatus(sets: readonly SetOutcome[]): ExerciseStatus {
  const working = sets.filter((s) => s.prescribedReps !== null || s.prescribedSeconds !== null)
  if (working.length === 0) return 'VERFEHLT'

  const statuses = working.map(setStatus)
  const missed = working.filter((_, index) => statuses[index] === 'verfehlt')

  if (missed.length > 1) return 'VERFEHLT'
  if (missed.length === 1) {
    const set = missed[0]
    const target = set.prescribedSeconds ?? set.prescribedReps ?? 0
    const actual = set.actualSeconds ?? set.actualReps ?? 0
    const shortfall = set.abandoned ? CLEARLY_MISSED_BY : target - actual
    return shortfall >= CLEARLY_MISSED_BY ? 'VERFEHLT' : 'KNAPP'
  }

  // Kein Satz verfehlt — jetzt entscheidet die Mehrheit der Rückmeldungen.
  const moreLeft = statuses.filter((s) => s === 'uebertroffen').length
  if (moreLeft > working.length / 2) return 'UEBERTROFFEN'

  // Wichtiger Sonderfall: Die Wiederholungen wurden geschafft, aber
  // überwiegend am Limit — obwohl Reserve vorgegeben war. Die Vorgabe wurde
  // also nur nominell erfüllt, tatsächlich bei höherer Intensität als
  // geplant. Hier zu steigern hieße, einen bereits zu harten Reiz weiter
  // anzuheben. Die Übung wird deshalb wie KNAPP behandelt: halten, nicht
  // steigern (docs/PLAN-ENGINE.md §9, Abgleich).
  const tooHard = statuses.filter((s) => s === 'hart').length
  if (tooHard > working.length / 2) return 'KNAPP'

  return 'ERFUELLT'
}

// ────────────────────────────────────────────────────────────────────
//  Regelkreis 1 — Fehlkorrektur innerhalb der Einheit
// ────────────────────────────────────────────────────────────────────

export interface InSessionCorrection {
  weightKg: number
  steps: number
  /** Formulierung für die Oberfläche (docs/UI-UX.md §5.4). */
  message: string
}

/** Ab dieser Abweichung war das Gewicht klar falsch angesetzt. */
const CLEAR_MISMATCH_REPS = 3

/**
 * Korrigiert ein falsch angesetztes Gewicht für die Folgesätze.
 *
 * Kreis 1 hat EINEN Zweck: einen Schätzfehler retten. Er ist kein
 * Progressionsmechanismus. Deshalb greift er nur bei klarer Abweichung,
 * maximal einmal pro Übung und maximal eine Stufe (in der Einmess-Woche
 * zwei).
 *
 * Auch die Formulierung ist bewusst gewählt: „Das Gewicht war zu niedrig
 * angesetzt", nicht „du wirst stärker". Kreis 1 behebt einen Fehler der
 * App, er feiert keinen Fortschritt.
 */
export function inSessionCorrection(input: {
  firstSet: SetOutcome
  equipment: Equipment
  calibrationWeek: boolean
}): InSessionCorrection | null {
  const { firstSet, equipment, calibrationWeek } = input
  if (firstSet.weightKg === null) return null

  const target = firstSet.prescribedReps
  const actual = firstSet.actualReps
  if (target === null || actual === null) return null

  const delta = rirDeltaOf(firstSet.feedback)
  const maxUp = calibrationWeek ? 2 : 1

  // Klar zu leicht: deutlich mehr Wiederholungen UND noch Reserve gemeldet
  if (actual >= target + CLEAR_MISMATCH_REPS && delta !== null && delta > 0) {
    const next = adjustBySteps(equipment, firstSet.weightKg, maxUp)
    if (next === null || next === firstSet.weightKg) return null
    return {
      weightKg: next,
      steps: maxUp,
      message: `Das Gewicht war zu niedrig angesetzt — ich korrigiere auf ${format(next)} kg.`,
    }
  }

  // Klar zu schwer: deutlich zu wenige Wiederholungen, oder verfehlt und am Limit
  const clearlyTooHeavy =
    actual <= target - CLEAR_MISMATCH_REPS ||
    (actual < target && delta !== null && delta < 0)

  if (clearlyTooHeavy) {
    const steps = actual <= target - CLEAR_MISMATCH_REPS * 2 ? -2 : -1
    const next = adjustBySteps(equipment, firstSet.weightKg, steps)
    if (next === null || next === firstSet.weightKg) return null
    return {
      weightKg: next,
      steps,
      message: `Zu schwer angesetzt — ich nehme auf ${format(next)} kg runter.`,
    }
  }

  return null
}

function format(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',')
}

// ────────────────────────────────────────────────────────────────────
//  Regelkreis 2 — Doppelprogression fürs nächste Mal
// ────────────────────────────────────────────────────────────────────

export interface CurrentPrescription {
  weightKg: number | null
  targetReps: number | null
  repRangeMin: number | null
  repRangeMax: number | null
  targetSeconds: number | null
}

export interface NextPrescription {
  weightKg: number | null
  targetReps: number | null
  targetSeconds: number | null
  /** Hat sich etwas verändert? */
  changed: boolean
  /** Begründung für die Anzeige „Für nächstes Mal" (docs/UI-UX.md §7). */
  reason: string
  /** Zählt als Rückschritt für den Deload-Check. */
  regression: boolean
}

/** Schrittweite der Progression bei zeitbasierten Übungen. */
const SECONDS_STEP = 5

/** Rückschritt bei zweimaliger deutlicher Verfehlung. */
const REGRESSION_PERCENT = -7.5

/**
 * Ab diesem relativen Sprung ist eine Gewichtsstufe zu grob.
 *
 * Bei leichten Übungen ist die kleinste verfügbare Stufe ein enormer
 * relativer Schritt: 2,5 kg auf eine 10-kg-Kurzhantel sind +25 %. Beim
 * Seitheben oder Rotatorentraining ist das der Normalfall — und ein
 * Gewicht, das man gerade 8-mal bewegt, schafft man mit 25 % mehr nicht
 * 6-mal. Solche Sprünge führen zwangsläufig zur Verfehlung und danach zum
 * Rückschritt: Der Nutzer pendelt zwischen zwei Stufen, ohne je Fortschritt
 * zu sehen.
 *
 * Deshalb wird bei grober Stufung zuerst der Wiederholungsbereich
 * ausgereizt. Erst an der Obergrenze ist der Sprung unvermeidbar — dann
 * trägt ihn die zusätzlich erarbeitete Kapazität.
 */
const COARSE_STEP_SHARE = 0.1

/**
 * Wie weit der Wiederholungsbereich bei grober Stufung überschritten
 * werden darf, bevor der Sprung trotzdem genommen wird.
 *
 * Genau so arbeiten erfahrene Trainierende mit festen Kurzhanteln: Man
 * bleibt beim leichteren Paar und geht über den nominellen Bereich hinaus,
 * bis das nächste Paar realistisch ist. Ohne Deckel würde die App sonst
 * irgendwann 30 Wiederholungen vorgeben.
 */
const EXTENDED_REPS = 6

/**
 * Trägt die geschätzte Kapazität das nächste Gewicht?
 *
 * Nutzt bewusst die rohe Epley-Formel und nicht `estimate1RM`: Dort ist die
 * Schätzung oberhalb von 12 Wiederholungen gesperrt, weil sie für die
 * ANZEIGE eines 1RM zu unzuverlässig wird. Hier wird nichts angezeigt —
 * beide Seiten werden mit derselben Formel verglichen, und für einen
 * Größenvergleich ist sie auch im höheren Bereich brauchbar.
 */
function capacitySupports(
  currentKg: number,
  currentReps: number,
  nextKg: number,
  nextReps: number,
  margin: number,
): boolean {
  const capacity = currentKg * (1 + currentReps / 30)
  const needed = nextKg * (1 + nextReps / 30) * margin
  return capacity >= needed
}

/**
 * Sicherheitsabstand für einen erneuten Versuch auf einem Gewicht, das
 * schon einmal verfehlt wurde. Beim ersten Versuch hat die Schätzung zu
 * optimistisch gerechnet — beim zweiten wird Abstand verlangt.
 */
const RETRY_MARGIN = 1.05

/**
 * Nach so vielen Einheiten „getroffen, aber am Limit" auf derselben Vorgabe
 * wird das Gewicht gesenkt, um den geplanten RIR wiederherzustellen.
 *
 * Drei Einheiten sind genug Beweis und kurz genug, dass keine Wochen
 * verloren gehen.
 */
const STUCK_LIMIT = 3

/**
 * Eine vergangene Ausführung dieser Übung.
 *
 * Das Gewicht MUSS mitgeführt werden. Ohne es wäre die Bestätigungsregel
 * nicht abbaubar: Ein dauerhaft unterschätzter Nutzer hätte endlos
 * „zweimal bestätigt" und würde in jeder Einheit eine Stufe steigen — in
 * einer Simulation über 10 Wochen ergab das +50 kg Bankdrücken. Mit dem
 * Gewicht lässt sich das Bestätigungsfenster auf die Einheiten SEIT DER
 * LETZTEN GEWICHTSÄNDERUNG begrenzen, womit jede Bestätigung genau einmal
 * zählt.
 */
export interface ExerciseAttempt {
  status: ExerciseStatus
  /** Vorgabe-Gewicht dieser Einheit. `null` bei Körpergewichtsübungen. */
  weightKg: number | null
  /**
   * Vorgegebene Wiederholungszahl dieser Einheit.
   *
   * Nötig, damit nach einem Rückschritt nicht erneut von der Untergrenze
   * hochgearbeitet werden muss: Wenn 10 kg × 14 schon bewiesen sind, wäre
   * es Zeitverschwendung, dort wieder mit 6 zu beginnen.
   */
  targetReps: number | null
}

/**
 * Nächste Vorgabe für eine Übung.
 *
 * `history` enthält die vergangenen Ausführungen dieser Übung, älteste
 * zuerst, einschließlich der eben abgeschlossenen. Daraus wird die
 * Bestätigung abgeleitet — es wird nichts zwischengespeichert.
 *
 * HARTE OBERGRENZE: entweder +1 Wiederholung ODER +1 Gewichtsstufe.
 * Niemals beides, niemals mehr. Auch bei außergewöhnlich starker Leistung
 * (docs/PLAN-ENGINE.md §11).
 */
export function nextPrescription(input: {
  current: CurrentPrescription
  history: readonly ExerciseAttempt[]
  level: Level
  equipment: Equipment | null
  calibrationWeek: boolean
  /** Aus Kreis 2b: Die ganze Einheit war zu leicht. */
  sessionWasTooEasy?: boolean
}): NextPrescription {
  const { current, history, level, equipment, calibrationWeek } = input
  const status = history.at(-1)?.status

  const unchanged = (reason: string): NextPrescription => ({
    weightKg: current.weightKg,
    targetReps: current.targetReps,
    targetSeconds: current.targetSeconds,
    changed: false,
    reason,
    regression: false,
  })

  if (status === undefined) return unchanged('Keine Daten aus der letzten Einheit.')

  // ── Zeitbasierte Übungen: Progression über die Dauer ──
  if (current.targetSeconds !== null) {
    if (status === 'UEBERTROFFEN' || status === 'ERFUELLT') {
      return {
        weightKg: current.weightKg,
        targetReps: null,
        targetSeconds: current.targetSeconds + SECONDS_STEP,
        changed: true,
        reason: `${current.targetSeconds + SECONDS_STEP} statt ${current.targetSeconds} Sekunden`,
        regression: false,
      }
    }
    if (status === 'KNAPP') return unchanged('Knapp verfehlt — gleiche Vorgabe nochmal.')
    const twiceMissed =
      history.length >= 2 && history.slice(-2).every((a) => a.status === 'VERFEHLT')
    if (twiceMissed && current.targetSeconds > SECONDS_STEP * 2) {
      return {
        weightKg: current.weightKg,
        targetReps: null,
        targetSeconds: current.targetSeconds - SECONDS_STEP,
        changed: true,
        reason: 'Zweimal verfehlt — ich nehme die Dauer zurück.',
        regression: true,
      }
    }
    return unchanged('Verfehlt — gleiche Vorgabe nochmal.')
  }

  const targetReps = current.targetReps
  const rangeMin = current.repRangeMin
  const rangeMax = current.repRangeMax
  if (targetReps === null || rangeMin === null || rangeMax === null) {
    return unchanged('Keine Wiederholungsvorgabe hinterlegt.')
  }

  const atRangeTop = targetReps >= rangeMax

  const raiseWeight = (why: string): NextPrescription => {
    if (equipment === null || current.weightKg === null) {
      // Körpergewichtsübung: nur Wiederholungen steigern
      return {
        weightKg: current.weightKg,
        targetReps: targetReps + 1,
        targetSeconds: null,
        changed: true,
        reason: `${targetReps + 1} statt ${targetReps} Wdh — ${why}`,
        regression: false,
      }
    }
    const next = adjustBySteps(equipment, current.weightKg, 1)
    if (next === null || next === current.weightKg) {
      return unchanged('Gewicht lässt sich an diesem Gerät nicht weiter erhöhen.')
    }

    // Grobe Stufung: Der Sprung wird erst genommen, wenn die geschätzte
    // Kapazität ihn trägt — sonst folgt zwangsläufig die Verfehlung und
    // danach der Rückschritt. Bei invertierten Geräten greift die Prüfung
    // nicht, dort bezieht sich das Gewicht auf die Unterstützung.
    if (!equipment.inverted && current.weightKg > 0) {
      const jump = Math.abs(next - current.weightKg) / current.weightKg
      if (jump > COARSE_STEP_SHARE) {
        const failedFrom = repsBeforeFailedJump(history, next, current.weightKg)

        if (failedFrom === null) {
          // Noch nie versucht: erst genug Kapazität aufbauen, aber nicht
          // unbegrenzt — irgendwann muss der Sprung gewagt werden.
          if (
            targetReps < rangeMax + EXTENDED_REPS &&
            !capacitySupports(current.weightKg, targetReps, next, rangeMin, 1)
          ) {
            return raiseReps(
              `eine Gewichtsstufe wären ${Math.round(jump * 100)} % — dafür fehlt noch Kapazität`,
            )
          }
        } else if (
          // Dieses Gewicht ist schon einmal gescheitert. Ein neuer Versuch
          // braucht eine nachweislich bessere Grundlage UND Sicherheitsabstand
          // — sonst wiederholt sich derselbe Fehlschlag im Dreitakt:
          // springen, zweimal verfehlen, zurückfallen.
          targetReps <= failedFrom ||
          !capacitySupports(current.weightKg, targetReps, next, rangeMin, RETRY_MARGIN)
        ) {
          return raiseReps(
            `${format(next)} kg sind mit ${failedFrom} Wdh schon gescheitert — ich baue weiter Grundlage auf`,
          )
        }
      }
    }

    return {
      weightKg: next,
      targetReps: rangeMin,
      targetSeconds: null,
      changed: true,
      reason: `${format(next)} kg — ${why}`,
      regression: false,
    }
  }

  const raiseReps = (why: string): NextPrescription => ({
    weightKg: current.weightKg,
    targetReps: targetReps + 1,
    targetSeconds: null,
    changed: true,
    reason: `${targetReps + 1} statt ${targetReps} Wdh — ${why}`,
    regression: false,
  })

  switch (status) {
    case 'UEBERTROFFEN': {
      // Die ganze Einheit war zu leicht → Bestätigung einmalig überspringen
      if (input.sessionWasTooEasy) {
        return raiseWeight('die komplette Einheit war zu leicht')
      }
      // Anfänger und Einmess-Woche: sofort erhöhen. Dort ist schnelle
      // Progression real, und die Startgewichte sind ohnehin unsicher.
      if (level === 'beginner' || calibrationWeek) {
        return raiseWeight('übertroffen')
      }
      // Sonst: Bestätigung abwarten. Ein einzelner starker Tag kann von
      // Tagesform, Koffein oder Motivation kommen.
      const consecutive = countTrailing(history, 'UEBERTROFFEN', current.weightKg)
      if (consecutive >= 2) return raiseWeight('zweimal bestätigt')
      if (atRangeTop) return raiseWeight('Wiederholungsbereich ausgereizt')
      return raiseReps('einmal übertroffen — ich warte auf Bestätigung')
    }

    case 'ERFUELLT': {
      if (atRangeTop) return raiseWeight('Wiederholungsbereich ausgereizt')
      return raiseReps('Vorgabe erfüllt')
    }

    case 'KNAPP': {
      // Ergänzung zur Spezifikation: Dort endet KNAPP bei „Vorgabe
      // unverändert wiederholen" — ohne Ausweg. Eine Simulation zeigte, dass
      // ein Nutzer damit 16 Einheiten (8 Wochen) unverändert bei derselben
      // Vorgabe stehen bleibt, wenn er sie zwar trifft, aber jedes Mal am
      // Limit. Das ist Stillstand: Der Reiz sitzt dauerhaft über dem
      // geplanten RIR, also ist das Gewicht zu hoch angesetzt.
      const stuck = countTrailing(history, 'KNAPP', current.weightKg)
      if (stuck < STUCK_LIMIT) return unchanged('Knapp verfehlt — gleiche Vorgabe nochmal.')

      // Richtung entscheidet die Lage im Wiederholungsbereich:
      //
      // An der OBERGRENZE ist „getroffen, aber am Limit" kein Stillstand,
      // sondern der abgeschlossene Wiederholungsaufbau. Der Ausweg geht nach
      // oben — genau die Doppelprogression. (Nach unten zu korrigieren wäre
      // falsch: In der Simulation senkte die App auf 57,5 kg und ging in der
      // nächsten Einheit sofort wieder auf 60 kg — eine verlorene Einheit.)
      if (atRangeTop) {
        const up = raiseWeight(`${stuck}-mal am Limit am oberen Bereichsende`)
        if (up.weightKg !== current.weightKg) return up
        // Die Stufungsprüfung schlägt stattdessen Wiederholungen vor. Wer
        // aber schon am Limit ist, schafft keine weitere — das würde direkt
        // in die Verfehlung führen. Also halten.
        return unchanged('Mehrfach am Limit — ich halte, bis die Vorgabe wieder mit Reserve sitzt.')
      }

      // UNTERHALB der Obergrenze heißt dasselbe Signal: Das Gewicht liegt
      // dauerhaft über dem geplanten RIR. Dann muss es sinken.
      if (equipment === null || current.weightKg === null) {
        return unchanged('Mehrfach am Limit — die Vorgabe bleibt, ohne Last kann ich nichts senken.')
      }
      const eased = adjustBySteps(equipment, current.weightKg, -1)
      if (eased === null || eased === current.weightKg) {
        return unchanged('Mehrfach am Limit — Gewicht lässt sich nicht weiter senken.')
      }
      return {
        weightKg: eased,
        // Die Wiederholungszahl bleibt: Weniger Gewicht bei gleichem Ziel
        // stellt genau den geplanten RIR wieder her.
        targetReps,
        targetSeconds: null,
        changed: true,
        reason: `${format(eased)} kg — ${stuck}-mal am Limit statt mit Reserve`,
        // Kein Rückschritt im Sinne des Deload-Checks: Das ist eine
        // Korrektur der Intensität, kein Leistungsabfall. Die Ermüdung wird
        // ohnehin über die RIR-Drift erfasst.
        regression: false,
      }
    }

    case 'VERFEHLT': {
      const twiceMissed = countTrailing(history, 'VERFEHLT', current.weightKg) >= 2
      if (!twiceMissed) return unchanged('Verfehlt — gleiche Vorgabe nochmal.')
      if (equipment === null || current.weightKg === null) {
        return {
          weightKg: current.weightKg,
          targetReps: Math.max(rangeMin, targetReps - 1),
          targetSeconds: null,
          changed: targetReps > rangeMin,
          reason: 'Zweimal verfehlt — ich nehme die Wiederholungen zurück.',
          regression: true,
        }
      }
      const next = adjustByPercent(equipment, current.weightKg, REGRESSION_PERCENT)
      if (next === null || next === current.weightKg) {
        return unchanged('Zweimal verfehlt — Gewicht lässt sich nicht weiter senken.')
      }
      // Auf einem Gewicht, das schon einmal getragen wurde, dort wieder
      // ansetzen — nicht an der Untergrenze. Sonst folgt auf jeden
      // Rückschritt eine Serie von Einheiten, die nur Bekanntes wiederholen.
      const proven = provenRepsAt(history, next, rangeMin, rangeMax + EXTENDED_REPS)
      return {
        weightKg: next,
        targetReps: proven ?? rangeMin,
        targetSeconds: null,
        changed: true,
        reason: `${format(next)} kg — zweimal verfehlt`,
        regression: true,
      }
    }
  }
}

/**
 * Höchste Wiederholungsvorgabe, die bei diesem Gewicht schon erfüllt wurde.
 *
 * `null`, wenn dieses Gewicht noch nie erfolgreich bewegt wurde — dann
 * bleibt es bei der Untergrenze des Bereichs.
 */
function provenRepsAt(
  history: readonly ExerciseAttempt[],
  weightKg: number,
  min: number,
  max: number,
): number | null {
  let best: number | null = null
  for (const attempt of history) {
    if (attempt.weightKg !== weightKg) continue
    if (attempt.status !== 'ERFUELLT' && attempt.status !== 'UEBERTROFFEN') continue
    if (attempt.targetReps === null) continue
    if (best === null || attempt.targetReps > best) best = attempt.targetReps
  }
  if (best === null) return null
  return Math.min(Math.max(best, min), max)
}

/**
 * Von wie vielen Wiederholungen aus ein Sprung auf `nextWeightKg` schon
 * einmal gescheitert ist. `null`, wenn es dort noch keinen Fehlschlag gab.
 *
 * Gesucht wird die Einheit VOR der Verfehlung — sie war das Sprungbrett.
 * Ihre Wiederholungszahl ist die Messlatte, die ein neuer Versuch
 * übertreffen muss.
 */
function repsBeforeFailedJump(
  history: readonly ExerciseAttempt[],
  nextWeightKg: number,
  currentWeightKg: number,
): number | null {
  let best: number | null = null
  for (let index = 1; index < history.length; index++) {
    const attempt = history[index]
    if (attempt.weightKg !== nextWeightKg || attempt.status !== 'VERFEHLT') continue

    const springboard = history[index - 1]
    if (springboard.weightKg !== currentWeightKg) continue
    if (springboard.targetReps === null) continue
    if (best === null || springboard.targetReps > best) best = springboard.targetReps
  }
  return best
}

/**
 * Zählt den Status am Ende der Historie — aber nur SEIT DER LETZTEN
 * GEWICHTSÄNDERUNG.
 *
 * Diese Begrenzung ist der Kern der Progressionsbremse. Ohne sie wächst der
 * Bestätigungszähler unbegrenzt weiter, bleibt dauerhaft über der Schwelle
 * und lässt das Gewicht in jeder Einheit steigen. Mit ihr zählt jede
 * Bestätigung genau einmal: Sobald das Gewicht angehoben wurde, beginnt das
 * Fenster neu.
 */
function countTrailing(
  history: readonly ExerciseAttempt[],
  status: ExerciseStatus,
  currentWeightKg: number | null,
): number {
  // Anfang des Fensters: direkt nach der jüngsten abweichenden Gewichtsstufe.
  let windowStart = 0
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index].weightKg !== currentWeightKg) {
      windowStart = index + 1
      break
    }
  }

  let count = 0
  for (let index = history.length - 1; index >= windowStart; index--) {
    if (history[index].status !== status) break
    count += 1
  }
  return count
}

// ────────────────────────────────────────────────────────────────────
//  Regelkreis 2b — Einheits-Qualität
// ────────────────────────────────────────────────────────────────────

export type SessionVerdict =
  | 'zu_leicht'
  | 'gut'
  | 'normal'
  | 'schwach'
  | 'deload_signal'

export interface SessionQuality {
  /** Anteil der Übungen mit Status ERFUELLT oder UEBERTROFFEN. */
  score: number
  /** Anteil der Übungen mit Status UEBERTROFFEN. */
  exceededShare: number
  verdict: SessionVerdict
  /** Darf die Bestätigungsregel einmalig übersprungen werden? */
  allowBroadIncrease: boolean
  /** Darf das Wochenvolumen erhöht werden (Kreis 3)? */
  allowVolumeIncrease: boolean
  message: string
}

/**
 * Bewertet die gesamte Einheit.
 *
 * Ein einzelner starker Satz ist Rauschen — eine durchweg starke EINHEIT
 * ist ein belastbares Signal, das eine breitere Steigerung rechtfertigt
 * (docs/PLAN-ENGINE.md §9, Kreis 2b).
 */
export function sessionQuality(statuses: readonly ExerciseStatus[]): SessionQuality {
  if (statuses.length === 0) {
    return {
      score: 0,
      exceededShare: 0,
      verdict: 'normal',
      allowBroadIncrease: false,
      allowVolumeIncrease: false,
      message: 'Keine auswertbaren Übungen.',
    }
  }

  const met = statuses.filter((s) => s === 'ERFUELLT' || s === 'UEBERTROFFEN').length
  const exceeded = statuses.filter((s) => s === 'UEBERTROFFEN').length
  const score = met / statuses.length
  const exceededShare = exceeded / statuses.length

  if (exceededShare >= 0.8) {
    return {
      score,
      exceededShare,
      verdict: 'zu_leicht',
      allowBroadIncrease: true,
      allowVolumeIncrease: true,
      message: 'Die komplette Einheit war zu leicht — ich hebe auf breiter Front an.',
    }
  }
  if (score >= 0.8) {
    return {
      score,
      exceededShare,
      verdict: 'gut',
      allowBroadIncrease: false,
      allowVolumeIncrease: true,
      message: 'Starke Einheit — die Vorgaben sitzen.',
    }
  }
  if (score >= 0.5) {
    return {
      score,
      exceededShare,
      verdict: 'normal',
      allowBroadIncrease: false,
      allowVolumeIncrease: false,
      message: 'Solide Einheit, aber noch nicht durchgehend erfüllt.',
    }
  }
  if (score >= 0.3) {
    return {
      score,
      exceededShare,
      verdict: 'schwach',
      allowBroadIncrease: false,
      allowVolumeIncrease: false,
      message: 'Die Vorgaben waren zu hoch — ich halte sie erstmal.',
    }
  }
  return {
    score,
    exceededShare,
    verdict: 'deload_signal',
    allowBroadIncrease: false,
    allowVolumeIncrease: false,
    message: 'Deutlich unter Plan. Das zählt als Signal für eine Entlastungswoche.',
  }
}

// ────────────────────────────────────────────────────────────────────
//  Kennzahlen aus den Logs (docs/PLAN-ENGINE.md §8)
// ────────────────────────────────────────────────────────────────────

/** Bestes geschätztes 1RM über alle Sätze einer Übung. */
export function bestE1rm(sets: readonly SetOutcome[]): number | null {
  let best: number | null = null
  for (const set of sets) {
    if (set.abandoned) continue
    if (set.weightKg === null || set.actualReps === null) continue
    const estimate = estimate1RM(set.weightKg, set.actualReps)
    if (estimate === null) continue
    if (best === null || estimate > best) best = estimate
  }
  return best === null ? null : Math.round(best * 10) / 10
}

/** Volumenlast: Summe aus Gewicht × Wiederholungen. */
export function volumeLoad(sets: readonly SetOutcome[]): number {
  let sum = 0
  for (const set of sets) {
    if (set.abandoned) continue
    if (set.weightKg === null || set.actualReps === null) continue
    sum += set.weightKg * set.actualReps
  }
  return Math.round(sum)
}

/** Zielerreichung: Anteil der Sätze, die die Vorgabe geschafft haben. */
export function targetHitRate(sets: readonly SetOutcome[]): number {
  const working = sets.filter((s) => s.prescribedReps !== null || s.prescribedSeconds !== null)
  if (working.length === 0) return 0
  const hit = working.filter((s) => setStatus(s) !== 'verfehlt').length
  return hit / working.length
}

/**
 * RIR-Drift: mittlere Abweichung vom Ziel-RIR.
 *
 * Negativ heißt: Es fühlt sich schwerer an als vorgegeben — ein
 * Frühwarnzeichen für Ermüdung (docs/PLAN-ENGINE.md §9c).
 */
export function rirDrift(sets: readonly SetOutcome[]): number | null {
  const deltas = sets
    .map((s) => rirDeltaOf(s.feedback))
    .filter((d): d is number => d !== null)
  if (deltas.length === 0) return null
  const sum = deltas.reduce((a, b) => a + b, 0)
  return Math.round((sum / deltas.length) * 100) / 100
}

/**
 * Stagnationszähler: Einheiten ohne e1RM-VERBESSERUNG.
 *
 * `history` enthält die besten e1RM-Werte vergangener Einheiten dieser
 * Übung, älteste zuerst.
 *
 * Gezählt wird von hinten, solange eine Einheit den bis dahin besten Wert
 * NICHT übertroffen hat. Ein gleich hoher Wert ist ausdrücklich keine
 * Verbesserung — sonst bliebe genau der häufigste Plateaufall unsichtbar:
 * Wer viermal exakt dasselbe Gewicht bei denselben Wiederholungen schafft,
 * hat einen unveränderten Bestwert, und ein Zähler, der nur Werte
 * UNTERHALB des Maximums sucht, meldete dafür null.
 */
export function stagnationCount(history: readonly (number | null)[]): number {
  const values = history.filter((v): v is number => v !== null)
  if (values.length < 2) return 0

  let count = 0
  for (let index = values.length - 1; index >= 1; index--) {
    const bestBefore = Math.max(...values.slice(0, index))
    if (values[index] > bestBefore) break
    count += 1
  }
  return count
}
