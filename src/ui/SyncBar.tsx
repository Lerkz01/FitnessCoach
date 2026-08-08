// ====================================================================
//  Sicherungs-Statuszeile
//
//  Sichtbar auf jedem Bildschirm, aber nur dann, wenn es etwas zu sagen
//  gibt. Im Normalfall — alles hochgeladen — bleibt sie weg: Eine Meldung,
//  die immer da steht, wird nicht mehr gelesen.
//
//  Gezeigt wird sie in genau vier Lagen:
//
//    offline           Sätze werden gesammelt und später hochgeladen
//    ausstehend        es liegt etwas in der Warteschlange
//    Fehler            Hochladen scheitert dauerhaft
//    nur lokal         gar keine Cloud eingerichtet
//
//  Der Ton ist bewusst beruhigend, nicht alarmierend: Offline zu sein ist
//  der vorgesehene Betriebsfall im Gym, kein Problem.
// ====================================================================

import type { SyncStatus } from '../sync/sync'

export function SyncBar({
  status,
  localOnly,
  onOpen,
}: {
  status: SyncStatus | null
  localOnly: boolean
  /** Führt zur Sicherungs-Ansicht mit den Einzelheiten. */
  onOpen: () => void
}) {
  const info = describe(status, localOnly)
  if (!info) return null

  return (
    <button
      type="button"
      onClick={onOpen}
      className={
        'w-full text-left px-5 py-2 text-xs leading-snug transition-colors ' +
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
        (info.tone === 'warning'
          ? 'bg-warning/15 text-text'
          : 'bg-surface-2 text-muted hover:text-text')
      }
    >
      <span className="font-medium">{info.title}</span>
      {info.detail ? <span> — {info.detail}</span> : null}
    </button>
  )
}

function describe(
  status: SyncStatus | null,
  localOnly: boolean,
): { title: string; detail: string | null; tone: 'info' | 'warning' } | null {
  if (localOnly) {
    return {
      title: 'Nur auf diesem Gerät gespeichert',
      detail: 'Ohne Cloud ist der Fortschritt bei Geräteverlust weg. Antippen für Details.',
      tone: 'warning',
    }
  }

  if (!status) return null

  if (status.state === 'offline') {
    return {
      title: 'Offline',
      detail:
        status.pending > 0
          ? `${status.pending} Einträge warten — sie gehen raus, sobald du Verbindung hast`
          : 'Training läuft weiter, alles wird lokal gespeichert',
      tone: 'info',
    }
  }

  if (status.state === 'error') {
    return {
      title: 'Hochladen klappt gerade nicht',
      detail: 'Deine Daten sind lokal sicher, ich versuche es weiter.',
      tone: 'warning',
    }
  }

  if (status.pending > 0) {
    return {
      title: status.state === 'syncing' ? 'Lade hoch …' : 'Warteschlange',
      detail: `${status.pending} ${status.pending === 1 ? 'Eintrag' : 'Einträge'}`,
      tone: 'info',
    }
  }

  // Alles hochgeladen — dann ist Stille die richtige Meldung.
  return null
}
