import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { SetLog } from '../domain/records'
import type { PushItem } from './adapter'
import { SupabaseAdapter } from './supabaseAdapter'
import type { RecordRow } from './rows'

function setLog(id: string, updatedAt = '2026-08-01T10:00:00.000Z'): SetLog {
  return {
    id,
    userId: 'u1',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt,
    deletedAt: null,
    sessionId: 's1',
    exerciseId: 'BRU-001',
    exerciseName: 'Bankdrücken',
    orderIndex: 0,
    setNumber: 1,
    isWarmup: false,
    prescribedWeightKg: 60,
    prescribedReps: 8,
    prescribedSeconds: null,
    prescribedRir: 2,
    actualWeightKg: 60,
    actualReps: 8,
    actualSeconds: null,
    feedback: 'as_planned',
    rirDelta: 0,
    abandoned: false,
    loggedAt: '2026-08-01T10:00:00.000Z',
    deviceId: 'd1',
    supersedesId: null,
  }
}

function items(...ids: string[]): PushItem[] {
  return ids.map((id) => ({ kind: 'setLogs' as const, record: setLog(id) }))
}

function rowFor(id: string, updatedAt: string): RecordRow {
  const record = setLog(id, updatedAt)
  return {
    id,
    kind: 'setLogs',
    created_at: record.createdAt,
    updated_at: updatedAt,
    deleted_at: null,
    data: record,
  }
}

// ── Nachgebaute Gegenseite ──────────────────────────────────────────

/**
 * Minimaler Ersatz für den Supabase-Client.
 *
 * Nachgebaut wird nur, was der Adapter benutzt: `rpc` und die
 * Abfragekette `from().select().order().order().range().gt()`. Damit ist der
 * Adapter ohne Cloud-Konto prüfbar — inklusive der Seitenweise-Logik, die
 * sich sonst erst bei zehntausend Datensätzen zeigt.
 */
function fakeClient(options: {
  rpc?: (payload: unknown) => { data: unknown; error: unknown }
  pages?: RecordRow[][]
  selectError?: { message: string }
}) {
  const calls = { rpc: 0, ranges: [] as [number, number][], gt: [] as (string | null)[] }
  let pageIndex = 0

  const client = {
    rpc: (_name: string, args: { payload: unknown }) => {
      calls.rpc += 1
      const result = options.rpc?.(args.payload) ?? { data: [], error: null }
      return Promise.resolve(result)
    },
    from: () => {
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      builder.select = chain
      builder.order = chain
      builder.range = (a: number, b: number) => {
        calls.ranges.push([a, b])
        return builder
      }
      builder.gt = (_col: string, value: string) => {
        calls.gt.push(value)
        return builder
      }
      // Die Kette wird erwartet (await), also braucht sie `then`.
      builder.then = (resolve: (value: unknown) => unknown) => {
        if (options.selectError) {
          return Promise.resolve(resolve({ data: null, error: options.selectError }))
        }
        const page = options.pages?.[pageIndex] ?? []
        pageIndex += 1
        return Promise.resolve(resolve({ data: page, error: null }))
      }
      return builder
    },
  }

  return { client: client as unknown as SupabaseClient, calls }
}

// ────────────────────────────────────────────────────────────────────

describe('push', () => {
  it('bestätigt die Kennungen, die die Gegenseite zurückgibt', async () => {
    const { client } = fakeClient({
      rpc: () => ({ data: [{ id: 'a' }, { id: 'b' }], error: null }),
    })
    const outcome = await new SupabaseAdapter(client).push(items('a', 'b'))

    expect(outcome.accepted.sort()).toEqual(['a', 'b'])
    expect(outcome.failed).toEqual([])
  })

  it('sendet den Datensatz vollständig mit', async () => {
    let gesendet: unknown = null
    const { client } = fakeClient({
      rpc: (payload) => {
        gesendet = payload
        return { data: [{ id: 'a' }], error: null }
      },
    })
    await new SupabaseAdapter(client).push(items('a'))

    const rows = gesendet as { id: string; kind: string; data: SetLog }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('setLogs')
    expect(rows[0].data.actualReps).toBe(8)
  })

  it('meldet nicht bestätigte Datensätze als VORÜBERGEHEND fehlgeschlagen', async () => {
    // Weder verschweigen noch aussortieren: Verschweigen lässt `attempts`
    // auf 0 und erzeugt einen Wiederholungssturm, Aussortieren verliert den
    // Satz.
    const { client } = fakeClient({ rpc: () => ({ data: [{ id: 'a' }], error: null }) })
    const outcome = await new SupabaseAdapter(client).push(items('a', 'b'))

    expect(outcome.accepted).toEqual(['a'])
    expect(outcome.failed).toHaveLength(1)
    expect(outcome.failed[0].recordId).toBe('b')
    expect(outcome.failed[0].permanent).toBe(false)
  })

  it('WIRFT bei einem Verbindungsfehler', async () => {
    // Nur dann greift die Wartezeit des Motors und der Eintrag bleibt liegen.
    const { client } = fakeClient({
      rpc: () => ({ data: null, error: { message: 'network', code: undefined } }),
    })
    await expect(new SupabaseAdapter(client).push(items('a'))).rejects.toThrow(
      /Hochladen fehlgeschlagen/,
    )
  })

  it('meldet einen Schemaverstoß als dauerhaft, statt zu werfen', async () => {
    // Sonst blockiert ein kaputter Eintrag alle anderen für immer.
    const { client } = fakeClient({
      rpc: () => ({ data: null, error: { message: 'ungültiger Wert', code: '22P02' } }),
    })
    const outcome = await new SupabaseAdapter(client).push(items('a'))

    expect(outcome.accepted).toEqual([])
    expect(outcome.failed[0].permanent).toBe(true)
  })

  it('schickt bei leerer Liste keine Anfrage', async () => {
    const { client, calls } = fakeClient({})
    const outcome = await new SupabaseAdapter(client).push([])
    expect(calls.rpc).toBe(0)
    expect(outcome.accepted).toEqual([])
  })
})

describe('pull', () => {
  it('gibt die Datensätze und den neuen Cursor zurück', async () => {
    const { client } = fakeClient({
      pages: [
        [
          rowFor('a', '2026-08-01T00:00:00.000Z'),
          rowFor('b', '2026-08-02T00:00:00.000Z'),
        ],
      ],
    })
    const outcome = await new SupabaseAdapter(client).pull(null)

    expect(outcome.items.map((i) => i.record.id)).toEqual(['a', 'b'])
    expect(outcome.cursor).toBe('2026-08-02T00:00:00.000Z')
  })

  it('holt seitenweise weiter, bis eine Seite nicht mehr voll ist', async () => {
    // DER kritische Fall der Wiederherstellung: Supabase liefert höchstens
    // 1000 Zeilen. Ohne Seitenweise-Abruf fehlten die restlichen — ohne
    // jeden Fehler. Stiller Teilverlust genau beim Retten.
    const volleSeite = Array.from({ length: 1000 }, (_, i) =>
      rowFor(`a${i}`, '2026-08-01T00:00:00.000Z'),
    )
    const restSeite = [rowFor('letzter', '2026-08-05T00:00:00.000Z')]

    const { client, calls } = fakeClient({ pages: [volleSeite, restSeite] })
    const outcome = await new SupabaseAdapter(client).pull(null)

    expect(outcome.items).toHaveLength(1001)
    expect(calls.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(outcome.cursor).toBe('2026-08-05T00:00:00.000Z')
  })

  it('hält die Cursor-Bedingung über alle Seiten gleich', async () => {
    // Würde sie mitwandern, überspränge der Versatz Zeilen.
    const volleSeite = Array.from({ length: 1000 }, (_, i) =>
      rowFor(`a${i}`, `2026-08-01T00:00:0${i % 10}.000Z`),
    )
    const { client, calls } = fakeClient({ pages: [volleSeite, []] })
    await new SupabaseAdapter(client).pull('2026-07-01T00:00:00.000Z')

    expect(calls.gt).toEqual([
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    ])
  })

  it('lädt beim ersten Abruf ohne Cursor alles', async () => {
    const { client, calls } = fakeClient({ pages: [[rowFor('a', '2026-08-01T00:00:00.000Z')]] })
    await new SupabaseAdapter(client).pull(null)
    expect(calls.gt).toEqual([])
  })

  it('überspringt unlesbare Zeilen und lädt die übrigen', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const kaputt: RecordRow = { ...rowFor('x', '2026-08-01T00:00:00.000Z'), data: null }

    const { client } = fakeClient({
      pages: [[rowFor('a', '2026-08-01T00:00:00.000Z'), kaputt]],
    })
    const outcome = await new SupabaseAdapter(client).pull(null)

    expect(outcome.items.map((i) => i.record.id)).toEqual(['a'])
    // Der Cursor berücksichtigt AUCH die übersprungene Zeile — sonst würde
    // sie bei jedem Abruf erneut geholt.
    expect(outcome.cursor).toBe('2026-08-01T00:00:00.000Z')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('WIRFT bei einem Abruffehler', async () => {
    const { client } = fakeClient({ selectError: { message: 'timeout' } })
    await expect(new SupabaseAdapter(client).pull(null)).rejects.toThrow(
      /Abrufen fehlgeschlagen/,
    )
  })
})
