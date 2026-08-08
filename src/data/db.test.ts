import { beforeEach, describe, expect, it } from 'vitest'
import { newId, nowIso } from '../domain/ids'
import { baseFields, type SetLog } from '../domain/records'
import {
  clearOutboxEntries,
  closeLocalDb,
  databaseName,
  dumpAll,
  getRecord,
  listRecords,
  outboxCount,
  pendingOutbox,
  putRecord,
  putRemoteRecord,
  resolveOutbox,
  softDelete,
} from './db'

/** Jeder Test bekommt ein eigenes Profil — also eine eigene Datenbank. */
let userId: string

beforeEach(async () => {
  userId = newId()
})

function makeSetLog(overrides: Partial<SetLog> = {}): SetLog {
  const id = overrides.id ?? newId()
  const at = nowIso()
  return {
    ...baseFields(userId, id, at),
    sessionId: 'session-1',
    exerciseId: 'BRU-001',
    exerciseName: 'Langhantel Bankdrücken flach',
    orderIndex: 0,
    setNumber: 1,
    isWarmup: false,
    prescribedWeightKg: 82.5,
    prescribedReps: 8,
    prescribedSeconds: null,
    prescribedRir: 2,
    actualWeightKg: 82.5,
    actualReps: 8,
    actualSeconds: null,
    feedback: 'as_planned',
    rirDelta: 0,
    abandoned: false,
    loggedAt: at,
    deviceId: 'test-device',
    supersedesId: null,
    ...overrides,
  }
}

describe('Profil-Trennung', () => {
  it('nutzt pro Profil eine eigene Datenbank', () => {
    expect(databaseName('a')).not.toBe(databaseName('b'))
    expect(databaseName('a')).toContain('a')
  })

  it('trennt die Daten zweier Profile vollständig', async () => {
    const luca = newId()
    const partner = newId()

    await putRecord(luca, 'setLogs', {
      ...makeSetLog(),
      userId: luca,
    })

    expect(await listRecords(luca, 'setLogs')).toHaveLength(1)
    expect(await listRecords(partner, 'setLogs')).toHaveLength(0)

    await closeLocalDb(luca)
    await closeLocalDb(partner)
  })
})

describe('putRecord — Schreiben und Warteschlange in einem Zug', () => {
  it('speichert den Datensatz sofort', async () => {
    const log = makeSetLog()
    await putRecord(userId, 'setLogs', log)

    const found = await getRecord(userId, 'setLogs', log.id)
    expect(found?.actualReps).toBe(8)
  })

  it('legt denselben Datensatz gleichzeitig in die Warteschlange', async () => {
    // Das ist die Kernzusicherung: Es darf keinen Zustand geben, in dem ein
    // Satz lokal existiert, aber nie synchronisiert würde.
    const log = makeSetLog()
    await putRecord(userId, 'setLogs', log)

    const queue = await pendingOutbox(userId)
    expect(queue).toHaveLength(1)
    expect(queue[0].kind).toBe('setLogs')
    expect(queue[0].recordId).toBe(log.id)
    expect(queue[0].attempts).toBe(0)
  })

  it('setzt updatedAt bei jedem Schreiben neu', async () => {
    const log = makeSetLog({ updatedAt: '2020-01-01T00:00:00.000Z' })
    const stored = await putRecord(userId, 'setLogs', log)
    expect(stored.updatedAt).not.toBe('2020-01-01T00:00:00.000Z')
  })

  it('erzeugt für einen zweimal geänderten Datensatz nur EINEN Warteschlangen-Eintrag', async () => {
    const log = makeSetLog()
    await putRecord(userId, 'setLogs', log)
    await putRecord(userId, 'setLogs', { ...log, actualReps: 9 })

    expect(await outboxCount(userId)).toBe(1)
    const found = await getRecord(userId, 'setLogs', log.id)
    expect(found?.actualReps).toBe(9)
  })

  it('behält die Position in der Warteschlange beim erneuten Ändern', async () => {
    const erst = makeSetLog()
    const zweit = makeSetLog()

    await putRecord(userId, 'setLogs', erst)
    await putRecord(userId, 'setLogs', zweit)
    // Erster Satz wird korrigiert — er soll seinen Platz behalten,
    // damit die Reihenfolge der Übertragung stabil bleibt.
    await putRecord(userId, 'setLogs', { ...erst, actualReps: 10 })

    const queue = await pendingOutbox(userId)
    expect(queue.map((e) => e.recordId)).toEqual([erst.id, zweit.id])
  })

  it('erhält die Reihenfolge mehrerer Sätze', async () => {
    const ids: string[] = []
    for (let i = 1; i <= 5; i++) {
      const log = makeSetLog({ setNumber: i })
      ids.push(log.id)
      await putRecord(userId, 'setLogs', log)
    }
    const queue = await pendingOutbox(userId)
    expect(queue.map((e) => e.recordId)).toEqual(ids)
  })
})

describe('putRemoteRecord — Gegenrichtung', () => {
  it('legt übernommene Datensätze NICHT in die Warteschlange', async () => {
    // Sonst würde derselbe Datensatz endlos hin und her wandern.
    const log = makeSetLog()
    await putRemoteRecord(userId, 'setLogs', log)

    expect(await getRecord(userId, 'setLogs', log.id)).toBeDefined()
    expect(await outboxCount(userId)).toBe(0)
  })
})

describe('Weiches Löschen', () => {
  it('markiert statt zu entfernen und bleibt synchronisierbar', async () => {
    const log = makeSetLog()
    await putRecord(userId, 'setLogs', log)
    await clearOutboxEntries(userId, [`setLogs:${log.id}`])

    await softDelete(userId, 'setLogs', log.id)

    const roh = await getRecord(userId, 'setLogs', log.id)
    expect(roh?.deletedAt).not.toBeNull()

    // Aus normalen Abfragen verschwunden …
    expect(await listRecords(userId, 'setLogs')).toHaveLength(0)
    // … aber vorhanden und zur Übertragung vorgemerkt.
    expect(await listRecords(userId, 'setLogs', { includeDeleted: true })).toHaveLength(1)
    expect(await outboxCount(userId)).toBe(1)
  })
})

describe('resolveOutbox', () => {
  it('lädt die Datensätze zu den Warteschlangen-Einträgen', async () => {
    const log = makeSetLog()
    await putRecord(userId, 'setLogs', log)

    const queue = await pendingOutbox(userId)
    const resolved = await resolveOutbox(userId, queue)

    expect(resolved).toHaveLength(1)
    expect(resolved[0].record.id).toBe(log.id)
  })
})

describe('dumpAll — Grundlage des Exports', () => {
  it('liefert alle Datensatzarten, auch gelöschte', async () => {
    const log = makeSetLog()
    await putRecord(userId, 'setLogs', log)
    await softDelete(userId, 'setLogs', log.id)

    const dump = await dumpAll(userId)
    expect(dump.setLogs).toHaveLength(1)
    expect(dump.checkins).toEqual([])
    // Gelöschte müssen mit, sonst wäre der Export keine vollständige Kopie.
    expect(dump.setLogs[0].deletedAt).not.toBeNull()
  })
})
