import { describe, expect, it } from 'vitest'
import { exercises } from '../data'
import {
  findUnmappedMuscles,
  isIgnoredMuscle,
  muscleRegion,
  resolveMuscles,
  VOLUME_MUSCLES,
} from './muscles'

describe('resolveMuscles', () => {
  it('bildet Unterregionen auf den übergeordneten Muskel ab', () => {
    expect(resolveMuscles('Brust (oben)')).toEqual(['Brust'])
    expect(resolveMuscles('Brust (unten)')).toEqual(['Brust'])
    expect(resolveMuscles('Trizeps (langer Kopf)')).toEqual(['Trizeps'])
  })

  it('zählt Brachialis und Brachioradialis zum Bizeps', () => {
    expect(resolveMuscles('Brachialis')).toEqual(['Bizeps'])
    expect(resolveMuscles('Brachioradialis')).toEqual(['Bizeps'])
  })

  it('trennt oberen Trapez vom oberen Rücken', () => {
    // Elevation vs. Schulterblatt-Retraktion sind verschiedene Funktionen
    expect(resolveMuscles('Trapez')).toEqual(['Trapez'])
    expect(resolveMuscles('unt. Trapez')).toEqual(['Oberer Rücken'])
  })

  it('löst zusammengesetzte Bezeichnungen in mehrere Muskeln auf', () => {
    expect(resolveMuscles('vord. + seitl. Schulter')).toEqual([
      'Vordere Schulter',
      'Seitliche Schulter',
    ])
    expect(resolveMuscles('Schulter gesamt')).toHaveLength(3)
  })

  it('ignoriert Cardio-Hinweise, die der Parser als Muskel gelesen hat', () => {
    for (const hint of ['VO2max', 'gelenkschonend', 'Grundlagenausdauer', 'Steigung 1–2 %']) {
      expect(isIgnoredMuscle(hint)).toBe(true)
      expect(resolveMuscles(hint)).toEqual([])
    }
  })

  it('ignoriert Muskeln ohne eigenes Volumenbudget', () => {
    expect(resolveMuscles('Hüftbeuger')).toEqual([])
    expect(resolveMuscles('Sägezahn')).toEqual([])
    expect(resolveMuscles('Ganzkörper explosiv')).toEqual([])
  })

  it('gibt für jede Bezeichnung nur gültige Volumen-Muskeln zurück', () => {
    const valid = new Set<string>(VOLUME_MUSCLES)
    for (const ex of exercises) {
      for (const raw of [...ex.primary, ...ex.secondary]) {
        for (const m of resolveMuscles(raw)) {
          expect(valid.has(m)).toBe(true)
        }
      }
    }
  })
})

describe('muscleRegion', () => {
  it('extrahiert die Unterregion für die Abdeckungsprüfung', () => {
    expect(muscleRegion('Brust (oben)')).toBe('oben')
    expect(muscleRegion('Bizeps (langer Kopf)')).toBe('langer Kopf')
  })

  it('gibt null zurück, wenn es keine Unterregion gibt', () => {
    expect(muscleRegion('Lat')).toBeNull()
    expect(muscleRegion('Hamstrings')).toBeNull()
  })
})

describe('Vollständigkeit über die gesamte Datenbank', () => {
  // Diese Prüfung ist der eigentliche Zweck von findUnmappedMuscles:
  // Kommt später eine Übung mit neuer Muskelbezeichnung hinzu, soll der
  // Test fehlschlagen — statt dass die Übung still aus dem Volumen fällt.
  it('kennt jede Muskelbezeichnung aus allen 381 Übungen', () => {
    const alle: string[] = []
    for (const ex of exercises) alle.push(...ex.primary, ...ex.secondary)

    const unmapped = findUnmappedMuscles(alle)
    expect(
      unmapped,
      `Nicht zugeordnete Muskelbezeichnungen — in muscles.ts ergänzen: ${unmapped.join(', ')}`,
    ).toEqual([])
  })

  it('ordnet jeder Kraftübung mindestens einen Volumen-Muskel zu', () => {
    // Cardio ist ausgeschlossen (App plant kein Cardio), und explosive
    // Ganzkörperübungen haben absichtlich kein Budget-Ziel.
    const ohneZuordnung = exercises
      .filter((ex) => ex.metric !== 'cardio' && ex.group !== 'Ganzkörper')
      .filter(
        (ex) =>
          [...ex.primary, ...ex.secondary].flatMap((raw) => resolveMuscles(raw)).length === 0,
      )
      .map((ex) => `${ex.id} ${ex.name}`)

    expect(ohneZuordnung).toEqual([])
  })
})
