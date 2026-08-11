// ====================================================================
//  Gesprächsverlauf — bewusst nur auf diesem Gerät
//
//  Der Chat wird NICHT synchronisiert und NICHT gesichert. Das ist eine
//  Entscheidung, nicht ein Versäumnis:
//
//   · Der Verlauf ist keine Trainingsdaten. Was am Plan geändert wurde,
//     steht im Anpassungsprotokoll — das wird übertragen und gesichert.
//     Der Wortlaut des Gesprächs trägt dazu nichts bei.
//   · Die Zusage „der Fortschritt darf nie verloren gehen" gilt für Sätze,
//     Gewichte und Anpassungen. Sie auf Chatverläufe auszudehnen würde die
//     Synchronisation und den Export für etwas belasten, das niemand
//     zurückhaben will.
//   · Weniger Kopien heißt weniger Orte, an denen etwas liegt.
//
//  localStorage statt IndexedDB, weil es klein ist und beim Start sofort
//  da sein soll. Getrennt je Profil: Zwei Konten auf einem Gerät dürfen
//  ihre Gespräche nicht sehen.
// ====================================================================

/** Was im Chat sichtbar ist — nicht das API-Format. */
export interface ChatEntry {
  id: string
  role: 'user' | 'coach'
  text: string
  /** Planänderungen dieses Zuges, eine Zeile je Änderung. */
  changes?: string[]
  at: string
}

/**
 * Wie viele Nachrichten behalten werden.
 *
 * Der Verlauf geht bei jeder Frage mit und kostet Geld. 40 Einträge sind
 * etwa zwanzig Fragen — mehr Rückblick braucht ein Trainingsgespräch nicht,
 * und der Kontext trägt den aktuellen Stand ohnehin frisch mit.
 */
const KEEP = 40

function key(userId: string): string {
  return `fitness-coach.chat.${userId}`
}

export function loadHistory(userId: string): ChatEntry[] {
  try {
    const raw = localStorage.getItem(key(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is ChatEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as ChatEntry).text === 'string',
    )
  } catch {
    // Kaputter Eintrag darf den Chat nicht blockieren.
    return []
  }
}

export function saveHistory(userId: string, entries: readonly ChatEntry[]): void {
  try {
    localStorage.setItem(key(userId), JSON.stringify(entries.slice(-KEEP)))
  } catch {
    // Speicher voll oder gesperrt (privates Fenster). Der Chat funktioniert
    // weiter, er erinnert sich nach einem Neustart nur nicht.
  }
}

export function clearHistory(userId: string): void {
  try {
    localStorage.removeItem(key(userId))
  } catch {
    // siehe oben
  }
}

/**
 * Der sichtbare Verlauf als API-Nachrichten.
 *
 * Werkzeugrunden werden NICHT mitgeschickt: Sie sind innerhalb eines Zuges
 * nötig, danach steht ihr Ergebnis im Trainingskontext, der frisch mitgeht.
 * Sie noch einmal zu senden wäre doppelt bezahlter Ballast — und würde das
 * Modell verleiten, eine Änderung für neu zu halten.
 */
export function toApiMessages(
  entries: readonly ChatEntry[],
): { role: 'user' | 'assistant'; content: string }[] {
  return entries
    .filter((entry) => entry.text.trim().length > 0)
    .map((entry) => ({
      role: entry.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: entry.text,
    }))
}
