// ====================================================================
//  Sekundenzähler
//
//  Ein Timer, der auch dann richtig läuft, wenn der Bildschirm aus war
//  oder der Browser im Hintergrund getaktet wurde: Gemessen wird nicht,
//  wie oft der Intervall gefeuert hat, sondern die Differenz zweier
//  Zeitstempel. Mobile Browser drosseln Hintergrund-Intervalle stark —
//  ein hochzählender Zähler wäre nach der Pause deutlich zu niedrig.
// ====================================================================

import { useCallback, useEffect, useRef, useState } from 'react'

export interface Ticker {
  /** Verstrichene ganze Sekunden seit dem Start. */
  elapsed: number
  running: boolean
  start: () => void
  stop: () => void
  reset: () => void
}

export function useTicker(): Ticker {
  const startedAt = useRef<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running) return
    const update = () => {
      if (startedAt.current === null) return
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000))
    }
    update()
    const id = setInterval(update, 250)
    // Beim Zurückkehren auf die Seite sofort nachziehen, statt bis zum
    // nächsten Intervall eine veraltete Zahl zu zeigen.
    document.addEventListener('visibilitychange', update)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', update)
    }
  }, [running])

  const start = useCallback(() => {
    startedAt.current = Date.now()
    setElapsed(0)
    setRunning(true)
  }, [])

  const stop = useCallback(() => setRunning(false), [])

  const reset = useCallback(() => {
    startedAt.current = null
    setElapsed(0)
    setRunning(false)
  }, [])

  return { elapsed, running, start, stop, reset }
}

/** `95` → `"1:35"`. Für Pausen und Zeit-Übungen. */
export function formatSeconds(total: number): string {
  const safe = Math.max(0, Math.floor(total))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
