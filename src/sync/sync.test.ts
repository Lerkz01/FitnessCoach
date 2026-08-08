import { beforeEach, describe, expect, it } from 'vitest'
import { outboxCount, pendingOutbox, putRecord, getRecord } from '../data/db'
import { newId, nowIso } from '../domain/ids'
import { baseFields, type SetLog } from '../domain/records'
import { MemoryAdapter } from './adapter'
import { backoffMs, SyncEngine } from './sync'

let userId: string

beforeEach(() => {
  userId = newId()
})

function makeSetLog(userIdArg: string, overrides: Partial<SetLog> = {}): SetLog {
  const id = overrides.id ?? newId()
  const at = overrides.createdAt ?? nowIso()
  return {
    ...baseFields(userIdArg, id, at),
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

async function logSets(count: number): Promise<SetLog[]> {
  const out: SetLog[] = []
  for (let i = 1; i <= count; i++) {
    const log = makeSetLog(userId, { setNumber: i })
    await putRecord(userId, 'setLogs', log)
    out.push(log)
  }
  return out
}

describe('backoffMs — Wartezeit zwischen Versuchen', () => {
  it('wächst exponentiell und ist nach oben begrenzt', () => {
    expect(backoffMs(0)).toBe(0)
    expect(backoffMs(1)).toBe(2000)
    expect(backoffMs(2)).toBe(4000)
    expect(backoffMs(3)).toBe(8000)
    expect(backoffMs(50)).toBe(5 * 60 * 1000) // Deckel
  })
})

describe('Live-Upload bei vorhandener Verbindung', () => {
  it('überträgt jeden Satz, nicht erst am Trainingsende', async () => {
    const adapter = new MemoryAdapter()
    const engine = new SyncEngine({ userId, adapter, isOnline: () => true })

    await logSets(1)
    await engine.flush()
    expect(adapter.store.size).toBe(1)

    // Zweiter Satz während derselben Einheit
    await logSets(1)
    await engine.flush()
    expect(adapter.store.size).toBe(2)
    expect(await outboxCount(userId)).toBe(0)
  })

  it('leert die Warteschlange nach erfolgreicher Übertragung', async () => {
    const adapter = new MemoryAdapter()
    const engine = new SyncEngine({ userId, adapter, isOnline: () => true })

    await logSets(4)
    expect(await outboxCount(userId)).toBe(4)

    const status = await engine.flush()
    expect(status.state).toBe('idle')
    expect(status.pending).toBe(0)
    expect(adapter.store.size).toBe(4)
  })
})

describe('Offline-Betrieb', () => {
  it('verliert offline keinen Satz und überträgt nichts', async () => {
    let online = false
    const adapter = new MemoryAdapter({ offline: true })
    const engine = new SyncEngine({ userId, adapter, isOnline: () => online })

    await logSets(3)
    const status = await engine.flush()

    expect(status.state).toBe('offline')
    expect(status.pending).toBe(3)
    // Ohne Verbindung darf nicht einmal ein Versuch stattfinden.
    expect(adapter.pushCalls).toBe(0)
    // Entscheidend: Die Sätze sind lokal vollständig vorhanden.
    expect(await outboxCount(userId)).toBe(3)
  })

  // ── Der wichtigste Test der Datei ────────────────────────────────
  it('holt die Warteschlange automatisch nach, sobald die Verbindung zurück ist', async () => {
    let online = false
    const adapter = new MemoryAdapter({ offline: true })
    const engine = new SyncEngine({ userId, adapter, isOnline: () => online })

    // Training im Keller ohne Netz
    const logs = await logSets(5)
    await engine.flush()
    expect(adapter.store.size).toBe(0)

    // Verbindung kommt mitten im Training zurück
    online = true
    adapter.options.offline = false
    await engine.flush()

    expect(adapter.store.size).toBe(5)
    expect(await outboxCount(userId)).toBe(0)
    for (const log of logs) {
      expect(adapter.store.has(`setLogs:${log.id}`)).toBe(true)
    }
  })

  it('überträgt in der Reihenfolge der Entstehung', async () => {
    const adapter = new MemoryAdapter()
    const engine = new SyncEngine({ userId, adapter, isOnline: () => true })

    const logs = await logSets(6)
    const queue = await pendingOutbox(userId)
    expect(queue.map((e) => e.recordId)).toEqual(logs.map((l) => l.id))

    await engine.flush()
    expect(adapter.store.size).toBe(6)
  })
})

describe('Idempotenz', () => {
  it('erzeugt bei doppelter Übertragung keinen Doppeleintrag', async () => {
    const adapter = new MemoryAdapter()
    const engine = new SyncEngine({ userId, adapter, isOnline: () => true })

    const log = makeSetLog(userId)
    await putRecord(userId, 'setLogs', log)
    await engine.flush()

    // Erneut in die Warteschlange (z.B. Korrektur) und nochmal übertragen
    await putRecord(userId, 'setLogs', { ...log, actualReps: 9 })
    await engine.flush()

    // Ein Datensatz, nicht zwei — der Schlüssel ist die geräteseitige ID.
    expect(adapter.store.size).toBe(1)
    const stored = adapter.store.get(`setLogs:${log.id}`)
    expect((stored?.record as SetLog).actualReps).toBe(9)
  })
})

describe('Fehlerbehandlung', () => {
  it('behält Einträge bei Verbindungsabbruch und versucht es später erneut', async () => {
    let online = true
    const adapter = new MemoryAdapter({ failEveryNthPush: 1 })
    const engine = new SyncEngine({
      userId,
      adapter,
      isOnline: () => online,
      // Zeit vorspulen, damit die Wartezeit nach dem Fehlversuch abgelaufen ist
      now: () => Date.now() + 60_000,
    })

    await logSets(2)
    const failed = await engine.flush()
    expect(failed.state).toBe('error')
    expect(await outboxCount(userId)).toBe(2)

    // Verbindung funktioniert wieder
    adapter.options.failEveryNthPush = undefined
    await engine.flush()
    expect(await outboxCount(userId)).toBe(0)
    expect(adapter.store.size).toBe(2)
  })

  it('wartet nach einem Fehlversuch, statt sofort erneut zu senden', async () => {
    const adapter = new MemoryAdapter({ failEveryNthPush: 1 })
    const engine = new SyncEngine({
      userId,
      adapter,
      isOnline: () => true,
      now: () => Date.now(), // keine Zeit vorspulen
    })

    await logSets(1)
    await engine.flush()
    const nachErstemVersuch = adapter.pushCalls

    adapter.options.failEveryNthPush = undefined
    await engine.flush()

    // Der Eintrag ist noch in der Wartezeit → kein neuer Versuch.
    expect(adapter.pushCalls).toBe(nachErstemVersuch)
    expect(await outboxCount(userId)).toBe(1)
  })

  it('lässt einen dauerhaft abgelehnten Datensatz die anderen nicht blockieren', async () => {
    const gift = makeSetLog(userId)
    const adapter = new MemoryAdapter({ rejectIds: new Set([gift.id]) })
    const engine = new SyncEngine({ userId, adapter, isOnline: () => true })

    await putRecord(userId, 'setLogs', gift)
    const gute = await logSets(3)

    await engine.flush()

    // Die gültigen Sätze sind durch …
    for (const log of gute) {
      expect(adapter.store.has(`setLogs:${log.id}`)).toBe(true)
    }
    // … der abgelehnte bleibt vorgemerkt und wird protokolliert.
    expect(await outboxCount(userId)).toBe(1)
    const rest = await pendingOutbox(userId)
    expect(rest[0].recordId).toBe(gift.id)
    expect(rest[0].attempts).toBe(1)
    expect(rest[0].lastError).toContain('dauerhaft')
  })
})

describe('Gegenrichtung', () => {
  it('übernimmt Änderungen von der Gegenseite', async () => {
    const adapter = new MemoryAdapter()
    const fremd = makeSetLog(userId, { setNumber: 9, actualReps: 12 })
    adapter.store.set(`setLogs:${fremd.id}`, { kind: 'setLogs', record: fremd })

    const engine = new SyncEngine({ userId, adapter, isOnline: () => true })
    await engine.flush()

    const lokal = await getRecord(userId, 'setLogs', fremd.id)
    expect(lokal?.actualReps).toBe(12)
    // Übernommene Datensätze dürfen nicht zurückgeschickt werden.
    expect(await outboxCount(userId)).toBe(0)
  })

  // ── Schutz gegen den schlimmsten denkbaren Datenverlust ──────────
  it('überschreibt noch nicht übertragene lokale Sätze NICHT', async () => {
    // Szenario: Offline geloggt, Übertragung schlägt fehl, und die
    // Gegenseite hat einen älteren Stand desselben Satzes. Würde der
    // Abruf ihn überschreiben, wäre genau die offline erbrachte Leistung
    // verloren — der Fall, den die App unbedingt verhindern muss.
    const log = makeSetLog(userId, { actualReps: 10 })

    const adapter = new MemoryAdapter({ rejectIds: new Set([log.id]) })
    adapter.store.set(`setLogs:${log.id}`, {
      kind: 'setLogs',
      record: { ...log, actualReps: 5, updatedAt: nowIso() },
    })

    await putRecord(userId, 'setLogs', log)

    const engine = new SyncEngine({ userId, adapter, isOnline: () => true })
    await engine.flush()

    const lokal = await getRecord(userId, 'setLogs', log.id)
    expect(lokal?.actualReps).toBe(10) // lokale Wahrheit bleibt erhalten
    expect(await outboxCount(userId)).toBe(1) // weiter zur Übertragung vorgemerkt
  })
})

describe('Nebenläufigkeit', () => {
  it('läuft nicht doppelt, wenn mehrere Anfragen gleichzeitig kommen', async () => {
    const adapter = new MemoryAdapter()
    const engine = new SyncEngine({ userId, adapter, isOnline: () => true })

    await logSets(3)
    await Promise.all([engine.flush(), engine.flush(), engine.flush()])

    // Ein Durchlauf reicht; parallele Anfragen werden gebündelt.
    expect(adapter.pushCalls).toBeLessThanOrEqual(2)
    expect(await outboxCount(userId)).toBe(0)
  })

  it('requestFlush wirft nie und blockiert nicht', async () => {
    const adapter = new MemoryAdapter({ offline: true })
    const engine = new SyncEngine({ userId, adapter, isOnline: () => true })

    await logSets(1)
    // Fire-and-forget: kein await, kein Fehler nach außen.
    expect(() => engine.requestFlush()).not.toThrow()
    await new Promise((r) => setTimeout(r, 20))
    expect(engine.getStatus().lastError).toBeTruthy()
  })
})
