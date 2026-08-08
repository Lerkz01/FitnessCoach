// ====================================================================
//  Geräteseitige ID-Erzeugung
//
//  Jeder Datensatz bekommt seine ID auf dem GERÄT, nicht vom Server.
//  Das ist die Voraussetzung dafür, dass offline geloggt werden kann und
//  die Synchronisation konfliktfrei bleibt (docs/ARCHITECTURE.md §3):
//  Zwei Geräte können nicht dieselbe ID erzeugen, also gibt es nichts
//  zusammenzuführen — es sind schlicht verschiedene Zeilen.
//
//  Verwendet wird UUIDv7: die ersten 48 Bit sind ein Zeitstempel in
//  Millisekunden. Damit sind IDs natürlich chronologisch sortierbar, was
//  für einen append-only Log genau passt.
// ====================================================================

const HEX = '0123456789abcdef'

function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count)
  crypto.getRandomValues(bytes)
  return bytes
}

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) {
    out += HEX[(b >> 4) & 0x0f] + HEX[b & 0x0f]
  }
  return out
}

/**
 * Erzeugt eine UUIDv7.
 *
 * Aufbau (RFC 9562):
 *   48 Bit  Unix-Zeit in Millisekunden
 *    4 Bit  Version (7)
 *   12 Bit  Zufall
 *    2 Bit  Variante (binär 10)
 *   62 Bit  Zufall
 */
export function newId(now: number = Date.now()): string {
  const bytes = new Uint8Array(16)

  // 48 Bit Zeitstempel, Big-Endian
  const ms = Math.max(0, Math.floor(now))
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff
  bytes[3] = Math.floor(ms / 2 ** 16) & 0xff
  bytes[4] = Math.floor(ms / 2 ** 8) & 0xff
  bytes[5] = ms & 0xff

  const rand = randomBytes(10)
  bytes.set(rand, 6)

  // Version 7 in die obere Hälfte von Byte 6
  bytes[6] = (bytes[6] & 0x0f) | 0x70
  // Variante 10xx in die obere Hälfte von Byte 8
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = toHex(bytes)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

/** Liest den Zeitstempel aus einer UUIDv7 zurück (für Diagnose und Tests). */
export function timestampOf(id: string): number | null {
  const hex = id.replace(/-/g, '')
  if (hex.length !== 32) return null
  const version = parseInt(hex[12], 16)
  if (version !== 7) return null
  return parseInt(hex.slice(0, 12), 16)
}

/**
 * Stabile Geräte-Kennung. Landet in jedem Satz-Datensatz, damit später
 * nachvollziehbar ist, von welchem Gerät ein Eintrag kam — hilfreich bei
 * Sync-Fragen und beim Debuggen doppelter Einträge.
 */
const DEVICE_ID_KEY = 'fitness-coach.deviceId'

export function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const created = newId()
    localStorage.setItem(DEVICE_ID_KEY, created)
    return created
  } catch {
    // Privater Modus o.ä. — dann eben eine flüchtige Kennung.
    return 'ephemeral'
  }
}

/** ISO-8601-Zeitstempel in UTC — das einheitliche Zeitformat aller Datensätze. */
export function nowIso(at: number = Date.now()): string {
  return new Date(at).toISOString()
}

/** Kalendertag in lokaler Zeit als `YYYY-MM-DD` (für Trainingstage, Messungen). */
export function today(at: Date = new Date()): string {
  const y = at.getFullYear()
  const m = String(at.getMonth() + 1).padStart(2, '0')
  const d = String(at.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
