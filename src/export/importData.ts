// ====================================================================
//  Import
//
//  Der Import ist die einzige echte Garantie dafür, dass der Export
//  brauchbar ist (docs/ARCHITECTURE.md §5). Ein Export, der noch nie
//  eingelesen wurde, ist ein Versprechen — kein Backup.
//
//  Deshalb wird er zusammen mit dem Export gebaut und im Round-Trip-Test
//  bewiesen, nicht nachträglich angeflanscht.
// ====================================================================

import { listRecords, putRecord } from '../data/db'
import {
  RECORD_KINDS,
  type AnyRecord,
  type RecordKind,
  type RecordTypes,
} from '../domain/records'
import { isReadable, majorVersion, SCHEMA_VERSION, type ExportBundle } from './format'

export interface ImportOptions {
  /**
   * Schreibt alle Datensätze auf das Zielprofil um. Ohne das könnte ein
   * Export nicht in ein neues Konto zurückgelesen werden — der häufigste
   * Wiederherstellungsfall überhaupt.
   */
  remapUserId?: boolean
  /** Wiederhergestellte Daten in die Cloud übertragen. */
  enqueueForSync?: boolean
  /**
   * `merge` (Standard): Bei gleicher ID gewinnt der neuere Stand.
   * `replace`: Die Importdatei gewinnt immer.
   */
  conflict?: 'merge' | 'replace'
}

export interface ImportResult {
  imported: Record<RecordKind, number>
  skipped: Record<RecordKind, number>
  warnings: string[]
  schemaVersion: string
  exportedAt: string
}

export class ImportError extends Error {}

/** Prüft Grundstruktur und Lesbarkeit, bevor irgendetwas geschrieben wird. */
export function validateBundle(input: unknown): ExportBundle {
  if (typeof input !== 'object' || input === null) {
    throw new ImportError('Die Datei enthält kein gültiges Export-Objekt.')
  }
  const bundle = input as Partial<ExportBundle>

  if (typeof bundle.schemaVersion !== 'string') {
    throw new ImportError('Der Datei fehlt die Angabe "schemaVersion".')
  }
  if (!isReadable(bundle.schemaVersion)) {
    throw new ImportError(
      `Diese Datei hat Format-Version ${bundle.schemaVersion}, diese App liest Version ` +
        `${majorVersion(SCHEMA_VERSION)}.x. ` +
        (majorVersion(bundle.schemaVersion) > majorVersion(SCHEMA_VERSION)
          ? 'Die Datei ist neuer als die App — bitte die App aktualisieren.'
          : 'Die Datei ist zu alt für diese App-Version.'),
    )
  }
  if (typeof bundle.records !== 'object' || bundle.records === null) {
    throw new ImportError('Der Datei fehlt der Abschnitt "records".')
  }

  // Eingehende Datei ist ungeprüft — deshalb bewusst über `unknown` lesen.
  const rawRecords = bundle.records as unknown as Record<string, unknown>
  for (const kind of RECORD_KINDS) {
    const list = rawRecords[kind]
    if (list !== undefined && !Array.isArray(list)) {
      throw new ImportError(`Der Abschnitt "records.${kind}" ist keine Liste.`)
    }
  }

  return bundle as ExportBundle
}

/**
 * Liest ein Export-Paket in ein Profil ein.
 *
 * Die Datensätze werden mit ihrem ORIGINAL-`updatedAt` geschrieben — es ist
 * ein Datenfeld, keine Sync-Buchhaltung. Für die Übertragung sorgt allein
 * die Warteschlange.
 */
export async function importBundle(
  userId: string,
  input: unknown,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const bundle = validateBundle(input)
  const remap = options.remapUserId ?? true
  const enqueue = options.enqueueForSync ?? true
  const conflict = options.conflict ?? 'merge'

  const imported = {} as Record<RecordKind, number>
  const skipped = {} as Record<RecordKind, number>
  const warnings: string[] = []

  // Referenzdaten prüfen: Fehlen sie, ist die Datei nicht selbsterklärend.
  if (!Array.isArray(bundle.exercisesReference) || bundle.exercisesReference.length === 0) {
    warnings.push(
      'Die Datei enthält keinen Übungs-Schnappschuss. Übungs-IDs lassen sich ' +
        'dann nur mit der aktuellen Datenbank auflösen.',
    )
  }

  for (const kind of RECORD_KINDS) {
    imported[kind] = 0
    skipped[kind] = 0

    const incoming = ((bundle.records as unknown as Record<string, AnyRecord[] | undefined>)[
      kind
    ] ?? []) as AnyRecord[]
    if (incoming.length === 0) continue

    // Bestehende Stände einmalig einlesen, statt pro Datensatz abzufragen.
    const existing = await listRecords(userId, kind, { includeDeleted: true })
    const existingById = new Map(existing.map((r) => [r.id, r]))

    for (const raw of incoming) {
      if (typeof raw?.id !== 'string' || raw.id.length === 0) {
        skipped[kind] += 1
        warnings.push(`Ein Datensatz in "${kind}" hat keine ID und wurde übersprungen.`)
        continue
      }

      const record = (remap ? { ...raw, userId } : raw) as RecordTypes[typeof kind]

      const current = existingById.get(record.id)
      if (current && conflict === 'merge') {
        // Neuerer Stand gewinnt. Bei Gleichstand bleibt der lokale erhalten,
        // damit ein wiederholter Import nichts verändert.
        if (current.updatedAt >= record.updatedAt) {
          skipped[kind] += 1
          continue
        }
      }

      await putRecord(userId, kind, record, { enqueue, touchUpdatedAt: false })
      imported[kind] += 1
    }

    // Vollständigkeitsprüfung gegen die mitgelieferten Zählwerte.
    const declared = bundle.counts?.[kind]
    if (typeof declared === 'number' && declared !== incoming.length) {
      warnings.push(
        `"${kind}": Die Datei nennt ${declared} Datensätze, enthält aber ${incoming.length}.`,
      )
    }
  }

  return {
    imported,
    skipped,
    warnings,
    schemaVersion: bundle.schemaVersion,
    exportedAt: bundle.exportedAt ?? 'unbekannt',
  }
}

/** Bequemer Weg von der Datei zum Import. */
export async function importJson(
  userId: string,
  json: string,
  options: ImportOptions = {},
): Promise<ImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new ImportError('Die Datei ist kein gültiges JSON.')
  }
  return importBundle(userId, parsed, options)
}
