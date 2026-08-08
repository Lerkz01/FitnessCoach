// ====================================================================
//  Synchronisation
//
//  Verhalten nach docs/ARCHITECTURE.md §3:
//
//  · Online während des Trainings → jeder Satz geht innerhalb von
//    Sekunden hoch. Nicht gesammelt, nicht erst am Trainingsende.
//  · Offline → Warteschlange. Das Training läuft völlig normal weiter.
//  · Verbindung kommt zurück → Warteschlange wird automatisch und sofort
//    abgearbeitet.
//
//  Zwei Eigenschaften sind hier entscheidend:
//
//  FIRE-AND-FORGET. Kein Aufruf blockiert das Loggen. Auch ein hängender
//  Upload verzögert keinen Satz und keinen Pausen-Timer. Deshalb gibt
//  `requestFlush()` nichts zurück, worauf man warten müsste, und keine
//  Methode wirft nach außen.
//
//  KEIN EINZELNER EINTRAG BLOCKIERT DEN REST. Fehlerhafte Datensätze
//  landen in einer Wartezeit statt die Warteschlange anzuhalten.
// ====================================================================

import {
  clearOutboxEntries,
  getMeta,
  markOutboxFailure,
  outboxCount,
  pendingOutbox,
  putRemoteRecord,
  resolveOutbox,
  setMeta,
  type OutboxEntry,
} from '../data/db'
import type { RecordKind } from '../domain/records'
import type { PushItem, RemoteAdapter } from './adapter'

/**
 * Schlüssel des Abruf-Cursors.
 *
 * Exportiert, weil die Wiederherstellung ihn setzen muss. Zwei getrennte
 * Schreibweisen desselben Schlüssels hätten bedeutet, dass die App nach
 * jeder Wiederherstellung noch einmal alles abruft.
 */
export const CURSOR_KEY = 'sync.cursor'

/** Nach so vielen Fehlversuchen gilt ein Eintrag als aussortiert. */
const MAX_ATTEMPTS = 25

/** Obergrenze der Wartezeit zwischen Versuchen. */
const MAX_BACKOFF_MS = 5 * 60 * 1000

/** Rückfall-Takt, falls kein Ereignis den Abgleich auslöst. */
const FALLBACK_INTERVAL_MS = 30 * 1000

/** Wie viele Datensätze pro Übertragung. */
const BATCH_SIZE = 100

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncStatus {
  state: SyncState
  /** Wartende Datensätze — die Zahl hinter dem Wolkensymbol (docs/UI-UX.md). */
  pending: number
  lastSuccessAt: string | null
  lastError: string | null
}

/** Wartezeit nach n Fehlversuchen: 2s, 4s, 8s … bis maximal 5 Minuten. */
export function backoffMs(attempts: number): number {
  if (attempts <= 0) return 0
  return Math.min(2 ** attempts * 1000, MAX_BACKOFF_MS)
}

function isDue(entry: OutboxEntry, now: number): boolean {
  if (entry.attempts === 0) return true
  if (entry.attempts >= MAX_ATTEMPTS) return false
  if (!entry.lastAttemptAt) return true
  const elapsed = now - Date.parse(entry.lastAttemptAt)
  return elapsed >= backoffMs(entry.attempts)
}

export interface SyncEngineOptions {
  userId: string
  adapter: RemoteAdapter
  /** Für Tests überschreibbar. */
  now?: () => number
  /** Standardmäßig `navigator.onLine`. */
  isOnline?: () => boolean
  onStatusChange?: (status: SyncStatus) => void
}

/**
 * Der Synchronisierer.
 *
 * Vorgesehene Nutzung: eine Instanz pro angemeldetem Profil, `start()`
 * beim App-Start, `requestFlush()` nach jedem Schreibvorgang.
 */
export class SyncEngine {
  private readonly userId: string
  private readonly adapter: RemoteAdapter
  private readonly now: () => number
  private readonly isOnline: () => boolean
  private readonly onStatusChange?: (status: SyncStatus) => void

  private running = false
  /** Während eines Durchlaufs eingegangene Anfragen → direkt noch einmal. */
  private queuedAgain = false
  private timer: ReturnType<typeof setInterval> | null = null
  private listenersAttached = false

  private status: SyncStatus = {
    state: 'idle',
    pending: 0,
    lastSuccessAt: null,
    lastError: null,
  }

  constructor(options: SyncEngineOptions) {
    this.userId = options.userId
    this.adapter = options.adapter
    this.now = options.now ?? (() => Date.now())
    this.isOnline =
      options.isOnline ??
      (() => (typeof navigator === 'undefined' ? true : navigator.onLine))
    this.onStatusChange = options.onStatusChange
  }

  getStatus(): SyncStatus {
    return { ...this.status }
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch }
    this.onStatusChange?.(this.getStatus())
  }

  /**
   * Hängt alle Auslöser ein und arbeitet die Warteschlange einmal ab.
   *
   * Auslöser (docs/ARCHITECTURE.md §3):
   *   · neuer Eintrag        → `requestFlush()` vom Schreibpfad
   *   · `online`-Ereignis    → Verbindung kommt zurück
   *   · `visibilitychange`   → App wird wieder sichtbar
   *   · Intervall (30 s)     → Rückfalloption
   */
  start(): void {
    if (this.listenersAttached) return
    this.listenersAttached = true

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
      document.addEventListener('visibilitychange', this.handleVisibility)
    }
    this.timer = setInterval(() => this.requestFlush(), FALLBACK_INTERVAL_MS)

    this.requestFlush()
  }

  stop(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
      document.removeEventListener('visibilitychange', this.handleVisibility)
    }
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.listenersAttached = false
  }

  private handleOnline = (): void => {
    // Verbindung ist zurück — nicht auf das Intervall warten.
    this.requestFlush()
  }

  private handleVisibility = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.requestFlush()
    }
  }

  /**
   * Bittet um einen Abgleich, ohne darauf zu warten.
   *
   * Das ist der Aufruf, den der Schreibpfad nach jedem Satz macht.
   * Er gibt bewusst kein Promise zurück: Nichts im Trainingsablauf darf
   * auf das Netz warten.
   */
  requestFlush(): void {
    void this.flush().catch(() => {
      // Fehler landen im Status, nicht als unbehandelte Ausnahme.
    })
  }

  /**
   * Arbeitet die Warteschlange ab und holt Änderungen der Gegenseite.
   * Läuft nie doppelt; parallele Anfragen werden zu einem Nachlauf gebündelt.
   */
  async flush(): Promise<SyncStatus> {
    if (this.running) {
      this.queuedAgain = true
      return this.getStatus()
    }

    this.running = true
    try {
      do {
        this.queuedAgain = false
        await this.runOnce()
      } while (this.queuedAgain)
    } finally {
      this.running = false
    }
    return this.getStatus()
  }

  private async runOnce(): Promise<void> {
    const pending = await outboxCount(this.userId)

    if (!this.isOnline()) {
      this.setStatus({ state: 'offline', pending })
      return
    }

    this.setStatus({ state: 'syncing', pending })

    try {
      await this.pushPending()
      await this.pullRemote()
      this.setStatus({
        state: 'idle',
        pending: await outboxCount(this.userId),
        lastSuccessAt: new Date(this.now()).toISOString(),
        lastError: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // Ein Verbindungsfehler ist kein Anwendungsfehler — die Daten sind
      // lokal sicher und werden beim nächsten Auslöser erneut versucht.
      this.setStatus({
        state: this.isOnline() ? 'error' : 'offline',
        pending: await outboxCount(this.userId),
        lastError: message,
      })
    }
  }

  private async pushPending(): Promise<void> {
    const now = this.now()
    const all = await pendingOutbox(this.userId, BATCH_SIZE * 2)
    const due = all.filter((entry) => isDue(entry, now)).slice(0, BATCH_SIZE)
    if (due.length === 0) return

    const resolved = await resolveOutbox(this.userId, due)

    // Datensätze, deren Eintrag noch existiert, die aber gelöscht wurden:
    // Der Eintrag darf nicht ewig stehen bleiben.
    const orphanKeys = due
      .filter((entry) => !resolved.some((r) => r.entry.key === entry.key))
      .map((entry) => entry.key)
    if (orphanKeys.length > 0) await clearOutboxEntries(this.userId, orphanKeys)

    if (resolved.length === 0) return

    const items: PushItem[] = resolved.map(({ entry, record }) => ({
      kind: entry.kind,
      record,
    }))

    let outcome
    try {
      outcome = await this.adapter.push(items)
    } catch (error) {
      // Ein Verbindungsfehler zählt als Versuch für ALLE beteiligten
      // Einträge. Ohne das würde `attempts` auf 0 bleiben, die Wartezeit
      // nie greifen — und da nach jedem Satz ein Abgleich angefragt wird,
      // entstünde bei gestörter Verbindung ein Wiederholungssturm.
      const message = error instanceof Error ? error.message : String(error)
      for (const { entry } of resolved) {
        await markOutboxFailure(this.userId, entry.key, message)
      }
      throw error
    }

    const acceptedKeys = resolved
      .filter(({ record }) => outcome.accepted.includes(record.id))
      .map(({ entry }) => entry.key)
    await clearOutboxEntries(this.userId, acceptedKeys)

    for (const failure of outcome.failed) {
      const match = resolved.find(({ record }) => record.id === failure.recordId)
      if (!match) continue
      await markOutboxFailure(
        this.userId,
        match.entry.key,
        failure.permanent ? `dauerhaft: ${failure.error}` : failure.error,
      )
    }
  }

  private async pullRemote(): Promise<void> {
    const cursor = await getMeta(this.userId, CURSOR_KEY)
    const outcome = await this.adapter.pull(cursor)
    if (outcome.items.length === 0) {
      if (outcome.cursor && outcome.cursor !== cursor) {
        await setMeta(this.userId, CURSOR_KEY, outcome.cursor)
      }
      return
    }

    // Lokale Änderungen, die noch nicht übertragen sind, dürfen NICHT von
    // der Gegenseite überschrieben werden — sonst verliert man genau die
    // Sätze, die offline geloggt wurden.
    const stillPending = new Set(
      (await pendingOutbox(this.userId, 1000)).map((e) => `${e.kind}:${e.recordId}`),
    )

    for (const item of outcome.items) {
      const key = `${item.kind}:${item.record.id}`
      if (stillPending.has(key)) continue
      await putRemoteRecord(this.userId, item.kind as RecordKind, item.record as never)
    }

    if (outcome.cursor) await setMeta(this.userId, CURSOR_KEY, outcome.cursor)
  }
}
