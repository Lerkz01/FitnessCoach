// ====================================================================
//  Supabase als Gegenseite
//
//  Erfüllt `RemoteAdapter`. Zwei Regeln, aus denen sich alles ergibt:
//
//  1. Verbindungsfehler WERFEN. Nur dann greift die Wartezeit des
//     Sync-Motors, und nur dann bleibt der Eintrag in der Warteschlange.
//     Ein geschluckter Fehler würde Datensätze stillschweigend verlieren.
//
//  2. Inhaltliche Ablehnungen einzelner Datensätze landen in `failed`,
//     nicht als Ausnahme — sonst blockiert ein kaputter Eintrag alle
//     anderen.
// ====================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PullOutcome, PushItem, PushOutcome, RemoteAdapter } from './adapter'
import { cursorOf, fromRows, toRow, type RecordRow } from './rows'

/**
 * Wie viele Zeilen ein Abruf höchstens liefert.
 *
 * Die Wiederherstellung nach einem Totalverlust holt zehntausende Sätze. Ohne
 * Seitenweise-Abruf liefe das in das Zeilenlimit von Supabase (Standard 1000)
 * — und dann fehlten Daten, ohne dass ein Fehler auftritt. Das ist der
 * gefährlichste denkbare Fall: stiller Teilverlust bei der Rettung.
 */
const PAGE_SIZE = 1000

export class SupabaseAdapter implements RemoteAdapter {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async push(items: PushItem[]): Promise<PushOutcome> {
    if (items.length === 0) return { accepted: [], failed: [] }

    const payload = items.map(toRow)
    const { data, error } = await this.client.rpc('upsert_records', { payload })

    if (error) {
      // Zwischen „keine Verbindung" und „Datensatz abgelehnt" muss
      // unterschieden werden: Das erste wird wiederholt, das zweite nicht.
      if (isPermanent(error)) {
        return {
          accepted: [],
          failed: items.map((item) => ({
            recordId: item.record.id,
            error: error.message,
            permanent: true,
          })),
        }
      }
      throw new Error(`Hochladen fehlgeschlagen: ${error.message}`)
    }

    const accepted = new Set<string>(
      Array.isArray(data)
        ? data
            .map((row) => (row as { id?: unknown }).id)
            .filter((id): id is string => typeof id === 'string')
        : [],
    )

    // Nicht bestätigte Datensätze werden als VORÜBERGEHEND fehlgeschlagen
    // gemeldet — nicht als dauerhaft und nicht stillschweigend übergangen.
    //
    // „Dauerhaft" würde sie nach wenigen Versuchen aussortieren, also
    // verlieren. Sie einfach weglassen wäre aber genauso falsch: Ohne
    // gemeldeten Fehlversuch bleibt `attempts` auf 0, die Wartezeit greift
    // nie, und weil nach jedem Satz ein Abgleich angefragt wird, entstünde
    // ein Wiederholungssturm.
    const failed = items
      .filter((item) => !accepted.has(item.record.id))
      .map((item) => ({
        recordId: item.record.id,
        error: 'Gegenseite hat den Datensatz nicht bestätigt',
        permanent: false,
      }))

    return { accepted: [...accepted], failed }
  }

  async pull(cursor: string | null): Promise<PullOutcome> {
    const all: RecordRow[] = []
    let from = 0

    // Seitenweise, bis eine Seite nicht mehr voll ist. Die Bedingung bleibt
    // über alle Seiten GLEICH — würde sie mitwandern, überspränge der
    // Versatz Zeilen.
    for (;;) {
      let query = this.client
        .from('records')
        .select('id, kind, created_at, updated_at, deleted_at, data')
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)

      if (cursor !== null) query = query.gt('updated_at', cursor)

      const { data, error } = await query
      if (error) throw new Error(`Abrufen fehlgeschlagen: ${error.message}`)

      const rows = (data ?? []) as RecordRow[]
      all.push(...rows)
      if (rows.length < PAGE_SIZE) break

      from += PAGE_SIZE
      // Sicherheitsnetz gegen eine Endlosschleife, falls die Gegenseite
      // wider Erwarten immer volle Seiten liefert.
      if (all.length > 500_000) break
    }

    const { items, skipped } = fromRows(all)
    if (skipped > 0) {
      // Kein Abbruch: Eine unlesbare Zeile darf die Wiederherstellung der
      // übrigen nicht verhindern. Sichtbar wird es trotzdem.
      console.warn(`${skipped} Zeilen übersprungen (unbekannte Art oder unvollständig)`)
    }

    return { items, cursor: cursorOf(all, cursor) }
  }
}

/**
 * Ist der Fehler dauerhaft?
 *
 * Postgres-Fehlercodes der Klassen 22 (Datenausnahme) und 23
 * (Integritätsverletzung) sowie 42 (Syntax/Zugriff) beschreiben ein Problem
 * mit dem Datensatz oder dem Schema. Wiederholen hilft dort nie. Alles
 * andere — Zeitüberschreitung, Netzabbruch, 5xx — wird wiederholt.
 */
function isPermanent(error: { code?: string; message?: string }): boolean {
  const code = error.code ?? ''
  return /^(22|23|42)/.test(code)
}
