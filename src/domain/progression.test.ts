import { describe, expect, it } from 'vitest'
import { equipmentById } from '../data'
import type { Equipment } from '../types'
import type { SetFeedback } from './records'
import {
  bestE1rm,
  exerciseStatus,
  inSessionCorrection,
  nextPrescription,
  rirDrift,
  sessionQuality,
  setStatus,
  stagnationCount,
  targetHitRate,
  volumeLoad,
  type CurrentPrescription,
  type ExerciseAttempt,
  type ExerciseStatus,
  type SetOutcome,
} from './progression'

function eq(id: string): Equipment {
  const found = equipmentById.get(id)
  if (!found) throw new Error(`Gerät ${id} nicht in der Datenbank`)
  return found
}

const STACK = () => eq('LEG-01') // Steckgewicht, 5 kg Stufen
const BARBELL = () => eq('FRE-02') // Langhantel, 2,5 kg Stufen
const ASSISTED = () => eq('FRE-11') // invertiert: weniger Gewicht = schwerer

/** Baut einen Arbeitssatz. Vorgabe 8 Wdh, sofern nicht überschrieben. */
function set(overrides: Partial<SetOutcome> = {}): SetOutcome {
  return {
    prescribedReps: 8,
    prescribedSeconds: null,
    actualReps: 8,
    actualSeconds: null,
    weightKg: 60,
    feedback: 'as_planned',
    abandoned: false,
    ...overrides,
  }
}

function sets(count: number, overrides: Partial<SetOutcome> = {}): SetOutcome[] {
  return Array.from({ length: count }, () => set(overrides))
}

/**
 * Historie am gleichen Vorgabe-Gewicht — der Normalfall in diesen Tests.
 * Das Gewicht ist Teil der Historie, weil das Bestätigungsfenster nur
 * Einheiten seit der letzten Gewichtsänderung zählt.
 */
function past(
  statuses: ExerciseStatus[],
  weightKg: number | null = 60,
  targetReps: number | null = 8,
): ExerciseAttempt[] {
  return statuses.map((status) => ({ status, weightKg, targetReps }))
}

function prescription(overrides: Partial<CurrentPrescription> = {}): CurrentPrescription {
  return {
    weightKg: 60,
    targetReps: 8,
    repRangeMin: 6,
    repRangeMax: 10,
    targetSeconds: null,
    ...overrides,
  }
}

// ────────────────────────────────────────────────────────────────────

describe('setStatus — Bewertung eines einzelnen Satzes', () => {
  it('erkennt einen getroffenen Satz', () => {
    expect(setStatus(set())).toBe('getroffen')
  })

  it('erkennt einen übertroffenen Satz nur mit Reserve-Rückmeldung', () => {
    expect(setStatus(set({ actualReps: 10, feedback: 'more_left' }))).toBe('uebertroffen')
    // Mehr Wiederholungen, aber am Limit: die Vorgabe war zu niedrig
    // angesetzt, nicht zu leicht — das ist kein Signal zum Steigern.
    expect(setStatus(set({ actualReps: 10, feedback: 'at_limit' }))).toBe('hart')
  })

  it('erkennt einen verfehlten Satz', () => {
    expect(setStatus(set({ actualReps: 6 }))).toBe('verfehlt')
  })

  it('bewertet einen harten Satz als hart, nicht als getroffen', () => {
    expect(setStatus(set({ feedback: 'at_limit' }))).toBe('hart')
  })

  it('behandelt einen Abbruch als Verfehlung, nicht als 0 Wiederholungen', () => {
    expect(setStatus(set({ abandoned: true, actualReps: 5 }))).toBe('verfehlt')
  })

  it('bewertet ohne Abgleich neutral', () => {
    expect(setStatus(set({ feedback: null }))).toBe('getroffen')
  })

  it('funktioniert für zeitbasierte Übungen', () => {
    const plank = set({
      prescribedReps: null,
      actualReps: null,
      prescribedSeconds: 45,
      actualSeconds: 60,
      feedback: 'more_left',
    })
    expect(setStatus(plank)).toBe('uebertroffen')
    expect(setStatus({ ...plank, actualSeconds: 30 })).toBe('verfehlt')
  })
})

describe('exerciseStatus — die Übung ist das Signal', () => {
  it('verlangt für ÜBERTROFFEN die Mehrheit der Sätze mit Reserve', () => {
    expect(exerciseStatus(sets(3, { actualReps: 10, feedback: 'more_left' }))).toBe(
      'UEBERTROFFEN',
    )
  })

  it('bewertet einen starken ersten Satz mit zwei mittelmäßigen als ERFUELLT', () => {
    // Genau der Fall, den der Nutzer ausdrücklich ausgeschlossen hat:
    // nicht steigern, nur weil EIN Satz gut war.
    const outcome = exerciseStatus([
      set({ actualReps: 11, feedback: 'more_left' }),
      set(),
      set(),
    ])
    expect(outcome).toBe('ERFUELLT')
  })

  it('bewertet alle Sätze getroffen als ERFUELLT', () => {
    expect(exerciseStatus(sets(3))).toBe('ERFUELLT')
  })

  it('steigert nicht, wenn die Wiederholungen nur am Limit erreicht wurden', () => {
    // Alle Wiederholungen geschafft, aber jedes Mal am Limit, obwohl
    // Reserve vorgegeben war. Nominell erfüllt, tatsächlich zu hart.
    expect(exerciseStatus(sets(3, { feedback: 'at_limit' }))).toBe('KNAPP')
  })

  it('bewertet eine gemischte Rückmeldung ohne Mehrheit als ERFUELLT', () => {
    expect(
      exerciseStatus([
        set({ feedback: 'at_limit' }),
        set({ feedback: 'as_planned' }),
        set({ actualReps: 10, feedback: 'more_left' }),
      ]),
    ).toBe('ERFUELLT')
  })

  it('bewertet einen knapp verfehlten Satz als KNAPP', () => {
    expect(exerciseStatus([set(), set(), set({ actualReps: 7 })])).toBe('KNAPP')
  })

  it('bewertet einen deutlich verfehlten Satz als VERFEHLT', () => {
    expect(exerciseStatus([set(), set(), set({ actualReps: 4 })])).toBe('VERFEHLT')
  })

  it('bewertet zwei verfehlte Sätze als VERFEHLT', () => {
    expect(exerciseStatus([set(), set({ actualReps: 7 }), set({ actualReps: 7 })])).toBe(
      'VERFEHLT',
    )
  })

  it('bewertet einen Abbruch als VERFEHLT', () => {
    expect(exerciseStatus([set(), set(), set({ abandoned: true })])).toBe('VERFEHLT')
  })

  it('bewertet eine Übung ohne Arbeitssätze als VERFEHLT', () => {
    expect(exerciseStatus([])).toBe('VERFEHLT')
  })
})

describe('Regelkreis 1 — Korrektur innerhalb der Einheit', () => {
  it('korrigiert nach oben, wenn das Gewicht klar zu niedrig angesetzt war', () => {
    const correction = inSessionCorrection({
      firstSet: set({ actualReps: 12, feedback: 'more_left' }),
      equipment: BARBELL(),
      calibrationWeek: false,
    })
    expect(correction?.weightKg).toBe(62.5)
    expect(correction?.steps).toBe(1)
    // Die Formulierung ist Teil der Logik: Kreis 1 behebt einen Fehler
    // der App, er feiert keinen Fortschritt.
    expect(correction?.message).toContain('zu niedrig angesetzt')
    expect(correction?.message).not.toContain('stärker')
  })

  it('greift in der Einmess-Woche zwei Stufen', () => {
    const correction = inSessionCorrection({
      firstSet: set({ actualReps: 12, feedback: 'more_left' }),
      equipment: BARBELL(),
      calibrationWeek: true,
    })
    expect(correction?.weightKg).toBe(65)
    expect(correction?.steps).toBe(2)
  })

  it('greift nicht bei kleinen Abweichungen', () => {
    // 2 Wdh mehr mit Reserve ist Tagesform, kein Schätzfehler.
    expect(
      inSessionCorrection({
        firstSet: set({ actualReps: 10, feedback: 'more_left' }),
        equipment: BARBELL(),
        calibrationWeek: false,
      }),
    ).toBeNull()
  })

  it('greift nicht, wenn mehr Wiederholungen am Limit erreicht wurden', () => {
    expect(
      inSessionCorrection({
        firstSet: set({ actualReps: 12, feedback: 'at_limit' }),
        equipment: BARBELL(),
        calibrationWeek: false,
      }),
    ).toBeNull()
  })

  it('korrigiert nach unten, wenn deutlich zu wenige Wiederholungen kamen', () => {
    const correction = inSessionCorrection({
      firstSet: set({ actualReps: 5, feedback: 'at_limit' }),
      equipment: BARBELL(),
      calibrationWeek: false,
    })
    expect(correction?.weightKg).toBe(57.5)
    expect(correction?.steps).toBe(-1)
  })

  it('korrigiert zwei Stufen nach unten bei sehr grober Fehlschätzung', () => {
    const correction = inSessionCorrection({
      firstSet: set({ actualReps: 2, feedback: 'at_limit' }),
      equipment: BARBELL(),
      calibrationWeek: false,
    })
    expect(correction?.steps).toBe(-2)
    expect(correction?.weightKg).toBe(55)
  })

  it('korrigiert nach unten, wenn die Vorgabe knapp verfehlt und am Limit war', () => {
    const correction = inSessionCorrection({
      firstSet: set({ actualReps: 7, feedback: 'at_limit' }),
      equipment: BARBELL(),
      calibrationWeek: false,
    })
    expect(correction?.steps).toBe(-1)
  })

  it('dreht die Richtung am invertierten Gerät', () => {
    // FRE-11: weniger Unterstützung = schwerer. „Zu leicht" heißt hier,
    // dass die Unterstützung SINKEN muss.
    const correction = inSessionCorrection({
      firstSet: set({ weightKg: 40, actualReps: 12, feedback: 'more_left' }),
      equipment: ASSISTED(),
      calibrationWeek: false,
    })
    expect(correction).not.toBeNull()
    expect(correction!.weightKg).toBeLessThan(40)
  })

  it('greift nicht bei Körpergewichtsübungen ohne Gewicht', () => {
    expect(
      inSessionCorrection({
        firstSet: set({ weightKg: null, actualReps: 15, feedback: 'more_left' }),
        equipment: BARBELL(),
        calibrationWeek: false,
      }),
    ).toBeNull()
  })
})

describe('Regelkreis 2 — Doppelprogression mit Bestätigungsregel', () => {
  it('steigert bei Fortgeschrittenen zuerst nur die Wiederholungen', () => {
    const next = nextPrescription({
      current: prescription(),
      history: past(['UEBERTROFFEN']),
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })
    expect(next.weightKg).toBe(60)
    expect(next.targetReps).toBe(9)
    expect(next.reason).toContain('Bestätigung')
  })

  it('steigert das Gewicht erst bei zweimaliger Bestätigung', () => {
    const next = nextPrescription({
      current: prescription({ targetReps: 9 }),
      history: past(['UEBERTROFFEN', 'UEBERTROFFEN']),
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })
    expect(next.weightKg).toBe(62.5)
    // Beim Gewichtssprung zurück an den unteren Rand des Bereichs.
    expect(next.targetReps).toBe(6)
  })

  it('steigert bei Anfängern sofort das Gewicht', () => {
    const next = nextPrescription({
      current: prescription(),
      history: past(['UEBERTROFFEN']),
      level: 'beginner',
      equipment: STACK(),
      calibrationWeek: false,
    })
    expect(next.weightKg).toBe(65)
  })

  it('steigert in der Einmess-Woche sofort das Gewicht', () => {
    const next = nextPrescription({
      current: prescription(),
      history: past(['UEBERTROFFEN']),
      level: 'advanced',
      equipment: BARBELL(),
      calibrationWeek: true,
    })
    expect(next.weightKg).toBe(62.5)
  })

  it('steigert niemals Gewicht UND Wiederholungen gleichzeitig', () => {
    // Die harte Obergrenze aus docs/PLAN-ENGINE.md §11 — geprüft über
    // alle Statuskombinationen.
    const statuses: ExerciseStatus[] = ['UEBERTROFFEN', 'ERFUELLT', 'KNAPP', 'VERFEHLT']
    for (const first of statuses) {
      for (const second of statuses) {
        for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
          const current = prescription()
          const next = nextPrescription({
            current,
            history: past([first, second]),
            level,
            equipment: BARBELL(),
            calibrationWeek: false,
            sessionWasTooEasy: true,
          })
          const weightRose = (next.weightKg ?? 0) > (current.weightKg ?? 0)
          const repsRose = (next.targetReps ?? 0) > (current.targetReps ?? 0)
          expect(weightRose && repsRose).toBe(false)
        }
      }
    }
  })

  it('steigert maximal eine Wiederholung, auch bei Ausnahmeleistung', () => {
    const next = nextPrescription({
      current: prescription(),
      history: past(['UEBERTROFFEN', 'UEBERTROFFEN', 'UEBERTROFFEN', 'UEBERTROFFEN']),
      level: 'intermediate',
      // Körpergewichtsübung: hier kann nur die Wiederholungszahl steigen
      equipment: null,
      calibrationWeek: false,
    })
    expect(next.targetReps).toBe(9)
  })

  it('wechselt am oberen Rand des Bereichs aufs Gewicht', () => {
    const next = nextPrescription({
      current: prescription({ targetReps: 10 }),
      history: past(['ERFUELLT']),
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })
    expect(next.weightKg).toBe(62.5)
    expect(next.targetReps).toBe(6)
    expect(next.reason).toContain('ausgereizt')
  })

  it('steigert bei ERFUELLT die Wiederholungen', () => {
    const next = nextPrescription({
      current: prescription(),
      history: past(['ERFUELLT']),
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })
    expect(next.targetReps).toBe(9)
    expect(next.weightKg).toBe(60)
  })

  it('hält die Vorgabe bei KNAPP unverändert', () => {
    const next = nextPrescription({
      current: prescription(),
      history: past(['KNAPP']),
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })
    expect(next.changed).toBe(false)
    expect(next.weightKg).toBe(60)
    expect(next.targetReps).toBe(8)
  })

  it('hält die Vorgabe nach EINER Verfehlung', () => {
    // Ein schlechter Tag ist kein Grund für einen Rückschritt.
    const next = nextPrescription({
      current: prescription(),
      history: past(['ERFUELLT', 'VERFEHLT']),
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })
    expect(next.changed).toBe(false)
    expect(next.regression).toBe(false)
  })

  it('nimmt das Gewicht nach zwei Verfehlungen zurück', () => {
    const next = nextPrescription({
      current: prescription(),
      history: past(['VERFEHLT', 'VERFEHLT']),
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })
    expect(next.weightKg).toBe(55)
    expect(next.targetReps).toBe(6)
    expect(next.regression).toBe(true)
  })

  it('überspringt die Bestätigung, wenn die ganze Einheit zu leicht war', () => {
    const next = nextPrescription({
      current: prescription(),
      history: past(['UEBERTROFFEN']),
      level: 'advanced',
      equipment: BARBELL(),
      calibrationWeek: false,
      sessionWasTooEasy: true,
    })
    expect(next.weightKg).toBe(62.5)
    expect(next.reason).toContain('Einheit')
  })

  it('steigert bei Körpergewichtsübungen nur die Wiederholungen', () => {
    const next = nextPrescription({
      current: prescription({ weightKg: null }),
      history: past(['UEBERTROFFEN', 'UEBERTROFFEN'], null),
      level: 'intermediate',
      equipment: null,
      calibrationWeek: false,
    })
    expect(next.weightKg).toBeNull()
    expect(next.targetReps).toBe(9)
  })

  it('lässt die Vorgabe unverändert, wenn keine Historie vorliegt', () => {
    const next = nextPrescription({
      current: prescription(),
      history: past([]),
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })
    expect(next.changed).toBe(false)
  })

  it('verbraucht die Bestätigung — nach dem Gewichtssprung beginnt sie neu', () => {
    // Der Fehler, den erst eine 10-Wochen-Simulation zeigte: Ohne diese
    // Regel bleibt der Bestätigungszähler dauerhaft über der Schwelle, und
    // ein durchgehend starker Nutzer steigt in JEDER Einheit eine Stufe —
    // in der Simulation +50 kg Bankdrücken in 10 Wochen.
    const next = nextPrescription({
      current: prescription({ weightKg: 62.5, targetReps: 6 }),
      history: [
        // zwei Bestätigungen bei 60 kg → das Gewicht wurde schon angehoben
        { status: 'UEBERTROFFEN', weightKg: 60, targetReps: 8 },
        { status: 'UEBERTROFFEN', weightKg: 60, targetReps: 8 },
        // erste Einheit auf der neuen Stufe
        { status: 'UEBERTROFFEN', weightKg: 62.5, targetReps: 8 },
      ],
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })

    // Nur +1 Wdh — die alten Bestätigungen sind verbraucht.
    expect(next.weightKg).toBe(62.5)
    expect(next.targetReps).toBe(7)
  })

  it('verbraucht auch den Rückschritt — nicht zweimal in Folge senken', () => {
    const next = nextPrescription({
      current: prescription({ weightKg: 55 }),
      history: [
        { status: 'VERFEHLT', weightKg: 60, targetReps: 8 },
        { status: 'VERFEHLT', weightKg: 60, targetReps: 8 },
        // Erste Verfehlung auf dem reduzierten Gewicht
        { status: 'VERFEHLT', weightKg: 55, targetReps: 8 },
      ],
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })

    expect(next.weightKg).toBe(55)
    expect(next.regression).toBe(false)
  })

  it('hält bei KNAPP zunächst, bevor sie eingreift', () => {
    const next = nextPrescription({
      current: prescription(),
      history: past(['KNAPP', 'KNAPP']),
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })
    expect(next.changed).toBe(false)
  })

  it('senkt das Gewicht nach dreimal am Limit unterhalb der Obergrenze', () => {
    // Die Wiederholungen werden getroffen, aber immer am Limit statt mit
    // Reserve. Ohne Ausweg stünde der Nutzer hier wochenlang fest — in der
    // Simulation 16 Einheiten ohne jede Änderung.
    const next = nextPrescription({
      current: prescription({ targetReps: 8 }),
      history: past(['KNAPP', 'KNAPP', 'KNAPP']),
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })

    expect(next.weightKg).toBe(57.5)
    // Gleiche Wiederholungszahl bei weniger Gewicht — genau das stellt den
    // geplanten RIR wieder her.
    expect(next.targetReps).toBe(8)
    // Kein Rückschritt im Sinne des Deload-Zählers: Das ist eine Korrektur
    // der Intensität, kein Leistungsabfall.
    expect(next.regression).toBe(false)
  })

  it('steigert das Gewicht, wenn das Limit an der Bereichsobergrenze liegt', () => {
    // Entscheidender Richtungsunterschied: An der Obergrenze ist „getroffen,
    // aber am Limit" der abgeschlossene Wiederholungsaufbau, kein Stillstand.
    const next = nextPrescription({
      current: prescription({ targetReps: 10 }),
      history: past(['KNAPP', 'KNAPP', 'KNAPP'], 60, 10),
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })

    expect(next.weightKg).toBe(62.5)
    expect(next.targetReps).toBe(6)
  })

  it('verbraucht den Eingriff — nach der Senkung beginnt die Zählung neu', () => {
    const next = nextPrescription({
      current: prescription({ weightKg: 57.5 }),
      history: [
        { status: 'KNAPP', weightKg: 60, targetReps: 8 },
        { status: 'KNAPP', weightKg: 60, targetReps: 8 },
        { status: 'KNAPP', weightKg: 60, targetReps: 8 },
        { status: 'KNAPP', weightKg: 57.5, targetReps: 8 },
      ],
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })
    expect(next.changed).toBe(false)
  })

  it('setzt nach einem Rückschritt auf dem bewiesenen Niveau wieder an', () => {
    // 55 kg × 9 war schon erfüllt. Nach einem Fehlschlag bei 60 kg dort
    // wieder mit 6 Wiederholungen anzufangen wäre verschenkte Zeit.
    const next = nextPrescription({
      current: prescription({ weightKg: 60 }),
      history: [
        { status: 'ERFUELLT', weightKg: 55, targetReps: 9 },
        { status: 'VERFEHLT', weightKg: 60, targetReps: 6 },
        { status: 'VERFEHLT', weightKg: 60, targetReps: 6 },
      ],
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })

    expect(next.weightKg).toBe(55)
    expect(next.targetReps).toBe(9)
    expect(next.regression).toBe(true)
  })

  it('wiederholt einen gescheiterten Sprung nicht auf gleicher Grundlage', () => {
    // Der Sprung auf 12 kg ist von 10 kg × 14 aus schon gescheitert. Ihn
    // beim erneuten Erreichen von 14 sofort zu wiederholen ergab in der
    // Simulation eine Endlosschleife im Dreitakt: springen, zweimal
    // verfehlen, zurückfallen.
    const next = nextPrescription({
      current: prescription({ weightKg: 10, targetReps: 14 }),
      history: [
        { status: 'UEBERTROFFEN', weightKg: 10, targetReps: 14 },
        { status: 'VERFEHLT', weightKg: 12, targetReps: 6 },
        { status: 'VERFEHLT', weightKg: 12, targetReps: 6 },
        { status: 'UEBERTROFFEN', weightKg: 10, targetReps: 14 },
      ],
      level: 'intermediate',
      equipment: eq('FRE-01'),
      calibrationWeek: false,
    })

    expect(next.weightKg).toBe(10)
    expect(next.targetReps).toBe(15)
    expect(next.reason).toContain('gescheitert')
  })

  it('reizt bei grober Stufung erst den Wiederholungsbereich aus', () => {
    // 10-kg-Kurzhantel, kleinste Stufe 2 kg = +20 %. Wer 8 Wdh schafft,
    // schafft mit 20 % mehr keine 6 — der Sprung würde zwangsläufig
    // verfehlt und im nächsten Schritt zurückgenommen.
    const next = nextPrescription({
      current: prescription({ weightKg: 10 }),
      history: [
        { status: 'UEBERTROFFEN', weightKg: 10, targetReps: 8 },
        { status: 'UEBERTROFFEN', weightKg: 10, targetReps: 8 },
      ],
      level: 'intermediate',
      equipment: eq('FRE-01'),
      calibrationWeek: false,
    })

    expect(next.weightKg).toBe(10)
    expect(next.targetReps).toBe(9)
    expect(next.reason).toContain('%')
  })

  it('geht bei grober Stufung auch über die Bereichsobergrenze hinaus', () => {
    // Bei 10 kg × 10 reicht die Kapazität für 12 kg × 6 noch nicht
    // (Epley: 13,3 gegen 14,4 nötig). Den Sprung hier zu nehmen, nur weil
    // der nominelle Bereich ausgereizt ist, führt zur Verfehlung — genau
    // dieses Pendeln zeigte die Simulation. Also weiter Wiederholungen,
    // so wie man es mit festen Kurzhanteln auch tatsächlich macht.
    const next = nextPrescription({
      current: prescription({ weightKg: 10, targetReps: 10 }),
      history: [{ status: 'ERFUELLT', weightKg: 10, targetReps: 10 }],
      level: 'intermediate',
      equipment: eq('FRE-01'),
      calibrationWeek: false,
    })

    expect(next.weightKg).toBe(10)
    expect(next.targetReps).toBe(11)
  })

  it('nimmt den groben Sprung, sobald die Kapazität ihn trägt', () => {
    // Bei 10 kg × 14 reicht es: Epley 14,67 gegen 14,4 nötig.
    const next = nextPrescription({
      current: prescription({ weightKg: 10, targetReps: 14 }),
      history: [{ status: 'ERFUELLT', weightKg: 10, targetReps: 14 }],
      level: 'intermediate',
      equipment: eq('FRE-01'),
      calibrationWeek: false,
    })

    expect(next.weightKg).toBe(12)
    expect(next.targetReps).toBe(6)
  })

  it('gilt die Stufungsprüfung auch für Anfänger', () => {
    const next = nextPrescription({
      current: prescription({ weightKg: 10 }),
      history: [{ status: 'UEBERTROFFEN', weightKg: 10, targetReps: 8 }],
      level: 'beginner',
      equipment: eq('FRE-01'),
      calibrationWeek: false,
    })
    expect(next.weightKg).toBe(10)
    expect(next.targetReps).toBe(9)
  })

  it('lässt schwere Gewichte normal steigen', () => {
    // 2,5 kg auf 60 kg sind 4 % — unproblematisch.
    const next = nextPrescription({
      current: prescription({ weightKg: 60 }),
      history: past(['UEBERTROFFEN', 'UEBERTROFFEN']),
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })
    expect(next.weightKg).toBe(62.5)
  })

  it('unterbricht die Bestätigungskette bei einem schwachen Tag', () => {
    // ÜBERTROFFEN, dann ERFUELLT, dann wieder ÜBERTROFFEN ist KEINE
    // Bestätigung in Folge — es gibt nur die Wiederholung.
    const next = nextPrescription({
      current: prescription(),
      history: past(['UEBERTROFFEN', 'ERFUELLT', 'UEBERTROFFEN']),
      level: 'intermediate',
      equipment: BARBELL(),
      calibrationWeek: false,
    })
    expect(next.weightKg).toBe(60)
    expect(next.targetReps).toBe(9)
  })
})

describe('Regelkreis 2 — zeitbasierte Übungen', () => {
  const plank = () => prescription({ weightKg: null, targetReps: null, targetSeconds: 45 })

  it('steigert die Dauer um 5 Sekunden', () => {
    const next = nextPrescription({
      current: plank(),
      history: past(['ERFUELLT']),
      level: 'intermediate',
      equipment: null,
      calibrationWeek: false,
    })
    expect(next.targetSeconds).toBe(50)
    expect(next.targetReps).toBeNull()
  })

  it('hält die Dauer bei KNAPP', () => {
    const next = nextPrescription({
      current: plank(),
      history: past(['KNAPP']),
      level: 'intermediate',
      equipment: null,
      calibrationWeek: false,
    })
    expect(next.targetSeconds).toBe(45)
    expect(next.changed).toBe(false)
  })

  it('nimmt die Dauer nach zwei Verfehlungen zurück', () => {
    const next = nextPrescription({
      current: plank(),
      history: past(['VERFEHLT', 'VERFEHLT']),
      level: 'intermediate',
      equipment: null,
      calibrationWeek: false,
    })
    expect(next.targetSeconds).toBe(40)
    expect(next.regression).toBe(true)
  })

  it('senkt die Dauer nicht unter eine sinnvolle Untergrenze', () => {
    const next = nextPrescription({
      current: prescription({ weightKg: null, targetReps: null, targetSeconds: 10 }),
      history: past(['VERFEHLT', 'VERFEHLT']),
      level: 'intermediate',
      equipment: null,
      calibrationWeek: false,
    })
    expect(next.targetSeconds).toBe(10)
    expect(next.changed).toBe(false)
  })
})

describe('Regelkreis 2b — die Einheit ist der Auftrag', () => {
  const all = (status: ExerciseStatus, count = 5): ExerciseStatus[] =>
    Array.from({ length: count }, () => status)

  it('erkennt eine durchweg zu leichte Einheit', () => {
    const quality = sessionQuality(all('UEBERTROFFEN'))
    expect(quality.verdict).toBe('zu_leicht')
    expect(quality.allowBroadIncrease).toBe(true)
    expect(quality.allowVolumeIncrease).toBe(true)
  })

  it('bewertet eine erfüllte Einheit als gut, ohne breite Anhebung', () => {
    const quality = sessionQuality(all('ERFUELLT'))
    expect(quality.verdict).toBe('gut')
    expect(quality.allowBroadIncrease).toBe(false)
    expect(quality.allowVolumeIncrease).toBe(true)
  })

  it('erlaubt bei einer normalen Einheit keine Volumenerhöhung', () => {
    const quality = sessionQuality([
      'ERFUELLT',
      'ERFUELLT',
      'ERFUELLT',
      'KNAPP',
      'VERFEHLT',
    ])
    expect(quality.verdict).toBe('normal')
    expect(quality.allowVolumeIncrease).toBe(false)
  })

  it('erkennt eine deutlich verfehlte Einheit als Deload-Signal', () => {
    const quality = sessionQuality(['VERFEHLT', 'VERFEHLT', 'VERFEHLT', 'KNAPP', 'ERFUELLT'])
    expect(quality.verdict).toBe('deload_signal')
    expect(quality.allowVolumeIncrease).toBe(false)
  })

  it('erlaubt breite Anhebung nicht, wenn nur einzelne Übungen gut liefen', () => {
    // Zwei starke Übungen von fünf sind Rauschen, kein Auftrag.
    const quality = sessionQuality([
      'UEBERTROFFEN',
      'UEBERTROFFEN',
      'ERFUELLT',
      'ERFUELLT',
      'ERFUELLT',
    ])
    expect(quality.allowBroadIncrease).toBe(false)
  })

  it('kommt mit einer leeren Einheit zurecht', () => {
    const quality = sessionQuality([])
    expect(quality.allowBroadIncrease).toBe(false)
    expect(quality.allowVolumeIncrease).toBe(false)
  })
})

describe('Kennzahlen', () => {
  it('berechnet das beste e1RM einer Übung', () => {
    const best = bestE1rm([
      set({ weightKg: 60, actualReps: 8 }),
      set({ weightKg: 65, actualReps: 8 }),
      set({ weightKg: 65, actualReps: 6 }),
    ])
    // Epley: 65 × (1 + 8/30) = 82,33
    expect(best).toBe(82.3)
  })

  it('ignoriert abgebrochene Sätze beim e1RM', () => {
    const best = bestE1rm([
      set({ weightKg: 60, actualReps: 8 }),
      set({ weightKg: 100, actualReps: 8, abandoned: true }),
    ])
    expect(best).toBe(76)
  })

  it('gibt null zurück, wenn kein Satz auswertbar ist', () => {
    expect(bestE1rm([set({ weightKg: null })])).toBeNull()
  })

  it('berechnet die Volumenlast', () => {
    expect(volumeLoad([set({ weightKg: 60, actualReps: 8 }), set({ weightKg: 60, actualReps: 7 })])).toBe(
      900,
    )
  })

  it('berechnet die Zielerreichung', () => {
    expect(targetHitRate([set(), set(), set({ actualReps: 5 })])).toBeCloseTo(2 / 3)
    expect(targetHitRate([])).toBe(0)
  })

  it('berechnet die RIR-Drift und erkennt zunehmende Schwere', () => {
    const feedbacks: SetFeedback[] = ['at_limit', 'at_limit', 'as_planned']
    const drift = rirDrift(feedbacks.map((feedback) => set({ feedback })))
    expect(drift).toBeLessThan(0)
    expect(rirDrift([set({ feedback: null })])).toBeNull()
  })

  it('zählt Stagnation ab dem letzten Bestwert', () => {
    expect(stagnationCount([80, 82, 84])).toBe(0)
    expect(stagnationCount([80, 84, 83, 82])).toBe(2)
    expect(stagnationCount([84])).toBe(0)
    expect(stagnationCount([])).toBe(0)
  })

  it('zählt einen gleich hohen Wert als Stillstand, nicht als Fortschritt', () => {
    // Der häufigste Plateaufall überhaupt: viermal exakt dasselbe Gewicht bei
    // denselben Wiederholungen. Ein Zähler, der nur Werte UNTERHALB des
    // Maximums sucht, meldet hier null — das Plateau bliebe unsichtbar.
    expect(stagnationCount([80, 80, 80, 80])).toBe(3)
    expect(stagnationCount([80, 84, 84])).toBe(1)
  })

  it('überspringt Lücken im e1RM-Verlauf', () => {
    expect(stagnationCount([80, null, 84, null, 83])).toBe(1)
  })
})
