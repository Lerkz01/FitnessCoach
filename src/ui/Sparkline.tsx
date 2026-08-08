// ====================================================================
//  Verlaufslinie
//
//  Ein bewusst minimaler Graph: keine Achsen, keine Gitter, keine
//  Bibliothek. Auf einem Handybildschirm zählt die RICHTUNG, nicht das
//  Ablesen einzelner Werte — die stehen als Zahl daneben.
//
//  Als SVG mit `preserveAspectRatio="none"`, damit die Linie jede Breite
//  füllt, ohne dass etwas gerechnet werden muss. `vector-effect` hält die
//  Strichstärke dabei konstant, sonst würde sie beim Streckeneffekt
//  verzerren.
// ====================================================================

export function Sparkline({
  values,
  label,
  tone = 'primary',
}: {
  /** Älteste zuerst. Weniger als zwei Werte ergeben keine Linie. */
  values: readonly number[]
  /** Beschreibung für Screenreader — die Linie selbst sagt ihnen nichts. */
  label: string
  tone?: 'primary' | 'success' | 'muted'
}) {
  if (values.length < 2) {
    return (
      <p className="text-xs text-muted py-2">
        Noch zu wenig Daten für einen Verlauf — ab zwei Messungen zeichne ich eine Linie.
      </p>
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  // Bei einer waagerechten Linie wäre die Spanne 0 — dann in die Mitte legen.
  const span = max - min || 1

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100
      const y = 100 - ((value - min) / span) * 100
      return `${x},${max === min ? 50 : y}`
    })
    .join(' ')

  const stroke =
    tone === 'success'
      ? 'var(--color-success)'
      : tone === 'muted'
        ? 'var(--color-muted)'
        : 'var(--color-primary)'

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className="w-full h-12 overflow-visible"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Letzter Punkt hervorgehoben — das ist der Wert, der gerade gilt. */}
      <circle
        cx={100}
        cy={max === min ? 50 : 100 - ((values[values.length - 1] - min) / span) * 100}
        r="3"
        fill={stroke}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
