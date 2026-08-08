import { describe, expect, it } from 'vitest'
import { exerciseById, exercises } from '../data'
import type { Exercise } from '../types'
import {
  estimateExerciseSeconds,
  injuryVerdict,
  injuryVerdictAll,
  loadEstimateOf,
  loadsLengthened,
  movementPatternOf,
  overlapScore,
  PATTERN_REFERENCE,
  systemLoadRank,
} from './exerciseMeta'
import type { MovementPattern } from './records'

function ex(id: string): Exercise {
  const found = exerciseById.get(id)
  if (!found) throw new Error(`Übung ${id} nicht in der Datenbank`)
  return found
}

const strength = exercises.filter((e) => e.metric !== 'cardio')

describe('Datenqualität der Übungsklassifizierung', () => {
  // Diese Prüfungen halten zwei Parser-Fehler fest, die beim Bau der
  // Metadaten aufgefallen sind. Ohne sie könnten sie stillschweigend
  // zurückkehren und den Plan-Generator falsch steuern.

  it('stuft Ausfallschritte und Split Squats als Grundübungen ein', () => {
    // Sie sind mehrgelenkig (Hüfte + Knie) und fehlten zunächst in der
    // Stichwortliste — dadurch galten sie als Isolationsübungen und wären
    // nie als frühe Grundübung eingeplant worden.
    for (const id of ['QUA-021', 'QUA-022', 'QUA-023', 'QUA-025', 'GES-018', 'GES-019']) {
      expect(ex(id).compound, `${id} ${ex(id).name}`).toBe(true)
    }
  })

  it('behandelt Walking Lunges als Wiederholungs-, nicht als Zeitübung', () => {
    // Das Stichwort „walk" traf fälschlich auch diese Übung.
    expect(ex('QUA-022').metric).toBe('reps')
  })

  it('behandelt echte Geh- und Halteübungen weiter als Zeitübungen', () => {
    expect(ex('TRA-010').metric).toBe('time') // Farmer's Walk
    expect(ex('WAD-012').metric).toBe('time') // Farmer's Walk auf Zehenspitzen
    expect(ex('ABS-019').metric).toBe('time') // Plank
    expect(ex('GAN-009').metric).toBe('time') // Bear Crawl
  })
})

describe('Bewegungsmuster', () => {
  it('gibt jeder Referenzübung genau ihr eigenes Muster', () => {
    for (const [pattern, id] of Object.entries(PATTERN_REFERENCE) as [
      MovementPattern,
      string,
    ][]) {
      expect(movementPatternOf(ex(id)), id).toBe(pattern)
    }
  })

  it('setzt für jede Referenzübung den Koeffizienten auf genau 1,0', () => {
    // Sonst wäre die vom Nutzer angegebene Zahl nicht der Bezugspunkt.
    for (const id of Object.values(PATTERN_REFERENCE)) {
      const estimate = loadEstimateOf(ex(id))
      expect(estimate.coefficient, id).toBe(1.0)
      expect(estimate.confidence, id).toBe('explicit')
    }
  })

  it('erkennt Muster auch bei nicht explizit eingetragenen Übungen', () => {
    expect(movementPatternOf(ex('BRU-032'))).toBe('horizontal_push') // Liegestütze
    expect(movementPatternOf(ex('RUE-014'))).toBe('vertical_pull') // Chin-Up
    expect(movementPatternOf(ex('QUA-022'))).toBe('squat') // Walking Lunges
  })

  it('vergibt Isolationsübungen kein Bewegungsmuster', () => {
    expect(movementPatternOf(ex('SCH-015'))).toBeNull() // KH Seitheben
    expect(movementPatternOf(ex('BIZ-007'))).toBeNull() // KH Curls
  })
})

describe('Last-Koeffizienten', () => {
  it('gibt Maschinen mit anderer Hebelwirkung mehr als 1,0', () => {
    // Eine Beinpresse bewegt ein Mehrfaches der Kniebeugenlast.
    const beinpresse = loadEstimateOf(ex('QUA-006'))
    expect(beinpresse.coefficient).toBeGreaterThan(1.5)
    expect(beinpresse.pattern).toBe('squat')
  })

  it('gibt Kurzhantelvarianten das Gewicht PRO HANTEL', () => {
    // 0,38 × Bankdrücken ist die Last je Hantel, nicht die Summe.
    const kh = loadEstimateOf(ex('BRU-005'))
    expect(kh.coefficient).toBeGreaterThan(0.3)
    expect(kh.coefficient).toBeLessThan(0.5)
  })

  it('ordnet Bankdrück-Varianten sinnvoll ein', () => {
    const flach = loadEstimateOf(ex('BRU-001')).coefficient
    const schraeg = loadEstimateOf(ex('BRU-002')).coefficient
    const negativ = loadEstimateOf(ex('BRU-003')).coefficient

    expect(schraeg).toBeLessThan(flach) // Schrägbank ist schwerer
    expect(negativ).toBeGreaterThan(flach) // Negativbank ist leichter
  })

  it('nutzt für Isolationsübungen den Körpergewichtsanteil', () => {
    const seitheben = loadEstimateOf(ex('SCH-015'))
    expect(seitheben.basis).toBe('bodyweight')
    expect(seitheben.pattern).toBeNull()
    // 10 % von 78 kg ≈ 8 kg pro Hantel — plausibel
    expect(seitheben.coefficient).toBeGreaterThan(0.05)
    expect(seitheben.coefficient).toBeLessThan(0.3)
  })

  it('setzt bei unilateralen Isolationsübungen weniger an', () => {
    const beidseitig = loadEstimateOf(ex('SCH-013')) // Seitheben Maschine
    const einarmig = loadEstimateOf(ex('SCH-014')) // einarmig
    expect(einarmig.coefficient).toBeLessThan(beidseitig.coefficient)
  })

  it('gibt reinen Körpergewichtsübungen keine Last', () => {
    expect(loadEstimateOf(ex('BRU-032')).basis).toBe('none') // Liegestütze
    expect(loadEstimateOf(ex('ABS-019')).basis).toBe('none') // Plank
    expect(loadEstimateOf(ex('RUE-012')).basis).toBe('none') // Klimmzug
  })

  it('markiert geschätzte Werte als solche', () => {
    // Die App korrigiert bei „estimated" aggressiver ein.
    expect(loadEstimateOf(ex('BRU-001')).confidence).toBe('explicit')
    expect(loadEstimateOf(ex('SCH-015')).confidence).toBe('estimated')
  })

  it('liefert für nahezu jede belastbare Kraftübung eine Schätzung', () => {
    const ohne = strength
      .filter((e) => loadEstimateOf(e).basis === 'none')
      .filter((e) => {
        // Reine Körpergewichts- und Zeitübungen dürfen ohne Last sein.
        const bodyOnly = e.equipmentIds.every((id) =>
          ['BODY', 'FRE-10', 'FRE-12'].includes(id),
        )
        return !bodyOnly && e.metric !== 'time'
      })
      .map((e) => `${e.id} ${e.name}`)

    // Ein paar Randfälle sind erwartbar (Kettlebells ohne bekannte Gewichte),
    // aber es dürfen nicht dutzende Übungen ohne Gewichtsvorgabe bleiben.
    expect(ohne.length, `Ohne Gewichtsschätzung: ${ohne.join(' · ')}`).toBeLessThan(30)
  })
})

describe('Belastung in gedehnter Position', () => {
  it('erkennt die typischen Vertreter', () => {
    expect(loadsLengthened(ex('RUE-061'))).toBe(true) // Rumänisches Kreuzheben
    expect(loadsLengthened(ex('BIZ-010'))).toBe(true) // Schrägbank-Curls
    expect(loadsLengthened(ex('TRI-014'))).toBe(true) // SZ über Kopf
    expect(loadsLengthened(ex('BRU-010'))).toBe(true) // Fliegende
    expect(loadsLengthened(ex('HAM-001'))).toBe(true) // Beinbeuger liegend
  })

  it('markiert Übungen ohne gedehnte Belastung nicht', () => {
    expect(loadsLengthened(ex('SCH-013'))).toBe(false) // Seitheben Maschine
    expect(loadsLengthened(ex('QUA-004'))).toBe(false) // Beinpresse horizontal
    expect(loadsLengthened(ex('TRA-001'))).toBe(false) // Shrugs
  })

  it('markiert einen sinnvollen Anteil des Pools', () => {
    const anteil = strength.filter(loadsLengthened).length / strength.length
    // Weder fast nichts noch fast alles — sonst wäre der Bonus wertlos.
    expect(anteil).toBeGreaterThan(0.05)
    expect(anteil).toBeLessThan(0.4)
  })
})

describe('Verletzungs-Zuordnung', () => {
  it('schließt bei akuten Beschwerden aus', () => {
    expect(injuryVerdict(ex('QUA-012'), { region: 'knee', severity: 'acute' })).toBe('exclude')
    expect(injuryVerdict(ex('SCH-006'), { region: 'shoulder', severity: 'acute' })).toBe(
      'exclude',
    )
    expect(injuryVerdict(ex('RUE-058'), { region: 'lower_back', severity: 'acute' })).toBe(
      'exclude',
    )
  })

  it('depriorisiert bei alten Beschwerden, statt auszuschließen', () => {
    // Eine alte Sache soll nicht den halben Pool sperren.
    expect(injuryVerdict(ex('QUA-012'), { region: 'knee', severity: 'history' })).toBe(
      'deprioritize',
    )
  })

  it('lässt unbetroffene Übungen unberührt', () => {
    expect(injuryVerdict(ex('BIZ-007'), { region: 'knee', severity: 'acute' })).toBeNull()
    expect(injuryVerdict(ex('WAD-001'), { region: 'shoulder', severity: 'acute' })).toBeNull()
  })

  it('nimmt bei mehreren Angaben das strengste Urteil', () => {
    const verdict = injuryVerdictAll(ex('QUA-012'), [
      { region: 'shoulder', severity: 'history' },
      { region: 'knee', severity: 'acute' },
    ])
    expect(verdict).toBe('exclude')
  })

  it('sperrt bei einer akuten Angabe nicht den ganzen Pool', () => {
    // Sonst könnte der Generator keinen sinnvollen Plan mehr bauen.
    for (const region of ['knee', 'shoulder', 'lower_back', 'elbow'] as const) {
      const ausgeschlossen = strength.filter(
        (e) => injuryVerdict(e, { region, severity: 'acute' }) === 'exclude',
      ).length
      const anteil = ausgeschlossen / strength.length
      expect(anteil, region).toBeLessThan(0.45)
    }
  })

  it('erfasst bei Knieproblemen die tatsächlich kritischen Übungen', () => {
    const kritisch = ['QUA-012', 'QUA-006', 'QUA-001', 'QUA-022', 'QUA-029']
    for (const id of kritisch) {
      expect(injuryVerdict(ex(id), { region: 'knee', severity: 'acute' }), id).toBe('exclude')
    }
  })
})

describe('Systemlast', () => {
  it('stellt schwere Grundübungen über leichte Isolation', () => {
    expect(systemLoadRank(ex('RUE-058'))).toBeGreaterThan(systemLoadRank(ex('BRU-001')))
    expect(systemLoadRank(ex('BRU-001'))).toBeGreaterThan(systemLoadRank(ex('SCH-015')))
    expect(systemLoadRank(ex('QUA-012'))).toBeGreaterThan(systemLoadRank(ex('WAD-001')))
  })

  it('bewertet freie Langhantelvarianten höher als geführte', () => {
    expect(systemLoadRank(ex('QUA-012'))).toBeGreaterThan(systemLoadRank(ex('QUA-016')))
  })

  it('bleibt im Bereich 0 bis 100', () => {
    for (const exercise of exercises) {
      const rank = systemLoadRank(exercise)
      expect(rank, exercise.id).toBeGreaterThanOrEqual(0)
      expect(rank, exercise.id).toBeLessThanOrEqual(100)
    }
  })

  it('gibt Cardio keine Systemlast im Krafttrainingssinn', () => {
    expect(systemLoadRank(ex('CAR-101'))).toBe(0)
  })
})

describe('Überlappung', () => {
  it('ergibt für dieselbe Übung 1', () => {
    expect(overlapScore(ex('BRU-001'), ex('BRU-001'))).toBeCloseTo(1, 5)
  })

  it('ergibt für sehr ähnliche Übungen einen hohen Wert', () => {
    // Bankdrücken flach vs. Smith-Bankdrücken flach
    expect(overlapScore(ex('BRU-001'), ex('BRU-015'))).toBeGreaterThan(0.8)
  })

  it('ergibt für unabhängige Übungen einen niedrigen Wert', () => {
    expect(overlapScore(ex('BRU-001'), ex('WAD-001'))).toBeLessThan(0.2)
    expect(overlapScore(ex('BIZ-007'), ex('QUA-001'))).toBeLessThan(0.2)
  })

  it('erkennt teilweise Überlappung als mittleren Wert', () => {
    // Klimmzug und Latzug: gleicher Zielmuskel, ähnliche Nebenmuskeln
    const wert = overlapScore(ex('RUE-012'), ex('RUE-001'))
    expect(wert).toBeGreaterThan(0.5)
  })

  it('ist symmetrisch', () => {
    const a = overlapScore(ex('BRU-001'), ex('SCH-005'))
    const b = overlapScore(ex('SCH-005'), ex('BRU-001'))
    expect(a).toBeCloseTo(b, 10)
  })
})

describe('Zeitbedarf', () => {
  it('rechnet Arbeit, Pausen und Rüstzeit zusammen', () => {
    const sekunden = estimateExerciseSeconds({
      exercise: ex('BRU-001'),
      sets: 4,
      reps: 8,
      seconds: null,
      restSeconds: 150,
      warmupSets: 2,
    })
    // 4 Sätze × 28 s Arbeit + 3 × 150 s Pause + Aufwärmen + Rüstzeit
    expect(sekunden).toBeGreaterThan(600)
    expect(sekunden).toBeLessThan(1000)
  })

  it('zählt bei unilateralen Übungen beide Seiten', () => {
    const gemeinsam = {
      sets: 3,
      reps: 10,
      seconds: null,
      restSeconds: 90,
      warmupSets: 0,
    }
    const einarmig = estimateExerciseSeconds({ ...gemeinsam, exercise: ex('SCH-014') })
    const beidarmig = estimateExerciseSeconds({ ...gemeinsam, exercise: ex('SCH-013') })
    expect(einarmig).toBeGreaterThan(beidarmig)
  })

  it('rechnet Zeit-Übungen nach Sekunden, nicht nach Wiederholungen', () => {
    const plank = estimateExerciseSeconds({
      exercise: ex('ABS-019'),
      sets: 3,
      reps: null,
      seconds: 45,
      restSeconds: 60,
      warmupSets: 0,
    })
    // 3 × 45 s + 2 × 60 s + Rüstzeit
    expect(plank).toBeGreaterThan(250)
    expect(plank).toBeLessThan(400)
  })

  it('zieht nach dem letzten Satz keine Pause mehr ab', () => {
    const einSatz = estimateExerciseSeconds({
      exercise: ex('SCH-013'),
      sets: 1,
      reps: 10,
      seconds: null,
      restSeconds: 120,
      warmupSets: 0,
    })
    // Ohne Pause: 35 s Arbeit + 40 s Rüstzeit
    expect(einSatz).toBeLessThan(120)
  })

  it('ergibt für eine ganze Einheit eine plausible Gesamtdauer', () => {
    // 8 Übungen wie im Beispiel aus docs/PLAN-ENGINE.md §12
    const plan = [
      { id: 'BRU-001', sets: 4, reps: 8, rest: 150, warmup: 2 },
      { id: 'RUE-012', sets: 4, reps: 8, rest: 150, warmup: 1 },
      { id: 'BRU-022', sets: 3, reps: 10, rest: 120, warmup: 0 },
      { id: 'RUE-023', sets: 3, reps: 10, rest: 120, warmup: 0 },
      { id: 'SCH-016', sets: 3, reps: 15, rest: 75, warmup: 0 },
      { id: 'RUE-048', sets: 3, reps: 15, rest: 75, warmup: 0 },
      { id: 'TRI-008', sets: 3, reps: 12, rest: 75, warmup: 0 },
      { id: 'BIZ-010', sets: 3, reps: 12, rest: 75, warmup: 0 },
    ]
    const total = plan.reduce(
      (sum, item) =>
        sum +
        estimateExerciseSeconds({
          exercise: ex(item.id),
          sets: item.sets,
          reps: item.reps,
          seconds: null,
          restSeconds: item.rest,
          warmupSets: item.warmup,
        }),
      0,
    )
    const minuten = total / 60
    // Für ein 75-Minuten-Budget muss so eine Einheit im Rahmen liegen.
    expect(minuten).toBeGreaterThan(50)
    expect(minuten).toBeLessThan(95)
  })
})
