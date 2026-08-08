import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeLocalDb, listRecords, outboxCount, putRecord } from '../data/db'
import { newId, nowIso } from '../domain/ids'
import type { PlannedExercise, SetLog, WorkoutSession } from '../domain/records'
import { MemoryAdapter } from './adapter'
import { hasAnyRecords, localCounts, restoreFromCloud } from './restore'
import { SyncEngine } from './sync'

function planned(overrides: Partial<PlannedExercise> = {}): PlannedExercise {
  return {
    exerciseId: 'BRU-001',
    exerciseName: 'Bankdrücken',
    orderIndex: 0,
    sets: 3,
    targetReps: 8,
    repRangeMin: 6,
    repRangeMax: 10,
    targetSeconds: null,
    targetRir: 2,
    restSeconds: 150,
    weightKg: 60,
    warmups: [],
    selectionReason: null,
    ...overrides,
  }
}

function session(userId: string): WorkoutSession {
  const at = nowIso()
  return {
    id: newId(),
    userId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    planId: null,
    label: 'Oberkörper A',
    scheduledFor: '2026-08-03',
    startedAt: at,
    completedAt: at,
    status: 'completed',
    planned: [planned()],
    sessionFeeling: 2,
    notes: null,
  }
}

function setLog(userId: string, sessionId: string, setNumber: number): SetLog {
  const at = nowIso()
  return {
    id: newId(),
    userId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    sessionId,
    exerciseId: 'BRU-001',
    exerciseName: 'Bankdrücken',
    orderIndex: 0,
    setNumber,
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
    loggedAt: at,
    deviceId: 'geraet-1',
    supersedesId: null,
  }
}

let userId: string

beforeEach(async () => {
  if (userId) await closeLocalDb(userId)
  userId = newId()
})

// ────────────────────────────────────────────────────────────────────

describe('Totalverlust und Wiederherstellung', () => {
  it('bringt einen kompletten Trainingsverlauf zurück', async () => {
    const adapter = new MemoryAdapter()

    // ── Gerät 1: trainieren und hochladen ──
    const s = session(userId)
    await putRecord(userId, 'sessions', s)
    for (const number of [1, 2, 3]) {
      await putRecord(userId, 'setLogs', setLog(userId, s.id, number))
    }

    const engine = new SyncEngine({ userId, adapter, isOnline: () => true })
    await engine.flush()
    expect(await outboxCount(userId)).toBe(0)

    // ── Der Totalverlust: die lokale Ablage ist weg ──
    await closeLocalDb(userId)
    indexedDB.deleteDatabase(`fitness-coach.${userId}`)
    await new Promise((r) => setTimeout(r, 20))
    expect(await hasAnyRecords(userId)).toBe(false)

    // ── Anmelden gibt dieselbe Kennung → alles zurückholen ──
    const result = await restoreFromCloud({ userId, adapter })

    expect(result.written).toBe(4)
    expect(result.hadLocalData).toBe(false)
    expect(result.perKind.sessions).toBe(1)
    expect(result.perKind.setLogs).toBe(3)

    const sessions = await listRecords(userId, 'sessions')
    const logs = await listRecords(userId, 'setLogs')
    expect(sessions).toHaveLength(1)
    expect(logs).toHaveLength(3)
    // Der Datensatz ist unverändert — nicht nur die Anzahl stimmt.
    expect(sessions[0].planned[0].exerciseName).toBe('Bankdrücken')
    expect(logs.every((log) => log.actualReps === 8)).toBe(true)
  })

  it('legt die zurückgeholten Sätze NICHT erneut in die Warteschlange', async () => {
    // Sonst schickt die App nach jeder Wiederherstellung alles zurück, was
    // die Cloud längst hat.
    const adapter = new MemoryAdapter()
    const s = session(userId)
    await putRecord(userId, 'sessions', s)
    await putRecord(userId, 'setLogs', setLog(userId, s.id, 1))

    const engine = new SyncEngine({ userId, adapter, isOnline: () => true })
    await engine.flush()

    await closeLocalDb(userId)
    indexedDB.deleteDatabase(`fitness-coach.${userId}`)
    await new Promise((r) => setTimeout(r, 20))

    await restoreFromCloud({ userId, adapter })
    expect(await outboxCount(userId)).toBe(0)
  })

  it('setzt den Cursor, damit der Betrieb nicht alles erneut holt', async () => {
    const adapter = new MemoryAdapter()
    await putRecord(userId, 'sessions', session(userId))

    const engine = new SyncEngine({ userId, adapter, isOnline: () => true })
    await engine.flush()

    await closeLocalDb(userId)
    indexedDB.deleteDatabase(`fitness-coach.${userId}`)
    await new Promise((r) => setTimeout(r, 20))

    await restoreFromCloud({ userId, adapter })

    const pullsVorher = adapter.pullCalls
    const engine2 = new SyncEngine({ userId, adapter, isOnline: () => true })
    await engine2.flush()

    // Ein Abruf findet statt, holt aber nichts mehr.
    expect(adapter.pullCalls).toBe(pullsVorher + 1)
    expect(await listRecords(userId, 'sessions')).toHaveLength(1)
  })

  it('überschreibt lokal Neueres NICHT mit einem älteren Cloud-Stand', async () => {
    // Der gefährlichste Fall: Wer noch nicht hochgeladene Sätze hat und die
    // Wiederherstellung antippt, darf sie nicht verlieren.
    const adapter = new MemoryAdapter()

    const s = session(userId)
    await putRecord(userId, 'sessions', s)
    const engine = new SyncEngine({ userId, adapter, isOnline: () => true })
    await engine.flush()

    // Lokal ändern, aber NICHT hochladen (offline).
    const geaendert: WorkoutSession = {
      ...s,
      notes: 'Rückenschmerzen, letzte Übung ausgelassen',
      updatedAt: new Date(Date.parse(s.updatedAt) + 60_000).toISOString(),
    }
    await putRecord(userId, 'sessions', geaendert, { touchUpdatedAt: false })

    const result = await restoreFromCloud({ userId, adapter })

    expect(result.keptLocal).toBe(1)
    expect(result.written).toBe(0)
    const [stored] = await listRecords(userId, 'sessions')
    expect(stored.notes).toBe('Rückenschmerzen, letzte Übung ausgelassen')
  })

  it('führt zusammen, statt zu ersetzen, wenn lokal schon Daten liegen', async () => {
    const adapter = new MemoryAdapter()

    // In der Cloud liegt eine Einheit von einem anderen Gerät.
    const fremde = session(userId)
    await adapter.push([{ kind: 'sessions', record: fremde }])

    // Lokal liegt eine eigene, noch nicht hochgeladene.
    const eigene = session(userId)
    await putRecord(userId, 'sessions', eigene)

    const result = await restoreFromCloud({ userId, adapter })

    expect(result.hadLocalData).toBe(true)
    const sessions = await listRecords(userId, 'sessions')
    expect(sessions).toHaveLength(2)
  })

  it('meldet den Fortschritt beim Laden', async () => {
    const adapter = new MemoryAdapter()
    const s = session(userId)
    await putRecord(userId, 'sessions', s)
    for (let i = 1; i <= 5; i++) {
      await putRecord(userId, 'setLogs', setLog(userId, s.id, i))
    }
    const engine = new SyncEngine({ userId, adapter, isOnline: () => true })
    await engine.flush()

    await closeLocalDb(userId)
    indexedDB.deleteDatabase(`fitness-coach.${userId}`)
    await new Promise((r) => setTimeout(r, 20))

    const meldungen: number[] = []
    await restoreFromCloud({
      userId,
      adapter,
      onProgress: (p) => meldungen.push(p.written),
    })

    expect(meldungen.at(-1)).toBe(6)
  })

  it('kommt mit einer leeren Cloud zurecht', async () => {
    const result = await restoreFromCloud({ userId, adapter: new MemoryAdapter() })
    expect(result.written).toBe(0)
    expect(result.hadLocalData).toBe(false)
  })
})

describe('localCounts', () => {
  it('zählt je Datensatzart', async () => {
    const s = session(userId)
    await putRecord(userId, 'sessions', s)
    await putRecord(userId, 'setLogs', setLog(userId, s.id, 1))
    await putRecord(userId, 'setLogs', setLog(userId, s.id, 2))

    const counts = await localCounts(userId)
    expect(counts.total).toBe(3)
    expect(counts.perKind.sessions).toBe(1)
    expect(counts.perKind.setLogs).toBe(2)
  })

  it('gibt null zurück, wenn nichts da ist', async () => {
    expect((await localCounts(userId)).total).toBe(0)
  })
})
