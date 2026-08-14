// ====================================================================
//  Pausentimer
//
//  Läuft rückwärts, blockiert aber nichts: Wer früher weitermachen will,
//  tippt „Weiter". Die Pausenlänge ist eine Empfehlung, kein Zwang
//  (docs/UI-UX.md §5.5).
// ====================================================================

import { useEffect, useRef } from 'react'
import { Button } from '../ui/controls'
import { formatSeconds, useTicker } from './useTicker'
import { signalRestOver } from './useWakeLock'

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
  const signalled = useRef(false)

  useEffect(() => {
    ticker.start()
  }, [ticker.start])

  const remaining = seconds - ticker.elapsed
  const over = remaining <= 0

  // Ein Signal, genau einmal. Ohne die Sperre würde es bei jedem
  // Neuzeichnen erneut piepen, also viermal pro Sekunde.
  useEffect(() => {
    if (over && !signalled.current) {
      signalled.current = true
      signalRestOver()
    }
  }, [over])
  // Der Sweep. Ein umlaufender Zeiger statt eines Balkens — der eine
  // orchestrierte Bewegungsmoment der App. Gerechnet über den Umfang, damit
  // der Ring nicht über eine Skalierung verzerrt wird.
  const RADIUS = 52
  const UMFANG = 2 * Math.PI * RADIUS
  const anteil = Math.min(1, ticker.elapsed / Math.max(1, seconds))

  return (
    <div
      className={
        'rounded-lg border border-border bg-surface p-5 text-center ' +
        (over ? 'sweep-over' : '')
      }
    >
      <p className="instrument-label">{over ? 'Pause vorbei' : 'Pause läuft'}</p>

      <div className="relative mx-auto mt-3 w-[132px] h-[132px]">
        <svg viewBox="0 0 132 132" className="w-full h-full sweep-ring" aria-hidden="true">
          {/* Leiser Schein hinter dem Ring — wird erst nach Ablauf sichtbar. */}
          <circle
            className="sweep-glow"
            cx="66"
            cy="66"
            r={RADIUS}
            fill="none"
            stroke="var(--color-reference)"
            strokeWidth="16"
            opacity="0"
          />
          <circle
            className="sweep-track"
            cx="66"
            cy="66"
            r={RADIUS}
            fill="none"
            strokeWidth="3"
          />
          <circle
            className="sweep-value"
            cx="66"
            cy="66"
            r={RADIUS}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={UMFANG}
            strokeDashoffset={UMFANG * (1 - anteil)}
          />
          {/* Skalenstriche alle 15 Grad — die Anmutung eines Zifferblatts,
              ohne Ziffern, die niemand liest. */}
          {Array.from({ length: 24 }, (_, index) => {
            const winkel = (index / 24) * 2 * Math.PI
            const innen = RADIUS - 9
            const aussen = RADIUS - 5
            return (
              <line
                key={index}
                x1={66 + Math.cos(winkel) * innen}
                y1={66 + Math.sin(winkel) * innen}
                x2={66 + Math.cos(winkel) * aussen}
                y2={66 + Math.sin(winkel) * aussen}
                stroke="var(--color-rule)"
                strokeWidth="1.5"
              />
            )
          })}
        </svg>

        <div className="absolute inset-0 grid place-items-center">
          <p
            className={
              'text-4xl font-semibold tabular leading-none ' +
              (over ? 'text-accent' : 'text-text')
            }
            // Nur die abgelaufene Zeit ansagen, nicht jede Sekunde vorlesen.
            aria-live={over ? 'polite' : 'off'}
          >
            {over ? `+${formatSeconds(-remaining)}` : formatSeconds(remaining)}
          </p>
          <p className="instrument-label mt-1">
            {over ? 'los' : `von ${formatSeconds(seconds)}`}
          </p>
        </div>
      </div>

      <p className="text-sm text-muted mt-4">
        <span className="instrument-label">danach</span>{' '}
        <span className="text-text">{nextLabel}</span>
      </p>

      <div className="mt-4">
        <Button full onClick={onDone}>
          {over ? 'Weiter' : 'Pause überspringen'}
        </Button>
      </div>
    </div>
  )
}
