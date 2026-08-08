// ====================================================================
//  Wiederherstellung nach Totalverlust
//
//  Der Fall, für den die ganze Sync-Mechanik existiert: Gerät weg, Speicher
//  geleert, App neu aufgesetzt. Übrig ist nur ein Konto.
//
//  Ablauf:
//    1. Anmelden → dieselbe Profilkennung wie vorher
//    2. Alles abrufen, ohne Cursor (also von Anfang an)
//    3. In die leere lokale Ablage schreiben — OHNE Warteschlange
//    4. Cursor setzen, damit der laufende Betrieb dort weitermacht
//
//  Punkt 3 ist der wichtige: Zurückgeladene Datensätze dürfen NICHT wieder
//  in die Warteschlange wandern. Sonst würde die App nach der
//  Wiederherstellung zehntausend Sätze zurückschicken, die die Cloud längst
//  hat — minutenlanger Datenverkehr für null Gewinn, und jeder davon ein
//  Anlass für Konflikte.
// ====================================================================

import { openLocalDb, putRemoteRecord, setMeta } from '../data/db'
import type { RecordKind } from '../domain/records'
import { RECORD_KINDS } from '../domain/records'
import type { RemoteAdapter } from './adapter'
import { CURSOR_KEY } from './sync'

export interface RestoreProgress {
  /** Wie viele Datensätze bisher geschrieben wurden. */
  written: number
  /** Aufteilung nach Art — das ist es, was der Nutzer wissen will. */
  perKind: Partial<Record<RecordKind, number>>
}

export interface RestoreResult extends RestoreProgress {
  /** Gab es lokal schon Daten? Dann wurde zusammengeführt, nicht ersetzt. */
  hadLocalData: boolean
  /** Datensätze, bei denen der lokale Stand neuer war und stehen blieb. */
  keptLocal: number
  cursor: string | null
}

/**
 * Holt alles aus der Cloud in die lokale Ablage.
 *
 * Vorhandene lokale Datensätze werden nur überschrieben, wenn der Stand aus
 * der Cloud NEUER ist — das übernimmt `putRemoteRecord`. Damit ist der
 * Aufruf auch dann sicher, wenn lokal noch etwas liegt, das nie hochgeladen
 * wurde: Es bleibt erhalten.
 */
export async function restoreFromCloud(input: {
  userId: string
  adapter: RemoteAdapter
  onProgress?: (progress: RestoreProgress) => void
}): Promise<RestoreResult> {
  const { userId, adapter } = input

  const hadLocalData = await hasAnyRecords(userId)

  // Ohne Cursor: von Anfang an, alles.
  const outcome = await adapter.pull(null)

  const perKind: Partial<Record<RecordKind, number>> = {}
  let written = 0
  let keptLocal = 0

  for (const item of outcome.items) {
    const kind = item.kind as RecordKind
    // `putRemoteRecord` schreibt OHNE Warteschlangen-Eintrag und lässt einen
    // NEUEREN lokalen Stand stehen.
    const stored = await putRemoteRecord(userId, kind, item.record as never)

    if (!stored) {
      // Lokal liegt etwas Neueres — vermutlich noch nicht hochgeladen.
      // Das ist kein Fehler, sondern der gewünschte Schutz.
      keptLocal += 1
      continue
    }

    written += 1
    perKind[kind] = (perKind[kind] ?? 0) + 1

    // Rückmeldung in Schritten, nicht bei jedem Satz — sonst rechnet die
    // Oberfläche mehr, als sie schreibt.
    if (written % 200 === 0) input.onProgress?.({ written, perKind })
  }

  input.onProgress?.({ written, perKind })

  // Der laufende Betrieb macht hier weiter und holt nicht alles erneut.
  if (outcome.cursor) await setMeta(userId, CURSOR_KEY, outcome.cursor)

  return { written, perKind, hadLocalData, keptLocal, cursor: outcome.cursor }
}

/** Liegt lokal überhaupt etwas? */
export async function hasAnyRecords(userId: string): Promise<boolean> {
  const db = await openLocalDb(userId)
  for (const kind of RECORD_KINDS) {
    const count = await db.count(kind)
    if (count > 0) return true
  }
  return false
}

/**
 * Zählt die lokalen Datensätze je Art.
 *
 * Grundlage für die Anzeige „so viel ist gesichert" — eine Zahl, die der
 * Nutzer mit dem vergleichen kann, was er erwartet.
 */
export async function localCounts(
  userId: string,
): Promise<{ total: number; perKind: Partial<Record<RecordKind, number>> }> {
  const db = await openLocalDb(userId)
  const perKind: Partial<Record<RecordKind, number>> = {}
  let total = 0
  for (const kind of RECORD_KINDS) {
    const count = await db.count(kind)
    if (count > 0) perKind[kind] = count
    total += count
  }
  return { total, perKind }
}
