// ====================================================================
//  Export-Format
//
//  Das ist der Kern der App-Unabhängigkeit (docs/ARCHITECTURE.md §5).
//
//  Zwei Eigenschaften machen die Datei zukunftssicher:
//
//  1. SELBSTERKLÄREND. Der Export enthält einen Schnappschuss der
//     Geräte- und Übungsdatenbank. Ohne den wäre "BRU-001" in fünf Jahren
//     bedeutungslos, falls sich die Datenbank geändert hat. Mit ihm bringt
//     die Datei ihr eigenes Wörterbuch mit.
//
//  2. NUR ROHDATEN. Kein abgeleiteter Zustand, keine Progressionsstände.
//     Eine künftige App rechnet alles aus den Rohdaten neu — und wenn wir
//     die Coaching-Logik verbessern, kann die Historie neu durchgerechnet
//     werden.
// ====================================================================

import type { Equipment, Exercise } from '../types'
import type { RecordKind, RecordTypes } from '../domain/records'

/**
 * Version des Export-Formats.
 *
 * Erste Zahl = grundlegende Änderung (ältere Leser müssen ablehnen).
 * Zweite Zahl = rückwärtskompatible Ergänzung (ältere Leser dürfen lesen
 * und die neuen Felder ignorieren).
 */
export const SCHEMA_VERSION = '1.0'

export const GENERATOR = 'fitness-coach'

/** Wird bei jedem Export mitgeschrieben, damit Fehler zuordenbar bleiben. */
export const APP_VERSION = '0.1.0'

/** Pro Datensatzart eine Liste. Abgeleitet, damit nichts vergessen werden kann. */
export type ExportRecords = {
  [K in RecordKind]: RecordTypes[K][]
}

export interface ExportBundle {
  /** Format-Version, siehe SCHEMA_VERSION. */
  schemaVersion: string
  generator: string
  appVersion: string
  exportedAt: string
  /** Profil, aus dem exportiert wurde. Beim Import wird umgeschrieben. */
  profileId: string

  /**
   * Schnappschuss der Nachschlagedaten — macht die Datei selbsterklärend.
   * Ohne diese beiden Blöcke sind die Übungs-IDs in den Sätzen nicht
   * mehr auflösbar, sobald sich die Datenbank ändert.
   */
  equipmentReference: Equipment[]
  exercisesReference: Exercise[]

  records: ExportRecords

  /** Anzahl je Datensatzart — einfache Vollständigkeitsprüfung beim Import. */
  counts: Record<RecordKind, number>

  /** Erklärtext in der Datei selbst, für den Fall, dass sie allein auftaucht. */
  readme: string
}

export const EXPORT_README = [
  'Fitness-Coach Datenexport.',
  '',
  'Diese Datei enthält den vollständigen Trainings- und Ernährungsverlauf eines',
  'Profils als Rohdaten. Sie ist absichtlich selbsterklärend: equipmentReference',
  'und exercisesReference enthalten einen Schnappschuss der Geräte- und',
  'Übungsdatenbank, sodass die IDs in den Sätzen auch dann noch auflösbar sind,',
  'wenn sich die Datenbank später ändert.',
  '',
  'Alle Zeitstempel sind ISO 8601 in UTC. Kalendertage sind YYYY-MM-DD in',
  'lokaler Zeit. Gewichte in Kilogramm, Längen in Zentimetern, Dauern in',
  'Sekunden.',
  '',
  'Abgeleitete Werte (geschätztes 1RM, Volumen, Progressionsstand) sind NICHT',
  'enthalten — sie werden aus diesen Rohdaten berechnet. Eine neue App braucht',
  'also nur diese Datei.',
  '',
  'Feldbeschreibung: siehe docs/DATA-SCHEMA.md',
].join('\n')

/** Erste Zahl der Version — entscheidet über Lesbarkeit. */
export function majorVersion(version: string): number {
  const parsed = Number.parseInt(version.split('.')[0] ?? '', 10)
  return Number.isFinite(parsed) ? parsed : -1
}

/** Kann dieser Stand der App die Datei lesen? */
export function isReadable(version: string): boolean {
  return majorVersion(version) === majorVersion(SCHEMA_VERSION)
}
