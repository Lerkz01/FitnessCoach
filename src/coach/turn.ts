// ====================================================================
//  Ein Zug im Gespräch
//
//  Ein „Zug" ist mehr als eine Anfrage: Will das Modell etwas am Plan
//  ändern, braucht es zwei Runden — erst der Wunsch, dann die Antwort auf
//  das Ergebnis. Diese Schleife steckt hier, damit der Bildschirm nur noch
//  anzeigen muss.
//
//  Die Runden sind hart begrenzt. Ein Modell, das im Kreis Werkzeuge
//  aufruft, würde sonst Geld verbrennen, ohne dass jemand es merkt.
// ====================================================================

import type { Adjustment } from '../domain/records'
import { applyCoachTool, type ApplyInput, type ToolOutcome } from './apply'
import { askCoach, type ApiMessage, type StreamHandlers } from './stream'

/** Höchstens so viele Werkzeugrunden pro Frage. */
export const MAX_ROUNDS = 3

export interface TurnResult {
  /** Der Antworttext, alle Runden zusammengefügt. */
  text: string
  /** Was am Plan geändert wurde — für die Anzeige und das Nachziehen. */
  changes: ToolOutcome[]
  /** Geschriebene Einträge, damit die App ihren Zustand aktualisiert. */
  adjustments: Adjustment[]
  /** Der Nachrichtenverlauf für die API, um den Zug erweitert. */
  messages: ApiMessage[]
  failed: boolean
}

export async function runCoachTurn(input: {
  /** Verlauf einschließlich der neuen Nutzernachricht. */
  messages: readonly ApiMessage[]
  context: string
  tools: readonly unknown[]
  handlers: StreamHandlers
  /** Alles, was applyCoachTool braucht — ohne den einzelnen Aufruf. */
  apply: Omit<ApplyInput, 'call' | 'adjustments'> & { adjustments: readonly Adjustment[] }
  signal?: AbortSignal
}): Promise<TurnResult> {
  const messages: ApiMessage[] = [...input.messages]
  const changes: ToolOutcome[] = []
  const written: Adjustment[] = []
  let text = ''

  // Die Anpassungen wachsen innerhalb eines Zuges mit: Setzt das Modell
  // erst Bizeps und dann Trizeps, muss der zweite Aufruf den ersten schon
  // sehen — sonst berechnet er die Wirkung auf einem veralteten Stand.
  let adjustments: Adjustment[] = [...input.apply.adjustments]

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const result = await askCoach({
      messages,
      context: input.context,
      tools: input.tools,
      handlers: input.handlers,
      signal: input.signal,
    })

    if (!result) return { text, changes, adjustments: written, messages, failed: true }

    if (result.text.length > 0) {
      text = text.length > 0 ? `${text}\n\n${result.text}` : result.text
    }

    if (result.toolCalls.length === 0) {
      return { text, changes, adjustments: written, messages, failed: false }
    }

    // Die Antwort UNVERÄNDERT zurückgeben, inklusive Denkblöcken. Wer hier
    // filtert, bekommt vom nächsten Aufruf eine Ablehnung.
    messages.push({ role: 'assistant', content: result.content })

    const results: unknown[] = []
    for (const call of result.toolCalls) {
      const outcome = await applyCoachTool({ ...input.apply, call, adjustments })
      changes.push(outcome)
      if (outcome.adjustment) {
        written.push(outcome.adjustment)
        adjustments = [...adjustments, outcome.adjustment]
      }
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: outcome.result,
      })
    }

    // Alle Ergebnisse in EINER Nachricht. Getrennt gesendet lernt das
    // Modell, keine parallelen Aufrufe mehr zu machen.
    messages.push({ role: 'user', content: results })
  }

  // Grenze erreicht. Das ist kein Absturz, aber es soll auffallen.
  input.handlers.onError(
    `Der Coach hat ${MAX_ROUNDS} Runden mit Werkzeugen gebraucht und wurde ` +
      'gestoppt. Die bereits durchgeführten Änderungen stehen unten und sind gültig.',
  )
  return { text, changes, adjustments: written, messages, failed: false }
}
