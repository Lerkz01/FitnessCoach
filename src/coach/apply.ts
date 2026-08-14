// ====================================================================
//  Werkzeuge ausführen — hier und nur hier ändert sich etwas
//
//  Die Edge Function fasst die Datenbank nie an. Was das Modell tun möchte,
//  kommt als Wunsch zurück und wird hier ausgeführt — über denselben Weg
//  wie jede andere Änderung in dieser App: als Eintrag im
//  Anpassungsprotokoll, in der Warteschlange zur Übertragung, jederzeit
//  nachlesbar.
//
//  Zwei Eigenschaften machen das ungefährlich:
//
//   · Es wird nur GESCHRIEBEN, nie gelöscht oder überschrieben. Ein
//     zurückgenommener Schwerpunkt ist ein neuer Eintrag, nicht ein
//     entfernter. Trainingsdaten werden überhaupt nicht berührt.
//   · Die Rückmeldung an das Modell ist die WAHRHEIT, nicht der Wunsch.
//     Wurde ein Schwerpunkt gekürzt, weil kein Volumen frei war, steht das
//     drin — sonst würde das Modell dem Nutzer etwas bestätigen, was nicht
//     passiert ist.
// ====================================================================

import { putRecord } from '../data/db'
import {
  activeFocus,
  applyFocus,
  avoidedExerciseIds,
  MAX_AVOIDED,
  type Focus,
} from '../domain/focus'
import type { VolumeMuscle } from '../domain/muscles'
import { VOLUME_MUSCLES } from '../domain/muscles'
import type { Adjustment, TrainingPlan, UserProfile } from '../domain/records'
import { baseFields } from '../domain/records'
import { newId } from '../domain/ids'
import type { CoachToolName } from './tools'

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolOutcome {
  /** Für das Modell — die tatsächliche Wirkung, nicht der Wunsch. */
  result: string
  /** Für die Anzeige im Chat, eine Zeile. */
  label: string
  /** Der geschriebene Eintrag, damit die App ihren Zustand nachziehen kann. */
  adjustment: Adjustment | null
}

const MUSCLES = new Set<string>(VOLUME_MUSCLES)

function asMuscle(value: unknown): VolumeMuscle | null {
  return typeof value === 'string' && MUSCLES.has(value) ? (value as VolumeMuscle) : null
}

function asText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

export interface ApplyInput {
  userId: string
  call: ToolCall
  profile: UserProfile
  plan: TrainingPlan | null
  adjustments: readonly Adjustment[]
  /** Übungsnamen zu IDs — nur für die Anzeige. */
  exerciseNames: ReadonlyMap<string, string>
  at?: string
}

export async function applyCoachTool(input: ApplyInput): Promise<ToolOutcome> {
  const { userId, call, profile, plan, adjustments } = input
  const at = input.at ?? new Date().toISOString()

  const write = async (fields: {
    scope: 'coach_focus' | 'coach_avoid'
    targetId: string
    targetLabel: string
    before: string
    after: string
    reason: string
    applied: boolean
  }): Promise<Adjustment> => {
    const record: Adjustment = {
      ...baseFields(userId, newId(), at),
      appliedAt: at,
      // Kreis 5 = aus dem Chat gewünscht. Bewusst von den automatischen
      // Regelkreisen unterscheidbar, damit im Protokoll sichtbar bleibt,
      // was die App entschieden hat und was der Nutzer wollte.
      circle: 5,
      userAccepted: true,
      ...fields,
    }
    await putRecord(userId, 'adjustments', record)
    return record
  }

  const name = call.name as CoachToolName

  switch (name) {
    // ── Schwerpunkt setzen ────────────────────────────────────────────
    case 'set_focus': {
      const muscle = asMuscle(call.input.muscle)
      if (!muscle) {
        return {
          result:
            `„${String(call.input.muscle)}" ist kein Muskel, für den die App ein ` +
            `Volumenbudget führt. Gültig sind: ${VOLUME_MUSCLES.join(', ')}. ` +
            'Nichts geändert.',
          label: 'Änderung abgelehnt: unbekannter Muskel',
          adjustment: null,
        }
      }

      const direction = call.input.direction === 'less' ? 'less' : 'more'
      const reason = asText(call.input.reason, 'Wunsch aus dem Coach-Chat')

      // Die Wirkung VORHER ausrechnen, damit die Rückmeldung stimmt. Sie
      // hängt vom übrigen Budget ab: Liegt der Muskel schon an der
      // Obergrenze oder ist im Plan kein Volumen frei, fällt sie kleiner
      // aus als gewünscht.
      const bisher = activeFocus(adjustments)
      const neu: Focus[] = [
        ...bisher.filter((entry) => entry.muscle !== muscle),
        { muscle, direction, at },
      ]
      const wirkung = plan
        ? applyFocus(plan.volumeTargets, neu, profile.priorityMuscles)
        : { targets: {}, notes: [] }

      const vorher = plan?.volumeTargets[muscle] ?? null
      const nachher = wirkung.targets[muscle] ?? null

      const adjustment = await write({
        scope: 'coach_focus',
        targetId: muscle,
        targetLabel: muscle,
        before: vorher === null ? 'normal' : `${vorher} Sätze/Woche`,
        after: direction === 'more' ? 'mehr' : 'weniger',
        reason,
        applied: true,
      })

      const wirksam =
        vorher !== null && nachher !== null && vorher !== nachher
          ? `${muscle} geht von ${vorher} auf ${nachher} Sätze pro Woche.`
          : `${muscle} ist als Schwerpunkt vermerkt.`

      return {
        result:
          `${wirksam} ${wirkung.notes.join(' ')} ` +
          'Wirksam beim nächsten Planaufbau, nicht in der laufenden Woche.',
        label: `Schwerpunkt ${direction === 'more' ? 'mehr' : 'weniger'} ${muscle}`,
        adjustment,
      }
    }

    // ── Schwerpunkt zurücknehmen ──────────────────────────────────────
    case 'clear_focus': {
      const muscle = asMuscle(call.input.muscle)
      if (!muscle) {
        return {
          result: `„${String(call.input.muscle)}" ist kein bekannter Muskel. Nichts geändert.`,
          label: 'Änderung abgelehnt: unbekannter Muskel',
          adjustment: null,
        }
      }

      const bestand = activeFocus(adjustments).some((entry) => entry.muscle === muscle)
      if (!bestand) {
        return {
          result: `Für ${muscle} war gar kein Schwerpunkt gesetzt. Nichts geändert.`,
          label: `Kein Schwerpunkt für ${muscle}`,
          adjustment: null,
        }
      }

      const adjustment = await write({
        scope: 'coach_focus',
        targetId: muscle,
        targetLabel: muscle,
        before: 'Schwerpunkt',
        after: 'normal',
        reason: asText(call.input.reason, 'Schwerpunkt zurückgenommen'),
        applied: false,
      })

      return {
        result:
          `Der Schwerpunkt auf ${muscle} ist weg. Das Volumen geht auf den ` +
          'geplanten Wert zurück, der Ausgleich bei den anderen Muskeln entfällt. ' +
          'Wirksam beim nächsten Planaufbau.',
        label: `Schwerpunkt ${muscle} aufgehoben`,
        adjustment,
      }
    }

    // ── Übung ablehnen ────────────────────────────────────────────────
    case 'avoid_exercise': {
      const exerciseId = typeof call.input.exerciseId === 'string' ? call.input.exerciseId : ''
      const label = input.exerciseNames.get(exerciseId)
      if (!label) {
        return {
          result:
            `Die Übungs-ID „${exerciseId}" steht nicht im aktuellen Plan. ` +
            'Nichts geändert. Nenn eine Übung aus der Wochenliste.',
          label: 'Änderung abgelehnt: unbekannte Übung',
          adjustment: null,
        }
      }

      // Obergrenze, damit der Plan nicht still dünn wird: Irgendwann findet
      // der Generator keinen Ersatz mehr und meldet den Muskel als nicht
      // abgedeckt — in einer Fußnote, die niemand liest.
      const bereitsAbgelehnt = avoidedExerciseIds(adjustments)
      if (!bereitsAbgelehnt.has(exerciseId) && bereitsAbgelehnt.size >= MAX_AVOIDED) {
        return {
          result:
            `Es sind schon ${MAX_AVOIDED} Übungen abgelehnt — mehr geht nicht, sonst ` +
            'findet der Generator für manche Muskeln keinen Ersatz mehr und das ' +
            'Wochenvolumen wird nicht erreicht. Sag der Person, sie soll zuerst eine ' +
            'Ablehnung aufheben (allow_exercise). Falls es um fehlende Geräte oder ' +
            'Beschwerden geht: Das gehört in die Einstellungen bzw. ins Profil, dort ' +
            'wirkt es auf die ganze Auswahl statt als Liste von Einzelfällen.',
          label: `Nicht abgelehnt: schon ${MAX_AVOIDED} auf der Liste`,
          adjustment: null,
        }
      }

      const adjustment = await write({
        scope: 'coach_avoid',
        targetId: exerciseId,
        targetLabel: label,
        before: 'im Plan',
        after: 'abgelehnt',
        reason: asText(call.input.reason, 'Auf Wunsch aus dem Coach-Chat'),
        applied: true,
      })

      return {
        result:
          `${label} fällt aus dem Plan. Beim nächsten Planaufbau sucht der ` +
          'Generator eine Übung, die dieselbe Muskulatur trifft — das ' +
          'Wochenvolumen bleibt also gleich. Wirksam ab nächster Woche.',
        label: `${label} abgelehnt`,
        adjustment,
      }
    }

    // ── Ablehnung aufheben ────────────────────────────────────────────
    case 'allow_exercise': {
      const exerciseId = typeof call.input.exerciseId === 'string' ? call.input.exerciseId : ''
      if (exerciseId.length === 0) {
        return {
          result: 'Ohne Übungs-ID kann ich nichts freigeben. Nichts geändert.',
          label: 'Änderung abgelehnt: keine Übung genannt',
          adjustment: null,
        }
      }

      const adjustment = await write({
        scope: 'coach_avoid',
        targetId: exerciseId,
        targetLabel: input.exerciseNames.get(exerciseId) ?? exerciseId,
        before: 'abgelehnt',
        after: 'wieder erlaubt',
        reason: asText(call.input.reason, 'Freigabe aus dem Coach-Chat'),
        applied: false,
      })

      return {
        result:
          `${adjustment.targetLabel} darf wieder eingeplant werden. Ob sie ` +
          'tatsächlich vorkommt, entscheidet der Generator nach Volumen und Geräten.',
        label: `${adjustment.targetLabel} wieder erlaubt`,
        adjustment,
      }
    }

    default:
      // Kann nur passieren, wenn die Edge Function ein Werkzeug durchlässt,
      // das hier nicht behandelt wird. Dann lieber sagen als schweigen.
      return {
        result: `Das Werkzeug „${call.name}" kenne ich nicht. Nichts geändert.`,
        label: `Unbekanntes Werkzeug: ${call.name}`,
        adjustment: null,
      }
  }
}
