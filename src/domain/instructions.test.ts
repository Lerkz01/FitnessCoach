import { describe, expect, it } from 'vitest'
import { exercises } from '../data'
import {
  buildInstruction,
  FAMILY_INSTRUCTIONS,
  movementFamilyOf,
  type MovementFamily,
} from './instructions'

const byName = (name: string) => {
  const found = exercises.find((exercise) => exercise.name === name)
  if (!found) throw new Error(`Übung nicht in der Datenbank: ${name}`)
  return found
}

/**
 * Cardio wird von der App nicht geplant und braucht keine Hinweise. Erkennbar
 * ist es an der METRIK — der Zielmuskel heißt „Grundlagenausdauer" oder
 * „VO2max", nicht „Cardio". Ein Filter auf den Muskelnamen ginge daneben und
 * hat mich bei der ersten Messung genau das gekostet.
 */
const trainable = exercises.filter((exercise) => exercise.metric !== 'cardio')

describe('movementFamilyOf', () => {
  /**
   * Die Zuordnung geschieht über Namensmuster. Das ist zerbrechlich, sobald
   * eine Übung dazukommt oder umbenannt wird — deshalb diese Stichproben.
   * Ausgewählt sind die Fälle, in denen ein falscher Treffer FALSCHE
   * Ausführungshinweise anzeigen würde, nicht nur unpassende.
   */
  it.each([
    // Reihenfolge der Regeln: „Schrägbankdrücken" darf nicht am
    // allgemeinen /drücken/ hängenbleiben.
    ['Langhantel Bankdrücken flach', 'bench_press'],
    // „Hammer Press" ist Bankdrücken, keine Hammer-Curls.
    ['Kurzhantel Bankdrücken Neutralgriff (Hammer Press)', 'bench_press'],
    // „Handgelenkcurls" enthält „curl", bewegt aber das Handgelenk. Der
    // Bizeps-Hinweis „nur im Ellbogen beugen" wäre hier schlicht falsch.
    ['Handgelenkcurls Langhantel', 'wrist'],
    // Umgekehrt: „Reverse Curls" ist trotz des Namens Ellbogenarbeit.
    ['Reverse Curls (SZ-Stange)', 'curl'],
    ['Schulterdrücken Maschine (Steckgewicht)', 'overhead_press'],
    ['Beinpresse 45° Standardstellung', 'leg_press'],
    // „Beinbeuger" und „Beinstrecker" unterscheiden sich um einen
    // Buchstaben und bewegen sich in die entgegengesetzte Richtung.
    ['Beinbeuger liegend', 'leg_curl'],
    ['Beinstrecker', 'leg_extension'],
    // Latzug ist kein Rudern — der Hinweis „nicht nach hinten lehnen"
    // wäre beim Rudern falsch.
    ['Latzug breit Obergriff', 'pulldown'],
    // Fliegende sind kein Drücken: „Ellbogen nicht beugen" gilt nur hier.
    ['Butterfly', 'fly'],
  ] as const)('%s → %s', (name, family) => {
    expect(movementFamilyOf(byName(name))).toBe(family)
  })

  it('hält Halteübungen von Wiederholungsübungen getrennt', () => {
    // Bei einer Halteübung wäre „über den vollen Bewegungsumfang arbeiten"
    // die genau falsche Anweisung.
    expect(FAMILY_INSTRUCTIONS.plank.execution).toContain('halten')
    for (const name of ['Plank', 'Hollow Hold', 'Dead Hang', 'Wall Sit']) {
      expect(movementFamilyOf(byName(name)), name).toBe('plank')
    }
  })

  it('erklärt für praktisch jede Übung mehr als den Auffangtext', () => {
    // Regressionsschutz: Der Auffangtext ist absichtlich vage. Wenn eine
    // neue Regel eine bestehende überschattet, steigt diese Zahl.
    const generisch = trainable.filter(
      (exercise) => movementFamilyOf(exercise) === 'generic',
    )
    expect(generisch.length).toBeLessThanOrEqual(3)
  })

  it('benutzt jede Familie, die es gibt', () => {
    // Eine Familie ohne Übung ist toter Text, den niemand pflegt und
    // niemand sieht. Der Auffangtext ist die einzige Ausnahme.
    const benutzt = new Set<MovementFamily>(trainable.map(movementFamilyOf))
    const ungenutzt = Object.keys(FAMILY_INSTRUCTIONS).filter(
      (family) => family !== 'generic' && !benutzt.has(family as MovementFamily),
    )
    expect(ungenutzt).toEqual([])
  })
})

describe('FAMILY_INSTRUCTIONS', () => {
  it('nennt für jede Familie Aufbau, Bewegung und Fehler', () => {
    for (const [family, text] of Object.entries(FAMILY_INSTRUCTIONS)) {
      // Zu kurz heißt: entweder nichtssagend oder unfertig. 40 Zeichen sind
      // etwa ein halber Satz.
      expect(text.setup.length, `${family}.setup`).toBeGreaterThan(40)
      expect(text.execution.length, `${family}.execution`).toBeGreaterThan(40)
      expect(text.mistake.length, `${family}.mistake`).toBeGreaterThan(40)
      expect(text.label.length, `${family}.label`).toBeGreaterThan(2)
    }
  })
})

describe('buildInstruction', () => {
  it('nennt das Gerät, an das man gehen muss', () => {
    const info = buildInstruction(byName('Beinpresse 45° Standardstellung'))
    expect(info.equipment.length).toBeGreaterThan(0)
    expect(info.equipment.join(' ')).toMatch(/presse/i)
  })

  it('markiert einseitige Übungen', () => {
    const einseitig = trainable.find((exercise) => exercise.unilateral)
    expect(einseitig).toBeDefined()
    expect(buildInstruction(einseitig!).unilateral).toBe(true)
  })

  it('führt bei Körpergewichtsübungen kein Gerät auf', () => {
    // Ohne diese Prüfung stünde bei Liegestützen „Gerät: —" oder Schlimmeres.
    const info = buildInstruction(byName('Liegestütze'))
    expect(info.equipment).toEqual([])
  })

  it('liefert für jede Übung eine vollständige Info', () => {
    for (const exercise of trainable) {
      const info = buildInstruction(exercise)
      expect(info.primaryMuscles.length, exercise.name).toBeGreaterThan(0)
      expect(info.tierLabel.length, exercise.name).toBeGreaterThan(0)
      expect(info.roleNote.length, exercise.name).toBeGreaterThan(20)
    }
  })

  it('nennt keinen Muskel doppelt', () => {
    for (const exercise of trainable) {
      const info = buildInstruction(exercise)
      expect(new Set(info.primaryMuscles).size, exercise.name).toBe(
        info.primaryMuscles.length,
      )
    }
  })
})
