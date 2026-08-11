import { describe, expect, it } from 'vitest'
import {
  activeFocus,
  applyFocus,
  avoidedExerciseIds,
  FOCUS_SETS,
  MAX_FOCUS,
  totalSets,
  type Focus,
} from './focus'
import type { VolumeMuscle } from './muscles'
import { VOLUME_TABLE } from './planning'
import type { Adjustment } from './records'

/** Ein realistisches Budget für einen Fortgeschrittenen. */
function budget(): Partial<Record<VolumeMuscle, number>> {
  const targets: Partial<Record<VolumeMuscle, number>> = {}
  for (const [muscle, row] of Object.entries(VOLUME_TABLE) as [
    VolumeMuscle,
    { intermediate: number },
  ][]) {
    targets[muscle] = row.intermediate
  }
  return targets
}

function focusOn(muscle: VolumeMuscle, direction: 'more' | 'less' = 'more'): Focus {
  return { muscle, direction, at: '2026-08-11T10:00:00.000Z' }
}

function adjustment(over: Partial<Adjustment>): Adjustment {
  return {
    id: 'a1',
    userId: 'u1',
    createdAt: '2026-08-11T10:00:00.000Z',
    updatedAt: '2026-08-11T10:00:00.000Z',
    deletedAt: null,
    appliedAt: '2026-08-11T10:00:00.000Z',
    scope: 'coach_focus',
    circle: 5,
    targetId: 'Bizeps',
    targetLabel: 'Bizeps',
    before: 'normal',
    after: 'mehr',
    reason: 'Wunsch aus dem Chat',
    applied: true,
    userAccepted: true,
    ...over,
  } as Adjustment
}

describe('applyFocus', () => {
  it('erhöht den betonten Muskel um genau FOCUS_SETS', () => {
    const before = budget()
    const { targets } = applyFocus(before, [focusOn('Bizeps')])
    expect(targets.Bizeps).toBe((before.Bizeps as number) + FOCUS_SETS)
  })

  it('hält das Gesamtvolumen konstant — sonst wird das Training länger', () => {
    // DAS ist die eigentliche Zusage. Mehr Arme heißt weniger woanders, nicht
    // mehr Zeit im Studio und keine höhere Erholungslast.
    const before = budget()
    const { targets } = applyFocus(before, [focusOn('Bizeps'), focusOn('Trizeps')])
    expect(totalSets(targets)).toBe(totalSets(before))
  })

  it('nimmt das Volumen bei anderen Muskeln weg, nicht bei den betonten', () => {
    const before = budget()
    const { targets } = applyFocus(before, [focusOn('Bizeps')])
    expect(targets.Bizeps as number).toBeGreaterThan(before.Bizeps as number)
    const gesunken = (Object.keys(targets) as VolumeMuscle[]).filter(
      (m) => (targets[m] as number) < (before[m] as number),
    )
    expect(gesunken.length).toBeGreaterThan(0)
    expect(gesunken).not.toContain('Bizeps')
  })

  it('schont im Profil als wichtig markierte Muskeln', () => {
    // Wer im Onboarding „Brust ist mir wichtig" gesagt hat, soll das nicht
    // durch einen späteren Chatwunsch verlieren.
    const before = budget()
    const { targets } = applyFocus(before, [focusOn('Bizeps')], ['Brust'])
    expect(targets.Brust).toBe(before.Brust)
  })

  it('drückt keinen Muskel unter das minimal wirksame Volumen', () => {
    const before = budget()
    const { targets } = applyFocus(before, [
      focusOn('Bizeps'),
      focusOn('Trizeps'),
      focusOn('Waden'),
    ])
    for (const [muscle, value] of Object.entries(targets) as [VolumeMuscle, number][]) {
      expect(value, muscle).toBeGreaterThanOrEqual(VOLUME_TABLE[muscle].beginner)
    }
  })

  it('geht nicht über die Obergrenze und sagt das', () => {
    const before = budget()
    before.Bizeps = VOLUME_TABLE.Bizeps.ceiling
    const { targets, notes } = applyFocus(before, [focusOn('Bizeps')])
    expect(targets.Bizeps).toBe(VOLUME_TABLE.Bizeps.ceiling)
    expect(notes.join(' ')).toMatch(/Obergrenze/)
  })

  it('senkt bei „weniger" und gibt das Volumen frei', () => {
    const before = budget()
    const { targets } = applyFocus(before, [focusOn('Waden', 'less')])
    expect(targets.Waden).toBe((before.Waden as number) - FOCUS_SETS)
    // Freigewordenes Volumen wird NICHT heimlich verteilt — sonst würde ein
    // „weniger Waden" unbemerkt woanders mehr bedeuten.
    expect(totalSets(targets)).toBe(totalSets(before) - FOCUS_SETS)
  })

  it('verrechnet „mehr" und „weniger" gegeneinander', () => {
    const before = budget()
    const { targets } = applyFocus(before, [focusOn('Bizeps'), focusOn('Waden', 'less')])
    expect(targets.Bizeps).toBe((before.Bizeps as number) + FOCUS_SETS)
    expect(targets.Waden).toBe((before.Waden as number) - FOCUS_SETS)
    expect(totalSets(targets)).toBe(totalSets(before))
    // Wenn das „weniger" den Zuschlag deckt, muss NIEMAND sonst abgeben.
    for (const muscle of Object.keys(targets) as VolumeMuscle[]) {
      if (muscle === 'Bizeps' || muscle === 'Waden') continue
      expect(targets[muscle], muscle).toBe(before[muscle])
    }
  })

  it('kürzt den Schwerpunkt, wenn nichts frei ist, statt den Boden zu brechen', () => {
    // Anfängerwoche oder Diät: alles liegt schon am Minimum.
    const before: Partial<Record<VolumeMuscle, number>> = {}
    for (const [muscle, row] of Object.entries(VOLUME_TABLE) as [
      VolumeMuscle,
      { beginner: number },
    ][]) {
      before[muscle] = row.beginner
    }
    const { targets, notes } = applyFocus(before, [focusOn('Bizeps')])
    for (const [muscle, value] of Object.entries(targets) as [VolumeMuscle, number][]) {
      expect(value, muscle).toBeGreaterThanOrEqual(VOLUME_TABLE[muscle].beginner)
    }
    expect(totalSets(targets)).toBeLessThanOrEqual(totalSets(before))
    expect(notes.join(' ')).toMatch(/kleiner aus als gewünscht/)
  })

  it('lässt das Budget ohne Schwerpunkt unangetastet', () => {
    const before = budget()
    const { targets, notes } = applyFocus(before, [])
    expect(targets).toEqual(before)
    expect(notes).toEqual([])
  })

  it('erklärt in Klartext, was sich geändert hat', () => {
    const { notes } = applyFocus(budget(), [focusOn('Bizeps')])
    const text = notes.join(' ')
    expect(text).toMatch(/Bizeps: \d+ → \d+ Sätze/)
    expect(text).toMatch(/Gesamtvolumen bleibt gleich/)
  })

  it('bleibt bei zwei Anwendungen hintereinander stabil', () => {
    // Der Schwerpunkt wird BEI JEDEM Planaufbau frisch gerechnet. Würde er
    // sich aufaddieren, wäre der Bizeps nach zehn Wochen bei 30 Sätzen.
    const before = budget()
    const einmal = applyFocus(before, [focusOn('Bizeps')]).targets
    const zweimal = applyFocus(before, [focusOn('Bizeps')]).targets
    expect(zweimal).toEqual(einmal)
  })
})

describe('activeFocus', () => {
  it('findet einen gesetzten Schwerpunkt', () => {
    const focus = activeFocus([adjustment({})])
    expect(focus).toEqual([
      { muscle: 'Bizeps', direction: 'more', at: '2026-08-11T10:00:00.000Z' },
    ])
  })

  it('ignoriert andere Anpassungen', () => {
    expect(activeFocus([adjustment({ scope: 'volume' })])).toEqual([])
  })

  it('ignoriert erfundene Muskelnamen', () => {
    // Der Modellaufruf könnte „Arme" schreiben — das ist kein Budgetmuskel.
    expect(activeFocus([adjustment({ targetId: 'Arme' })])).toEqual([])
  })

  it('lässt einen aufgehobenen Schwerpunkt fallen', () => {
    const focus = activeFocus([
      adjustment({ id: 'a1', appliedAt: '2026-08-01T10:00:00.000Z' }),
      adjustment({
        id: 'a2',
        appliedAt: '2026-08-10T10:00:00.000Z',
        applied: false,
        after: 'normal',
      }),
    ])
    expect(focus).toEqual([])
  })

  it('nimmt pro Muskel den jüngsten Eintrag', () => {
    const focus = activeFocus([
      adjustment({ id: 'a1', appliedAt: '2026-08-01T10:00:00.000Z', after: 'mehr' }),
      adjustment({ id: 'a2', appliedAt: '2026-08-10T10:00:00.000Z', after: 'weniger' }),
    ])
    expect(focus).toEqual([
      { muscle: 'Bizeps', direction: 'less', at: '2026-08-10T10:00:00.000Z' },
    ])
  })

  it('begrenzt die Zahl gleichzeitiger Betonungen', () => {
    const muskeln: VolumeMuscle[] = ['Bizeps', 'Trizeps', 'Brust', 'Lat', 'Waden']
    const focus = activeFocus(
      muskeln.map((muscle, index) =>
        adjustment({
          id: `a${index}`,
          targetId: muscle,
          appliedAt: `2026-08-0${index + 1}T10:00:00.000Z`,
        }),
      ),
    )
    expect(focus.filter((f) => f.direction === 'more')).toHaveLength(MAX_FOCUS)
    // Die JÜNGSTEN Wünsche bleiben — der Nutzer hat sie zuletzt geäußert.
    expect(focus.map((f) => f.muscle)).toContain('Waden')
    expect(focus.map((f) => f.muscle)).not.toContain('Bizeps')
  })

  it('ignoriert gelöschte Einträge', () => {
    expect(activeFocus([adjustment({ deletedAt: '2026-08-11T11:00:00.000Z' })])).toEqual(
      [],
    )
  })
})

describe('avoidedExerciseIds', () => {
  it('sammelt abgelehnte Übungen', () => {
    const ids = avoidedExerciseIds([
      adjustment({ scope: 'coach_avoid', targetId: 'BEI-012' }),
    ])
    expect([...ids]).toEqual(['BEI-012'])
  })

  it('hebt eine Ablehnung wieder auf', () => {
    const ids = avoidedExerciseIds([
      adjustment({
        id: 'a1',
        scope: 'coach_avoid',
        targetId: 'BEI-012',
        appliedAt: '2026-08-01T10:00:00.000Z',
      }),
      adjustment({
        id: 'a2',
        scope: 'coach_avoid',
        targetId: 'BEI-012',
        appliedAt: '2026-08-10T10:00:00.000Z',
        applied: false,
      }),
    ])
    expect(ids.size).toBe(0)
  })

  it('verwechselt Schwerpunkte nicht mit Ablehnungen', () => {
    expect(avoidedExerciseIds([adjustment({ scope: 'coach_focus' })]).size).toBe(0)
  })
})
