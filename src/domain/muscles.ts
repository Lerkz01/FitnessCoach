// ====================================================================
//  Muskel-Taxonomie
//
//  Die Übungsdatenbank verwendet 75 verschiedene Muskelbezeichnungen,
//  teils mit Unterregionen ("Brust (oben)"), teils zusammengesetzt
//  ("vord. + seitl. Schulter"), teils sehr allgemein ("Ganzkörper").
//
//  Für die Volumenrechnung werden sie auf 18 VOLUMEN-MUSKELN normalisiert
//  (docs/PLAN-ENGINE.md §3). Die Unterregionen bleiben separat erhalten,
//  weil der Plan-Generator sie für die regionale Abdeckung braucht
//  (docs/TRAINING-SCIENCE.md §6).
// ====================================================================

/** Die 18 Muskeln, für die ein Wochen-Volumenbudget geführt wird. */
export const VOLUME_MUSCLES = [
  'Brust',
  'Lat',
  'Oberer Rücken',
  'Unterer Rücken',
  'Trapez',
  'Vordere Schulter',
  'Seitliche Schulter',
  'Hintere Schulter',
  'Bizeps',
  'Trizeps',
  'Unterarme',
  'Quadrizeps',
  'Hamstrings',
  'Gesäß',
  'Adduktoren',
  'Waden',
  'Bauch',
  'Schienbein',
] as const

export type VolumeMuscle = (typeof VOLUME_MUSCLES)[number]

/**
 * Bezeichnungen, die kein Volumenziel haben und bewusst ignoriert werden.
 *
 * Zwei Gruppen:
 *  1. Keine Muskeln — stammen aus der Cardio-Tabelle, deren letzte Spalte
 *     "Hinweis" heißt und vom Parser als `secondary` gelesen wird.
 *  2. Muskeln ohne eigenes Budget — sie werden nie direkt geplant und sind
 *     nie der begrenzende Faktor (Hüftbeuger, Sägezahn), oder es sind
 *     Sammelbegriffe, die zu unspezifisch für ein Budget sind (Ganzkörper).
 *     Ihre Übungen bleiben nutzbar; sie zählen nur nicht ins Volumen.
 */
const IGNORED = new Set([
  // 1. Cardio-Hinweise, keine Muskeln
  'Fettstoffwechsel',
  'Grundlagenausdauer',
  'Kondition',
  'VO2max',
  'gelenkschonend',
  'rückenschonend',
  'Steigung 1–2 %',
  // 2. Qualitäten statt Muskeln
  'Balance',
  'Mobilität',
  'Schultermobilität',
  // 3. Zu unspezifisch für ein Budget
  'Ganzkörper',
  'Ganzkörper explosiv',
  // 4. Kein eigenes Budget (nie limitierend, nie direkt geplant)
  'Hüftbeuger',
  'Sägezahn',
])

/**
 * Rohbezeichnung → Volumen-Muskel(n).
 *
 * Mehrere Ziele bedeuten, dass die Bezeichnung mehrere Muskeln umfasst.
 * Der Satzanteil wird dann GLEICHMÄSSIG aufgeteilt (siehe volume.ts) —
 * sonst würde ein Satz "Schulter gesamt" dreifach zählen.
 */
const MUSCLE_MAP: Record<string, readonly VolumeMuscle[]> = {
  // ── Brust ────────────────────────────────────────────────────────
  Brust: ['Brust'],
  'Brust (oben)': ['Brust'],
  'Brust (mittel)': ['Brust'],
  'Brust (unten)': ['Brust'],
  'Brust (innen)': ['Brust'],
  'Brust (außen)': ['Brust'],

  // ── Rücken ───────────────────────────────────────────────────────
  Lat: ['Lat'],
  'ob. Rücken': ['Oberer Rücken'],
  // Mittlerer/unterer Trapez arbeitet funktionell mit dem oberen Rücken
  // (Schulterblatt-Retraktion), nicht mit dem oberen Trapez (Elevation).
  'unt. Trapez': ['Oberer Rücken'],
  Schulterblattstabilität: ['Oberer Rücken'],
  'unt. Rücken': ['Unterer Rücken'],
  Rückenstrecker: ['Unterer Rücken'],
  // Generisches "Rücken" steht in der DB nur als Sekundärziel beim
  // Sumo-Kreuzheben und meint dort die Streckerkette.
  Rücken: ['Unterer Rücken'],
  Trapez: ['Trapez'],

  // ── Schultern ────────────────────────────────────────────────────
  'vord. Schulter': ['Vordere Schulter'],
  'seitl. Schulter': ['Seitliche Schulter'],
  'hint. Schulter': ['Hintere Schulter'],
  'vord. + seitl. Schulter': ['Vordere Schulter', 'Seitliche Schulter'],
  'Schulter gesamt': ['Vordere Schulter', 'Seitliche Schulter', 'Hintere Schulter'],
  Schulter: ['Vordere Schulter', 'Seitliche Schulter'],
  Schultern: ['Vordere Schulter', 'Seitliche Schulter'],
  // Rotatoren-/Stabilitätsarbeit zählt zur hinteren Schulter — dort
  // liegen die trainierten Außenrotatoren.
  Rotatorenmanschette: ['Hintere Schulter'],
  Schulterstabilität: ['Hintere Schulter'],

  // ── Arme ─────────────────────────────────────────────────────────
  Bizeps: ['Bizeps'],
  'Bizeps (langer Kopf)': ['Bizeps'],
  'Bizeps (kurzer Kopf)': ['Bizeps'],
  Brachialis: ['Bizeps'],
  Brachioradialis: ['Bizeps'],
  Trizeps: ['Trizeps'],
  'Trizeps (lang)': ['Trizeps'],
  'Trizeps (langer Kopf)': ['Trizeps'],
  'Trizeps (lateraler Kopf)': ['Trizeps'],
  'Trizeps (medialer Kopf)': ['Trizeps'],
  Unterarm: ['Unterarme'],
  Unterarmbeuger: ['Unterarme'],
  Unterarmstrecker: ['Unterarme'],
  Griff: ['Unterarme'],
  Griffkraft: ['Unterarme'],

  // ── Beine ────────────────────────────────────────────────────────
  Quadrizeps: ['Quadrizeps'],
  'Quadrizeps (außen)': ['Quadrizeps'],
  'Quadrizeps (Rectus)': ['Quadrizeps'],
  'Quadrizeps (Betonung Vastus)': ['Quadrizeps'],
  Hamstrings: ['Hamstrings'],
  'Hamstrings (Betonung innen/außen)': ['Hamstrings'],
  Gesäß: ['Gesäß'],
  'Gesäß (Gluteus medius)': ['Gesäß'],
  'Gluteus medius': ['Gesäß'],
  Adduktoren: ['Adduktoren'],
  // Generisches "Beine" steht nur als Sekundärziel bei explosiven
  // Ganzkörperübungen (Push Press, High Pull).
  Beine: ['Quadrizeps', 'Gesäß'],

  // ── Waden & Schienbein ───────────────────────────────────────────
  Waden: ['Waden'],
  Gastrocnemius: ['Waden'],
  'Gastrocnemius (innen/außen)': ['Waden'],
  Soleus: ['Waden'],
  Schienbeinmuskel: ['Schienbein'],

  // ── Bauch & Rumpf ────────────────────────────────────────────────
  Bauch: ['Bauch'],
  'Bauch gesamt': ['Bauch'],
  'gerader Bauchmuskel': ['Bauch'],
  'unt. Bauch': ['Bauch'],
  'schräge Bauchmuskeln': ['Bauch'],
  Rumpf: ['Bauch'],
  Rumpfstabilität: ['Bauch'],
}

/**
 * Löst eine Rohbezeichnung in Volumen-Muskeln auf.
 * Leeres Array = bewusst ignoriert oder unbekannt.
 */
export function resolveMuscles(raw: string): readonly VolumeMuscle[] {
  const key = raw.trim()
  if (IGNORED.has(key)) return []
  return MUSCLE_MAP[key] ?? []
}

/** true, wenn die Bezeichnung absichtlich kein Volumenziel hat. */
export function isIgnoredMuscle(raw: string): boolean {
  return IGNORED.has(raw.trim())
}

/**
 * Extrahiert die Unterregion einer Bezeichnung — für die regionale
 * Abdeckung im Plan-Generator (docs/TRAINING-SCIENCE.md §6).
 *
 *   "Brust (oben)"          → "oben"
 *   "Bizeps (langer Kopf)"  → "langer Kopf"
 *   "Lat"                   → null
 */
export function muscleRegion(raw: string): string | null {
  const match = raw.match(/\(([^)]+)\)\s*$/)
  return match ? match[1].trim() : null
}

/**
 * Alle Bezeichnungen, die weder gemappt noch bewusst ignoriert sind.
 * Wird von den Tests über die gesamte Datenbank geprüft, damit eine
 * neue Übung mit unbekanntem Muskel nicht still aus dem Volumen fällt.
 */
export function findUnmappedMuscles(rawNames: Iterable<string>): string[] {
  const unknown = new Set<string>()
  for (const raw of rawNames) {
    const key = raw.trim()
    if (!key) continue
    if (IGNORED.has(key)) continue
    if (!MUSCLE_MAP[key]) unknown.add(key)
  }
  return [...unknown].sort((a, b) => a.localeCompare(b, 'de'))
}
