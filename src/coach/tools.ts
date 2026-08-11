// ====================================================================
//  Werkzeuge des Coaches
//
//  Die Schemata entstehen in der APP, nicht auf dem Server. Grund: Nur hier
//  sind die gültigen Werte bekannt — die 18 Budgetmuskeln und die Übungen,
//  die diese Woche tatsächlich im Plan stehen. Als Aufzählung im Schema kann
//  das Modell sie nicht erfinden; es kann strukturell nur aus dem wählen,
//  was existiert.
//
//  Das ist mehr wert als jede Prüfung hinterher: Ein erfundener Muskelname
//  („Arme") oder eine erfundene Übungs-ID würde sonst als scheinbar
//  erfolgreiche Änderung durchlaufen und nichts tun.
//
//  Ausgeführt wird hier, nicht auf dem Server (siehe coach/apply.ts). Die
//  Edge Function sieht die Datenbank nie.
// ====================================================================

import { VOLUME_MUSCLES } from '../domain/muscles'
import { FOCUS_SETS, MAX_FOCUS } from '../domain/focus'

/** Die Werkzeugnamen — dieselbe Liste steht in der Edge Function. */
export const COACH_TOOL_NAMES = [
  'set_focus',
  'clear_focus',
  'avoid_exercise',
  'allow_exercise',
] as const

export type CoachToolName = (typeof COACH_TOOL_NAMES)[number]

export interface ToolSchema {
  name: CoachToolName
  description: string
  input_schema: Record<string, unknown>
}

export interface PlannedExerciseRef {
  exerciseId: string
  exerciseName: string
}

/**
 * Die Werkzeuge für diesen Aufruf.
 *
 * `available` sind die Übungen der aktuellen Woche. Ist die Liste leer, gibt
 * es die Übungswerkzeuge gar nicht — ein Werkzeug ohne mögliche Eingabe wäre
 * eine Einladung zum Erfinden.
 */
export function coachTools(available: readonly PlannedExerciseRef[]): ToolSchema[] {
  const tools: ToolSchema[] = [
    {
      name: 'set_focus',
      description:
        `Verschiebt das Wochenvolumen eines Muskels um ${FOCUS_SETS} Sätze. ` +
        'Nutze dies, wenn die Person ausdrücklich mehr oder weniger Arbeit für ' +
        'einen Körperbereich möchte. Für „mehr Arme" rufe das Werkzeug zweimal ' +
        'auf: einmal Bizeps, einmal Trizeps. ' +
        'Es ist eine Nullsumme: Mehr an einer Stelle bedeutet automatisch etwas ' +
        'weniger bei anderen Muskeln, damit die Einheiten nicht länger werden. ' +
        `Höchstens ${MAX_FOCUS} Muskeln können gleichzeitig betont sein; ein ` +
        'vierter verdrängt den ältesten. Wirkt beim nächsten Planaufbau.',
      input_schema: {
        type: 'object',
        properties: {
          muscle: {
            type: 'string',
            enum: [...VOLUME_MUSCLES],
            description: 'Der Muskel, dessen Volumen sich verschiebt.',
          },
          direction: {
            type: 'string',
            enum: ['more', 'less'],
            description: '„more" = mehr Sätze, „less" = weniger Sätze.',
          },
          reason: {
            type: 'string',
            description:
              'Der Wunsch in den Worten der Person, ein kurzer Satz. Steht später ' +
              'im Anpassungsprotokoll und erklärt dort, warum sich der Plan ' +
              'geändert hat.',
          },
        },
        required: ['muscle', 'direction', 'reason'],
        additionalProperties: false,
      },
    },
    {
      name: 'clear_focus',
      description:
        'Nimmt einen Schwerpunkt zurück. Der Muskel bekommt wieder sein normales ' +
        'Volumen, der Ausgleich bei den anderen Muskeln entfällt.',
      input_schema: {
        type: 'object',
        properties: {
          muscle: {
            type: 'string',
            enum: [...VOLUME_MUSCLES],
            description: 'Der Muskel, dessen Schwerpunkt entfällt.',
          },
          reason: { type: 'string', description: 'Warum, ein kurzer Satz.' },
        },
        required: ['muscle', 'reason'],
        additionalProperties: false,
      },
    },
  ]

  if (available.length === 0) return tools

  const ids = available.map((exercise) => exercise.exerciseId)
  const list = available
    .map((exercise) => `${exercise.exerciseId} = ${exercise.exerciseName}`)
    .join(', ')

  tools.push(
    {
      name: 'avoid_exercise',
      description:
        'Nimmt eine Übung aus dem Plan. Der Generator ersetzt sie beim nächsten ' +
        'Planaufbau durch eine, die dieselbe Muskulatur trifft. Nutze dies, wenn ' +
        'die Person eine Übung nicht mag, nicht kann oder sie ihr wehtut. ' +
        `Verfügbare Übungen: ${list}.`,
      input_schema: {
        type: 'object',
        properties: {
          exerciseId: {
            type: 'string',
            enum: ids,
            description: 'ID der Übung aus der Liste oben.',
          },
          reason: {
            type: 'string',
            description: 'Warum die Übung wegfällt, ein kurzer Satz.',
          },
        },
        required: ['exerciseId', 'reason'],
        additionalProperties: false,
      },
    },
    {
      name: 'allow_exercise',
      description:
        'Hebt eine frühere Ablehnung auf, damit die Übung wieder eingeplant ' +
        'werden kann.',
      input_schema: {
        type: 'object',
        properties: {
          exerciseId: { type: 'string', description: 'ID der Übung.' },
          reason: { type: 'string', description: 'Warum, ein kurzer Satz.' },
        },
        required: ['exerciseId', 'reason'],
        additionalProperties: false,
      },
    },
  )

  return tools
}
