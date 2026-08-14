import { describe, expect, it } from 'vitest'
import type { Equipment } from '../types'
import {
  calibrationSessionsNeeded,
  calibrationState,
  FIRST_PROBE_SHARE,
  MAX_CALIBRATION_SESSIONS,
  probeNext,
  PROBE_REPS,
  PROBE_SETS,
  toCalibrationExercise,
} from './calibration'
import type { PlannedExercise, SetFeedback } from './records'
import { estimate1RM, weightForReps } from './weights'

/** Langhantel: feine Stufen. */
const BARBELL: Equipment = {
  // FRE-01 wäre die KURZHANTEL — die hat ein eigenes Raster und deckelt bei
  // 60 kg. Mit der falschen ID lief die ganze Simulation gegen diesen Deckel
  // und sah nach einem Fehler im Verfahren aus.
  id: 'FRE-02',
  name: 'Langhantel',
  category: 'Frei',
  loadType: 'plate',
  description: '',
  stepKg: 2.5,
  inverted: false,
  maxKg: null,
}

/** Maschine mit grobem Steckgewicht — der schwierige Fall. */
const COARSE: Equipment = {
  id: 'MAS-99',
  name: 'Maschine grob',
  category: 'Brust',
  loadType: 'stack',
  description: '',
  stepKg: 10,
  inverted: false,
  maxKg: 120,
}

function planned(over: Partial<PlannedExercise> = {}): PlannedExercise {
  return {
    exerciseId: 'BRU-001',
    exerciseName: 'Langhantel Bankdrücken flach',
    orderIndex: 0,
    sets: 4,
    targetReps: 8,
    repRangeMin: 8,
    repRangeMax: 12,
    targetSeconds: null,
    targetRir: 2,
    restSeconds: 150,
    weightKg: 60,
    warmups: [
      { weightKg: 30, reps: 8 },
      { weightKg: 45, reps: 5 },
    ],
    selectionReason: 'Grundübung',
    ...over,
  }
}

/**
 * Simuliert einen Menschen mit einem bestimmten echten 1RM.
 *
 * Er macht bei einem Gewicht so viele Wiederholungen, wie die Vorgabe will —
 * höchstens aber so viele, wie er kann — und meldet danach ehrlich, wie viel
 * Reserve er hatte.
 */
function person(trueOneRm: number) {
  return (weightKg: number, targetReps: number, targetRir: number) => {
    // Wie viele Wiederholungen wären maximal möglich? Epley umgekehrt.
    const maxReps = Math.max(1, Math.round((trueOneRm / weightKg - 1) / 0.0333))
    // Er macht die Vorgabe, wenn er kann.
    const actualReps = Math.min(targetReps, maxReps)
    const reserve = maxReps - actualReps
    const feedback: SetFeedback =
      reserve > targetRir ? 'more_left' : reserve < targetRir ? 'at_limit' : 'as_planned'
    return { actualReps, feedback }
  }
}

/**
 * Fährt die Einmessung einer Übung durch, genau wie in der App.
 *
 * Wichtig: Der Tastsatz läuft mit `probeReps` (dem hohen Ziel), gerechnet
 * wird aber auf `targetReps` (das echte Ziel der Vorgabe). Wer das in der
 * Simulation vermischt, prüft ein Verfahren, das es nicht gibt.
 */
function measure(input: {
  equipment: Equipment
  startKg: number
  trueOneRm: number
  /** Das echte Ziel der Vorgabe, z.B. 5 oder 8. */
  targetReps: number
  targetRir: number
  probeReps?: number
}) {
  const probeReps = input.probeReps ?? PROBE_REPS
  const macht = person(input.trueOneRm)
  const weg: { weightKg: number; reps: number; feedback: SetFeedback }[] = []
  let weight = input.startKg
  let found: number | null = null
  let nachricht = ''

  for (let probe = 1; probe <= PROBE_SETS; probe++) {
    const { actualReps, feedback } = macht(weight, probeReps, input.targetRir)
    weg.push({ weightKg: weight, reps: actualReps, feedback })

    const result = probeNext({
      weightKg: weight,
      actualReps,
      feedback,
      targetReps: input.targetReps,
      targetRir: input.targetRir,
      probeReps,
      equipment: input.equipment,
      probeNumber: probe,
    })
    nachricht = result.message

    if (result.found) {
      found = result.foundWeightKg
      break
    }
    weight = result.nextWeightKg as number
  }

  return { weg, found, nachricht, saetze: weg.length }
}

describe('probeNext — Konvergenz', () => {
  it('findet ein Langhantelgewicht in höchstens drei Sätzen', () => {
    const ergebnis = measure({
      equipment: BARBELL,
      startKg: 50, // 85 % einer 60-kg-Schätzung
      trueOneRm: 100,
      targetReps: 8,
      targetRir: 2,
    })
    expect(ergebnis.found).not.toBeNull()
    expect(ergebnis.saetze).toBeLessThanOrEqual(PROBE_SETS)
  })

  it('landet nah am wirklich richtigen Gewicht', () => {
    // Das wahre Arbeitsgewicht für 8 Wdh. bei RIR 2, also 10 Wdh. Belastbarkeit.
    const wahr = weightForReps(100, 10)
    const ergebnis = measure({
      equipment: BARBELL,
      startKg: 50,
      trueOneRm: 100,
      targetReps: 8,
      targetRir: 2,
    })
    // Innerhalb von zwei Gerätestufen — genauer geht es mit drei Sätzen nicht,
    // und Regelkreis 1 zieht den Rest in der nächsten Einheit nach.
    expect(Math.abs((ergebnis.found as number) - wahr)).toBeLessThanOrEqual(5)
  })

  it('funktioniert über die ganze Kraftspanne', () => {
    // Von Anfängerin bis weit fortgeschritten: Das Verfahren darf nicht nur
    // bei dem einen Wert stimmen, für den ich es zufällig gebaut habe.
    for (const oneRm of [40, 60, 80, 100, 130, 160]) {
      const schaetzung = weightForReps(oneRm, 10)
      const ergebnis = measure({
        equipment: BARBELL,
        // Die Schätzung des Generators liegt bewusst falsch — genau darum
        // wird ja gemessen. Start bei 70 % davon.
        startKg: Math.max(2.5, Math.round((schaetzung * FIRST_PROBE_SHARE) / 2.5) * 2.5),
        trueOneRm: oneRm,
        targetReps: 8,
        targetRir: 2,
      })
      expect(ergebnis.found, `1RM ${oneRm}`).not.toBeNull()
      expect(ergebnis.saetze, `1RM ${oneRm}`).toBeLessThanOrEqual(PROBE_SETS)
      expect(
        Math.abs((ergebnis.found as number) - weightForReps(oneRm, 10)),
        `1RM ${oneRm}`,
      ).toBeLessThanOrEqual(7.5)
    }
  })

  it('kommt auch mit einer völlig falschen Schätzung zurecht', () => {
    // Der schlimmste Fall: Die Schätzung liegt um das Dreifache daneben.
    const ergebnis = measure({
      equipment: BARBELL,
      startKg: 20,
      trueOneRm: 140,
      targetReps: 8,
      targetRir: 2,
    })
    expect(ergebnis.found).not.toBeNull()
    // Es darf nicht in einem Satz von 20 auf 100 kg springen — aber das
    // Verfahren rechnet, es springt nicht blind, also ist der Sprung
    // gerechtfertigt und der zweite Satz sitzt.
    expect(ergebnis.saetze).toBeLessThanOrEqual(PROBE_SETS)
  })

  it('bricht bei grobem Steckgewicht ab, statt zwischen zwei Stufen zu pendeln', () => {
    // 10-kg-Stufen: Es gibt kein „genau richtig". Ohne Abbruchkriterium würde
    // das Verfahren endlos hin und her springen.
    const ergebnis = measure({
      equipment: COARSE,
      startKg: 40,
      trueOneRm: 95,
      targetReps: 10,
      targetRir: 2,
    })
    expect(ergebnis.found).not.toBeNull()
    expect(ergebnis.saetze).toBeLessThanOrEqual(PROBE_SETS)
    expect(ergebnis.found as number).toBeGreaterThan(0)
  })

  it('nimmt nach dem letzten Tastsatz, was da ist, statt nichts', () => {
    const result = probeNext({
      weightKg: 50,
      actualReps: 15,
      feedback: 'more_left',
      targetReps: 5,
      targetRir: 2,
      probeReps: PROBE_REPS,
      equipment: BARBELL,
      probeNumber: PROBE_SETS,
    })
    expect(result.found).toBe(true)
    expect(result.foundWeightKg).not.toBeNull()
    expect(result.message).toMatch(/nächste Einheit/)
  })

  it('rechnet die gemeldete Reserve mit ein', () => {
    // Zehn Wiederholungen „mit Reserve" und zehn „am Limit" bedeuten
    // verschiedene 1RM. Ohne diese Unterscheidung läge die Schätzung
    // systematisch zu niedrig.
    const mitReserve = probeNext({
      weightKg: 50,
      actualReps: 8,
      feedback: 'more_left',
      targetReps: 8,
      targetRir: 2,
      probeReps: PROBE_REPS,
      equipment: BARBELL,
      probeNumber: 1,
    })
    const amLimit = probeNext({
      weightKg: 50,
      actualReps: 8,
      feedback: 'at_limit',
      targetReps: 8,
      targetRir: 2,
      probeReps: PROBE_REPS,
      equipment: BARBELL,
      probeNumber: 1,
    })
    const a = mitReserve.nextWeightKg ?? mitReserve.foundWeightKg ?? 0
    const b = amLimit.nextWeightKg ?? amLimit.foundWeightKg ?? 0
    expect(a).toBeGreaterThan(b)
  })

  it('erklärt einen gedeckelten Tastsatz nicht für fertig', () => {
    // DER Fehler des ersten Entwurfs: Ein Satz, der am Wiederholungsziel
    // endete und noch Reserve hatte, sagt nur „mindestens so viel". Wurde er
    // als gefunden gewertet, stand am Ende ein viel zu leichtes Gewicht im
    // Plan — in der Simulation 42,5 statt 75 kg.
    const result = probeNext({
      weightKg: 40,
      actualReps: PROBE_REPS,
      feedback: 'more_left',
      targetReps: 10,
      targetRir: 2,
      probeReps: PROBE_REPS,
      equipment: COARSE,
      probeNumber: 1,
    })
    expect(result.found).toBe(false)
    // Und es muss sich WIRKLICH bewegen. An einer Maschine mit 10-kg-Stufen
    // hätte die Epley-Rechnung 43,8 kg ergeben, gerundet wieder 40 — drei
    // Tastsätze ohne einen Millimeter Fortschritt.
    expect(result.nextWeightKg as number).toBeGreaterThan(40)
  })

  it('nimmt einen zu vielen Wiederholungen entsprechenden Sprung', () => {
    // Oberhalb von zwölf Wiederholungen liefert estimate1RM nichts. Das darf
    // nicht dazu führen, dass gar nicht gerechnet wird.
    const result = probeNext({
      weightKg: 30,
      actualReps: 25,
      feedback: 'more_left',
      targetReps: 8,
      targetRir: 2,
      probeReps: PROBE_REPS,
      equipment: BARBELL,
      probeNumber: 1,
    })
    expect(result.found).toBe(false)
    expect(result.nextWeightKg as number).toBeGreaterThan(30)
  })

  it('ist mit der 1RM-Formel konsistent', () => {
    // Wenn der Satz genau die Belastbarkeit trifft, muss das Ergebnis dem
    // direkt gerechneten Wert entsprechen.
    const oneRm = estimate1RM(60, 10) as number
    const result = probeNext({
      weightKg: 60,
      actualReps: 8,
      feedback: 'as_planned',
      targetReps: 8,
      targetRir: 2,
      probeReps: PROBE_REPS,
      equipment: BARBELL,
      probeNumber: 1,
    })
    const erwartet = Math.floor(weightForReps(oneRm, 10) / 2.5) * 2.5
    expect(result.foundWeightKg).toBe(erwartet)
  })
})

describe('toCalibrationExercise', () => {
  it('startet bewusst zu leicht', () => {
    const messen = toCalibrationExercise(planned({ weightKg: 60 }), BARBELL)
    expect(messen.weightKg as number).toBeLessThan(60)
    // 85 % von 60 = 51, auf 2,5er-Stufen abgerundet.
    expect(messen.weightKg).toBe(50)
  })

  it('lässt Aufwärmsätze weg — der erste Tastsatz IST das Aufwärmen', () => {
    expect(toCalibrationExercise(planned(), BARBELL).warmups).toEqual([])
  })

  it('kürzt die Sätze und die Pause', () => {
    const messen = toCalibrationExercise(planned({ sets: 4 }), BARBELL)
    expect(messen.sets).toBe(PROBE_SETS)
    expect(messen.restSeconds).toBeLessThan(150)
  })

  it('tastet mit hohem Wiederholungsziel, merkt sich aber das echte', () => {
    // Der Tastsatz läuft mit zwölf Wiederholungen, weil die ZAHL das
    // Messinstrument ist. Das echte Ziel darf dabei nicht verloren gehen —
    // sonst wüsste die App am Ende nicht, für welche Vorgabe sie ein Gewicht
    // gesucht hat.
    const messen = toCalibrationExercise(
      planned({ targetReps: 5, repRangeMin: 5, repRangeMax: 8, targetRir: 2 }),
      BARBELL,
    )
    expect(messen.targetReps).toBe(PROBE_REPS)
    expect(messen.probeForReps).toBe(5)
    expect(messen.targetRir).toBe(2)
  })

  it('merkt sich bei Körpergewichtsübungen kein Messziel', () => {
    const messen = toCalibrationExercise(planned({ weightKg: null }), null)
    expect(messen.probeForReps).toBeNull()
    expect(messen.targetReps).toBe(8)
  })

  it('lässt Körpergewichtsübungen in Ruhe', () => {
    // Bei Klimmzügen gibt es kein Gewicht einzumessen.
    const messen = toCalibrationExercise(
      planned({ weightKg: null, exerciseName: 'Klimmzug' }),
      null,
    )
    expect(messen.weightKg).toBeNull()
    expect(messen.selectionReason).toBe('Grundübung')
  })

  it('erklärt, warum das Gewicht so niedrig ist', () => {
    const messen = toCalibrationExercise(planned(), BARBELL)
    expect(messen.selectionReason).toMatch(/Einmessen/)
  })
})

describe('calibrationState', () => {
  it('braucht eine Einheit pro Trainingstag', () => {
    expect(calibrationSessionsNeeded(['mon', 'tue', 'thu', 'fri'])).toBe(4)
    expect(calibrationSessionsNeeded(['mon', 'wed', 'fri'])).toBe(3)
  })

  it('läuft nicht länger als die Obergrenze', () => {
    expect(
      calibrationSessionsNeeded(['mon', 'tue', 'wed', 'thu', 'fri', 'sat']),
    ).toBe(MAX_CALIBRATION_SESSIONS)
  })

  it('ist am Anfang aktiv und nach einer Runde vorbei', () => {
    const tage = ['mon', 'tue', 'thu', 'fri'] as const
    expect(
      calibrationState({ trainingDays: tage, completedCalibrationSessions: 0 }).active,
    ).toBe(true)
    expect(
      calibrationState({ trainingDays: tage, completedCalibrationSessions: 3 }).active,
    ).toBe(true)
    expect(
      calibrationState({ trainingDays: tage, completedCalibrationSessions: 4 }).active,
    ).toBe(false)
  })
})
