import { describe, expect, it, vi } from 'vitest'
import { parseCoachStream, type StreamHandlers } from './stream'

/**
 * Baut einen Datenstrom aus SSE-Ereignissen.
 *
 * `chunkSize` schneidet die Bytes willkürlich klein — damit wird geprüft, was
 * im Netz wirklich passiert: Ein Ereignis kommt über zwei Pakete verteilt an,
 * mitten in einem Wort oder mitten im JSON.
 */
function streamOf(events: readonly unknown[], chunkSize = 1024): ReadableStream<Uint8Array> {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
  const bytes = new TextEncoder().encode(body)
  let offset = 0
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize))
      offset += chunkSize
    },
  })
}

function handlers(): StreamHandlers & { chunks: string[]; errors: string[]; thought: number } {
  const chunks: string[] = []
  const errors: string[] = []
  const state = {
    chunks,
    errors,
    thought: 0,
    onText: (chunk: string) => chunks.push(chunk),
    onThinking: () => {
      state.thought += 1
    },
    onError: (message: string) => errors.push(message),
  }
  return state
}

const TEXT_ANSWER = [
  { type: 'message_start' },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Heute ' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Beine.' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
  { type: 'message_stop' },
]

/** Denken zuerst, dann ein Werkzeugwunsch — der reale Ablauf bei Opus 5. */
const TOOL_ANSWER = [
  { type: 'message_start' },
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: 'Der Nutzer will mehr Arme.' },
  },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'text_delta', text: 'Ich verschiebe etwas Volumen.' },
  },
  { type: 'content_block_stop', index: 1 },
  {
    type: 'content_block_start',
    index: 2,
    content_block: { type: 'tool_use', id: 'toolu_1', name: 'set_focus', input: {} },
  },
  // Das JSON kommt in Stücken, die einzeln UNGÜLTIG sind.
  {
    type: 'content_block_delta',
    index: 2,
    delta: { type: 'input_json_delta', partial_json: '{"muscle": "Biz' },
  },
  {
    type: 'content_block_delta',
    index: 2,
    delta: { type: 'input_json_delta', partial_json: 'eps", "direction": "mo' },
  },
  {
    type: 'content_block_delta',
    index: 2,
    delta: { type: 'input_json_delta', partial_json: 're", "reason": "Wunsch"}' },
  },
  { type: 'content_block_stop', index: 2 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
  { type: 'message_stop' },
]

describe('parseCoachStream', () => {
  it('setzt Text aus den Stücken zusammen', async () => {
    const h = handlers()
    const result = await parseCoachStream(streamOf(TEXT_ANSWER), h)
    expect(result?.text).toBe('Heute Beine.')
    expect(result?.stopReason).toBe('end_turn')
    expect(h.errors).toEqual([])
  })

  it('meldet jedes Stück sofort — sonst wirkt die App eingefroren', async () => {
    const h = handlers()
    await parseCoachStream(streamOf(TEXT_ANSWER), h)
    expect(h.chunks).toEqual(['Heute ', 'Beine.'])
  })

  it('setzt ein über Pakete zerschnittenes Ereignis richtig zusammen', async () => {
    // 7 Byte pro Paket zerreißt jedes Ereignis mehrfach. Ohne Puffer über
    // die Paketgrenze hinweg käme hier nichts oder Müll heraus.
    for (const size of [1, 3, 7, 13, 64]) {
      const h = handlers()
      const result = await parseCoachStream(streamOf(TEXT_ANSWER, size), h)
      expect(result?.text, `Paketgröße ${size}`).toBe('Heute Beine.')
      expect(h.errors, `Paketgröße ${size}`).toEqual([])
    }
  })

  it('parst den Werkzeugwunsch erst am Blockende', async () => {
    // DER Fehlerfall: „{"muscle": "Biz" ist als JSON ungültig. Wer unterwegs
    // parst, bekommt entweder eine Ausnahme oder — schlimmer — ein
    // halbfertiges Objekt und ruft mit falschen Werten auf.
    const h = handlers()
    const result = await parseCoachStream(streamOf(TOOL_ANSWER), h)
    expect(result?.toolCalls).toEqual([
      {
        id: 'toolu_1',
        name: 'set_focus',
        input: { muscle: 'Bizeps', direction: 'more', reason: 'Wunsch' },
      },
    ])
    expect(result?.stopReason).toBe('tool_use')
  })

  it('parst den Werkzeugwunsch auch bei zerschnittenen Paketen', async () => {
    for (const size of [1, 5, 11, 40]) {
      const result = await parseCoachStream(streamOf(TOOL_ANSWER, size), handlers())
      expect(result?.toolCalls[0]?.input, `Paketgröße ${size}`).toEqual({
        muscle: 'Bizeps',
        direction: 'more',
        reason: 'Wunsch',
      })
    }
  })

  it('behält die Denkblöcke unverändert für die Fortsetzung', async () => {
    // Werden Denkblöcke beim Zurücksenden weggelassen oder verändert, lehnt
    // die API die nächste Runde ab — und die Werkzeugantwort käme nie an.
    const result = await parseCoachStream(streamOf(TOOL_ANSWER), handlers())
    const typen = (result?.content ?? []).map((block) => (block as { type: string }).type)
    expect(typen).toEqual(['thinking', 'text', 'tool_use'])
    const denk = result?.content[0] as { thinking: string }
    expect(denk.thinking).toBe('Der Nutzer will mehr Arme.')
  })

  it('meldet das Denken genau einmal', async () => {
    const h = handlers()
    await parseCoachStream(streamOf(TOOL_ANSWER), h)
    expect(h.thought).toBe(1)
  })

  it('gibt den sichtbaren Text neben dem Werkzeugwunsch zurück', async () => {
    const result = await parseCoachStream(streamOf(TOOL_ANSWER), handlers())
    expect(result?.text).toBe('Ich verschiebe etwas Volumen.')
  })

  it('reicht einen Serverfehler als Klartext weiter', async () => {
    const h = handlers()
    await parseCoachStream(
      streamOf([{ type: 'coach_error', message: 'Guthaben aufgebraucht.' }]),
      h,
    )
    expect(h.errors).toEqual(['Guthaben aufgebraucht.'])
  })

  it('übergeht unbekannte Ereignisse und kaputte Zeilen', async () => {
    // Die API bekommt mit der Zeit neue Ereignistypen. Sie dürfen den Chat
    // nicht anhalten.
    const body = new TextEncoder().encode(
      'data: {"type":"etwas_neues"}\n\n' +
        'data: kein json\n\n' +
        ': ein Kommentar\n\n' +
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}\n\n' +
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}\n\n',
    )
    const h = handlers()
    const result = await parseCoachStream(
      new ReadableStream({
        start(controller) {
          controller.enqueue(body)
          controller.close()
        },
      }),
      h,
    )
    expect(result?.text).toBe('ok')
    expect(h.errors).toEqual([])
  })

  it('liefert bei kaputtem Werkzeug-JSON ein leeres Objekt statt eines Absturzes', async () => {
    // Dann greift die Prüfung in apply.ts und lehnt mit klarer Meldung ab —
    // besser als ein Aufruf mit erratenen Werten.
    const result = await parseCoachStream(
      streamOf([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 't1', name: 'set_focus' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"muscle": "Biz' },
        },
        { type: 'content_block_stop', index: 0 },
      ]),
      handlers(),
    )
    expect(result?.toolCalls[0]?.input).toEqual({})
  })

  it('bricht bei einem Lesefehler mit einer Meldung ab, nicht mit einer Ausnahme', async () => {
    const h = handlers()
    const result = await parseCoachStream(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('Verbindung verloren'))
        },
      }),
      h,
    )
    expect(result).toBeNull()
    expect(h.errors.join(' ')).toMatch(/abgebrochen/)
  })

  it('verwechselt zwei Werkzeugwünsche in einer Antwort nicht', async () => {
    // „Mehr Arme" ruft zweimal auf. Werden die Teil-JSONs nicht je Blockindex
    // getrennt gesammelt, entsteht daraus ein einziger unsinniger Aufruf.
    const result = await parseCoachStream(
      streamOf([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 't1', name: 'set_focus' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"muscle":"Bizeps"}' },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 't2', name: 'set_focus' },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{"muscle":"Trizeps"}' },
        },
        { type: 'content_block_stop', index: 1 },
      ]),
      handlers(),
    )
    expect(result?.toolCalls.map((call) => call.input)).toEqual([
      { muscle: 'Bizeps' },
      { muscle: 'Trizeps' },
    ])
  })
})

// Kein Netzzugriff in diesen Tests — falls doch, soll es auffallen.
vi.stubGlobal('fetch', () => {
  throw new Error('Diese Tests dürfen nicht ins Netz.')
})
