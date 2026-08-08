// ====================================================================
//  Lokale Persistenz (IndexedDB)
//
//  Zwei Eigenschaften sind hier nicht verhandelbar:
//
//  1. SOFORT SICHER. Jeder Satz ist nach dem Antippen gespeichert, nicht
//     erst am Trainingsende (docs/ARCHITECTURE.md §3). Absturz, Akku leer,
//     App weggewischt — der Satz ist da.
//
//  2. ATOMAR MIT DER SYNC-WARTESCHLANGE. Datensatz und Warteschlangen-
//     Eintrag werden in DERSELBEN Transaktion geschrieben. Andernfalls
//     könnte ein Satz lokal existieren, aber nie in die Cloud gelangen —
//     ein stiller Datenverlust, der erst beim Gerätewechsel auffällt.
//
//  Profil-Trennung: pro Profil eine EIGENE Datenbank. Ein Profilwechsel
//  kann damit prinzipiell keine Daten vermischen (docs/ARCHITECTURE.md §6).
// ====================================================================

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { nowIso } from '../domain/ids'
import { RECORD_KINDS, type AnyRecord, type RecordKind, type RecordTypes } from '../domain/records'

const SCHEMA_VERSION = 1

/** Ein Eintrag in der Sync-Warteschlange. */
export interface OutboxEntry {
  /** `kind:recordId` — verhindert Doppeleinträge für denselben Datensatz. */
  key: string
  kind: RecordKind
  recordId: string
  /** Laufende Nummer, erhält die Reihenfolge über Wiederholungen hinweg. */
  seq: number
  enqueuedAt: string
  attempts: number
  lastAttemptAt: string | null
  lastError: string | null
}

interface MetaEntry {
  key: string
  value: string
}

interface CoachDB extends DBSchema {
  profiles: { key: string; value: RecordTypes['profiles'] }
  strengthReferences: {
    key: string
    value: RecordTypes['strengthReferences']
    indexes: { byExercise: string }
  }
  plans: { key: string; value: RecordTypes['plans'] }
  sessions: {
    key: string
    value: RecordTypes['sessions']
    indexes: { byScheduledFor: string; byStatus: string }
  }
  setLogs: {
    key: string
    value: RecordTypes['setLogs']
    indexes: { bySession: string; byExercise: string; byLoggedAt: string }
  }
  checkins: { key: string; value: RecordTypes['checkins']; indexes: { byWeek: string } }
  bodyMetrics: {
    key: string
    value: RecordTypes['bodyMetrics']
    indexes: { byMeasuredOn: string }
  }
  nutritionTargets: {
    key: string
    value: RecordTypes['nutritionTargets']
    indexes: { byEffectiveFrom: string }
  }
  adjustments: {
    key: string
    value: RecordTypes['adjustments']
    indexes: { byAppliedAt: string; byScope: string }
  }
  outbox: { key: string; value: OutboxEntry; indexes: { bySeq: number } }
  meta: { key: string; value: MetaEntry }
}

/** Datenbankname pro Profil — die härteste Form der Trennung. */
export function databaseName(userId: string): string {
  return `fitness-coach.${userId}`
}

const openConnections = new Map<string, Promise<IDBPDatabase<CoachDB>>>()

export function openLocalDb(userId: string): Promise<IDBPDatabase<CoachDB>> {
  const name = databaseName(userId)
  const existing = openConnections.get(name)
  if (existing) return existing

  const promise = openDB<CoachDB>(name, SCHEMA_VERSION, {
    upgrade(db) {
      // Version 1: alle Stores anlegen. Künftige Migrationen kommen als
      // zusätzliche Blöcke dazu, damit bestehende Daten erhalten bleiben.
      if (!db.objectStoreNames.contains('profiles')) {
        db.createObjectStore('profiles', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('strengthReferences')) {
        const s = db.createObjectStore('strengthReferences', { keyPath: 'id' })
        s.createIndex('byExercise', 'exerciseId')
      }
      if (!db.objectStoreNames.contains('plans')) {
        db.createObjectStore('plans', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id' })
        s.createIndex('byScheduledFor', 'scheduledFor')
        s.createIndex('byStatus', 'status')
      }
      if (!db.objectStoreNames.contains('setLogs')) {
        const s = db.createObjectStore('setLogs', { keyPath: 'id' })
        s.createIndex('bySession', 'sessionId')
        s.createIndex('byExercise', 'exerciseId')
        s.createIndex('byLoggedAt', 'loggedAt')
      }
      if (!db.objectStoreNames.contains('checkins')) {
        const s = db.createObjectStore('checkins', { keyPath: 'id' })
        s.createIndex('byWeek', 'weekOf')
      }
      if (!db.objectStoreNames.contains('bodyMetrics')) {
        const s = db.createObjectStore('bodyMetrics', { keyPath: 'id' })
        s.createIndex('byMeasuredOn', 'measuredOn')
      }
      if (!db.objectStoreNames.contains('nutritionTargets')) {
        const s = db.createObjectStore('nutritionTargets', { keyPath: 'id' })
        s.createIndex('byEffectiveFrom', 'effectiveFrom')
      }
      if (!db.objectStoreNames.contains('adjustments')) {
        const s = db.createObjectStore('adjustments', { keyPath: 'id' })
        s.createIndex('byAppliedAt', 'appliedAt')
        s.createIndex('byScope', 'scope')
      }
      if (!db.objectStoreNames.contains('outbox')) {
        const s = db.createObjectStore('outbox', { keyPath: 'key' })
        s.createIndex('bySeq', 'seq')
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' })
      }
    },
  })

  openConnections.set(name, promise)
  return promise
}

/** Schließt die Verbindung — nötig beim Profilwechsel. */
export async function closeLocalDb(userId: string): Promise<void> {
  const name = databaseName(userId)
  const promise = openConnections.get(name)
  if (!promise) return
  openConnections.delete(name)
  const db = await promise
  db.close()
}

const SEQ_KEY = 'outbox.nextSeq'

async function nextSeq(db: IDBPDatabase<CoachDB>): Promise<number> {
  // Eigener Zähler statt autoIncrement: Der Warteschlangen-Schlüssel ist
  // `kind:recordId`, damit ein mehrfach geänderter Datensatz nur EINEN
  // Eintrag hat. Die Reihenfolge braucht deshalb ein separates Feld.
  const tx = db.transaction('meta', 'readwrite')
  const current = await tx.store.get(SEQ_KEY)
  const value = current ? Number(current.value) : 1
  await tx.store.put({ key: SEQ_KEY, value: String(value + 1) })
  await tx.done
  return value
}

/**
 * Schreibt einen Datensatz und setzt ihn in einem Zug auf die
 * Sync-Warteschlange.
 *
 * `updatedAt` wird immer neu gesetzt — es ist der Cursor, an dem die
 * Gegenseite erkennt, was neu ist.
 */
export async function putRecord<K extends RecordKind>(
  userId: string,
  kind: K,
  record: RecordTypes[K],
  options: { enqueue?: boolean; touchUpdatedAt?: boolean } = {},
): Promise<RecordTypes[K]> {
  const db = await openLocalDb(userId)
  const enqueue = options.enqueue ?? true
  // Beim Import bleibt `updatedAt` unverändert: Es ist ein Datenfeld des
  // Originals, keine Sync-Buchhaltung. Die Übertragung steuert allein die
  // Warteschlange.
  const touch = options.touchUpdatedAt ?? true

  const stored = (touch ? { ...record, updatedAt: nowIso() } : { ...record }) as RecordTypes[K]
  const key = `${kind}:${record.id}`

  // Reihenfolge-Nummer VOR der Haupttransaktion holen, damit die
  // Haupttransaktion nur zwei Stores anfasst und nicht quer sperrt.
  const seq = enqueue ? await nextSeq(db) : 0

  const tx = db.transaction([kind, 'outbox'], 'readwrite')
  // Beide Schreibvorgänge in EINER Transaktion — entweder beides oder nichts.
  await (tx.objectStore(kind) as never as { put(v: unknown): Promise<unknown> }).put(stored)

  if (enqueue) {
    const outbox = tx.objectStore('outbox')
    const existing = await outbox.get(key)
    await outbox.put({
      key,
      kind,
      recordId: record.id,
      // Bestehende Reihenfolge beibehalten: Ein zweimal geänderter Satz
      // soll seine Position in der Warteschlange nicht verlieren.
      seq: existing?.seq ?? seq,
      enqueuedAt: existing?.enqueuedAt ?? nowIso(),
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
    })
  }

  await tx.done
  return stored
}

/**
 * Übernimmt einen Datensatz von der Gegenseite, OHNE ihn erneut in die
 * Warteschlange zu legen — sonst würde er endlos hin und her wandern.
 *
 * Ein NEUERER lokaler Stand wird nicht überschrieben. Diese Bedingung ist
 * die letzte Absicherung gegen Datenverlust und sitzt bewusst hier, an der
 * einen Stelle, durch die alles von außen Kommende muss: Ohne sie könnte
 * eine Wiederherstellung lokal noch nicht hochgeladene Sätze mit einem
 * älteren Cloud-Stand überschreiben — also genau die Arbeit vernichten, die
 * sie retten soll.
 *
 * Rückgabe: `true`, wenn geschrieben wurde.
 */
export async function putRemoteRecord<K extends RecordKind>(
  userId: string,
  kind: K,
  record: RecordTypes[K],
): Promise<boolean> {
  const db = await openLocalDb(userId)
  const tx = db.transaction(kind, 'readwrite')
  const store = tx.objectStore(kind) as never as {
    get(key: string): Promise<RecordTypes[K] | undefined>
    put(value: unknown): Promise<unknown>
  }

  const existing = await store.get(record.id)
  if (existing && existing.updatedAt > record.updatedAt) {
    await tx.done
    return false
  }

  await store.put(record)
  await tx.done
  return true
}

export async function getRecord<K extends RecordKind>(
  userId: string,
  kind: K,
  id: string,
): Promise<RecordTypes[K] | undefined> {
  const db = await openLocalDb(userId)
  return (await db.get(kind, id)) as RecordTypes[K] | undefined
}

/** Alle nicht gelöschten Datensätze einer Art. */
export async function listRecords<K extends RecordKind>(
  userId: string,
  kind: K,
  options: { includeDeleted?: boolean } = {},
): Promise<RecordTypes[K][]> {
  const db = await openLocalDb(userId)
  const all = (await db.getAll(kind)) as RecordTypes[K][]
  if (options.includeDeleted) return all
  return all.filter((r) => r.deletedAt === null)
}

/** Weiches Löschen — bleibt synchronisierbar. */
export async function softDelete<K extends RecordKind>(
  userId: string,
  kind: K,
  id: string,
): Promise<void> {
  const existing = await getRecord(userId, kind, id)
  if (!existing) return
  await putRecord(userId, kind, { ...existing, deletedAt: nowIso() } as RecordTypes[K])
}

// ────────────────────────────────────────────────────────────────────
//  Warteschlange
// ────────────────────────────────────────────────────────────────────

/** Wartende Einträge in Reihenfolge ihrer Entstehung. */
export async function pendingOutbox(
  userId: string,
  limit = 200,
): Promise<OutboxEntry[]> {
  const db = await openLocalDb(userId)
  const entries = await db.getAllFromIndex('outbox', 'bySeq')
  return entries.slice(0, limit)
}

export async function outboxCount(userId: string): Promise<number> {
  const db = await openLocalDb(userId)
  return db.count('outbox')
}

/** Erfolgreich übertragen — Eintrag entfernen. */
export async function clearOutboxEntries(userId: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const db = await openLocalDb(userId)
  const tx = db.transaction('outbox', 'readwrite')
  for (const key of keys) await tx.store.delete(key)
  await tx.done
}

/** Fehlversuch vermerken — der Eintrag bleibt in der Warteschlange. */
export async function markOutboxFailure(
  userId: string,
  key: string,
  error: string,
): Promise<void> {
  const db = await openLocalDb(userId)
  const tx = db.transaction('outbox', 'readwrite')
  const entry = await tx.store.get(key)
  if (entry) {
    await tx.store.put({
      ...entry,
      attempts: entry.attempts + 1,
      lastAttemptAt: nowIso(),
      lastError: error.slice(0, 500),
    })
  }
  await tx.done
}

/** Lädt die Datensätze zu Warteschlangen-Einträgen. */
export async function resolveOutbox(
  userId: string,
  entries: OutboxEntry[],
): Promise<{ entry: OutboxEntry; record: AnyRecord }[]> {
  const db = await openLocalDb(userId)
  const out: { entry: OutboxEntry; record: AnyRecord }[] = []
  for (const entry of entries) {
    const record = (await db.get(entry.kind, entry.recordId)) as AnyRecord | undefined
    if (record) out.push({ entry, record })
  }
  return out
}

// ────────────────────────────────────────────────────────────────────
//  Metadaten
// ────────────────────────────────────────────────────────────────────

export async function getMeta(userId: string, key: string): Promise<string | null> {
  const db = await openLocalDb(userId)
  const entry = await db.get('meta', key)
  return entry?.value ?? null
}

export async function setMeta(userId: string, key: string, value: string): Promise<void> {
  const db = await openLocalDb(userId)
  await db.put('meta', { key, value })
}

/** Vollständiger lokaler Datenbestand — Grundlage des Exports. */
export async function dumpAll(
  userId: string,
): Promise<Record<RecordKind, AnyRecord[]>> {
  const out = {} as Record<RecordKind, AnyRecord[]>
  for (const kind of RECORD_KINDS) {
    out[kind] = (await listRecords(userId, kind, { includeDeleted: true })) as AnyRecord[]
  }
  return out
}
