// ====================================================================
//  Export
//
//  Erzeugt die app-unabhängige Sicherungsdatei (docs/ARCHITECTURE.md §5).
//  Wird wöchentlich automatisch und jederzeit manuell aufgerufen.
// ====================================================================

import { dumpAll } from '../data/db'
import { equipment, exercises } from '../data'
import { nowIso } from '../domain/ids'
import { RECORD_KINDS, type AnyRecord, type RecordKind } from '../domain/records'
import {
  APP_VERSION,
  EXPORT_README,
  GENERATOR,
  SCHEMA_VERSION,
  type ExportBundle,
  type ExportRecords,
} from './format'

/** Baut das vollständige Export-Paket aus dem lokalen Datenbestand. */
export async function buildExportBundle(userId: string): Promise<ExportBundle> {
  const dump = await dumpAll(userId)

  // Zwischenspeicher mit einheitlichem Typ; die genaue Zuordnung pro
  // Datensatzart stellt `RECORD_KINDS` sicher.
  const collected: Record<RecordKind, AnyRecord[]> = {} as Record<RecordKind, AnyRecord[]>
  const counts = {} as Record<RecordKind, number>

  for (const kind of RECORD_KINDS) {
    const list = dump[kind] ?? []
    // Nach Entstehungszeit sortieren — macht die Datei für Menschen lesbar
    // und Vergleiche zwischen zwei Exporten stabil.
    const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    collected[kind] = sorted
    counts[kind] = sorted.length
  }

  const records = collected as unknown as ExportRecords

  return {
    schemaVersion: SCHEMA_VERSION,
    generator: GENERATOR,
    appVersion: APP_VERSION,
    exportedAt: nowIso(),
    profileId: userId,
    // Schnappschuss der Nachschlagedaten: ohne ihn ist "BRU-001" später
    // nicht mehr auflösbar.
    equipmentReference: equipment,
    exercisesReference: exercises,
    records,
    counts,
    readme: EXPORT_README,
  }
}

/** Export als JSON-Text. Eingerückt, damit die Datei lesbar bleibt. */
export async function exportJson(userId: string): Promise<string> {
  const bundle = await buildExportBundle(userId)
  return JSON.stringify(bundle, null, 2)
}

/** Dateiname mit Datum und Profil — sortiert sich von allein. */
export function exportFileName(
  displayName: string,
  at: Date = new Date(),
  extension = 'json',
): string {
  const day = at.toISOString().slice(0, 10)
  const safeName = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `fitness-coach-${safeName || 'profil'}-${day}.${extension}`
}
