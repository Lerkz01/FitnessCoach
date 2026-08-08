import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeLocalDb, listRecords, outboxCount } from '../data/db'
import { analyzeSession } from '../domain/history'
import { newId } from '../domain/ids'
import type { PlannedExercise } from '../domain/records'
import {
  abandonSession,
  completeSession,
  correctSet,
  logSet,
  setSlots,
  startSession,
} from './session'

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
    warmups: [
      { weightKg: 20, reps: 10 },
      { weightKg: 40, reps: 5 },
    ],
    selectionReason: 'Schwere Grundübung für Brust',
    ...overrides,
  }
}

let userId: string

beforeEach(async () => {
  if (userId) await closeLocalDb(userId)
  userId = newId()
})

describe('setSlots — Satzfolge einer Übung', () => {
  it('setzt Aufwärmsätze vor die Arbeitssätze', () => {
    const slots = setSlots(planned())
    expect(slots.map((s) => s.isWarmup)).toEqual([true, true, false, false, false])
  })

  it('nummeriert Arbeitssätze ab 1 und Aufwärmsätze darunter', () => {
    // Stabile Nummerierung: Wird ein Aufwärmsatz übersprungen, verschiebt
    // sich kein Arbeitssatz.
    const slots = setSlots(planned())
    expect(slots.map((s) => s.setNumber)).toEqual([-1, 0, 1, 2, 3])
  })

  it('übernimmt die Aufwärmgewichte', () => {
    const slots = setSlots(planned())
    expect(slots[0].weightKg).toBe(20)
    expect(slots[1].weightKg).toBe(40)
    expect(slots[2].weightKg).toBe(60)
  })

  it('kommt ohne Aufwärmsätze zurecht', () => {
    const slots = setSlots(planned({ warmups: [], sets: 2 }))
    expect(slots.map((s) => s.setNumber)).toEqual([1, 2])
  })

  it('führt zeitbasierte Übungen mit Sekunden', () => {
    const slots = setSlots(
      planned({ warmups: [], sets: 2, targetReps: null, targetSeconds: 45 }),
    )
    expect(slots[0].seconds).toBe(45)
    expect(slots[0].reps).toBeNull()
  })
})

describe('startSession', () => {
  it('friert die Vorgabe beim Start ein', async () => {
    const exercise = planned()
    await startSession({
      userId,
      planId: 'p1',
      label: 'Oberkörper A',
      exercises: [exercise],
    })

    // Spätere Änderung am Original darf die Einheit nicht verändern —
    // sonst wäre der Vergleich Vorgabe/Wirklichkeit hinterher wertlos.
    exercise.weightKg = 999
    const stored = await listRecords(userId, 'sessions')
    expect(stored[0].planned[0].weightKg).toBe(60)
  })

  it('schreibt die Einheit sofort und stellt sie in die Warteschlange', async () => {
    await startSession({ userId, planId: null, label: 'Test', exercises: [planned()] })
    const stored = await listRecords(userId, 'sessions')
    expect(stored).toHaveLength(1)
    expect(stored[0].status).toBe('active')
    expect(stored[0].startedAt).not.toBeNull()
    expect(await outboxCount(userId)).toBe(1)
  })
})

describe('logSet', () => {
  it('schreibt jeden Satz einzeln und sofort', async () => {
    const session = await startSession({
      userId,
      planId: null,
      label: 'Test',
      exercises: [planned()],
    })
    const exercise = session.planned[0]

    for (const setNumber of [1, 2, 3]) {
      await logSet({
        userId,
        session,
        exercise,
        setNumber,
        isWarmup: false,
        actualWeightKg: 60,
        actualReps: 8,
        feedback: 'as_planned',
      })
      // Nach jedem Satz muss er auf der Platte sein — nicht erst am Ende.
      const logs = await listRecords(userId, 'setLogs')
      expect(logs).toHaveLength(setNumber)
    }
  })

  it('hält Vorgabe und Wirklichkeit getrennt', async () => {
    const session = await startSession({
      userId,
      planId: null,
      label: 'Test',
      exercises: [planned()],
    })

    await logSet({
      userId,
      session,
      exercise: session.planned[0],
      setNumber: 1,
      isWarmup: false,
      // Gerät besetzt, an einem anderen mit 65 kg trainiert
      actualWeightKg: 65,
      actualReps: 7,
      feedback: 'at_limit',
    })

    const [log] = await listRecords(userId, 'setLogs')
    expect(log.prescribedWeightKg).toBe(60)
    expect(log.prescribedReps).toBe(8)
    expect(log.actualWeightKg).toBe(65)
    expect(log.actualReps).toBe(7)
  })

  it('leitet die RIR-Abweichung aus dem Abgleich ab', async () => {
    const session = await startSession({
      userId,
      planId: null,
      label: 'Test',
      exercises: [planned()],
    })

    await logSet({
      userId,
      session,
      exercise: session.planned[0],
      setNumber: 1,
      isWarmup: false,
      actualWeightKg: 60,
      actualReps: 10,
      feedback: 'more_left',
    })

    const [log] = await listRecords(userId, 'setLogs')
    expect(log.rirDelta).toBe(1.5)
  })

  it('gibt Aufwärmsätzen keine Progressionsvorgabe', async () => {
    const session = await startSession({
      userId,
      planId: null,
      label: 'Test',
      exercises: [planned()],
    })

    await logSet({
      userId,
      session,
      exercise: session.planned[0],
      setNumber: 0,
      isWarmup: true,
      prescribedWeightKg: 40,
      actualWeightKg: 40,
      actualReps: 5,
      feedback: null,
    })

    const [log] = await listRecords(userId, 'setLogs')
    expect(log.isWarmup).toBe(true)
    expect(log.prescribedReps).toBeNull()
    expect(log.prescribedRir).toBeNull()
    // Das Gewicht wird trotzdem festgehalten — es gehört zum Verlauf.
    expect(log.prescribedWeightKg).toBe(40)
  })

  it('hält eine Korrektur aus Regelkreis 1 als Vorgabe des Satzes fest', async () => {
    const session = await startSession({
      userId,
      planId: null,
      label: 'Test',
      exercises: [planned()],
    })

    // Satz 1 zeigte, dass 60 kg zu leicht war → Satz 2 mit 62,5 kg
    await logSet({
      userId,
      session,
      exercise: session.planned[0],
      setNumber: 2,
      isWarmup: false,
      prescribedWeightKg: 62.5,
      actualWeightKg: 62.5,
      actualReps: 8,
      feedback: 'as_planned',
    })

    const [log] = await listRecords(userId, 'setLogs')
    expect(log.prescribedWeightKg).toBe(62.5)
    // Die eingefrorene Einheits-Vorgabe bleibt unberührt — sie ist der
    // Anker, an dem die Bestätigungsregel das Gewicht wiedererkennt.
    const [stored] = await listRecords(userId, 'sessions')
    expect(stored.planned[0].weightKg).toBe(60)
  })

  it('merkt einen abgebrochenen Satz als solchen', async () => {
    const session = await startSession({
      userId,
      planId: null,
      label: 'Test',
      exercises: [planned()],
    })

    await logSet({
      userId,
      session,
      exercise: session.planned[0],
      setNumber: 1,
      isWarmup: false,
      actualWeightKg: 60,
      actualReps: 3,
      feedback: 'at_limit',
      abandoned: true,
    })

    const [log] = await listRecords(userId, 'setLogs')
    expect(log.abandoned).toBe(true)
  })
})

describe('correctSet', () => {
  it('überschreibt nichts, sondern hängt eine Korrektur an', async () => {
    const session = await startSession({
      userId,
      planId: null,
      label: 'Test',
      exercises: [planned()],
    })
    const exercise = session.planned[0]

    const original = await logSet({
      userId,
      session,
      exercise,
      setNumber: 1,
      isWarmup: false,
      actualWeightKg: 60,
      actualReps: 8,
      feedback: 'as_planned',
    })

    await correctSet({
      userId,
      session,
      exercise,
      setNumber: 1,
      isWarmup: false,
      actualWeightKg: 60,
      actualReps: 6,
      feedback: 'at_limit',
      supersedesId: original.id,
    })

    const logs = await listRecords(userId, 'setLogs')
    // Beide Zeilen liegen da — die Historie bleibt nachvollziehbar.
    expect(logs).toHaveLength(2)

    // Für die Auswertung zählt nur die Korrektur.
    const { exercises } = analyzeSession(logs)
    expect(exercises[0].workingSets).toBe(1)
    expect(exercises[0].volumeLoad).toBe(360)
  })
})

describe('completeSession und abandonSession', () => {
  it('schließt die Einheit ab', async () => {
    const session = await startSession({
      userId,
      planId: null,
      label: 'Test',
      exercises: [planned()],
    })

    await completeSession({ userId, session, sessionFeeling: 2 })

    const [stored] = await listRecords(userId, 'sessions')
    expect(stored.status).toBe('completed')
    expect(stored.completedAt).not.toBeNull()
    expect(stored.sessionFeeling).toBe(2)
  })

  it('behält bei Abbruch die geloggten Sätze, wertet die Einheit aber nicht', async () => {
    const session = await startSession({
      userId,
      planId: null,
      label: 'Test',
      exercises: [planned()],
    })

    await logSet({
      userId,
      session,
      exercise: session.planned[0],
      setNumber: 1,
      isWarmup: false,
      actualWeightKg: 60,
      actualReps: 8,
      feedback: 'as_planned',
    })

    await abandonSession({ userId, session })

    const [stored] = await listRecords(userId, 'sessions')
    expect(stored.status).toBe('skipped')
    expect(stored.completedAt).toBeNull()
    // Trainiert ist trainiert — der Satz bleibt.
    expect(await listRecords(userId, 'setLogs')).toHaveLength(1)
  })
})
