import { describe, expect, it } from 'vitest'
import type { SetLog } from '../domain/records'
import { cursorOf, fromRow, fromRows, toRow, type RecordRow } from './rows'

function setLog(overrides: Partial<SetLog> = {}): SetLog {
  return {
    id: 'set-1',
    userId: 'u1',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
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
    ...overrides,
  }
}

function row(overrides: Partial<RecordRow> = {}): RecordRow {
  const record = setLog()
  return {
    id: record.id,
    kind: 'setLogs',
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: null,
    data: record,
    ...overrides,
  }
}

describe('toRow', () => {
  it('hebt die Cursor-Felder in Spalten, behält den Datensatz vollständig', () => {
    const record = setLog()
    const converted = toRow({ kind: 'setLogs', record })

    expect(converted.id).toBe('set-1')
    expect(converted.kind).toBe('setLogs')
    expect(converted.updated_at).toBe(record.updatedAt)
    expect(converted.deleted_at).toBeNull()
    // `data` ist der unveränderte Datensatz — kein Feld darf fehlen.
    expect(converted.data).toEqual(record)
  })

  it('überträgt ein weiches Löschen in die Spalte', () => {
    const record = setLog({ deletedAt: '2026-08-02T10:00:00.000Z' })
    expect(toRow({ kind: 'setLogs', record }).deleted_at).toBe('2026-08-02T10:00:00.000Z')
  })
})

describe('fromRow', () => {
  it('liest den Datensatz zurück', () => {
    const item = fromRow(row())
    expect(item?.kind).toBe('setLogs')
    expect(item?.record.id).toBe('set-1')
  })

  it('liest AUSSCHLIESSLICH aus data, nicht aus den Spalten', () => {
    // Weichen Spalte und Inhalt ab, gewinnt der Inhalt: Er ist der
    // Datensatz der App. Die Spalte zu bevorzugen wäre eine stille
    // Datenveränderung.
    const item = fromRow(
      row({ updated_at: '2099-01-01T00:00:00.000Z', id: 'andere-id' }),
    )
    expect(item?.record.id).toBe('set-1')
    expect(item?.record.updatedAt).toBe('2026-08-01T10:00:00.000Z')
  })

  it('überspringt unbekannte Datensatzarten', () => {
    // Eine neuere App-Version könnte Arten schreiben, die wir nicht kennen.
    expect(fromRow(row({ kind: 'zukunftsdaten' }))).toBeNull()
  })

  it('überspringt Zeilen ohne brauchbaren Inhalt', () => {
    expect(fromRow(row({ data: null }))).toBeNull()
    expect(fromRow(row({ data: 'kein Objekt' }))).toBeNull()
    expect(fromRow(row({ data: {} }))).toBeNull()
  })

  it('verlangt die vier Felder, ohne die der Datensatz unbrauchbar ist', () => {
    const record = setLog()
    for (const feld of ['id', 'userId', 'createdAt', 'updatedAt'] as const) {
      const ohne = { ...record }
      delete (ohne as Record<string, unknown>)[feld]
      expect(fromRow(row({ data: ohne })), `ohne ${feld}`).toBeNull()
    }
  })
})

describe('fromRows', () => {
  it('lädt die brauchbaren Zeilen und zählt die übersprungenen', () => {
    // Der entscheidende Fall bei der Wiederherstellung: EINE kaputte Zeile
    // darf nicht verhindern, dass die anderen zurückkommen.
    const result = fromRows([
      row({ id: 'a', data: setLog({ id: 'a' }) }),
      row({ id: 'b', kind: 'unbekannt' }),
      row({ id: 'c', data: setLog({ id: 'c' }) }),
    ])

    expect(result.items.map((i) => i.record.id)).toEqual(['a', 'c'])
    expect(result.skipped).toBe(1)
  })
})

describe('cursorOf', () => {
  it('nimmt das Maximum, nicht den letzten Eintrag', () => {
    // Die Sortierung der Antwort ist nicht garantiert. Ein zu großer Cursor
    // würde Zeilen überspringen — und damit dauerhaft verlieren.
    const cursor = cursorOf(
      [
        row({ updated_at: '2026-08-03T00:00:00.000Z' }),
        row({ updated_at: '2026-08-01T00:00:00.000Z' }),
      ],
      null,
    )
    expect(cursor).toBe('2026-08-03T00:00:00.000Z')
  })

  it('behält den alten Cursor bei leerer Antwort', () => {
    expect(cursorOf([], '2026-08-01T00:00:00.000Z')).toBe('2026-08-01T00:00:00.000Z')
  })

  it('geht nie hinter den bisherigen Cursor zurück', () => {
    const cursor = cursorOf(
      [row({ updated_at: '2026-07-01T00:00:00.000Z' })],
      '2026-08-01T00:00:00.000Z',
    )
    expect(cursor).toBe('2026-08-01T00:00:00.000Z')
  })
})
