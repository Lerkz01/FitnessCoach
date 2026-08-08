// ====================================================================
//  Pausentimer
//
//  Läuft rückwärts, blockiert aber nichts: Wer früher weitermachen will,
//  tippt „Weiter". Die Pausenlänge ist eine Empfehlung, kein Zwang
//  (docs/UI-UX.md §5.5).
// ====================================================================

import { useEffect } from 'react'
import { Button } from '../ui/controls'
import { formatSeconds, useTicker } from './useTicker'

export function RestTimer({
  seconds,
  onDone,
  nextLabel,
}: {
  seconds: number
  onDone: () => void
  /** Was nach der Pause kommt — damit man sich schon einstellen kann. */
  nextLabel: string
}) {
  const ticker = useTicker()

  useEffect(() => {
    ticker.start()
  }, [ticker.start])

  const remaining = seconds - ticker.elapsed
  const over = remaining <= 0
  const percent = Math.min(100, (ticker.elapsed / Math.max(1, seconds)) * 100)

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 text-center">
      <p className="text-sm text-muted">Pause</p>
      <p
        className={
          'text-5xl font-bold tabular mt-1 ' + (over ? 'text-success' : 'text-text')
        }
        // Nur die abgelaufene Zeit ansagen, nicht jede Sekunde vorlesen.
        aria-live={over ? 'polite' : 'off'}
      >
        {over ? formatSeconds(-remaining) : formatSeconds(remaining)}
      </p>
      <p className="text-xs text-muted mt-1">
        {over ? 'Pause vorbei — los' : `von ${formatSeconds(seconds)}`}
      </p>

      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-4">
        <div
          className={'h-full rounded-full ' + (over ? 'bg-success' : 'bg-primary')}
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="text-sm text-muted mt-4">Als Nächstes: {nextLabel}</p>

      <div className="mt-4">
        <Button full onClick={onDone}>
          {over ? 'Weiter' : 'Pause überspringen'}
        </Button>
      </div>
    </div>
  )
}
