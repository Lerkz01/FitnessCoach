// ====================================================================
//  Sicherung
//
//  Die Zusage lautet: Fortschritt geht nie verloren. Eine Zusage, die man
//  nicht überprüfen kann, ist wertlos — dieser Abschnitt macht sie prüfbar.
//
//  Drei Ebenen, absichtlich unabhängig voneinander
//  (docs/ARCHITECTURE.md §4):
//
//    1. LOKAL      IndexedDB auf dem Gerät. Jeder Satz sofort, auch offline.
//    2. CLOUD      Supabase. Automatisch, sobald Verbindung besteht.
//    3. DATEI      Eine JSON-Datei, die man selbst irgendwohin legt.
//
//  Ebene 3 ist nicht überflüssig: Sie schützt gegen den Fall, dass das
//  Cloud-Konto selbst verloren geht — vergessenes Passwort, gelöschtes
//  Projekt, eingestellter Anbieter. Eine Sicherung, die nur beim Anbieter
//  liegt, ist keine vollständige Sicherung.
// ====================================================================

import { useCallback, useEffect, useState } from 'react'
import { exportFileName, exportJson } from '../export/exportData'
import { importJson } from '../export/importData'
import { localCounts } from '../sync/restore'
import type { SyncStatus } from '../sync/sync'
import { Button, Notice } from '../ui/controls'
import { Disclosure, Row } from '../ui/Disclosure'

export function BackupSection({
  userId,
  displayName,
  status,
  localOnly,
  email,
  onRestore,
  onImported,
}: {
  userId: string
  displayName: string
  status: SyncStatus | null
  /** Keine Cloud eingerichtet — dann ist die Zusage nicht erfüllt. */
  localOnly: boolean
  email: string | null
  onRestore: () => void
  onImported: () => void
}) {
  const [counts, setCounts] = useState<{ total: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setCounts(await localCounts(userId))
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh, status?.pending])

  const download = async () => {
    setBusy('export')
    setProblem(null)
    try {
      const json = await exportJson(userId)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = exportFileName(displayName)
      link.click()
      // Der Speicher muss freigegeben werden, sonst bleibt die ganze Datei
      // im Arbeitsspeicher liegen.
      URL.revokeObjectURL(url)
      setMessage('Sicherungsdatei erstellt. Leg sie an einen Ort, den du wiederfindest.')
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const upload = async (file: File) => {
    setBusy('import')
    setProblem(null)
    setMessage(null)
    try {
      const text = await file.text()
      // `merge`: Bei gleicher Kennung gewinnt der neuere Stand. Niemals
      // `replace` — das würde neuere lokale Sätze mit älteren aus der Datei
      // überschreiben.
      const result = await importJson(userId, text, { conflict: 'merge' })

      const imported = sum(result.imported)
      const skipped = sum(result.skipped)
      setMessage(
        `${imported} Datensätze übernommen` +
          (skipped > 0 ? `, ${skipped} übersprungen (lokal war neuer)` : '') +
          '.',
      )
      if (result.warnings.length > 0) setProblem(result.warnings.join(' · '))
      onImported()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const pending = status?.pending ?? 0
  const safe = !localOnly && pending === 0 && status?.lastSuccessAt !== null

  return (
    <Disclosure
      title="Sicherung"
      summary={
        localOnly
          ? 'nur lokal'
          : pending === 0
            ? 'alles hochgeladen'
            : `${pending} ausstehend`
      }
      tone={localOnly || pending > 0 ? 'attention' : 'normal'}
      defaultOpen={localOnly}
    >
      {localOnly ? (
        <Notice tone="warning">
          <span className="font-medium text-text">Keine Cloud eingerichtet. </span>
          Dein Fortschritt liegt ausschließlich auf diesem Gerät. Geht der Speicher
          verloren, ist er weg. Lade zumindest regelmäßig eine Sicherungsdatei
          herunter — oder richte die Cloud ein.
        </Notice>
      ) : null}

      <div className="mt-1">
        <Row
          label="Auf diesem Gerät"
          value={counts ? `${counts.total} Datensätze` : '…'}
        />
        {!localOnly ? (
          <>
            <Row
              label="Noch nicht hochgeladen"
              value={pending === 0 ? 'nichts' : String(pending)}
              hint={
                pending > 0
                  ? 'Bleibt in der Warteschlange und geht raus, sobald Verbindung da ist.'
                  : undefined
              }
            />
            <Row
              label="Zuletzt hochgeladen"
              value={status?.lastSuccessAt ? relativeTime(status.lastSuccessAt) : 'noch nie'}
            />
            {email ? <Row label="Konto" value={email} /> : null}
          </>
        ) : null}
      </div>

      {safe ? (
        <p className="text-xs text-success mt-3 leading-relaxed">
          Alles, was du bisher trainiert hast, liegt in der Cloud. Selbst wenn dieses
          Gerät verloren geht, holst du es mit einer Anmeldung zurück.
        </p>
      ) : null}

      {status?.lastError && !localOnly ? (
        <p className="text-xs text-muted mt-3 leading-relaxed">
          Letzter Fehler beim Hochladen: {status.lastError}. Die Daten sind lokal sicher
          und werden weiter versucht.
        </p>
      ) : null}

      {message ? (
        <div className="mt-3">
          <Notice>{message}</Notice>
        </div>
      ) : null}
      {problem ? (
        <div className="mt-3">
          <Notice tone="warning">{problem}</Notice>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        <Button variant="secondary" full disabled={busy !== null} onClick={() => void download()}>
          {busy === 'export' ? 'Erstelle …' : 'Sicherungsdatei herunterladen'}
        </Button>

        <label
          className={
            'block w-full min-h-14 px-6 rounded-lg bg-surface-2 text-text ' +
            'font-semibold text-base text-center leading-[3.5rem] cursor-pointer ' +
            'hover:bg-border transition-colors'
          }
        >
          {busy === 'import' ? 'Lade …' : 'Sicherungsdatei einlesen'}
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
              event.target.value = ''
              if (file) void upload(file)
            }}
          />
        </label>

        {!localOnly ? (
          <Button variant="ghost" full disabled={busy !== null} onClick={onRestore}>
            Aus der Cloud zurückholen
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted mt-4 leading-relaxed">
        Die Datei enthält alles: Trainings, Sätze, Check-ins, Messwerte und die
        Begründungen jeder Anpassung. Sie ist lesbares JSON und beschreibt sich selbst —
        auch eine spätere, andere App kann sie einlesen.
      </p>
    </Disclosure>
  )
}

function sum(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0)
}

/** „vor 3 Minuten" ist verständlicher als ein Zeitstempel. */
function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (seconds < 60) return 'gerade eben'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `vor ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `vor ${hours} h`
  const days = Math.round(hours / 24)
  return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`
}
