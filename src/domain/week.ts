// ====================================================================
//  Kalenderwochen
//
//  Eine Woche beginnt am MONTAG. Das ist die deutsche Konvention und
//  außerdem die, die zum Trainingssplit passt.
//
//  `Date.getDay()` beginnt dagegen am Sonntag (0). Genau dort entsteht der
//  klassische Fehler: Ein Sonntag würde ohne Sonderbehandlung dem Montag
//  DANACH zugeordnet — also der Woche, die noch nicht stattgefunden hat.
//  Und der Sonntag ist bei uns der Standard-Check-in-Tag.
// ====================================================================

/** Montag der Woche, in der `date` liegt, als `YYYY-MM-DD`. */
export function mondayOf(date: Date = new Date()): string {
  const day = date.getDay()
  // Sonntag (0) gehört zur Woche, die sechs Tage vorher begann.
  const daysSinceMonday = day === 0 ? 6 : day - 1

  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  monday.setDate(monday.getDate() - daysSinceMonday)
  return localDay(monday)
}

/**
 * Lokaler Kalendertag eines ISO-Zeitstempels.
 *
 * NIEMALS `stamp.slice(0, 10)` benutzen: Das liefert den UTC-Tag. In
 * Deutschland ist der lokale Tag ein bis zwei Stunden voraus, ein Eintrag
 * von 00:55 lokal trägt in UTC noch das Datum des Vortags. Die Zeitreihe
 * wäre dann verdreht — genau daran zeigte der Fortschritt „−0,4 kg", obwohl
 * das Gewicht gestiegen war.
 */
export function localDayOf(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp)
  if (Number.isNaN(parsed.getTime())) return isoTimestamp.slice(0, 10)
  return localDay(parsed)
}

/** Kalendertag in lokaler Zeit als `YYYY-MM-DD`. */
export function localDay(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Rechnet unser Wochentag-Kürzel in die Zählung von `Date.getDay()` um.
 *
 * Zwei Systeme mit unterschiedlichem Wochenanfang: `WEEKDAYS` beginnt bei
 * Montag (Index 0), `Date.getDay()` bei Sonntag (0). Diese Umrechnung
 * inline hinzuschreiben ist die klassische Fehlerquelle — deshalb eine
 * benannte Funktion mit Test.
 */
export function weekdayToDateDay(weekday: string): number {
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const index = order.indexOf(weekday)
  if (index < 0) return 0
  // Montag (0) → 1, …, Samstag (5) → 6, Sonntag (6) → 0
  return index === 6 ? 0 : index + 1
}

/**
 * Vergleicht Datensätze chronologisch — Tag zuerst, dann Anlagezeitpunkt.
 *
 * Der Zweitschlüssel ist NICHT kosmetisch. Mehrere Einträge am selben Tag
 * sind der Normalfall: Wer sich einrichtet und noch am selben Tag den ersten
 * Check-in macht, hat zwei Gewichte mit demselben Datum. Ohne Zweitschlüssel
 * ist ihre Reihenfolge beliebig — im Browser zeigte der Fortschritt daraufhin
 * „−0,4 kg", obwohl das Gewicht gestiegen war.
 */
export function chronologically<T extends { createdAt: string }>(
  dayOf: (entry: T) => string,
): (a: T, b: T) => number {
  return (a, b) => {
    const left = dayOf(a)
    const right = dayOf(b)
    if (left !== right) return left < right ? -1 : 1
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
    return 0
  }
}

/** Wie viele Wochen zwischen zwei Montagen liegen. */
export function weeksBetween(fromMonday: string, toMonday: string): number {
  const from = Date.parse(`${fromMonday}T00:00:00`)
  const to = Date.parse(`${toMonday}T00:00:00`)
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.round((to - from) / (7 * 24 * 60 * 60 * 1000))
}

/**
 * Steht der Check-in an?
 *
 * Ja, wenn heute der gewählte Wochentag ist ODER später in derselben Woche —
 * ein vergessener Check-in soll nachholbar sein, nicht verfallen.
 */
export function checkinDue(input: {
  checkinWeekday: number
  lastCheckinWeekOf: string | null
  at?: Date
}): boolean {
  const at = input.at ?? new Date()
  const currentWeek = mondayOf(at)

  // Diese Woche schon abgegeben.
  if (input.lastCheckinWeekOf === currentWeek) return false

  const today = at.getDay()
  const dueDay = input.checkinWeekday
  const position = (day: number) => (day === 0 ? 7 : day)
  return position(today) >= position(dueDay)
}
