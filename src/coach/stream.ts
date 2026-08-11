// ====================================================================
//  Antwort des Coaches empfangen
//
//  Warum als Datenstrom und nicht als eine Antwort am Ende: Eine Frage mit
//  vollem Trainingskontext braucht mehrere Sekunden. Ohne Datenstrom sieht
//  man in dieser Zeit nichts und hält die App für kaputt.
//
//  Was hier zusammengesetzt wird, sind die Ereignisse der Messages API:
//  Text kommt in Stücken, ein Werkzeugwunsch kommt als unvollständiges JSON
//  in Stücken — und darf erst geparst werden, wenn der Block zu Ende ist.
//  Genau das war der Teil, der ohne Sorgfalt still kaputtgeht: Ein halb
//  angekommenes JSON ist syntaktisch gültig, bis es das nicht mehr ist.
// ====================================================================

import { supabase } from '../sync/supabaseClient'
import type { ToolCall } from './apply'

export type ChatRole = 'user' | 'assistant'

/** Eine Nachricht, wie sie an die API geht. */
export interface ApiMessage {
  role: ChatRole
  content: unknown
}

export interface StreamHandlers {
  /** Ein Stück Antworttext. */
  onText: (chunk: string) => void
  /** Das Modell denkt — für die Anzeige „überlegt …". */
  onThinking: () => void
  /** Fehler in Klartext, für den Nutzer lesbar. */
  onError: (message: string) => void
}

export interface StreamResult {
  /** Der reine Antworttext. */
  text: string
  /** Werkzeugwünsche, in der Reihenfolge des Auftretens. */
  toolCalls: ToolCall[]
  /**
   * Die Blöcke der Antwort, unverändert.
   *
   * Müssen beim nächsten Aufruf UNVERÄNDERT zurückgegeben werden, sonst
   * bricht die Fortsetzung ab — dazu gehören auch Denkblöcke, deren Text
   * leer ist.
   */
  content: unknown[]
  stopReason: string | null
}

/** Roher Block, wie er über den Datenstrom kommt. */
interface RawBlock {
  type: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
  [key: string]: unknown
}

const FUNCTION_PATH = '/functions/v1/coach'

/** Ist der Chat überhaupt benutzbar? */
export function coachAvailable(): boolean {
  return supabase() !== null
}

export async function askCoach(input: {
  messages: readonly ApiMessage[]
  context: string
  tools: readonly unknown[]
  handlers: StreamHandlers
  signal?: AbortSignal
}): Promise<StreamResult | null> {
  const client = supabase()
  if (!client) {
    input.handlers.onError(
      'Der Coach braucht die Cloud-Verbindung. Ohne eingerichtete Cloud gibt es ' +
        'keinen Chat — alles andere in der App funktioniert weiter.',
    )
    return null
  }

  const { data: sessionData } = await client.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) {
    input.handlers.onError('Nicht angemeldet. Melde dich neu an.')
    return null
  }

  const base = import.meta.env.VITE_SUPABASE_URL as string
  let response: Response
  try {
    response = await fetch(`${base.replace(/\/+$/, '')}${FUNCTION_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: input.messages,
        context: input.context,
        tools: input.tools,
      }),
      signal: input.signal,
    })
  } catch (error) {
    // Der häufigste Fall: kein Netz. Das ist kein Fehler der App, und der
    // Rest der App funktioniert weiter — das gehört in die Meldung.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    input.handlers.onError(
      offline
        ? 'Kein Netz. Der Chat braucht Internet, alles andere in der App nicht.'
        : `Der Coach ist nicht erreichbar: ${
            error instanceof Error ? error.message : String(error)
          }`,
    )
    return null
  }

  if (!response.ok || !response.body) {
    let message = `Der Coach antwortet mit Fehler ${response.status}.`
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      // Antwort war kein JSON — dann bleibt die Statusmeldung.
    }
    input.handlers.onError(message)
    return null
  }

  return parseCoachStream(response.body, input.handlers)
}

/**
 * Setzt die Ereignisse des Datenstroms zu einer Antwort zusammen.
 *
 * Eigene Funktion, weil hier die Fehler wohnen, die man nicht sieht: Ein
 * Ereignis kann über zwei Netzwerkpakete verteilt ankommen, und der
 * Werkzeugwunsch kommt als JSON in Stücken, die einzeln ungültig sind.
 * Ohne Netz und ohne Anmeldung prüfbar.
 */
export async function parseCoachStream(
  body: ReadableStream<Uint8Array>,
  handlers: StreamHandlers,
): Promise<StreamResult | null> {
  const blocks: RawBlock[] = []
  /** Angesammeltes Teil-JSON je Blockindex — nur für Werkzeugwünsche. */
  const partialJson = new Map<number, string>()
  let text = ''
  let stopReason: string | null = null
  let thinkingAnnounced = false

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Ereignisse sind durch eine Leerzeile getrennt. Der Rest bleibt im
      // Puffer — ein Ereignis kann über zwei Pakete verteilt ankommen.
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data: '))
        if (!line) continue

        let event: {
          type?: string
          index?: number
          content_block?: RawBlock
          delta?: {
            type?: string
            text?: string
            thinking?: string
            partial_json?: string
            stop_reason?: string
          }
          message?: string
        }
        try {
          event = JSON.parse(line.slice(6))
        } catch {
          continue
        }

        switch (event.type) {
          case 'coach_error':
            handlers.onError(event.message ?? 'Unbekannter Fehler beim Coach.')
            break

          case 'content_block_start': {
            const index = event.index ?? blocks.length
            blocks[index] = { ...(event.content_block ?? { type: 'text' }) }
            if (blocks[index].type === 'tool_use') partialJson.set(index, '')
            if (blocks[index].type === 'thinking' && !thinkingAnnounced) {
              thinkingAnnounced = true
              handlers.onThinking()
            }
            break
          }

          case 'content_block_delta': {
            const index = event.index ?? 0
            const delta = event.delta ?? {}
            if (delta.type === 'text_delta' && delta.text) {
              text += delta.text
              blocks[index] = {
                ...(blocks[index] ?? { type: 'text' }),
                text: (blocks[index]?.text ?? '') + delta.text,
              }
              handlers.onText(delta.text)
            } else if (delta.type === 'thinking_delta' && delta.thinking) {
              blocks[index] = {
                ...(blocks[index] ?? { type: 'thinking' }),
                thinking: (blocks[index]?.thinking ?? '') + delta.thinking,
              }
            } else if (delta.type === 'input_json_delta' && delta.partial_json) {
              // NICHT unterwegs parsen: Teil-JSON ist zwischendurch ungültig.
              partialJson.set(index, (partialJson.get(index) ?? '') + delta.partial_json)
            }
            break
          }

          case 'content_block_stop': {
            const index = event.index ?? 0
            const raw = partialJson.get(index)
            if (raw !== undefined && blocks[index]) {
              try {
                blocks[index].input = raw.length > 0 ? JSON.parse(raw) : {}
              } catch {
                // Sollte nicht vorkommen. Wenn doch, ist der Wunsch
                // unbrauchbar — dann ein leeres Objekt, und die Prüfung in
                // apply.ts lehnt ihn mit einer klaren Meldung ab.
                blocks[index].input = {}
              }
            }
            break
          }

          case 'message_delta':
            if (event.delta?.stop_reason) stopReason = event.delta.stop_reason
            break

          default:
            break
        }
      }
    }
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') return null
    handlers.onError(
      `Die Verbindung ist abgebrochen: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return null
  }

  const content = blocks.filter((block): block is RawBlock => block !== undefined)
  const toolCalls: ToolCall[] = content
    .filter((block) => block.type === 'tool_use')
    .map((block) => ({
      id: String(block.id ?? ''),
      name: String(block.name ?? ''),
      input: (block.input ?? {}) as Record<string, unknown>,
    }))

  return { text, toolCalls, content, stopReason }
}
