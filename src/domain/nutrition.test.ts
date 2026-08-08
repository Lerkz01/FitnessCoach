import { describe, expect, it } from 'vitest'
import {
  activityFactor,
  ageFromBirthYear,
  buildNutritionPlan,
  estimateTdee,
  mifflinStJeor,
  targetRatePercentPerWeek,
} from './nutrition'

const luca = {
  sex: 'male' as const,
  weightKg: 78,
  heightCm: 180,
  age: 26,
  dailyActivity: 'light' as const,
  sessionsPerWeek: 4,
  level: 'intermediate' as const,
}

describe('mifflinStJeor', () => {
  it('rechnet die Männer-Formel korrekt', () => {
    // 10×78 + 6,25×180 − 5×26 + 5 = 780 + 1125 − 130 + 5
    expect(mifflinStJeor({ sex: 'male', weightKg: 78, heightCm: 180, age: 26 })).toBe(1780)
  })

  it('rechnet die Frauen-Formel korrekt', () => {
    // 10×62 + 6,25×168 − 5×28 − 161 = 620 + 1050 − 140 − 161
    expect(mifflinStJeor({ sex: 'female', weightKg: 62, heightCm: 168, age: 28 })).toBe(1369)
  })

  it('nimmt bei fehlender Angabe den Mittelwert beider Formeln', () => {
    const args = { weightKg: 70, heightCm: 175, age: 30 }
    const m = mifflinStJeor({ ...args, sex: 'male' })
    const f = mifflinStJeor({ ...args, sex: 'female' })
    const u = mifflinStJeor({ ...args, sex: 'unspecified' })
    expect(u).toBeCloseTo((m + f) / 2, 5)
  })
})

describe('activityFactor', () => {
  it('rechnet Alltag und Trainingsfrequenz getrennt zusammen', () => {
    // Das ist genauer als ein einzelner Dropdown, weil die App die
    // Trainingstage bereits kennt.
    expect(activityFactor('sedentary', 4)).toBeCloseTo(1.3, 5) // 1,20 + 4×0,025
    expect(activityFactor('light', 4)).toBeCloseTo(1.45, 5)
    expect(activityFactor('very_active', 6)).toBeCloseTo(1.8, 5)
  })

  it('steigt mit jeder zusätzlichen Einheit', () => {
    expect(activityFactor('light', 5)).toBeGreaterThan(activityFactor('light', 3))
  })
})

describe('estimateTdee', () => {
  it('multipliziert Grundumsatz mit Aktivitätsfaktor', () => {
    const tdee = estimateTdee(luca)
    expect(tdee).toBeCloseTo(1780 * 1.45, 5)
  })
})

describe('targetRatePercentPerWeek', () => {
  it('nutzt bei Fettverlust die langsamere Rate bei niedrigem Körperfett', () => {
    // Bei wenig Reserven schützt die langsamere Rate die Muskelmasse.
    expect(
      targetRatePercentPerWeek({ goal: 'fatloss', level: 'intermediate', bodyFatBucket: '10-14' }),
    ).toBe(-0.5)
  })

  it('erlaubt bei höherem Körperfett die schnellere Rate', () => {
    expect(
      targetRatePercentPerWeek({ goal: 'fatloss', level: 'intermediate', bodyFatBucket: '25-29' }),
    ).toBe(-0.7)
  })

  it('bleibt ohne Körperfett-Angabe konservativ', () => {
    expect(
      targetRatePercentPerWeek({ goal: 'fatloss', level: 'intermediate', bodyFatBucket: null }),
    ).toBe(-0.5)
  })

  it('staffelt die Aufbaurate nach Erfahrung', () => {
    const anfaenger = targetRatePercentPerWeek({ goal: 'muscle', level: 'beginner' })
    const fortgeschritten = targetRatePercentPerWeek({ goal: 'muscle', level: 'intermediate' })
    const erfahren = targetRatePercentPerWeek({ goal: 'muscle', level: 'advanced' })

    expect(anfaenger).toBeGreaterThan(fortgeschritten)
    expect(fortgeschritten).toBeGreaterThan(erfahren)
  })

  it('hält bei Kraft und Fitness das Gewicht', () => {
    expect(targetRatePercentPerWeek({ goal: 'strength', level: 'advanced' })).toBe(0)
    expect(targetRatePercentPerWeek({ goal: 'fitness', level: 'beginner' })).toBe(0)
  })
})

describe('buildNutritionPlan', () => {
  it('setzt beim Aufbau einen moderaten Überschuss', () => {
    const plan = buildNutritionPlan({ ...luca, goal: 'muscle' })
    const ueberschuss = plan.kcal - plan.maintenanceKcal

    // docs/TRAINING-SCIENCE.md §10: 200–350 kcal, nicht mehr
    expect(ueberschuss).toBeGreaterThanOrEqual(200)
    expect(ueberschuss).toBeLessThanOrEqual(350)
  })

  it('setzt bei Fettverlust ein Defizit passend zur Zielrate', () => {
    const plan = buildNutritionPlan({ ...luca, goal: 'fatloss', bodyFatBucket: '15-19' })
    expect(plan.kcal).toBeLessThan(plan.maintenanceKcal)
    expect(plan.targetRatePercentPerWeek).toBe(-0.5)
    // 0,5 % von 78 kg = 0,39 kg pro Woche
    expect(plan.expectedKgPerWeek).toBeCloseTo(-0.39, 2)
  })

  it('erhöht das Protein im Defizit', () => {
    const aufbau = buildNutritionPlan({ ...luca, goal: 'muscle' })
    const diaet = buildNutritionPlan({ ...luca, goal: 'fatloss' })

    // 1,8 vs. 2,2 g/kg — mehr Protein schützt Muskeln und sättigt besser
    expect(aufbau.proteinG).toBe(Math.round(1.8 * 78))
    expect(diaet.proteinG).toBe(Math.round(2.2 * 78))
    expect(diaet.proteinG).toBeGreaterThan(aufbau.proteinG)
  })

  it('unterschreitet die Fett-Untergrenze von 0,8 g/kg nie', () => {
    // Auch in einem aggressiven Defizit bei niedrigem Gewicht
    const plan = buildNutritionPlan({
      ...luca,
      weightKg: 55,
      goal: 'fatloss',
      bodyFatBucket: '25-29',
    })
    expect(plan.fatG).toBeGreaterThanOrEqual(Math.round(0.8 * 55))
  })

  it('füllt mit Kohlenhydraten auf, sodass die Makros zur Kalorienzahl passen', () => {
    const plan = buildNutritionPlan({ ...luca, goal: 'muscle' })
    const ausMakros = plan.proteinG * 4 + plan.fatG * 9 + plan.carbsG * 4
    // Rundungstoleranz von wenigen Kilokalorien
    expect(Math.abs(ausMakros - plan.kcal)).toBeLessThanOrEqual(6)
  })

  it('liefert immer eine Begründung für die Anzeige', () => {
    for (const goal of ['muscle', 'fatloss', 'strength', 'fitness'] as const) {
      const plan = buildNutritionPlan({ ...luca, goal })
      expect(plan.reason.length, goal).toBeGreaterThan(20)
      expect(plan.reason, goal).toContain('Erhaltungsbedarf')
    }
  })

  it('hält bei Kraft und Fitness den Erhaltungsbedarf', () => {
    for (const goal of ['strength', 'fitness'] as const) {
      const plan = buildNutritionPlan({ ...luca, goal })
      expect(plan.kcal).toBe(plan.maintenanceKcal)
      expect(plan.expectedKgPerWeek).toBe(0)
    }
  })

  it('ergibt für ein Beispielprofil plausible Zahlen', () => {
    const plan = buildNutritionPlan({ ...luca, goal: 'muscle' })
    // Grobe Plausibilität: ein 78-kg-Mann mit 4 Einheiten liegt beim
    // Aufbau im Bereich 2600–3200 kcal.
    expect(plan.kcal).toBeGreaterThan(2600)
    expect(plan.kcal).toBeLessThan(3200)
    expect(plan.proteinG).toBeGreaterThan(120)
  })
})

describe('ageFromBirthYear', () => {
  it('rechnet das Alter grob aus dem Geburtsjahr', () => {
    expect(ageFromBirthYear(2000, new Date('2026-08-06'))).toBe(26)
  })
})
