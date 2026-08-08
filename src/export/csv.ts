// ====================================================================
//  CSV-Export
//
//  Die JSON-Datei ist die maschinenlesbare Wahrheit. Diese CSVs sind eine
//  Bequemlichkeit für Menschen, die die Daten in Excel ansehen wollen.
//
//  Deshalb bewusst deutsche Excel-Konventionen: Semikolon als Trenner,
//  Komma als Dezimalzeichen, UTF-8 mit BOM. Mit Punkt und Komma-Trenner
//  landet in deutschem Excel alles in einer Spalte und Zahlen werden als
//  Text gelesen — dann ist die Datei praktisch unbrauchbar.
// ====================================================================

import type { BodyMetric, CheckIn, SetLog } from '../domain/records'

const DELIMITER = ';'
/** Damit Excel die Datei als UTF-8 erkennt. */
const BOM = '﻿'

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    // Deutsches Dezimalzeichen
    return String(value).replace('.', ',')
  }

  if (typeof value === 'boolean') return value ? 'ja' : 'nein'

  const text = String(value)
  if (text.includes(DELIMITER) || text.includes('"') || /[\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(DELIMITER)]
  for (const row of rows) {
    lines.push(row.map(cell).join(DELIMITER))
  }
  return BOM + lines.join('\r\n') + '\r\n'
}

/** Die wichtigste Tabelle: jeder Satz mit Vorgabe und Realität. */
export function setLogsCsv(logs: SetLog[]): string {
  const headers = [
    'Datum',
    'Zeit',
    'Einheit',
    'Übung ID',
    'Übung',
    'Satz',
    'Aufwärmsatz',
    'Vorgabe Gewicht (kg)',
    'Vorgabe Wdh',
    'Vorgabe Sekunden',
    'Vorgabe RIR',
    'Gewicht (kg)',
    'Wdh',
    'Sekunden',
    'Abgleich',
    'RIR-Abweichung',
    'Abgebrochen',
  ]

  const rows = [...logs]
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
    .map((l) => {
      const at = new Date(l.loggedAt)
      return [
        at.toISOString().slice(0, 10),
        at.toISOString().slice(11, 19),
        l.sessionId,
        l.exerciseId,
        l.exerciseName,
        l.setNumber,
        l.isWarmup,
        l.prescribedWeightKg,
        l.prescribedReps,
        l.prescribedSeconds,
        l.prescribedRir,
        l.actualWeightKg,
        l.actualReps,
        l.actualSeconds,
        feedbackLabel(l.feedback),
        l.rirDelta,
        l.abandoned,
      ]
    })

  return toCsv(headers, rows)
}

function feedbackLabel(value: SetLog['feedback']): string {
  switch (value) {
    case 'as_planned':
      return 'genau so'
    case 'more_left':
      return 'mehr drin'
    case 'at_limit':
      return 'am Limit'
    default:
      return ''
  }
}

export function checkinsCsv(checkins: CheckIn[]): string {
  const headers = [
    'Woche ab',
    'Gewicht Ø (kg)',
    'Optik',
    'Energie',
    'Schlaf',
    'Gelenke',
    'Motivation',
    'Kalorienziel getroffen',
    'Abgesendet',
    'Notiz',
  ]

  const rows = [...checkins]
    .sort((a, b) => a.weekOf.localeCompare(b.weekOf))
    .map((c) => [
      c.weekOf,
      c.weightKgAvg,
      c.looks,
      c.energy,
      c.sleep,
      c.joints,
      c.motivation,
      c.calorieAdherence,
      c.submittedAt,
      c.notes,
    ])

  return toCsv(headers, rows)
}

export function bodyMetricsCsv(metrics: BodyMetric[]): string {
  const headers = [
    'Datum',
    'Gewicht (kg)',
    'Taille (cm)',
    'Brust (cm)',
    'Hüfte (cm)',
    'Oberarm (cm)',
    'Oberschenkel (cm)',
    'Wade (cm)',
    'Körperfett-Bereich',
    'Quelle',
  ]

  const rows = [...metrics]
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))
    .map((m) => [
      m.measuredOn,
      m.weightKg,
      m.waistCm,
      m.chestCm,
      m.hipCm,
      m.armCm,
      m.thighCm,
      m.calfCm,
      m.bodyFatBucket,
      m.source,
    ])

  return toCsv(headers, rows)
}
