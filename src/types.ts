// ====================================================================
//  Domänen-Typen der Fitness-Coach-App
//  Quelle der Wahrheit: data/source/*.md  →  Parser  →  src/data/*.json
// ====================================================================

/** Ladeart eines Geräts – bestimmt, wie Gewicht eingestellt & gerundet wird. */
export type LoadType =
  | 'stack' // Steckgewicht (Gewichtsmagazin)
  | 'plate' // Plate-Loaded (Hantelscheiben aufgesteckt)
  | 'free' // Freihantel
  | 'body' // Körpergewicht
  | 'cardio' // Ausdauergerät
  | 'accessory' // Zubehör (z.B. Fußschlaufen)

/** Wie die Leistung einer Übung gemessen wird. */
export type Metric =
  | 'reps' // Wiederholungen
  | 'time' // Zeit (Planks, Carries, Dead Hangs …)
  | 'cardio' // Ausdauer (Dauer/Distanz/Intervalle)

/** Oberste Muskelgruppe – abgeleitet aus dem Abschnitt im Übungskatalog. */
export type MuscleGroup =
  | 'Brust'
  | 'Rücken'
  | 'Trapez'
  | 'Schultern'
  | 'Bizeps'
  | 'Trizeps'
  | 'Unterarme'
  | 'Quadrizeps'
  | 'Hamstrings'
  | 'Gesäß'
  | 'Adduktoren'
  | 'Waden'
  | 'Bauch'
  | 'Ganzkörper'
  | 'Cardio'

/** Ein Gerät aus dem Gym-Inventar. */
export interface Equipment {
  id: string // z.B. "LEG-01"
  name: string
  category: string // "Beine", "Rücken", … (aus dem Inventar-Abschnitt)
  loadType: LoadType
  description: string
  /** Kleinste real einstellbare Gewichtsstufe in kg. null = kein Gewicht (body/cardio). */
  stepKg: number | null
  /** true = mehr Gewicht bedeutet WENIGER Widerstand (unterstützte Klimmzug-/Dip-Maschine). */
  inverted: boolean
  /** Bekanntes Maximalgewicht in kg, sonst null (noch zu ergänzen). */
  maxKg: number | null
}

/** Eine Übung, gemappt auf die benötigten Geräte. */
export interface Exercise {
  id: string // z.B. "BRU-001"
  name: string
  group: MuscleGroup
  /**
   * Geräte-Anforderung als UND/ODER-Struktur:
   * äußeres Array = alle Gruppen werden benötigt (UND),
   * inneres Array = Alternativen innerhalb einer Gruppe (ODER).
   * Beispiel: [["FRE-02"], ["FRE-04","FRE-08"]] = FRE-02 UND (FRE-04 ODER FRE-08).
   */
  equipmentGroups: string[][]
  /** Flache Liste aller referenzierten Geräte-IDs (für schnelle Anzeige/Suche). */
  equipmentIds: string[]
  primary: string[] // Hauptzielmuskeln (inkl. Unterregion, z.B. "Brust (oben)")
  secondary: string[] // mittrainierte Muskulatur
  /** Einarmig/einbeinig – Volumen zählt beide Seiten. */
  unilateral: boolean
  metric: Metric
  /** Mehrgelenkig (Grundübung) vs. Isolation – steuert die Übungsreihenfolge. */
  compound: boolean
}
