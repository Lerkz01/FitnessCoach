// ====================================================================
//  Aufklappbare Abschnitte
//
//  Grundsatz für die ganze App: nicht alles gleichzeitig auf einen
//  Bildschirm. Jeder Bereich ist zugeklappt und zeigt in der Kopfzeile den
//  einen Wert, der von außen zählt — aufgeklappt wird nur, was gerade
//  interessiert.
//
//  Umgesetzt mit <details>/<summary> und nicht mit eigenem Zustand:
//   · Tastatur und Screenreader funktionieren von sich aus
//   · kein React-Zustand, der beim Neuaufbau verloren geht
//   · Strg+F des Browsers findet auch zugeklappten Text
//
//  AUSNAHME: der Workout-Bildschirm. Wer mit 20 kg in der Hand zwischen
//  zwei Sätzen steht, darf nicht erst etwas aufklappen müssen
//  (docs/UI-UX.md §5).
// ====================================================================

import type { ReactNode } from 'react'

interface DisclosureProps {
  title: string
  /** Kennzahl in der Kopfzeile — sichtbar, ohne aufzuklappen. */
  summary?: string
  children: ReactNode
  /** Standardmäßig offen. Sparsam einsetzen, sonst ist nichts gewonnen. */
  defaultOpen?: boolean
  /** Hebt die Kopfzeile hervor, z.B. bei einer offenen Aufgabe. */
  tone?: 'normal' | 'attention'
}

export function Disclosure({
  title,
  summary,
  children,
  defaultOpen = false,
  tone = 'normal',
}: DisclosureProps) {
  return (
    <details
      open={defaultOpen}
      className={
        'group rounded-lg border bg-surface overflow-hidden ' +
        (tone === 'attention' ? 'border-primary/50' : 'border-border')
      }
    >
      <summary
        className={
          'flex items-center gap-3 min-h-14 px-4 py-3 cursor-pointer select-none ' +
          'marker:content-none [&::-webkit-details-marker]:hidden ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
        }
      >
        <span className="flex-1 font-semibold">{title}</span>
        {summary ? <span className="text-sm text-muted tabular">{summary}</span> : null}
        {/* Dreht sich beim Aufklappen — das einzige rein dekorative Element. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="w-4 h-4 shrink-0 text-muted transition-transform group-open:rotate-180"
        >
          <path
            d="M5 7.5 10 12.5 15 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </summary>
      <div className="px-4 pb-4 pt-1 border-t border-border">{children}</div>
    </details>
  )
}

/**
 * Zeile aus Bezeichnung und Wert — das häufigste Muster innerhalb eines
 * aufgeklappten Abschnitts.
 */
export function Row({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-muted text-sm">{label}</span>
        <span className="tabular font-medium">{value}</span>
      </div>
      {hint ? <p className="text-xs text-muted mt-0.5 leading-snug">{hint}</p> : null}
    </div>
  )
}
