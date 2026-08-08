import { describe, expect, it } from 'vitest'
import { VOLUME_MUSCLES } from './muscles'
import {
  buildVolumePlan,
  scheduleSessions,
  sessionTemplates,
  splitForDays,
  splitLabel,
  sortWeekdays,
} from './planning'
import type { Weekday } from './records'

describe('splitForDays', () => {
  it('leitet den Split aus der Anzahl der Trainingstage ab', () => {
    expect(splitForDays(3)).toBe('3_fullbody')
    expect(splitForDays(4)).toBe('4_upper_lower')
    expect(splitForDays(5)).toBe('5_ppl_ul')
    expect(splitForDays(6)).toBe('6_ppl')
  })

  it('fällt bei zu wenigen Tagen auf Ganzkörper zurück', () => {
    expect(splitForDays(2)).toBe('3_fullbody')
  })

  it('hat für jeden Split eine lesbare Bezeichnung', () => {
    for (const days of [3, 4, 5, 6]) {
      expect(splitLabel(splitForDays(days)).length).toBeGreaterThan(5)
    }
  })
})

describe('sessionTemplates', () => {
  it('liefert so viele Einheiten wie der Split vorsieht', () => {
    expect(sessionTemplates('3_fullbody')).toHaveLength(3)
    expect(sessionTemplates('4_upper_lower')).toHaveLength(4)
    expect(sessionTemplates('5_ppl_ul')).toHaveLength(5)
    expect(sessionTemplates('6_ppl')).toHaveLength(6)
  })

  it('wechselt beim Ober-/Unterkörper-Split die Ausrichtung ab', () => {
    const foci = sessionTemplates('4_upper_lower').map((t) => t.focus)
    expect(foci).toEqual(['upper', 'lower', 'upper', 'lower'])
  })
})

describe('scheduleSessions', () => {
  it('verteilt die Einheiten auf die gewählten Tage', () => {
    const days: Weekday[] = ['mon', 'tue', 'thu', 'fri']
    const plan = scheduleSessions('4_upper_lower', days)

    expect(plan).toHaveLength(4)
    expect(plan.map((p) => p.weekday)).toEqual(days)
    expect(plan.map((p) => p.template.label)).toEqual([
      'Oberkörper A',
      'Unterkörper A',
      'Oberkörper B',
      'Unterkörper B',
    ])
  })

  it('sortiert die Tage kalendarisch, egal wie sie ankommen', () => {
    const plan = scheduleSessions('4_upper_lower', ['fri', 'mon', 'thu', 'tue'])
    expect(plan.map((p) => p.weekday)).toEqual(['mon', 'tue', 'thu', 'fri'])
  })

  it('legt an aufeinanderfolgenden Tagen keine gleiche Ausrichtung nebeneinander', () => {
    // Der ungünstigste Fall: sechs Tage in Folge
    const days: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    const plan = scheduleSessions('6_ppl', days)

    for (let i = 1; i < plan.length; i++) {
      const vorher = plan[i - 1]
      const jetzt = plan[i]
      expect(
        jetzt.template.focus,
        `${vorher.weekday} → ${jetzt.weekday}: ${jetzt.template.label}`,
      ).not.toBe(vorher.template.focus)
    }
  })

  it('kommt auch mit weniger Tagen als Vorlagen zurecht', () => {
    const plan = scheduleSessions('3_fullbody', ['mon', 'thu'])
    expect(plan).toHaveLength(2)
  })
})

describe('sortWeekdays', () => {
  it('sortiert ab Montag', () => {
    expect(sortWeekdays(['sun', 'mon', 'sat'])).toEqual(['mon', 'sat', 'sun'])
  })
})

describe('buildVolumePlan', () => {
  it('gibt für jeden Volumen-Muskel ein Budget', () => {
    const plan = buildVolumePlan({
      level: 'intermediate',
      goal: 'muscle',
      priorityMuscles: [],
    })
    for (const muscle of VOLUME_MUSCLES) {
      expect(plan.start[muscle], muscle).toBeDefined()
      expect(plan.ceiling[muscle], muscle).toBeDefined()
    }
  })

  it('staffelt das Startvolumen nach Erfahrung', () => {
    const anfaenger = buildVolumePlan({ level: 'beginner', goal: 'muscle', priorityMuscles: [] })
    const fortgeschritten = buildVolumePlan({
      level: 'intermediate',
      goal: 'muscle',
      priorityMuscles: [],
    })
    const erfahren = buildVolumePlan({ level: 'advanced', goal: 'muscle', priorityMuscles: [] })

    expect(anfaenger.start['Brust']).toBe(9)
    expect(fortgeschritten.start['Brust']).toBe(13)
    expect(erfahren.start['Brust']).toBe(15)
  })

  it('startet immer unter der Obergrenze', () => {
    for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
      const plan = buildVolumePlan({ level, goal: 'muscle', priorityMuscles: ['Brust', 'Lat'] })
      for (const muscle of VOLUME_MUSCLES) {
        expect(plan.start[muscle]!, `${level} ${muscle}`).toBeLessThanOrEqual(
          plan.ceiling[muscle]!,
        )
      }
    }
  })

  it('gibt Prioritäts-Muskeln mehr Volumen', () => {
    const ohne = buildVolumePlan({ level: 'intermediate', goal: 'muscle', priorityMuscles: [] })
    const mit = buildVolumePlan({
      level: 'intermediate',
      goal: 'muscle',
      priorityMuscles: ['Brust', 'Lat'],
    })

    expect(mit.start['Brust']!).toBe(ohne.start['Brust']! + 3)
    expect(mit.start['Lat']!).toBe(ohne.start['Lat']! + 3)
    // Nicht-Prioritäten bleiben unverändert
    expect(mit.start['Quadrizeps']).toBe(ohne.start['Quadrizeps'])
  })

  it('senkt das Volumen bei Ziel Maximalkraft', () => {
    // Kraft sättigt früher — dafür wird schwerer trainiert.
    const kraft = buildVolumePlan({ level: 'intermediate', goal: 'strength', priorityMuscles: [] })
    const aufbau = buildVolumePlan({ level: 'intermediate', goal: 'muscle', priorityMuscles: [] })

    expect(kraft.start['Brust']!).toBeLessThan(aufbau.start['Brust']!)
    expect(kraft.ceiling['Brust']!).toBeLessThan(aufbau.ceiling['Brust']!)
  })

  it('setzt bei Fettverlust Obergrenze GLEICH Startwert', () => {
    // Im Defizit geht es um Erhalt, nicht um Aufbau — die App darf das
    // Volumen dort nicht wöchentlich hochfahren.
    const diaet = buildVolumePlan({ level: 'intermediate', goal: 'fatloss', priorityMuscles: [] })
    for (const muscle of VOLUME_MUSCLES) {
      expect(diaet.start[muscle], muscle).toBe(diaet.ceiling[muscle])
    }
  })

  it('gibt großen Muskeln mehr Volumen als kleinen', () => {
    const plan = buildVolumePlan({ level: 'intermediate', goal: 'muscle', priorityMuscles: [] })
    expect(plan.start['Brust']!).toBeGreaterThan(plan.start['Unterarme']!)
    expect(plan.start['Quadrizeps']!).toBeGreaterThan(plan.start['Trapez']!)
    // Die vordere Schulter hat bewusst ein niedriges Budget — sie wird aus
    // jedem Drückmuster mitversorgt.
    expect(plan.start['Vordere Schulter']!).toBeLessThan(plan.start['Seitliche Schulter']!)
  })
})
