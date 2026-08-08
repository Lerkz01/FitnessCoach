// ====================================================================
//  Schnittstelle zur Gegenseite
//
//  Die Synchronisationslogik kennt Supabase nicht. Sie spricht nur mit
//  dieser Schnittstelle. Zwei Gründe:
//
//  1. Die gesamte Sync-Mechanik ist ohne Cloud-Konto testbar.
//  2. Ein Anbieterwechsel wäre eine neue Implementierung dieser
//     Schnittstelle — nicht ein Umbau der App.
// ====================================================================

import type { AnyRecord, RecordKind } from '../domain/records'

export interface PushItem {
  kind: RecordKind
  record: AnyRecord
}

export interface PushFailure {
  recordId: string
  error: string
  /**
   * `true` = die Gegenseite hat den Datensatz inhaltlich abgelehnt
   * (z.B. Schema-Verstoß). Ein Wiederholen wird nie helfen, deshalb wird
   * so ein Eintrag nach wenigen Versuchen aussortiert, statt die
   * Warteschlange dauerhaft zu blockieren.
   */
  permanent: boolean
}

export interface PushOutcome {
  /** IDs, die die Gegenseite übernommen hat. */
  accepted: string[]
  failed: PushFailure[]
}

export interface PullOutcome {
  items: PushItem[]
  /** Neuer Cursor für den nächsten Abruf. */
  cursor: string | null
}

export interface RemoteAdapter {
  /**
   * Überträgt Datensätze. Muss IDEMPOTENT sein: Derselbe Datensatz
   * zweimal gesendet darf keinen Doppeleintrag erzeugen — die ID kommt
   * vom Gerät und ist der Schlüssel (docs/ARCHITECTURE.md §3).
   *
   * Wirft nur bei Verbindungsfehlern. Inhaltliche Ablehnungen einzelner
   * Datensätze gehören in `failed`, damit ein fehlerhafter Eintrag nicht
   * alle anderen aufhält.
   */
  push(items: PushItem[]): Promise<PushOutcome>

  /** Holt alles, was sich seit `cursor` auf der Gegenseite geändert hat. */
  pull(cursor: string | null): Promise<PullOutcome>
}

// --------------------------------------------------------------------
//  Speicher-Implementierung für Tests und den lokalen Betrieb ohne Cloud
// --------------------------------------------------------------------

export interface MemoryAdapterOptions {
  /** Simuliert fehlende Verbindung. */
  offline?: boolean
  /** Datensatz-IDs, die inhaltlich abgelehnt werden sollen. */
  rejectIds?: Set<string>
  /** Verbindungsfehler bei jedem n-ten Aufruf (1 = immer). */
  failEveryNthPush?: number
}

/**
 * Vollständige, aber flüchtige Gegenseite. Verhält sich wie der echte
 * Adapter — inklusive Idempotenz — und macht die Sync-Tests unabhängig
 * von einem Cloud-Konto.
 */
export class MemoryAdapter implements RemoteAdapter {
  readonly store = new Map<string, PushItem>()
  pushCalls = 0
  pullCalls = 0
  options: MemoryAdapterOptions

  constructor(options: MemoryAdapterOptions = {}) {
    this.options = options
  }

  async push(items: PushItem[]): Promise<PushOutcome> {
    this.pushCalls += 1

    if (this.options.offline) {
      throw new Error('offline')
    }
    if (
      this.options.failEveryNthPush &&
      this.pushCalls % this.options.failEveryNthPush === 0
    ) {
      throw new Error('Verbindung unterbrochen')
    }

    const accepted: string[] = []
    const failed: PushFailure[] = []

    for (const item of items) {
      if (this.options.rejectIds?.has(item.record.id)) {
        failed.push({
          recordId: item.record.id,
          error: 'inhaltlich abgelehnt',
          permanent: true,
        })
        continue
      }
      // Idempotent: Schlüssel ist die geräteseitig erzeugte ID.
      this.store.set(`${item.kind}:${item.record.id}`, {
        kind: item.kind,
        record: { ...item.record },
      })
      accepted.push(item.record.id)
    }

    return { accepted, failed }
  }

  async pull(cursor: string | null): Promise<PullOutcome> {
    this.pullCalls += 1
    if (this.options.offline) throw new Error('offline')

    const items = [...this.store.values()]
      .filter((item) => cursor === null || item.record.updatedAt > cursor)
      .sort((a, b) => a.record.updatedAt.localeCompare(b.record.updatedAt))

    const newCursor =
      items.length > 0 ? items[items.length - 1].record.updatedAt : cursor

    return { items, cursor: newCursor }
  }
}
