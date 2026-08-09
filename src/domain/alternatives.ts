// ====================================================================
//  Übungstausch — „das Gerät ist besetzt"
//
//  Ausdrückliche Nutzeranforderung, und sie muss OHNE KI funktionieren:
//  regelbasiert, sofort, offline (docs/UI-UX.md §10). Wer im Gym vor einer
//  besetzten Maschine steht, wartet nicht auf eine Antwort aus dem Netz.
//
//  Die zentrale Einsicht steckt in der Frage, was „besetzt" eigentlich
//  heißt:
//
//    Eine MASCHINE gibt es einmal. Ist sie besetzt, fällt jede Übung an ihr
//    weg — auch eine andere Griffvariante.
//
//    KURZHANTELN und LANGHANTELN gibt es mehrfach. Ist die Flachbank
//    besetzt, ist die Langhantel deshalb nicht weg — Schrägbankdrücken
//    bleibt möglich.
//
//  Ohne diese Unterscheidung wäre der Tausch entweder nutzlos (schlägt
//  dieselbe Maschine vor) oder unnötig streng (streicht alle 60
//  Kurzhantelübungen, weil eine Bank belegt ist).
// ====================================================================

import { equipmentById } from '../data'
import type { Equipment, Exercise } from '../types'
import {
  injuryVerdictAll,
  loadEstimateOf,
  movementPatternOf,
  overlapScore,
} from './exerciseMeta'
import { muscleRegion } from './muscles'
import type { UserProfile } from './records'

// ────────────────────────────────────────────────────────────────────

/**
 * Geräte, die es im Studio mehrfach gibt.
 *
 * Als mehrfach vorhanden gelten nur:
 *   · `loadType: 'free'` — Kurzhanteln, Langhanteln, verstellbare Bänke
 *   · `loadType: 'accessory'` — Fußschlaufen und Ähnliches sind gar keine
 *     Station, sondern Zubehör, das man mitnimmt
 *   · ein ausdrückliches „Mehrere vorhanden" in der Beschreibung
 *
 * Alles andere ist eine Einzelstation.
 *
 * `loadType: 'body'` gilt AUSDRÜCKLICH NICHT als mehrfach vorhanden — das
 * war ein Fehlschluss im ersten Entwurf. `loadType` beschreibt, WIE die Last
 * wirkt, nicht WIE VIELE es gibt: Die 45°-Hyperextension ist eine
 * Körpergewichtsübung an genau einer Station.
 *
 * Im Zweifel wird gesperrt, denn die Kosten sind unsymmetrisch: Zu streng
 * heißt, dass ein etwas anderer Vorschlag kommt — harmlos. Zu lasch heißt,
 * dass die App eine Übung auf dem besetzten Gerät vorschlägt, und damit wäre
 * die ganze Funktion nutzlos.
 */
export function isMultiStation(equipment: Equipment): boolean {
  if (equipment.loadType === 'free') return true
  if (equipment.loadType === 'accessory') return true
  return /mehrere vorhanden/i.test(equipment.description ?? '')
}

/**
 * Welche Geräte fallen weg, wenn diese Übung besetzt ist?
 *
 * Nur die Einzelstationen. Die Langhantel bleibt verfügbar, auch wenn die
 * Bank, auf der sie liegt, belegt ist.
 */
export function blockedEquipmentFor(exercise: Exercise): string[] {
  return exercise.equipmentIds.filter((id) => {
    const equipment = equipmentById.get(id)
    return equipment ? !isMultiStation(equipment) : false
  })
}

/**
 * Braucht die Übung ein Gerät aus der Sperrliste?
 *
 * Auswertung über `equipmentGroups`: Das äußere Array ist ein UND, das
 * innere ein ODER. Eine Gruppe ist erfüllbar, solange EINE ihrer
 * Alternativen frei ist. Erst wenn alle Alternativen einer Gruppe gesperrt
 * sind, ist die Übung nicht ausführbar.
 *
 * Die flache `equipmentIds`-Liste zu prüfen wäre falsch: „Bankdrücken an
 * Flachbank ODER Smith-Maschine" wäre damit gesperrt, sobald eines von
 * beiden belegt ist — obwohl das andere frei sein kann.
 */
export function needsBlocked(exercise: Exercise, blocked: ReadonlySet<string>): boolean {
  const groups =
    exercise.equipmentGroups.length > 0
      ? exercise.equipmentGroups
      : exercise.equipmentIds.map((id) => [id])

  return groups.some((group) => group.length > 0 && group.every((id) => blocked.has(id)))
}

// ────────────────────────────────────────────────────────────────────

export interface Alternative {
  exercise: Exercise
  /** 0…1 — wie gut der Reiz dem der besetzten Übung entspricht. */
  match: number
  /** Klartext für die Oberfläche: warum diese Übung. */
  reason: string
}

/**
 * Wofür eine Alternative gesucht wird. Die beiden Fälle unterscheiden sich
 * in zwei Punkten, deshalb ein Zweck statt zweier einzelner Schalter:
 *
 *   `occupied`  Das Gerät ist belegt → seine Einzelstationen sind gesperrt.
 *               Eine andere Griffvariante am selben Gerät hilft nicht.
 *
 *   `rotation`  Die Übung stagniert → das Gerät ist frei, es geht um einen
 *               NEUEN Reiz. Deshalb keine Gerätesperre, aber eine andere
 *               Unterregion wird bevorzugt (docs/PLAN-ENGINE.md §9 Kreis 3d):
 *               Wer auf „Brust (mittel)" feststeckt, kommt mit „Brust (oben)"
 *               weiter, nicht mit derselben Region an einem anderen Gerät.
 */
export type AlternativePurpose = 'occupied' | 'rotation'

export interface AlternativeInput {
  /** Die besetzte oder stagnierende Übung. */
  exercise: Exercise
  /** Standard `occupied`. */
  purpose?: AlternativePurpose
  pool: readonly Exercise[]
  profile: UserProfile
  /** Übungen, die in dieser Einheit schon vorkommen. */
  usedExerciseIds?: ReadonlySet<string>
  /**
   * Zusätzlich gesperrte Geräte — etwa aus einem früheren Tausch in
   * derselben Einheit. Wer zweimal „besetzt" tippt, will nicht wieder auf
   * dem ersten besetzten Gerät landen.
   */
  alsoBlocked?: ReadonlySet<string>
  limit?: number
}

/**
 * Ersatzübungen, beste zuerst.
 *
 * Bewertet wird ausschließlich danach, ob der REIZ erhalten bleibt — nicht,
 * ob die Übung „gut" ist. Eine bessere Übung, die andere Muskeln trifft,
 * wäre hier die falsche Antwort: Das Wochenvolumen ist pro Muskel geplant,
 * und ein Tausch darf es nicht verschieben.
 */
export function findAlternatives(input: AlternativeInput): Alternative[] {
  const { exercise, pool, profile } = input
  const limit = input.limit ?? 5

  const purpose = input.purpose ?? 'occupied'

  // Bei Rotation ist das Gerät frei — nur bei „besetzt" wird gesperrt.
  const blocked = new Set<string>([
    ...(purpose === 'occupied' ? blockedEquipmentFor(exercise) : []),
    ...(input.alsoBlocked ?? []),
  ])
  const disabled = new Set(profile.disabledEquipmentIds)
  const blacklist = new Set(profile.blacklistedExerciseIds)
  const used = input.usedExerciseIds ?? new Set<string>()

  const originalPattern = movementPatternOf(exercise)
  const originalLoadable = loadEstimateOf(exercise).basis !== 'none'
  const originalRegions = regionsOf(exercise)
  const originalPrimary = new Set(exercise.primary.map((p) => p.toLowerCase().trim()))

  /**
   * Intern mit Punktzahl, nach außen ohne.
   *
   * `match` ist die reine Muskel-Übereinstimmung und wird angezeigt.
   * `score` mischt zusätzlich Bewegungsmuster, Belastbarkeit und
   * Verletzungen hinein und dient nur der Sortierung. Beides in ein Feld zu
   * legen würde die Anzeige unehrlich machen.
   */
  const candidates: (Alternative & { score: number })[] = []

  for (const candidate of pool) {
    if (candidate.id === exercise.id) continue
    if (used.has(candidate.id)) continue
    if (blacklist.has(candidate.id)) continue
    if (candidate.metric === 'cardio') continue
    // Kettlebell-Gewichte sind unbekannt — ohne Gewichtsvorgabe nicht planbar.
    if (candidate.id.startsWith('KET-')) continue

    // Gerät gesperrt oder gar nicht vorhanden
    if (needsBlocked(candidate, blocked)) continue
    if (needsBlocked(candidate, disabled)) continue

    // Verletzungen: akut ausschließen, Vorgeschichte nur abwerten
    const verdict = injuryVerdictAll(candidate, profile.injuries)
    if (verdict === 'exclude') continue

    const match = overlapScore(exercise, candidate)
    // Unter dieser Schwelle ist es keine Ersatzübung mehr, sondern eine
    // andere Übung. Dann lieber nichts anbieten als den Plan verwässern.
    if (match < 0.5) continue

    let score = match * 100

    // Gleiches Bewegungsmuster: die Vorgabe lässt sich direkt übertragen.
    const gleichesMuster =
      originalPattern !== null && movementPatternOf(candidate) === originalPattern
    if (gleichesMuster) score += 20

    // Progression braucht ein einstellbares Gewicht. Eine
    // Körpergewichtsübung als Ersatz für eine Hantelübung bricht die
    // Vergleichbarkeit.
    const schaetzung = loadEstimateOf(candidate)
    const candidateLoadable = schaetzung.basis !== 'none'
    if (originalLoadable === candidateLoadable) score += 15

    // Explizit hinterlegter Koeffizient = belastbarere Gewichtsschätzung.
    const gewichtBekannt = schaetzung.confidence === 'explicit'
    if (gewichtBekannt) score += 10

    if (verdict === 'deprioritize') score -= 40

    // Gleiche ANATOMISCHE Bezeichnung, nicht nur gleicher Volumen-Muskel.
    //
    // Die Volumen-Taxonomie kennt 18 Muskeln und fasst dabei zusammen, was
    // anatomisch getrennt ist: „gerader Bauchmuskel" und „schräge
    // Bauchmuskeln" sind beide „Bauch". Bei gleicher Überlappung entschied
    // deshalb die Reihenfolge im Pool — die Bauchmaschine bekam die
    // Rotationsmaschine als Ersatz, obwohl ein anderer Muskel gemeint ist.
    // Dieser kleine Zuschlag bricht solche Gleichstände sinnvoll.
    if (candidate.primary.some((p) => originalPrimary.has(p.toLowerCase().trim()))) {
      score += 12
    }

    // Rotation lebt vom neuen Reiz. Eine andere Unterregion ist genau das;
    // dieselbe Region an einem anderen Gerät ist es nur zur Hälfte.
    const andereRegion =
      originalRegions.size > 0 &&
      [...regionsOf(candidate)].some((r) => !originalRegions.has(r))
    if (purpose === 'rotation') {
      if (andereRegion) score += 35
      // Ein Gerätewechsel bringt zusätzlich eine andere Belastungskurve.
      if (equipmentKey(candidate) !== equipmentKey(exercise)) score += 15
    }

    candidates.push({
      exercise: candidate,
      match: Math.round(match * 100) / 100,
      reason: describe({
        candidate,
        gleichesMuster,
        gewichtBekannt,
        neueRegion: purpose === 'rotation' && andereRegion,
      }),
      score,
    })
  }

  return pickVaried(
    candidates.sort((a, b) => b.score - a.score),
    limit,
  ).map(({ exercise: e, match, reason }) => ({ exercise: e, match, reason }))
}

/** Wie viele Vorschläge höchstens dasselbe Gerät verlangen dürfen. */
const MAX_PER_EQUIPMENT = 2

/**
 * Wählt aus der sortierten Liste eine VIELFÄLTIGE Auswahl.
 *
 * Zwei Gründe, warum die reine Bestenliste nicht taugt:
 *
 * 1. Sind alle vier Vorschläge Kurzhantelübungen und die Kurzhanteln waren
 *    das Problem, steht man wieder da. Höchstens zwei pro Gerät.
 * 2. Fast identische Übungen verschwenden Plätze. Beim Dip-Ersatz kamen
 *    „Liegestütze eng / Diamond" UND „Diamond Push-Ups" — zwei von vier
 *    Plätzen für dieselbe Bewegung.
 */
function pickVaried<T extends { exercise: Exercise; match: number }>(
  sorted: readonly T[],
  limit: number,
): T[] {
  const gewaehlt: T[] = []
  const proGeraet = new Map<string, number>()

  // Zwei Durchgänge: erst mit allen Regeln, dann die Liste auffüllen, falls
  // die Regeln zu streng waren. Lieber ein ähnlicher Vorschlag als keiner.
  for (const streng of [true, false]) {
    for (const kandidat of sorted) {
      if (gewaehlt.length >= limit) break
      if (gewaehlt.some((g) => g.exercise.id === kandidat.exercise.id)) continue

      if (streng) {
        const schluessel = equipmentKey(kandidat.exercise)
        if ((proGeraet.get(schluessel) ?? 0) >= MAX_PER_EQUIPMENT) continue

        // Nahezu identische Bewegung wie ein schon gewählter Vorschlag?
        const doppelt = gewaehlt.some(
          (g) => overlapScore(g.exercise, kandidat.exercise) > 0.95 &&
            equipmentKey(g.exercise) === schluessel,
        )
        if (doppelt) continue

        proGeraet.set(schluessel, (proGeraet.get(schluessel) ?? 0) + 1)
      }

      gewaehlt.push(kandidat)
    }
  }

  return gewaehlt
}

function equipmentKey(exercise: Exercise): string {
  return [...exercise.equipmentIds].sort().join('+')
}

/**
 * Unterregionen, die die Übung direkt trifft — etwa „oben" bei
 * „Brust (oben)". Grundlage für die Bevorzugung einer anderen Region beim
 * Rotieren.
 */
function regionsOf(exercise: Exercise): Set<string> {
  const out = new Set<string>()
  for (const raw of exercise.primary) {
    const region = muscleRegion(raw)
    if (region !== null) out.add(`${raw.split('(')[0].trim()}:${region}`)
  }
  return out
}

/**
 * Begründung für die Anzeige.
 *
 * Bewusst OHNE Ähnlichkeitsstufe („trifft praktisch dasselbe"). Sortiert
 * wird nach einer Punktzahl, in die auch Bewegungsmuster und die Güte der
 * Gewichtsschätzung eingehen — eine angezeigte Prozentzahl würde der
 * Reihenfolge dann sichtbar widersprechen und wie ein Fehler wirken.
 *
 * Stattdessen steht hier, was im Gym zählt: an welches Gerät man geht, und
 * ob die Bewegung dieselbe ist.
 */
function describe(input: {
  candidate: Exercise
  gleichesMuster: boolean
  gewichtBekannt: boolean
  neueRegion?: boolean
}): string {
  const geraet = input.candidate.equipmentIds
    .map((id) => equipmentById.get(id)?.name)
    .filter((name): name is string => Boolean(name))
    .join(' + ')

  const zusatz: string[] = []
  if (input.neueRegion) zusatz.push('trifft die Region anders')
  if (input.gleichesMuster) zusatz.push('gleiche Bewegung')
  if (input.gewichtBekannt) zusatz.push('Gewicht kann ich ableiten')

  return [geraet || 'Körpergewicht', ...zusatz].join(' · ')
}
