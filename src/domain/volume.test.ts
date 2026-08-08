import { describe, expect, it } from 'vitest'
import { exerciseById, exercises } from '../data'
import type { Exercise } from '../types'
import {
  countedSets,
  directVsIndirect,
  setContribution,
  totalVolume,
  type VolumeEntry,
} from './volume'

/** Holt eine echte Übung aus der Datenbank — Tests gegen Fantasiedaten wären wertlos. */
function ex(id: string): Exercise {
  const found = exerciseById.get(id)
  if (!found) throw new Error(`Übung ${id} nicht in der Datenbank`)
  return found
}

describe('setContribution — fraktionale Zählung', () => {
  it('zählt primär 1,0 und sekundär 0,5', () => {
    // RUE-012 Klimmzug Obergriff breit: primär Lat, sekundär Bizeps + ob. Rücken
    const klimmzug = ex('RUE-012')
    expect(setContribution(klimmzug)).toEqual({
      Lat: 1.0,
      Bizeps: 0.5,
      'Oberer Rücken': 0.5,
    })
  })

  it('teilt zusammengesetzte Bezeichnungen auf, statt doppelt zu zählen', () => {
    // SCH-010 Arnold Press: primär "vord. + seitl. Schulter"
    // Ein Satz darf insgesamt 1,0 beitragen, nicht 2,0.
    const arnold = ex('SCH-010')
    const c = setContribution(arnold)
    expect(c['Vordere Schulter']).toBeCloseTo(0.5)
    expect(c['Seitliche Schulter']).toBeCloseTo(0.5)

    const primaerSumme = (c['Vordere Schulter'] ?? 0) + (c['Seitliche Schulter'] ?? 0)
    expect(primaerSumme).toBeCloseTo(1.0)
  })

  it('lässt ignorierte Bezeichnungen komplett weg', () => {
    // BRU-013 Kurzhantel Überzüge: sekundär u.a. "Sägezahn" (kein Budget)
    const pullover = ex('BRU-013')
    const c = setContribution(pullover)
    expect(Object.keys(c)).not.toContain('Sägezahn')
    expect(c['Brust']).toBeGreaterThan(0)
  })
})

describe('countedSets — unilateral und Aufwärmsätze', () => {
  it('zählt bei unilateralen Übungen beide Seiten', () => {
    const einarmig = ex('RUE-005') // Latzug einarmig
    expect(einarmig.unilateral).toBe(true)
    expect(countedSets(einarmig, 3)).toBe(6)
  })

  it('zählt bilaterale Übungen einfach', () => {
    const beidarmig = ex('RUE-012') // Klimmzug breit
    expect(beidarmig.unilateral).toBe(false)
    expect(countedSets(beidarmig, 3)).toBe(3)
  })

  it('zählt Aufwärmsätze nie ins Volumen', () => {
    expect(countedSets(ex('BRU-001'), 3, true)).toBe(0)
  })
})

describe('totalVolume — das Beispiel aus docs/PLAN-ENGINE.md', () => {
  it('rechnet 4 Sätze Klimmzüge korrekt fraktional auf', () => {
    const v = totalVolume([{ exercise: ex('RUE-012'), sets: 4 }])
    expect(v['Lat']).toBeCloseTo(4.0)
    expect(v['Bizeps']).toBeCloseTo(2.0)
    expect(v['Oberer Rücken']).toBeCloseTo(2.0)
  })

  it('addiert mehrere Übungen zum Wochenvolumen', () => {
    const woche: VolumeEntry[] = [
      { exercise: ex('RUE-012'), sets: 4 }, // Klimmzug
      { exercise: ex('BIZ-004'), sets: 3 }, // SZ-Curls (primär Bizeps)
    ]
    const v = totalVolume(woche)
    // Bizeps: 2,0 indirekt aus Klimmzügen + 3,0 direkt aus Curls
    expect(v['Bizeps']).toBeCloseTo(5.0)
  })

  it('ignoriert Aufwärmsätze in der Summe', () => {
    const v = totalVolume([
      { exercise: ex('BRU-001'), sets: 3, isWarmup: true },
      { exercise: ex('BRU-001'), sets: 4 },
    ])
    expect(v['Brust']).toBeCloseTo(4.0)
  })
})

describe('directVsIndirect — Grundlage der Volumen-Anzeige', () => {
  it('trennt direktes von indirektem Volumen', () => {
    const { direct, indirect } = directVsIndirect([{ exercise: ex('RUE-012'), sets: 4 }])
    expect(direct['Lat']).toBeCloseTo(4.0)
    expect(direct['Bizeps']).toBeUndefined()
    expect(indirect['Bizeps']).toBeCloseTo(2.0)
  })

  it('ergibt zusammen genau das Gesamtvolumen', () => {
    const entries: VolumeEntry[] = [
      { exercise: ex('RUE-012'), sets: 4 },
      { exercise: ex('SCH-010'), sets: 3 },
      { exercise: ex('RUE-005'), sets: 3 }, // unilateral
    ]
    const total = totalVolume(entries)
    const { direct, indirect } = directVsIndirect(entries)

    for (const muscle of Object.keys(total) as (keyof typeof total)[]) {
      const summe = (direct[muscle] ?? 0) + (indirect[muscle] ?? 0)
      expect(summe).toBeCloseTo(total[muscle] ?? 0)
    }
  })
})

describe('Plausibilität über die gesamte Datenbank', () => {
  it('trägt ein Satz für EINEN Muskel nie mehr als 1,0 bei', () => {
    // Die richtige Invariante ist pro Muskel, nicht als Summe über alle:
    // Ein Überzug ist gleichzeitig direkte Brust- UND direkte Lat-Arbeit,
    // die Summe darf also über 1,0 liegen. Was nicht passieren darf:
    // dass ein einzelner Muskel doppelt gezählt wird, etwa weil eine Übung
    // "Brust (oben)" und "Brust (mittel)" beide als primär führt.
    for (const exercise of exercises) {
      const c = setContribution(exercise)
      for (const [muskel, wert] of Object.entries(c)) {
        expect(wert, `${exercise.id} ${exercise.name} → ${muskel}`).toBeLessThanOrEqual(
          1.0001,
        )
      }
    }
  })

  it('zählt einen Muskel als primär, wenn er primär UND sekundär genannt ist', () => {
    const doppelt: Exercise = {
      ...ex('BRU-001'),
      primary: ['Brust'],
      secondary: ['Brust (oben)', 'Trizeps'],
    }
    const c = setContribution(doppelt)
    expect(c['Brust']).toBeCloseTo(1.0) // nicht 1,5
    expect(c['Trizeps']).toBeCloseTo(0.5)
  })

  it('zählt mehrere Unterregionen desselben Muskels als einen Satz', () => {
    const zweiRegionen: Exercise = {
      ...ex('BRU-001'),
      primary: ['Brust (oben)', 'Brust (mittel)'],
      secondary: [],
    }
    expect(setContribution(zweiRegionen)['Brust']).toBeCloseTo(1.0) // nicht 2,0
  })

  it('erzeugt für Cardio-Übungen kein Krafttrainings-Volumen', () => {
    for (const exercise of exercises.filter((e) => e.metric === 'cardio')) {
      expect(Object.keys(setContribution(exercise)), exercise.id).toEqual([])
    }
  })
})
