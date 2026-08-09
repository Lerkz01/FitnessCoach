import { describe, expect, it } from 'vitest'
import { equipmentById, exerciseById, exercises } from '../data'
import type { Exercise } from '../types'
import {
  blockedEquipmentFor,
  findAlternatives,
  isMultiStation,
  needsBlocked,
} from './alternatives'
import { overlapScore } from './exerciseMeta'
import type { UserProfile } from './records'

function ex(id: string): Exercise {
  const found = exerciseById.get(id)
  if (!found) throw new Error(`Übung ${id} nicht in der Datenbank`)
  return found
}

function eq(id: string) {
  const found = equipmentById.get(id)
  if (!found) throw new Error(`Gerät ${id} nicht in der Datenbank`)
  return found
}

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'p1',
    userId: 'u1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    deletedAt: null,
    displayName: 'Luca',
    sex: 'male',
    birthYear: 1998,
    heightCm: 183,
    goal: 'muscle',
    targetWeightKg: null,
    bodyFatBucket: 'mid',
    priorityMuscles: [],
    level: 'intermediate',
    trainingYears: '2to5y',
    knowsRir: true,
    trainingDays: ['mon', 'tue', 'thu', 'fri'],
    sessionMinutes: 75,
    dailyActivity: 'light',
    injuries: [],
    blacklistedExerciseIds: [],
    disabledEquipmentIds: [],
    checkinWeekday: 'sun',
    intensity: 'demanding',
    feedbackStyle: 'rir',
    onboardingCompletedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

const POOL = exercises.filter((e) => e.metric !== 'cardio')

// ────────────────────────────────────────────────────────────────────

describe('isMultiStation — was es mehrfach gibt', () => {
  it('erkennt Kurz- und Langhanteln als mehrfach vorhanden', () => {
    expect(isMultiStation(eq('FRE-01'))).toBe(true) // Kurzhanteln
    expect(isMultiStation(eq('FRE-02'))).toBe(true) // Langhantel
  })

  it('erkennt „Mehrere vorhanden" in der Beschreibung', () => {
    expect(isMultiStation(eq('FRE-07'))).toBe(true) // Squat Racks
  })

  it('behandelt eine Bank mit Ablage als Einzelstation', () => {
    // Die Flachbank mit Ablage gibt es einmal — ist sie besetzt, ist sie weg.
    expect(isMultiStation(eq('FRE-04'))).toBe(false)
  })

  it('behandelt Maschinen als Einzelstation', () => {
    expect(isMultiStation(eq('LEG-01'))).toBe(false)
  })

  it('behandelt Zubehör als mehrfach nutzbar — es ist gar keine Station', () => {
    expect(isMultiStation(eq('FRE-14'))).toBe(true) // Fußschlaufen
  })

  it('behandelt eine Körpergewichts-STATION als Einzelstation', () => {
    // Der Fehlschluss im ersten Entwurf: `loadType: 'body'` beschreibt, WIE
    // die Last wirkt, nicht WIE VIELE es gibt. Die 45°-Hyperextension ist
    // eine Körpergewichtsübung an genau einer Station.
    expect(isMultiStation(eq('LEG-11'))).toBe(false)
  })
})

describe('blockedEquipmentFor — was ausfällt', () => {
  it('sperrt bei Langhantel-Bankdrücken nur die Bank, nicht die Hantel', () => {
    // DER Kern der ganzen Logik: Ist die Flachbank besetzt, bleibt die
    // Langhantel verfügbar — Schrägbankdrücken geht weiter.
    const blocked = blockedEquipmentFor(ex('BRU-001'))
    expect(blocked).toContain('FRE-04')
    expect(blocked).not.toContain('FRE-02')
  })

  it('sperrt bei einer Maschine die Maschine', () => {
    const maschine = POOL.find(
      (e) => e.equipmentIds.length === 1 && e.equipmentIds[0].startsWith('LEG-'),
    )
    expect(maschine).toBeDefined()
    expect(blockedEquipmentFor(maschine!)).toEqual(maschine!.equipmentIds)
  })
})

describe('needsBlocked — UND/ODER der Gerätegruppen', () => {
  it('sperrt nur, wenn ALLE Alternativen einer Gruppe weg sind', () => {
    // Eine Übung, die Flachbank ODER Smith-Maschine erlaubt, bleibt
    // möglich, solange eines von beiden frei ist. Die flache Geräteliste zu
    // prüfen wäre hier falsch.
    const kandidat: Exercise = {
      ...ex('BRU-001'),
      equipmentGroups: [['FRE-02'], ['FRE-04', 'FRE-08']],
      equipmentIds: ['FRE-02', 'FRE-04', 'FRE-08'],
    }
    expect(needsBlocked(kandidat, new Set(['FRE-04']))).toBe(false)
    expect(needsBlocked(kandidat, new Set(['FRE-04', 'FRE-08']))).toBe(true)
  })

  it('sperrt, wenn ein zwingend nötiges Gerät weg ist', () => {
    const kandidat: Exercise = {
      ...ex('BRU-001'),
      equipmentGroups: [['FRE-02'], ['FRE-04']],
      equipmentIds: ['FRE-02', 'FRE-04'],
    }
    expect(needsBlocked(kandidat, new Set(['FRE-02']))).toBe(true)
  })

  it('kommt mit Übungen ohne Gruppenangabe zurecht', () => {
    const kandidat: Exercise = {
      ...ex('BRU-001'),
      equipmentGroups: [],
      equipmentIds: ['FRE-01'],
    }
    expect(needsBlocked(kandidat, new Set(['FRE-01']))).toBe(true)
    expect(needsBlocked(kandidat, new Set(['FRE-02']))).toBe(false)
  })
})

describe('findAlternatives', () => {
  it('schlägt bei besetzter Flachbank etwas anderes vor', () => {
    const alternativen = findAlternatives({
      exercise: ex('BRU-001'),
      pool: POOL,
      profile: profile(),
    })
    expect(alternativen.length).toBeGreaterThan(0)
  })

  it('schlägt NIEMALS eine Übung auf dem besetzten Gerät vor', () => {
    const besetzt = ex('BRU-001')
    const gesperrt = new Set(blockedEquipmentFor(besetzt))

    const alternativen = findAlternatives({
      exercise: besetzt,
      pool: POOL,
      profile: profile(),
      limit: 20,
    })

    for (const a of alternativen) {
      expect(
        needsBlocked(a.exercise, gesperrt),
        `${a.exercise.name} braucht ein gesperrtes Gerät`,
      ).toBe(false)
    }
  })

  it('erhält den Reiz — Brustübung wird nicht durch Beinübung ersetzt', () => {
    const alternativen = findAlternatives({
      exercise: ex('BRU-001'),
      pool: POOL,
      profile: profile(),
      limit: 10,
    })
    // Alle Vorschläge müssen überwiegend dieselbe Muskulatur treffen.
    for (const a of alternativen) {
      expect(a.match, `${a.exercise.name} passt kaum`).toBeGreaterThanOrEqual(0.5)
      expect(a.exercise.group).toBe(besterGruppenwert(ex('BRU-001')))
    }
  })

  it('sortiert die beste Übereinstimmung nach vorn', () => {
    const alternativen = findAlternatives({
      exercise: ex('BRU-001'),
      pool: POOL,
      profile: profile(),
      limit: 5,
    })
    expect(alternativen[0].match).toBeGreaterThanOrEqual(0.7)
  })

  it('bietet die besetzte Übung selbst nicht an', () => {
    const alternativen = findAlternatives({
      exercise: ex('BRU-001'),
      pool: POOL,
      profile: profile(),
      limit: 20,
    })
    expect(alternativen.map((a) => a.exercise.id)).not.toContain('BRU-001')
  })

  it('überspringt Übungen, die in dieser Einheit schon vorkommen', () => {
    const ohne = findAlternatives({
      exercise: ex('BRU-001'),
      pool: POOL,
      profile: profile(),
      limit: 5,
    })
    const ersteWahl = ohne[0].exercise.id

    const mit = findAlternatives({
      exercise: ex('BRU-001'),
      pool: POOL,
      profile: profile(),
      usedExerciseIds: new Set([ersteWahl]),
      limit: 5,
    })
    expect(mit.map((a) => a.exercise.id)).not.toContain(ersteWahl)
  })

  it('achtet auf die Sperrliste des Profils', () => {
    const ohne = findAlternatives({
      exercise: ex('BRU-001'),
      pool: POOL,
      profile: profile(),
      limit: 5,
    })
    const ersteWahl = ohne[0].exercise.id

    const mit = findAlternatives({
      exercise: ex('BRU-001'),
      pool: POOL,
      profile: profile({ blacklistedExerciseIds: [ersteWahl] }),
      limit: 5,
    })
    expect(mit.map((a) => a.exercise.id)).not.toContain(ersteWahl)
  })

  it('berücksichtigt zusätzlich gesperrte Geräte aus einem früheren Tausch', () => {
    // Zweimal „besetzt" darf nicht auf dem ersten besetzten Gerät landen.
    const ohne = findAlternatives({
      exercise: ex('BRU-001'),
      pool: POOL,
      profile: profile(),
      limit: 5,
    })
    const ersteWahl = ohne[0].exercise
    const nochGesperrt = new Set(blockedEquipmentFor(ersteWahl))

    if (nochGesperrt.size === 0) return // nur Freihanteln, nichts zu sperren

    const mit = findAlternatives({
      exercise: ex('BRU-001'),
      pool: POOL,
      profile: profile(),
      alsoBlocked: nochGesperrt,
      limit: 10,
    })
    for (const a of mit) {
      expect(needsBlocked(a.exercise, nochGesperrt)).toBe(false)
    }
  })

  it('schließt Übungen aus, die eine akute Verletzung verbietet', () => {
    const mitVerletzung = findAlternatives({
      exercise: ex('BRU-001'),
      pool: POOL,
      profile: profile({
        injuries: [{ region: 'shoulder', severity: 'acute' }],
      }),
      // Ohne hohe Obergrenze verdeckt der Deckel den Unterschied: Bei
      // limit 20 und mehr als 20 Treffern kommen beide Male genau 20.
      limit: 500,
    })
    const ohne = findAlternatives({
      exercise: ex('BRU-001'),
      pool: POOL,
      profile: profile(),
      limit: 500,
    })
    expect(mitVerletzung.length).toBeLessThan(ohne.length)
  })

  it('nennt in der Begründung das Gerät, an das man gehen muss', () => {
    const alternativen = findAlternatives({
      exercise: ex('BRU-001'),
      pool: POOL,
      profile: profile(),
      limit: 3,
    })
    for (const a of alternativen) {
      expect(a.reason.length).toBeGreaterThan(5)
    }
  })

  it('bietet nicht viermal dasselbe Gerät an', () => {
    // Wären alle Vorschläge Kurzhantelübungen und die Kurzhanteln das
    // Problem, stünde man wieder da.
    const alternativen = findAlternatives({
      exercise: ex('BRU-001'),
      pool: POOL,
      profile: profile(),
      limit: 4,
    })
    const proGeraet = new Map<string, number>()
    for (const a of alternativen) {
      const k = [...a.exercise.equipmentIds].sort().join('+')
      proGeraet.set(k, (proGeraet.get(k) ?? 0) + 1)
    }
    expect(Math.max(...proGeraet.values())).toBeLessThanOrEqual(2)
  })

  it('bietet keine zwei nahezu identischen Übungen an', () => {
    // Beim Dip-Ersatz kamen „Liegestütze eng / Diamond" UND
    // „Diamond Push-Ups" — zwei von vier Plätzen für dieselbe Bewegung.
    const alternativen = findAlternatives({
      exercise: ex('TRI-002'),
      pool: POOL,
      profile: profile(),
      limit: 4,
    })
    for (let i = 0; i < alternativen.length; i++) {
      for (let j = i + 1; j < alternativen.length; j++) {
        const a = alternativen[i].exercise
        const b = alternativen[j].exercise
        const gleichesGeraet =
          [...a.equipmentIds].sort().join('+') === [...b.equipmentIds].sort().join('+')
        if (gleichesGeraet) {
          expect(
            overlapScore(a, b),
            `${a.name} und ${b.name} sind praktisch dasselbe`,
          ).toBeLessThanOrEqual(0.95)
        }
      }
    }
  })

  it('hält sich an die Obergrenze', () => {
    expect(
      findAlternatives({
        exercise: ex('BRU-001'),
        pool: POOL,
        profile: profile(),
        limit: 3,
      }),
    ).toHaveLength(3)
  })

  it('gibt eine leere Liste zurück, wenn nichts passt', () => {
    // Pool auf eine einzige, völlig andere Übung eingeschränkt.
    const beinuebung = POOL.find((e) => e.group === 'Quadrizeps')
    expect(beinuebung).toBeDefined()
    const alternativen = findAlternatives({
      exercise: ex('BRU-001'),
      pool: [beinuebung!],
      profile: profile(),
    })
    expect(alternativen).toEqual([])
  })
})

/** Die Muskelgruppe, zu der die Übung in der Datenbank gehört. */
function besterGruppenwert(exercise: Exercise): string {
  return exercise.group
}
