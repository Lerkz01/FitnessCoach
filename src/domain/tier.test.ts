import { describe, expect, it } from 'vitest'
import { exercises } from '../data'
import { movementFamilyOf } from './instructions'
import { prescribe, tierOf } from './prescription'

const byName = (name: string) => {
  const found = exercises.find((exercise) => exercise.name === name)
  if (!found) throw new Error(`Übung nicht in der Datenbank: ${name}`)
  return found
}

/**
 * Die Einstufung als Grund- oder Isolationsübung entscheidet über Sätze,
 * Wiederholungsbereich, RIR, Pausenlänge UND die Position in der Einheit
 * (docs/PLAN-ENGINE.md §6). Ein Fehler darin ist deshalb kein Schönheitsfehler,
 * sondern eine falsche Vorgabe für jede Einheit.
 *
 * Diese Tests sind entstanden, nachdem die Anzeige der „Rolle im Plan" im
 * Übungsinfo-Blatt sichtbar gemacht hat, dass der Latzug als Isolationsübung
 * geführt wurde — mit 10–15 Wiederholungen und 75 Sekunden Pause statt 8–12
 * und 120 Sekunden.
 */
describe('Ein- oder mehrgelenkig', () => {
  it.each([
    // Latzug: Schultergelenk UND Ellbogen arbeiten. War fälschlich Isolation.
    'Latzug breit Obergriff',
    'Latzug eng Untergriff',
    'Latzug Neutralgriff (V-Griff)',
    'Lat Pulldown Dual (Maschine) beidarmig',
    // Rudern am Gerät: dasselbe Argument.
    'Rudermaschine Brustpolster, breit',
    'Rudermaschine plate-loaded, beidarmig',
    // Teilbewegungen des Kreuzhebens.
    'Rack Pulls',
    'Einbeiniges RDL Kurzhantel',
    // Klimmzug, nur exzentrisch — bleibt derselbe Bewegungsablauf.
    'Negativ-Klimmzüge (exzentrisch)',
  ])('%s ist mehrgelenkig', (name) => {
    expect(byName(name).compound).toBe(true)
  })

  it.each([
    // Gegenprobe. Diese sind WIRKLICH eingelenkig — sie umzustellen wäre
    // derselbe Fehler in der anderen Richtung.
    ['Straight-Arm Pulldown', 'Arme bleiben gestreckt, nur die Schulter arbeitet'],
    ['Rückenstrecker Maschine sitzend', 'nur Streckung der Wirbelsäule'],
    ['Frog Pumps', 'nur Hüftstreckung'],
    ['Kabel Kickback über Kreuz', 'nur Hüftstreckung'],
    ['Kurzhantel Curls beidarmig', 'nur der Ellbogen'],
    ['Beinstrecker', 'nur das Knie'],
  ])('%s bleibt eingelenkig (%s)', (name) => {
    expect(byName(name).compound).toBe(false)
  })

  it('behandelt Latzug und Rudern gleich', () => {
    // Kabelrudern war schon vorher mehrgelenkig und wird über die
    // Last-Stichwörter als schwere Grundübung geführt. Dass derselbe
    // senkrechte Zug am Latzug als Isolation lief, war die eigentliche
    // Ungereimtheit — nicht die Höhe der Einstufung.
    //
    // Nebenbefund, der hier festgehalten sein soll: Die MID-LOAD-Stichwörter
    // ergeben Rang 60, und die Schwelle für „schwer" ist ≥ 60. Es gibt also
    // faktisch keine Mittelstufe — Bankdrücken, Rudern, Klimmzug, Latzug,
    // Dips, Beinpresse und Ausfallschritte landen alle bei „schwer". Das ist
    // vertretbar, aber es ist eine Entscheidung, die niemand bewusst
    // getroffen hat.
    expect(tierOf(byName('Latzug breit Obergriff'))).toBe(
      tierOf(byName('Kabelrudern eng sitzend')),
    )
  })

  it('gibt Zugübungen eine Vorgabe, die zu einer Grundübung passt', () => {
    // Die Wirkung zählt, nicht das Etikett: mindestens drei Sätze, ein
    // Wiederholungsbereich, der nicht im Ausdauerbereich liegt, und eine
    // Pause, in der man sich wirklich erholt.
    for (const name of ['Latzug breit Obergriff', 'Rudermaschine Brustpolster, breit']) {
      const spec = prescribe({
        exercise: byName(name),
        goal: 'muscle',
        intensity: 'demanding',
        sessionMinutes: 75,
      })
      expect(spec.sets, name).toBeGreaterThanOrEqual(3)
      expect(spec.repRangeMax as number, name).toBeLessThanOrEqual(12)
      expect(spec.restSeconds, name).toBeGreaterThanOrEqual(120)
    }
  })

  it('stuft keine Zugmaschine mehr als Isolation ein', () => {
    // Regressionsschutz über die Bewegungsfamilie statt über eine Namensliste:
    // Kommt eine neue Latzug- oder Rudervariante dazu, greift der Test auch
    // für sie.
    const zugmaschinen = exercises.filter((exercise) => {
      if (exercise.metric === 'cardio') return false
      const familie = movementFamilyOf(exercise)
      if (familie !== 'pulldown' && familie !== 'row') return false
      // Der Straight-Arm Pulldown ist die berechtigte Ausnahme.
      return !/straight.?arm/i.test(exercise.name)
    })

    expect(zugmaschinen.length).toBeGreaterThan(20)
    const falsch = zugmaschinen
      .filter((exercise) => !exercise.compound)
      .map((exercise) => `${exercise.id} ${exercise.name}`)
    expect(falsch).toEqual([])
  })
})
