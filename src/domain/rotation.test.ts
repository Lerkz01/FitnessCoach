import { describe, expect, it } from 'vitest'
import type { Adjustment } from './records'
import { ROTATION_WEEKS, rotatedOutExerciseIds } from './rotation'

let counter = 0
function adjustment(overrides: Partial<Adjustment> = {}): Adjustment {
  counter += 1
  const at = '2026-08-09T10:00:00.000Z'
  return {
    id: `a-${counter}`,
    userId: 'u1',
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    appliedAt: at,
    scope: 'exercise_rotation',
    circle: 3,
    targetId: 'SCH-013',
    targetLabel: 'Seitheben Maschine',
    before: 'Seitheben Maschine',
    after: 'Kabel Seitheben einarmig',
    reason: 'Seit 3 Einheiten kein Bestwert',
    applied: true,
    userAccepted: null,
    ...overrides,
  }
}

/** Bezugszeitpunkt: kurz nach dem Standard-Eintrag. */
const JETZT = new Date('2026-08-09T12:00:00.000Z')

describe('rotatedOutExerciseIds', () => {
  it('nennt eine angewandte Rotation', () => {
    const out = rotatedOutExerciseIds([adjustment()], JETZT)
    expect([...out]).toEqual(['SCH-013'])
  })

  it('ignoriert einen bloßen Vorschlag', () => {
    // Ein Vorschlag ohne Ersatz oder ein abgelehnter darf den Plan nicht
    // verändern.
    const out = rotatedOutExerciseIds([adjustment({ applied: false })], JETZT)
    expect(out.size).toBe(0)
  })

  it('ignoriert den Tausch mitten in der Einheit', () => {
    // „Gerät besetzt" ist Kreis 1 und sperrt nichts für die Zukunft — dort
    // war das Gerät belegt, nicht die Übung verbraucht. Beide Fälle nutzen
    // denselben Bereich `exercise_rotation`, deshalb entscheidet der Kreis.
    const out = rotatedOutExerciseIds([adjustment({ circle: 1 })], JETZT)
    expect(out.size).toBe(0)
  })

  it('ignoriert andere Bereiche', () => {
    const out = rotatedOutExerciseIds([adjustment({ scope: 'volume' })], JETZT)
    expect(out.size).toBe(0)
  })

  it('ignoriert weich gelöschte Einträge', () => {
    const out = rotatedOutExerciseIds(
      [adjustment({ deletedAt: '2026-08-09T11:00:00.000Z' })],
      JETZT,
    )
    expect(out.size).toBe(0)
  })

  it('lässt die Übung nach der Frist wieder zu', () => {
    // Rotation dient der Re-Sensibilisierung. Eine Übung für immer zu
    // verbannen würde den Pool über die Jahre leerräumen.
    const spaeter = new Date(
      JETZT.getTime() + (ROTATION_WEEKS * 7 + 1) * 24 * 60 * 60 * 1000,
    )
    expect(rotatedOutExerciseIds([adjustment()], spaeter).size).toBe(0)
  })

  it('hält die Übung innerhalb der Frist draußen', () => {
    const knappDavor = new Date(
      JETZT.getTime() + (ROTATION_WEEKS * 7 - 1) * 24 * 60 * 60 * 1000,
    )
    expect(rotatedOutExerciseIds([adjustment()], knappDavor).size).toBe(1)
  })

  it('sammelt mehrere Rotationen', () => {
    const out = rotatedOutExerciseIds(
      [adjustment(), adjustment({ targetId: 'BIZ-004' })],
      JETZT,
    )
    expect([...out].sort()).toEqual(['BIZ-004', 'SCH-013'])
  })

  it('kommt mit unbrauchbaren Zeitstempeln zurecht', () => {
    const out = rotatedOutExerciseIds([adjustment({ appliedAt: 'kaputt' })], JETZT)
    expect(out.size).toBe(0)
  })

  it('kommt ohne Übungs-Kennung zurecht', () => {
    expect(rotatedOutExerciseIds([adjustment({ targetId: null })], JETZT).size).toBe(0)
  })

  it('gibt bei leerem Protokoll nichts zurück', () => {
    expect(rotatedOutExerciseIds([], JETZT).size).toBe(0)
  })
})
