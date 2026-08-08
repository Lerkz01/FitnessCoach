import { describe, expect, it } from 'vitest'
import { equipmentById } from '../data'
import type { Equipment } from '../types'
import {
  adjustByPercent,
  adjustBySteps,
  CALIBRATION_FACTOR,
  estimate1RM,
  roundToStep,
  stepAt,
  weightForReps,
  weightLabel,
} from './weights'

function eq(id: string): Equipment {
  const found = equipmentById.get(id)
  if (!found) throw new Error(`Gerät ${id} nicht in der Datenbank`)
  return found
}

const STACK = () => eq('LEG-01') // Beinstrecker, Steckgewicht 5 kg
const BARBELL = () => eq('FRE-02') // Langhantel, 2,5 kg
const DUMBBELL = () => eq('FRE-01') // Kurzhanteln, 1 kg bis 10, dann 2 kg
const ASSISTED = () => eq('FRE-11') // Unterstützte Klimmzug-/Dip-Maschine, INVERTIERT
const BODYWEIGHT = () => eq('FRE-10') // Klimmzugstangen, kein Gewicht

describe('stepAt — Schrittweite je Gerät', () => {
  it('nutzt 5 kg beim Steckgewicht', () => {
    expect(stepAt(STACK(), 40)).toBe(5)
  })

  it('nutzt 2,5 kg bei der Langhantel (2 × 1,25 kg)', () => {
    expect(stepAt(BARBELL(), 60)).toBe(2.5)
  })

  it('staffelt die Kurzhantel-Schrittweite bei 10 kg', () => {
    expect(stepAt(DUMBBELL(), 8)).toBe(1)
    expect(stepAt(DUMBBELL(), 9.9)).toBe(1)
    expect(stepAt(DUMBBELL(), 10)).toBe(2)
    expect(stepAt(DUMBBELL(), 24)).toBe(2)
  })

  it('gibt null für Geräte ohne Gewicht zurück', () => {
    expect(stepAt(BODYWEIGHT(), 0)).toBeNull()
    expect(stepAt(eq('CAR-01'), 0)).toBeNull() // Laufband
  })
})

describe('roundToStep — keine unmöglichen Gewichte', () => {
  it('rundet am Steckgewicht ab statt auf (Sicherheit vor Ehrgeiz)', () => {
    // Die harte Regel aus gym-geraete.md: keine "37 kg" an einem 5-kg-Stack
    expect(roundToStep(STACK(), 37)).toBe(35)
    expect(roundToStep(STACK(), 39.9)).toBe(35)
  })

  it('rundet auf Wunsch zur nächsten Stufe', () => {
    expect(roundToStep(STACK(), 37, 'nearest')).toBe(35)
    expect(roundToStep(STACK(), 38, 'nearest')).toBe(40)
    expect(roundToStep(STACK(), 37, 'up')).toBe(40)
  })

  it('hält das Kurzhantel-Raster über und unter 10 kg ein', () => {
    expect(roundToStep(DUMBBELL(), 7.4)).toBe(7)
    expect(roundToStep(DUMBBELL(), 15.5)).toBe(14)
    expect(roundToStep(DUMBBELL(), 10.5)).toBe(10)
  })

  it('begrenzt Kurzhanteln auf den vorhandenen Bereich 1–60 kg', () => {
    expect(roundToStep(DUMBBELL(), 90)).toBe(60)
    expect(roundToStep(DUMBBELL(), 0.2)).toBeGreaterThanOrEqual(1)
  })

  it('fällt bei normalen Geräten nie auf 0 kg', () => {
    expect(roundToStep(STACK(), 2)).toBe(5)
  })

  it('erlaubt bei invertierten Geräten 0 (= ohne Unterstützung)', () => {
    expect(roundToStep(ASSISTED(), 2)).toBe(0)
  })

  it('gibt null für Geräte ohne Gewicht zurück', () => {
    expect(roundToStep(BODYWEIGHT(), 50)).toBeNull()
  })
})

describe('adjustBySteps — die Grundoperation der Progression', () => {
  it('erhöht und senkt am Steckgewicht um ganze Stufen', () => {
    expect(adjustBySteps(STACK(), 40, +1)).toBe(45)
    expect(adjustBySteps(STACK(), 40, -1)).toBe(35)
    expect(adjustBySteps(STACK(), 40, +2)).toBe(50)
  })

  it('respektiert das gestaffelte Kurzhantel-Raster', () => {
    expect(adjustBySteps(DUMBBELL(), 8, +1)).toBe(9)
    expect(adjustBySteps(DUMBBELL(), 20, +1)).toBe(22)
  })

  // ── Der wichtigste Test der Datei ────────────────────────────────
  it('dreht die Richtung bei der unterstützten Klimmzugmaschine (FRE-11)', () => {
    const m = ASSISTED()
    expect(m.inverted).toBe(true)

    // "Eine Stufe schwerer" heißt hier WENIGER Unterstützungsgewicht.
    // Ohne diese Umkehrung würde die App den Nutzer rückwärts progressieren.
    expect(adjustBySteps(m, 30, +1)).toBe(25)
    expect(adjustBySteps(m, 30, +2)).toBe(20)

    // "Leichter" heißt mehr Unterstützung.
    expect(adjustBySteps(m, 30, -1)).toBe(35)
  })

  it('lässt die Unterstützung nicht unter 0 fallen', () => {
    expect(adjustBySteps(ASSISTED(), 5, +1)).toBe(0)
    expect(adjustBySteps(ASSISTED(), 5, +5)).toBe(0)
  })

  it('gibt null für Körpergewichtsübungen zurück', () => {
    expect(adjustBySteps(BODYWEIGHT(), 0, +1)).toBeNull()
  })
})

describe('adjustByPercent — Deloads und Rückschritte', () => {
  it('senkt am Steckgewicht auf eine gültige Stufe', () => {
    expect(adjustByPercent(STACK(), 100, -10)).toBe(90)
    expect(adjustByPercent(STACK(), 100, -7)).toBe(90) // 93 → abgerundet
  })

  it('erhöht auf eine gültige Stufe', () => {
    expect(adjustByPercent(STACK(), 100, +10)).toBe(110)
  })

  it('bedeutet bei FRE-11 "leichter" = mehr Unterstützung', () => {
    // −10 % Belastung → mehr Unterstützungsgewicht
    const leichter = adjustByPercent(ASSISTED(), 30, -10)
    expect(leichter).toBeGreaterThan(30)
  })
})

describe('estimate1RM — Epley mit Verlässlichkeitsgrenze', () => {
  it('schätzt im verlässlichen Bereich', () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(116.67, 1)
    expect(estimate1RM(80, 8)).toBeCloseTo(101.33, 1)
    expect(estimate1RM(100, 1)).toBeCloseTo(103.33, 1)
  })

  it('verweigert die Schätzung über 12 Wiederholungen', () => {
    // Eine Schätzung mit bekannt großem Fehler ist schlechter als keine
    expect(estimate1RM(50, 13)).toBeNull()
    expect(estimate1RM(50, 20)).toBeNull()
  })

  it('verweigert unsinnige Eingaben', () => {
    expect(estimate1RM(100, 0)).toBeNull()
    expect(estimate1RM(0, 5)).toBeNull()
  })
})

describe('weightForReps — Umkehrung für die Gewichtsvorgabe', () => {
  it('ist die Umkehrfunktion von estimate1RM', () => {
    const gewicht = 82.5
    const wdh = 6
    const e1rm = estimate1RM(gewicht, wdh)!
    expect(weightForReps(e1rm, wdh)).toBeCloseTo(gewicht, 5)
  })

  it('gibt für mehr Wiederholungen weniger Gewicht', () => {
    const e1rm = 120
    expect(weightForReps(e1rm, 10)).toBeLessThan(weightForReps(e1rm, 5))
  })
})

describe('weightLabel — Anzeige in der Oberfläche', () => {
  it('warnt bei invertierten Geräten explizit', () => {
    const label = weightLabel(ASSISTED())
    expect(label.label).toBe('Unterstützung')
    expect(label.hint).toContain('schwerer')
  })

  it('bleibt bei normalen Geräten schlicht', () => {
    expect(weightLabel(STACK())).toEqual({ label: 'Gewicht', hint: null })
  })
})

describe('Einmess-Woche', () => {
  it('setzt bewusst konservativ unter der Schätzung an', () => {
    expect(CALIBRATION_FACTOR).toBeLessThan(1)
    const geschaetzt = weightForReps(120, 8)
    const woche1 = geschaetzt * CALIBRATION_FACTOR
    expect(woche1).toBeLessThan(geschaetzt)
  })
})
