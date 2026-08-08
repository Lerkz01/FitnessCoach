// ====================================================================
//  Umwandlung Datensatz ↔ Datenbankzeile
//
//  Bewusst von der Netzkommunikation getrennt: Diese Umwandlung ist die
//  Stelle, an der Daten still verloren gehen können, und sie muss ohne
//  Cloud-Konto prüfbar sein.
//
//  Die Zeile führt vier Felder doppelt (`id`, `created_at`, `updated_at`,
//  `deleted_at`) — einmal als Spalte für Index und Cursor, einmal innerhalb
//  von `data`. Der Rückweg liest sie AUSSCHLIESSLICH aus `data`: Das ist der
//  unveränderte Datensatz der App. Würden die Spalten gewinnen, wäre eine
//  Abweichung zwischen Spalte und Inhalt eine stille Datenveränderung.
// ====================================================================

import { RECORD_KINDS, type AnyRecord, type RecordKind } from '../domain/records'
import type { PushItem } from './adapter'

/** Eine Zeile der Tabelle `records`. */
export interface RecordRow {
  id: string
  kind: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  data: unknown
}

/** Datensatz → Zeile, wie sie `upsert_records` erwartet. */
export function toRow(item: PushItem): Omit<RecordRow, 'data'> & { data: AnyRecord } {
  return {
    id: item.record.id,
    kind: item.kind,
    created_at: item.record.createdAt,
    updated_at: item.record.updatedAt,
    deleted_at: item.record.deletedAt,
    data: item.record,
  }
}

const KNOWN = new Set<string>(RECORD_KINDS)

/**
 * Zeile → Datensatz. `null`, wenn die Zeile unbrauchbar ist.
 *
 * Unbrauchbare Zeilen werden ÜBERSPRUNGEN, nicht als Fehler geworfen: Eine
 * einzelne kaputte Zeile — etwa von einer neueren App-Version mit
 * unbekannter Datensatzart — darf nicht verhindern, dass die anderen
 * zehntausend zurückgeladen werden. Genau dieser Fall ist die
 * Wiederherstellung nach einem Totalverlust.
 */
export function fromRow(row: RecordRow): PushItem | null {
  if (!KNOWN.has(row.kind)) return null

  const data = row.data
  if (data === null || typeof data !== 'object') return null

  const record = data as Partial<AnyRecord>
  // Ohne diese vier Felder ist der Datensatz für die lokale Ablage
  // unbrauchbar: `id` ist der Schlüssel, `updatedAt` der Sync-Cursor.
  if (typeof record.id !== 'string' || record.id === '') return null
  if (typeof record.userId !== 'string') return null
  if (typeof record.createdAt !== 'string') return null
  if (typeof record.updatedAt !== 'string') return null

  return { kind: row.kind as RecordKind, record: record as AnyRecord }
}

/** Wandelt eine Antwort um und meldet, was übersprungen wurde. */
export function fromRows(rows: readonly RecordRow[]): {
  items: PushItem[]
  skipped: number
} {
  const items: PushItem[] = []
  let skipped = 0
  for (const row of rows) {
    const item = fromRow(row)
    if (item === null) skipped += 1
    else items.push(item)
  }
  return { items, skipped }
}

/**
 * Cursor aus einer Zeilenmenge.
 *
 * Genommen wird das MAXIMUM, nicht der letzte Eintrag: Die Sortierung der
 * Antwort ist nicht garantiert, und ein zu kleiner Cursor würde Zeilen
 * doppelt holen — ein zu großer würde sie überspringen und damit dauerhaft
 * verlieren.
 */
export function cursorOf(rows: readonly RecordRow[], fallback: string | null): string | null {
  let max = fallback
  for (const row of rows) {
    if (typeof row.updated_at !== 'string') continue
    if (max === null || row.updated_at > max) max = row.updated_at
  }
  return max
}
