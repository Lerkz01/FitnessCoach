// ====================================================================
//  Der aktive Sync-Motor
//
//  Die Oberfläche soll nach jedem Satz einen Upload anstoßen können, ohne
//  zu wissen, ob überhaupt eine Cloud eingerichtet ist. Deshalb wird der
//  Motor hier einmal angemeldet und alles Weitere geht über `requestUpload`.
//
//  Ist kein Motor angemeldet — etwa weil noch keine Cloud-Zugangsdaten
//  hinterlegt sind — passiert schlicht nichts. Die Sätze liegen dann in der
//  Warteschlange in IndexedDB und gehen beim nächsten Start raus.
// ====================================================================

import type { SyncEngine } from './sync'

let active: SyncEngine | null = null

export function setActiveSyncEngine(engine: SyncEngine | null): void {
  active = engine
}

/**
 * Bittet um einen Upload-Versuch. Wirft nie und wartet nicht — ein
 * fehlgeschlagener Upload darf das Training niemals unterbrechen.
 */
export function requestUpload(): void {
  active?.requestFlush()
}
