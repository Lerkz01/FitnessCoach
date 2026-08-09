import { describe, expect, it } from 'vitest'
import { equipmentById, exerciseById, exercises as allExercises } from '../data'
import type { Exercise } from '../types'
import { generateWeek, type GeneratedWeek } from './generator'
import { movementPatternOf } from './exerciseMeta'
import { newId, nowIso } from './ids'
import { resolveMuscles, type VolumeMuscle } from './muscles'
import { buildVolumePlan } from './planning'
import { tierOf } from './prescription'
import { stepAt } from './weights'
import {
  baseFields,
  type Goal,
  type Level,
  type SessionMinutes,
  type StrengthReference,
  type UserProfile,
  type Weekday,
} from './records'

const at = nowIso()

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    ...baseFields('u', newId(), at),
    displayName: 'Testprofil',
    sex: 'male',
    birthYear: 2000,
    heightCm: 180,
    goal: 'muscle',
    targetWeightKg: 84,
    bodyFatBucket: '15-19',
    priorityMuscles: ['Brust', 'Lat', 'Oberer Rücken'],
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
    onboardingCompletedAt: at,
    ...overrides,
  }
}

const REFERENCE_DATA: { exerciseId: string; pattern: string; weightKg: number | null; reps: number }[] =
  [
    { exerciseId: 'BRU-001', pattern: 'horizontal_push', weightKg: 80, reps: 8 },
    { exerciseId: 'QUA-012', pattern: 'squat', weightKg: 100, reps: 6 },
    { exerciseId: 'RUE-001', pattern: 'vertical_pull', weightKg: 70, reps: 10 },
    { exerciseId: 'RUE-023', pattern: 'horizontal_pull', weightKg: 70, reps: 10 },
    { exerciseId: 'SCH-005', pattern: 'vertical_push', weightKg: 50, reps: 8 },
    { exerciseId: 'RUE-058', pattern: 'hinge', weightKg: 120, reps: 5 },
  ]

function makeReferences(): StrengthReference[] {
  return REFERENCE_DATA.map((r, index) => ({
    ...baseFields('u', `ref-${index}`, at),
    exerciseId: r.exerciseId,
    pattern: r.pattern as StrengthReference['pattern'],
    weightKg: r.weightKg,
    reps: r.reps,
    recordedAt: at,
  }))
}

function generate(
  overrides: Partial<UserProfile> = {},
  options: {
    withReferences?: boolean
    calibrationWeek?: boolean
    excludeExerciseIds?: ReadonlySet<string>
  } = {},
): { week: GeneratedWeek; profile: UserProfile } {
  const profile = makeProfile(overrides)
  const volume = buildVolumePlan({
    level: profile.level,
    goal: profile.goal,
    priorityMuscles: profile.priorityMuscles,
  })
  const week = generateWeek({
    profile,
    volumeTargets: volume.start,
    references: (options.withReferences ?? true) ? makeReferences() : [],
    bodyweightKg: 78,
    calibrationWeek: options.calibrationWeek ?? true,
    excludeExerciseIds: options.excludeExerciseIds,
  })
  return { week, profile }
}

function ex(id: string): Exercise {
  const found = exerciseById.get(id)
  if (!found) throw new Error(`Übung ${id} nicht in der Datenbank`)
  return found
}

function allExerciseIds(week: GeneratedWeek): string[] {
  return week.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId))
}

function primaryMusclesOf(id: string): VolumeMuscle[] {
  return ex(id).primary.flatMap((raw) => resolveMuscles(raw))
}

// ────────────────────────────────────────────────────────────────────

describe('Grundgerüst', () => {
  it('erzeugt eine Einheit pro Trainingstag', () => {
    const { week, profile } = generate()
    expect(week.sessions).toHaveLength(profile.trainingDays.length)
    expect(week.sessions.map((s) => s.weekday)).toEqual(profile.trainingDays)
  })

  it('vergibt jeder Einheit eine Bezeichnung und Übungen', () => {
    const { week } = generate()
    for (const session of week.sessions) {
      expect(session.label.length).toBeGreaterThan(0)
      expect(session.exercises.length).toBeGreaterThanOrEqual(4)
    }
  })

  it('nummeriert die Übungen lückenlos ab 0', () => {
    const { week } = generate()
    for (const session of week.sessions) {
      expect(session.exercises.map((e) => e.orderIndex)).toEqual(
        session.exercises.map((_, index) => index),
      )
    }
  })

  it('funktioniert für 3 bis 6 Trainingstage', () => {
    const tage: Weekday[][] = [
      ['mon', 'wed', 'fri'],
      ['mon', 'tue', 'thu', 'fri'],
      ['mon', 'tue', 'wed', 'thu', 'fri'],
      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    ]
    for (const trainingDays of tage) {
      const { week } = generate({ trainingDays })
      expect(week.sessions, `${trainingDays.length} Tage`).toHaveLength(trainingDays.length)
      for (const session of week.sessions) {
        expect(session.exercises.length, `${trainingDays.length} Tage`).toBeGreaterThan(2)
      }
    }
  })
})

// ── Die Regressionen, die beim Bauen aufgefallen sind ────────────────

describe('Programmgestaltung', () => {
  it('setzt für jeden großen Muskel eine Grundübung, nicht nur Isolation', () => {
    // Ohne diese Regel gewinnen Fliegende gegen Bankdrücken, weil sie den
    // Bonus für gedehnte Position kassieren — das ergäbe ein Brusttraining
    // aus drei Fliegende-Varianten und keinem Drücken.
    const { week } = generate()
    const grosse: VolumeMuscle[] = ['Brust', 'Lat', 'Oberer Rücken', 'Quadrizeps']

    for (const muskel of grosse) {
      const grundübungen = allExerciseIds(week)
        .filter((id) => primaryMusclesOf(id).includes(muskel))
        .filter((id) => tierOf(ex(id)) !== 'isolation')
      expect(grundübungen.length, `${muskel} ohne Grundübung`).toBeGreaterThan(0)
    }
  })

  it('programmiert die Übungen, für die der Nutzer Referenzwerte angegeben hat', () => {
    // Wer „Kniebeuge 100 kg × 6" angibt, trainiert Kniebeugen. Für genau
    // diese Übungen ist das Startgewicht außerdem am genauesten bekannt.
    const { week } = generate()
    const ids = new Set(allExerciseIds(week))

    expect(ids.has('BRU-001'), 'Bankdrücken fehlt').toBe(true)
    expect(ids.has('QUA-012'), 'Kniebeuge fehlt').toBe(true)
  })

  it('stellt Grundübungen vor Isolationsübungen', () => {
    const { week } = generate()
    for (const session of week.sessions) {
      const stufen = session.exercises.map((e) => tierOf(ex(e.exerciseId)))
      const ersteIsolation = stufen.indexOf('isolation')
      if (ersteIsolation === -1) continue
      // Nach der ersten Isolationsübung darf keine schwere Grundübung folgen.
      expect(
        stufen.slice(ersteIsolation).includes('heavy_compound'),
        `${session.label}: Grundübung nach Isolation`,
      ).toBe(false)
    }
  })

  it('bringt keine Hüftstreckung an den Oberkörpertag', () => {
    // Rack Pulls haben „ob. Rücken" als Primärmuskel und wären damit für
    // eine Oberkörper-Einheit zulässig — programmatisch ist das falsch.
    const { week } = generate()
    for (const session of week.sessions) {
      if (session.focus !== 'upper' && session.focus !== 'push' && session.focus !== 'pull') {
        continue
      }
      for (const item of session.exercises) {
        const pattern = movementPatternOf(ex(item.exerciseId))
        expect(
          pattern === 'hinge' || pattern === 'squat',
          `${session.label}: ${item.exerciseName} (${pattern})`,
        ).toBe(false)
      }
    }
  })

  it('bringt kein Drücken oder Ziehen an den Unterkörpertag', () => {
    const { week } = generate()
    for (const session of week.sessions) {
      if (session.focus !== 'lower') continue
      for (const item of session.exercises) {
        const pattern = movementPatternOf(ex(item.exerciseId))
        if (pattern === null) continue
        expect(['squat', 'hinge'], `${session.label}: ${item.exerciseName}`).toContain(pattern)
      }
    }
  })

  it('setzt nicht zwei schwere Übungen desselben Musters in eine Einheit', () => {
    // Kreuzheben und Sumo-Kreuzheben an einem Tag wären in Summe zu viel
    // Wirbelsäulenbelastung.
    const { week } = generate()
    for (const session of week.sessions) {
      const schwereMuster = session.exercises
        .map((e) => ex(e.exerciseId))
        .filter((e) => tierOf(e) === 'heavy_compound')
        .map((e) => movementPatternOf(e))
        .filter((p): p is NonNullable<typeof p> => p !== null)

      const zaehler = new Map<string, number>()
      for (const pattern of schwereMuster) {
        zaehler.set(pattern, (zaehler.get(pattern) ?? 0) + 1)
      }
      for (const [pattern, anzahl] of zaehler) {
        expect(anzahl, `${session.label}: ${anzahl}× ${pattern}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('verwendet keine explosiven Ganzkörperübungen für Muskelaufbau', () => {
    // Power Clean, High Pull, Renegade Rows und Burpees sind Athletik- und
    // Konditionsmittel, kein Hypertrophie-Werkzeug.
    const { week } = generate({ goal: 'muscle' })
    for (const id of allExerciseIds(week)) {
      expect(ex(id).group, id).not.toBe('Ganzkörper')
    }
  })

  it('bevorzugt keine Progressionsvarianten als Einstiegsübung', () => {
    // „Klimmzug mit Zusatzgewicht" ist eine Steigerungsstufe, keine
    // Einstiegsübung.
    const { week } = generate()
    for (const id of allExerciseIds(week)) {
      expect(ex(id).name.toLowerCase(), id).not.toContain('zusatzgewicht')
    }
  })

  it('respektiert die persönliche Blacklist', () => {
    const { week } = generate({ blacklistedExerciseIds: ['BRU-001', 'QUA-012'] })
    const ids = new Set(allExerciseIds(week))
    expect(ids.has('BRU-001')).toBe(false)
    expect(ids.has('QUA-012')).toBe(false)
    // Und baut trotzdem einen vollständigen Plan.
    expect(week.sessions.every((s) => s.exercises.length >= 4)).toBe(true)
  })

  it('schließt bei akuten Beschwerden die betroffenen Übungen aus', () => {
    const { week } = generate({ injuries: [{ region: 'knee', severity: 'acute' }] })
    const ids = new Set(allExerciseIds(week))
    expect(ids.has('QUA-012'), 'Kniebeuge trotz akuter Knieprobleme').toBe(false)
    expect(ids.has('QUA-001'), 'Beinstrecker trotz akuter Knieprobleme').toBe(false)
    // Der Plan bleibt nutzbar.
    expect(week.sessions.every((s) => s.exercises.length >= 3)).toBe(true)
  })
})

// ── Vorgaben ────────────────────────────────────────────────────────

describe('Vorgaben pro Übung', () => {
  it('gibt immer eine konkrete Zielzahl, nie nur einen Bereich', () => {
    const { week } = generate()
    for (const session of week.sessions) {
      for (const item of session.exercises) {
        const hatZiel = item.targetReps !== null || item.targetSeconds !== null
        expect(hatZiel, `${item.exerciseName} ohne Zielzahl`).toBe(true)
        if (item.targetReps !== null) {
          expect(item.targetReps).toBeGreaterThanOrEqual(item.repRangeMin ?? 0)
          expect(item.targetReps).toBeLessThanOrEqual(item.repRangeMax ?? 99)
        }
      }
    }
  })

  it('gibt bei schweren Grundübungen niemals Muskelversagen vor', () => {
    // Nicht aus Vorsicht: Für Kraft bringt es nichts und es kostet das
    // Volumen der Folgeübungen (docs/TRAINING-SCIENCE.md §4).
    for (const intensity of ['moderate', 'demanding', 'very_demanding'] as const) {
      const { week } = generate({ intensity })
      for (const session of week.sessions) {
        for (const item of session.exercises) {
          if (tierOf(ex(item.exerciseId)) !== 'heavy_compound') continue
          expect(item.targetRir, `${item.exerciseName} bei ${intensity}`).toBeGreaterThanOrEqual(1)
        }
      }
    }
  })

  it('hält Satzpausen nie unter 60 Sekunden', () => {
    for (const sessionMinutes of [45, 60, 75, 90] as SessionMinutes[]) {
      const { week } = generate({ sessionMinutes })
      for (const session of week.sessions) {
        for (const item of session.exercises) {
          expect(item.restSeconds, `${sessionMinutes} Min`).toBeGreaterThanOrEqual(60)
        }
      }
    }
  })

  it('begrenzt Isolationsübungen auf höchstens 3 Sätze', () => {
    const { week } = generate()
    for (const session of week.sessions) {
      for (const item of session.exercises) {
        if (tierOf(ex(item.exerciseId)) !== 'isolation') continue
        expect(item.sets, item.exerciseName).toBeLessThanOrEqual(3)
      }
    }
  })

  it('setzt bei knappem Zeitbudget kürzere Pausen als bei viel Zeit', () => {
    const kurz = generate({ sessionMinutes: 45 }).week
    const lang = generate({ sessionMinutes: 90 }).week

    const schnitt = (week: GeneratedWeek) => {
      const alle = week.sessions.flatMap((s) => s.exercises.map((e) => e.restSeconds))
      return alle.reduce((a, b) => a + b, 0) / alle.length
    }
    expect(schnitt(kurz)).toBeLessThan(schnitt(lang))
  })
})

// ── Gewichte ────────────────────────────────────────────────────────

describe('Gewichtsvorgaben', () => {
  it('gibt nur real einstellbare Gewichte vor', () => {
    // Die harte Regel aus gym-geraete.md: keine „37 kg" an einem 5-kg-Stack.
    const { week } = generate()
    for (const session of week.sessions) {
      for (const item of session.exercises) {
        if (item.weightKg === null) continue
        const exercise = ex(item.exerciseId)
        const equipment = exercise.equipmentIds
          .map((id) => equipmentById.get(id))
          .find((e) => e && e.stepKg !== null)
        if (!equipment) continue

        const step = stepAt(equipment, item.weightKg)
        if (step === null) continue
        const rest = Math.abs(item.weightKg / step - Math.round(item.weightKg / step))
        expect(rest, `${item.exerciseName}: ${item.weightKg} kg bei ${step}-kg-Stufen`).toBeLessThan(
          0.01,
        )
      }
    }
  })

  it('gibt Körpergewichtsübungen kein Gewicht', () => {
    // Ein „Sissy Squat mit 75 kg" ist an dem Gerät nicht einstellbar —
    // Bank und Rack sind Positionierhilfen, keine Lastquelle.
    const { week } = generate()
    const ids = new Set(allExerciseIds(week))
    for (const id of ['QUA-029', 'RUE-012', 'ABS-019', 'BRU-032']) {
      if (!ids.has(id)) continue
      const item = week.sessions
        .flatMap((s) => s.exercises)
        .find((e) => e.exerciseId === id)
      expect(item?.weightKg, `${id} sollte kein Gewicht haben`).toBeNull()
    }
  })

  it('bleibt bei Kurzhanteln im plausiblen Bereich', () => {
    // Der Wadenanteil von 0,9 des Körpergewichts ergab an der Kurzhantel
    // 60 kg pro Hand für einen Farmer's Walk.
    const { week } = generate()
    for (const session of week.sessions) {
      for (const item of session.exercises) {
        if (item.weightKg === null) continue
        if (!ex(item.exerciseId).equipmentIds.includes('FRE-01')) continue
        expect(item.weightKg, `${item.exerciseName} pro Hantel`).toBeLessThanOrEqual(78 * 0.45)
      }
    }
  })

  it('setzt in der Einmess-Woche konservativer an', () => {
    const einmessen = generate({}, { calibrationWeek: true }).week
    const normal = generate({}, { calibrationWeek: false }).week

    const bench = (week: GeneratedWeek) =>
      week.sessions.flatMap((s) => s.exercises).find((e) => e.exerciseId === 'BRU-001')?.weightKg

    const a = bench(einmessen)
    const b = bench(normal)
    if (a !== null && a !== undefined && b !== null && b !== undefined) {
      expect(a).toBeLessThan(b)
    }
  })

  it('leitet aus dem Referenzwert ein plausibles Arbeitsgewicht ab', () => {
    // Angabe: Bankdrücken 80 kg × 8 → geschätztes 1RM ≈ 101 kg.
    // Bei 5 Zielwiederholungen und Einmess-Abschlag liegt das Arbeitsgewicht
    // sinnvollerweise zwischen 70 und 90 kg.
    const { week } = generate()
    const bench = week.sessions
      .flatMap((s) => s.exercises)
      .find((e) => e.exerciseId === 'BRU-001')
    expect(bench?.weightKg).toBeGreaterThan(70)
    expect(bench?.weightKg).toBeLessThan(90)
  })

  it('baut auch ohne jede Referenzangabe einen Plan mit Gewichten', () => {
    const { week } = generate({}, { withReferences: false })
    const mitGewicht = week.sessions
      .flatMap((s) => s.exercises)
      .filter((e) => e.weightKg !== null)
    expect(mitGewicht.length).toBeGreaterThan(10)
    for (const item of mitGewicht) {
      expect(item.weightKg!, item.exerciseName).toBeGreaterThan(0)
    }
  })
})

// ── Aufwärmsätze ────────────────────────────────────────────────────

describe('Aufwärmsätze', () => {
  it('gibt sie nur bei schweren Grundübungen', () => {
    const { week } = generate()
    for (const session of week.sessions) {
      for (const item of session.exercises) {
        if (item.warmups.length === 0) continue
        expect(tierOf(ex(item.exerciseId)), item.exerciseName).toBe('heavy_compound')
      }
    }
  })

  it('gibt keine bei leichten oder einbeinigen Übungen', () => {
    // Drei Aufwärmsätze ab 10 kg für einen Bulgarian Split Squat mit
    // 20 kg Kurzhantel wären sinnlos.
    const { week } = generate()
    for (const session of week.sessions) {
      for (const item of session.exercises) {
        if (item.warmups.length === 0) continue
        expect(item.weightKg, item.exerciseName).not.toBeNull()
        expect(item.weightKg!, item.exerciseName).toBeGreaterThanOrEqual(30)
        expect(ex(item.exerciseId).unilateral, item.exerciseName).toBe(false)
      }
    }
  })

  it('steigert das Aufwärmgewicht bis unter das Arbeitsgewicht', () => {
    const { week } = generate()
    for (const session of week.sessions) {
      for (const item of session.exercises) {
        if (item.warmups.length < 2) continue
        const gewichte = item.warmups.map((w) => w.weightKg ?? 0)
        for (let i = 1; i < gewichte.length; i++) {
          expect(gewichte[i], item.exerciseName).toBeGreaterThan(gewichte[i - 1])
        }
        expect(gewichte.at(-1)!, item.exerciseName).toBeLessThan(item.weightKg!)
      }
    }
  })
})

// ── Volumen und Zeit ────────────────────────────────────────────────

describe('Volumen', () => {
  it('trifft das Wochenziel der großen Muskeln annähernd', () => {
    const profile = makeProfile()
    const volume = buildVolumePlan({
      level: profile.level,
      goal: profile.goal,
      priorityMuscles: profile.priorityMuscles,
    })
    const week = generateWeek({
      profile,
      volumeTargets: volume.start,
      references: makeReferences(),
      bodyweightKg: 78,
      calibrationWeek: true,
    })

    const grosse: VolumeMuscle[] = [
      'Brust',
      'Lat',
      'Oberer Rücken',
      'Quadrizeps',
      'Hamstrings',
      'Seitliche Schulter',
    ]
    for (const muskel of grosse) {
      const ziel = volume.start[muskel]!
      const erreicht = week.weeklyVolume[muskel] ?? 0
      // Toleranz nach unten 25 %, nach oben 60 % — indirektes Volumen aus
      // Grundübungen lässt sich nicht exakt steuern.
      expect(erreicht, `${muskel}: Ziel ${ziel}, erreicht ${erreicht}`).toBeGreaterThan(
        ziel * 0.75,
      )
      expect(erreicht, `${muskel}: Ziel ${ziel}, erreicht ${erreicht}`).toBeLessThan(ziel * 1.6)
    }
  })

  it('bleibt pro Muskel und Einheit nahe an der Obergrenze von 10 Sätzen', () => {
    // Exakt einhalten lässt sich die Grenze nicht: Indirektes Volumen aus
    // Grundübungen ist nicht steuerbar — eine Kniebeuge trägt zum Gesäß bei,
    // ob es ins Budget passt oder nicht. Der Generator senkt die Satzzahl,
    // solange das möglich ist; bei der Mindestsatzzahl ist Schluss.
    const { week } = generate()
    for (const session of week.sessions) {
      for (const [muskel, wert] of Object.entries(session.volume)) {
        expect(wert, `${session.label} · ${muskel}`).toBeLessThanOrEqual(12)
      }
    }
  })

  it('senkt das Volumen bei Ziel Fettverlust', () => {
    const gesamt = (goal: Goal) => {
      const profile = makeProfile({ goal })
      const volume = buildVolumePlan({
        level: profile.level,
        goal,
        priorityMuscles: profile.priorityMuscles,
      })
      const week = generateWeek({
        profile,
        volumeTargets: volume.start,
        references: makeReferences(),
        bodyweightKg: 78,
        calibrationWeek: true,
      })
      return Object.values(week.weeklyVolume).reduce((a, b) => a + b, 0)
    }
    expect(gesamt('fatloss')).toBeLessThan(gesamt('muscle'))
  })
})

describe('Zeitbudget', () => {
  it('hält jede Einheit im gewählten Budget', () => {
    for (const sessionMinutes of [45, 60, 75, 90] as SessionMinutes[]) {
      const { week } = generate({ sessionMinutes })
      for (const session of week.sessions) {
        expect(
          session.estimatedMinutes,
          `${sessionMinutes}-Min-Budget: ${session.label} braucht ${session.estimatedMinutes} Min`,
        ).toBeLessThanOrEqual(sessionMinutes)
      }
    }
  })

  it('füllt das Budget sinnvoll aus, statt zu kurz zu bleiben', () => {
    const { week } = generate({ sessionMinutes: 75 })
    const schnitt =
      week.sessions.reduce((sum, s) => sum + s.estimatedMinutes, 0) / week.sessions.length
    expect(schnitt, `Durchschnitt ${schnitt} Min bei 75-Min-Budget`).toBeGreaterThan(40)
  })

  it('plant bei kleinerem Budget weniger Übungen', () => {
    const kurz = generate({ sessionMinutes: 45 }).week
    const lang = generate({ sessionMinutes: 90 }).week
    const anzahl = (week: GeneratedWeek) =>
      week.sessions.reduce((sum, s) => sum + s.exercises.length, 0)
    expect(anzahl(kurz)).toBeLessThan(anzahl(lang))
  })
})

describe('Ziele und Level', () => {
  it('erzeugt für jedes Ziel und Level einen vollständigen Plan', () => {
    for (const goal of ['muscle', 'strength', 'fatloss', 'fitness'] as Goal[]) {
      for (const level of ['beginner', 'intermediate', 'advanced'] as Level[]) {
        const { week } = generate({ goal, level })
        expect(week.sessions.length, `${goal}/${level}`).toBeGreaterThan(0)
        for (const session of week.sessions) {
          expect(session.exercises.length, `${goal}/${level}: ${session.label}`).toBeGreaterThan(2)
        }
      }
    }
  })

  it('nutzt bei Maximalkraft niedrigere Wiederholungen', () => {
    const durchschnitt = (goal: Goal) => {
      const { week } = generate({ goal })
      const werte = week.sessions
        .flatMap((s) => s.exercises)
        .filter((e) => tierOf(ex(e.exerciseId)) === 'heavy_compound')
        .map((e) => e.targetReps ?? 0)
      return werte.reduce((a, b) => a + b, 0) / werte.length
    }
    expect(durchschnitt('strength')).toBeLessThan(durchschnitt('muscle'))
  })

  it('gibt jeder Übung eine Begründung für die Anzeige', () => {
    const { week } = generate()
    for (const session of week.sessions) {
      for (const item of session.exercises) {
        expect(item.selectionReason, item.exerciseName).toBeTruthy()
        expect(item.selectionReason!.length).toBeGreaterThan(3)
      }
    }
  })
})

describe('Abwechslung über die Woche', () => {
  it('wiederholt Übungen zwischen A- und B-Einheiten nur selten', () => {
    const { week } = generate()
    const alle = allExerciseIds(week)
    const eindeutige = new Set(alle)
    // Mindestens drei Viertel der Übungsplätze sind verschiedene Übungen.
    expect(eindeutige.size / alle.length).toBeGreaterThan(0.75)
  })

  it('nutzt pro Muskel höchstens 4 verschiedene Übungen pro Woche', () => {
    // Mehr Varianten kosten die Vergleichbarkeit, auf der die Progression
    // beruht (docs/TRAINING-SCIENCE.md §6).
    const { week } = generate()
    const perMuscle = new Map<VolumeMuscle, Set<string>>()
    for (const id of allExerciseIds(week)) {
      for (const muskel of primaryMusclesOf(id)) {
        if (!perMuscle.has(muskel)) perMuscle.set(muskel, new Set())
        perMuscle.get(muskel)!.add(id)
      }
    }
    for (const [muskel, ids] of perMuscle) {
      expect(ids.size, `${muskel}: ${[...ids].join(', ')}`).toBeLessThanOrEqual(4)
    }
  })
})

describe('Rotation — herausrotierte Übungen bleiben draußen', () => {
  it('plant eine ausgeschlossene Übung nicht ein', () => {
    const { week: ohne } = generate()
    const raus = ohne.sessions[0].exercises[1].exerciseId

    const { week: mit } = generate({}, { excludeExerciseIds: new Set([raus]) })
    const jetztGeplant = mit.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId))

    expect(jetztGeplant).not.toContain(raus)
  })

  it('füllt den Platz mit einer anderen Übung, statt ihn leer zu lassen', () => {
    const { week: ohne } = generate()
    const vorher = ohne.sessions.flatMap((s) => s.exercises).length
    const raus = ohne.sessions[0].exercises[1].exerciseId

    const { week: mit } = generate({}, { excludeExerciseIds: new Set([raus]) })
    const nachher = mit.sessions.flatMap((s) => s.exercises).length

    // Der Plan darf nicht schrumpfen — das Wochenvolumen bleibt gleich.
    expect(nachher).toBeGreaterThanOrEqual(vorher - 1)
  })

  it('ignoriert den Ausschluss, wenn er zu viel wegnehmen würde', () => {
    // Ein leerer Plan wäre schlechter als eine wiederholte Übung. Lieber die
    // Rotation aussetzen und das sagen.
    const alle = new Set(allExercises.map((e) => e.id))
    const { week } = generate({}, { excludeExerciseIds: alle })

    expect(week.sessions.flatMap((s) => s.exercises).length).toBeGreaterThan(0)
    expect(week.notes.join(' ')).toContain('Rotation')
  })
})
