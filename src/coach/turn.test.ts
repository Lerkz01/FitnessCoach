import { beforeEach, describe, expect, it, vi } from 'vitest'
import { closeLocalDb, listRecords } from '../data/db'
import { newId, nowIso } from '../domain/ids'
import { buildVolumePlan } from '../domain/planning'
import { baseFields, type TrainingPlan, type UserProfile } from '../domain/records'
import type { StreamResult } from './stream'
import { MAX_ROUNDS, runCoachTurn } from './turn'

// Der Netzaufruf wird ersetzt, alles andere ist echt: die Werkzeuge schreiben
// wirklich in die Datenbank und die Rückmeldung wird wirklich berechnet.
const antworten: (StreamResult | null)[] = []
vi.mock('./stream', () => ({
  askCoach: vi.fn(async () => antworten.shift() ?? null),
  coachAvailable: () => true,
}))

const at = nowIso()
const USER = 'coach-turn-test'

function profile(): UserProfile {
  return {
    ...baseFields(USER, newId(), at),
    displayName: 'Test',
    sex: 'male',
    birthYear: 2000,
    heightCm: 180,
    goal: 'muscle',
    targetWeightKg: null,
    bodyFatBucket: null,
    priorityMuscles: [],
    level: 'intermediate',
    trainingYears: '2to5y',
    knowsRir: true,
    trainingDays: ['mon', 'wed', 'fri'],
    sessionMinutes: 60,
    dailyActivity: 'light',
    injuries: [],
    blacklistedExerciseIds: [],
    disabledEquipmentIds: [],
    checkinWeekday: 'sun',
    intensity: 'demanding',
    feedbackStyle: 'rir',
    onboardingCompletedAt: at,
  }
}

function plan(): TrainingPlan {
  return {
    ...baseFields(USER, newId(), at),
    version: 1,
    splitType: '3_fullbody',
    trainingDays: ['mon', 'wed', 'fri'],
    volumeTargets: buildVolumePlan({
      level: 'intermediate',
      goal: 'muscle',
      priorityMuscles: [],
    }).start,
    activeFrom: at,
    activeUntil: null,
    reason: 'Test',
  }
}

function toolAnswer(calls: { name: string; input: Record<string, unknown> }[]): StreamResult {
  return {
    text: 'Mache ich.',
    toolCalls: calls.map((call, index) => ({ id: `t${index}`, ...call })),
    content: [
      { type: 'thinking', thinking: 'überlege' },
      { type: 'text', text: 'Mache ich.' },
      ...calls.map((call, index) => ({
        type: 'tool_use',
        id: `t${index}`,
        name: call.name,
        input: call.input,
      })),
    ],
    stopReason: 'tool_use',
  }
}

function textAnswer(text: string): StreamResult {
  return {
    text,
    toolCalls: [],
    content: [{ type: 'text', text }],
    stopReason: 'end_turn',
  }
}

function handlers() {
  const errors: string[] = []
  return { errors, onText: () => {}, onThinking: () => {}, onError: (m: string) => errors.push(m) }
}

async function run(input: {
  antwortenReihe: StreamResult[]
  frage?: string
}): ReturnType<typeof runCoachTurn> {
  antworten.length = 0
  antworten.push(...input.antwortenReihe)
  return runCoachTurn({
    messages: [{ role: 'user', content: input.frage ?? 'Mehr Arme bitte.' }],
    context: 'Kontext',
    tools: [],
    handlers: handlers(),
    apply: {
      userId: USER,
      profile: profile(),
      plan: plan(),
      adjustments: [],
      exerciseNames: new Map([['BRU-001', 'Langhantel Bankdrücken flach']]),
    },
  })
}

describe('runCoachTurn', () => {
  beforeEach(async () => {
    await closeLocalDb(USER)
    indexedDB.deleteDatabase(`fitness-coach.${USER}`)
  })

  it('führt einen Werkzeugwunsch aus und schreibt ihn in die Datenbank', async () => {
    const result = await run({
      antwortenReihe: [
        toolAnswer([
          { name: 'set_focus', input: { muscle: 'Bizeps', direction: 'more', reason: 'Wunsch' } },
        ]),
        textAnswer('Bizeps geht auf 12 Sätze.'),
      ],
    })

    expect(result.failed).toBe(false)
    expect(result.adjustments).toHaveLength(1)
    expect(result.adjustments[0].scope).toBe('coach_focus')
    expect(result.adjustments[0].targetId).toBe('Bizeps')
    expect(result.adjustments[0].circle).toBe(5)

    // Wirklich geschrieben, nicht nur zurückgegeben.
    const gespeichert = await listRecords(USER, 'adjustments')
    expect(gespeichert).toHaveLength(1)
    expect(gespeichert[0].targetId).toBe('Bizeps')
  })

  it('fügt den Text beider Runden zusammen', async () => {
    const result = await run({
      antwortenReihe: [
        toolAnswer([
          { name: 'set_focus', input: { muscle: 'Bizeps', direction: 'more', reason: 'x' } },
        ]),
        textAnswer('Fertig.'),
      ],
    })
    expect(result.text).toBe('Mache ich.\n\nFertig.')
  })

  it('gibt die Antwortblöcke unverändert zurück, Denkblöcke inklusive', async () => {
    // Wer hier filtert, bekommt von der API eine Ablehnung — und die zweite
    // Runde käme niemals an.
    const result = await run({
      antwortenReihe: [
        toolAnswer([
          { name: 'set_focus', input: { muscle: 'Bizeps', direction: 'more', reason: 'x' } },
        ]),
        textAnswer('Fertig.'),
      ],
    })
    const assistant = result.messages.find((message) => message.role === 'assistant')
    const typen = (assistant?.content as { type: string }[]).map((block) => block.type)
    expect(typen).toEqual(['thinking', 'text', 'tool_use'])
  })

  it('schickt alle Werkzeugergebnisse in EINER Nachricht', async () => {
    // Getrennt gesendet lernt das Modell, keine parallelen Aufrufe mehr zu
    // machen — dann käme „mehr Arme" nur noch für einen der beiden Muskeln.
    const result = await run({
      antwortenReihe: [
        toolAnswer([
          { name: 'set_focus', input: { muscle: 'Bizeps', direction: 'more', reason: 'x' } },
          { name: 'set_focus', input: { muscle: 'Trizeps', direction: 'more', reason: 'x' } },
        ]),
        textAnswer('Beide erhöht.'),
      ],
    })
    const userNachrichten = result.messages.filter((message) => message.role === 'user')
    // Die erste ist die Frage, die zweite trägt BEIDE Ergebnisse.
    expect(userNachrichten).toHaveLength(2)
    expect(userNachrichten[1].content as unknown[]).toHaveLength(2)
    expect(result.adjustments).toHaveLength(2)
  })

  it('sieht beim zweiten Aufruf den ersten schon', async () => {
    // „Mehr Arme" setzt Bizeps UND Trizeps. Würde der zweite Aufruf auf dem
    // alten Stand rechnen, wäre die gemeldete Wirkung falsch — beide würden
    // behaupten, sie seien der einzige Schwerpunkt.
    const result = await run({
      antwortenReihe: [
        toolAnswer([
          { name: 'set_focus', input: { muscle: 'Bizeps', direction: 'more', reason: 'x' } },
          { name: 'set_focus', input: { muscle: 'Trizeps', direction: 'more', reason: 'x' } },
        ]),
        textAnswer('ok'),
      ],
    })
    const zweiter = result.changes[1].result
    // Der zweite Bericht muss den Ausgleich für ZWEI Schwerpunkte nennen.
    expect(zweiter).toMatch(/Trizeps/)
    expect(zweiter).toMatch(/Gesamtvolumen bleibt gleich|weniger bei/)
  })

  it('lehnt einen erfundenen Muskel ab, ohne etwas zu schreiben', async () => {
    const result = await run({
      antwortenReihe: [
        toolAnswer([{ name: 'set_focus', input: { muscle: 'Arme', direction: 'more', reason: 'x' } }]),
        textAnswer('Ich meinte Bizeps und Trizeps.'),
      ],
    })
    expect(result.adjustments).toHaveLength(0)
    expect(await listRecords(USER, 'adjustments')).toHaveLength(0)
    // Und das Modell erfährt WARUM, damit es sich korrigieren kann.
    expect(result.changes[0].result).toMatch(/kein Muskel/)
  })

  it('lehnt eine erfundene Übungs-ID ab', async () => {
    const result = await run({
      antwortenReihe: [
        toolAnswer([{ name: 'avoid_exercise', input: { exerciseId: 'XYZ-999', reason: 'x' } }]),
        textAnswer('Die kenne ich nicht.'),
      ],
    })
    expect(result.adjustments).toHaveLength(0)
    expect(result.changes[0].result).toMatch(/steht nicht im aktuellen Plan/)
  })

  it('braucht ohne Werkzeugwunsch nur eine Runde', async () => {
    const result = await run({ antwortenReihe: [textAnswer('Montag ist Oberkörper.')] })
    expect(result.text).toBe('Montag ist Oberkörper.')
    expect(result.changes).toEqual([])
    expect(result.messages).toHaveLength(1)
  })

  it('bricht ab, wenn die Verbindung scheitert, ohne halbe Änderungen zu behaupten', async () => {
    const result = await run({ antwortenReihe: [] })
    expect(result.failed).toBe(true)
    expect(result.adjustments).toEqual([])
  })

  it('stoppt nach der Rundengrenze und sagt das', async () => {
    const endlos = Array.from({ length: MAX_ROUNDS }, () =>
      toolAnswer([
        { name: 'set_focus', input: { muscle: 'Bizeps', direction: 'more', reason: 'x' } },
      ]),
    )
    const h = handlers()
    antworten.length = 0
    antworten.push(...endlos)
    const result = await runCoachTurn({
      messages: [{ role: 'user', content: 'x' }],
      context: 'k',
      tools: [],
      handlers: h,
      apply: {
        userId: USER,
        profile: profile(),
        plan: plan(),
        adjustments: [],
        exerciseNames: new Map(),
      },
    })
    expect(result.failed).toBe(false)
    expect(h.errors.join(' ')).toMatch(/Runden/)
    expect(result.changes).toHaveLength(MAX_ROUNDS)
  })
})
