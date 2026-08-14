// ====================================================================
//  Die Messanzeige — das Signaturelement
//
//  Eine Skala mit ZWEI Marken: die Vorgabe (eine feine Linie) und das
//  Erreichte (Champagner). Bewusst monochrom — zwei gesättigte Farben
//  nebeneinander wären lauter, nicht klarer, und die Position der Marke
//  sagt es schon.
//
//  Warum das das eine besondere Element dieser App ist: Der Leitsatz der
//  ganzen Progressionslogik heißt „Vergleich statt Bewertung"
//  (docs/PLAN-ENGINE.md §9). Die App sagt nie „gut" oder „schlecht", sie
//  legt Vorgabe und Ergebnis nebeneinander. Genau das tut dieses Element —
//  es ist der Leitsatz als Bild.
//
//  Ein einfacher Fortschrittsbalken könnte das nicht: Er kennt nur „wie
//  weit von 100 %" und müsste die Vorgabe verschweigen oder in eine Zahl
//  daneben auslagern. Hier steht beides in derselben Skala, und man sieht
//  ohne ein Wort, ob man darunter, darauf oder darüber liegt.
// ====================================================================

export function Gauge({
  /** Erreichter Wert. */
  value,
  /** Geplanter Wert — die Referenzmarke. */
  reference,
  /** Skalenende. Ohne Angabe das Größere von beiden, mit Luft. */
  max,
  label,
  /** Text rechts, meist die Zahlen selbst. */
  readout,
}: {
  value: number
  reference: number | null
  max?: number
  label?: string
  readout?: string
}) {
  /**
   * Wo die Referenzmarke sitzt — immer an derselben Stelle.
   *
   * Das ist der Punkt, an dem diese Anzeige zur Gerätetafel wird. Skalierte
   * man jede Anzeige auf ihren eigenen Höchstwert, stünde die Marke bei jedem
   * Muskel woanders: gemessen 87 %, 87 %, 70 % in einer Liste von drei. Man
   * müsste jede Zeile einzeln lesen.
   *
   * Bei fester Position wird die Marke zu einer geraden senkrechten Linie
   * durch die ganze Liste, und die Balken sind sichtbar kürzer oder länger. Damit ist die Frage „wo stehe ich gegenüber dem Plan" mit einem
   * Blick über die Spalte beantwortet statt mit dreimal Rechnen.
   */
  const REFERENCE_AT = 0.72

  const anteil = (input: number) => {
    if (reference !== null && reference > 0 && max === undefined) {
      return `${Math.min(100, Math.max(0, (input / reference) * REFERENCE_AT * 100))}%`
    }
    // Ohne Referenz bleibt die gewöhnliche Skala. Die 1 fängt den Fall ab,
    // dass alle Werte 0 sind — sonst teilt die Anzeige durch null.
    const ende = max ?? Math.max(1, value)
    return `${Math.min(100, Math.max(0, (input / ende) * 100))}%`
  }
  const ende = max ?? Math.max(1, Math.max(value, reference ?? 0))

  // Über der Referenz wechselt die Füllung die Bedeutung: nicht mehr „noch
  // nicht da", sondern „darüber". Das darf man sehen.
  const darueber = reference !== null && value > reference

  return (
    <div>
      {label || readout ? (
        <div className="flex items-baseline justify-between gap-3 mb-2">
          {label ? <span className="instrument-label">{label}</span> : null}
          {readout ? <span className="tabular text-sm">{readout}</span> : null}
        </div>
      ) : null}
      <div
        className="gauge"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={ende}
        aria-label={label ?? 'Messanzeige'}
      >
        <div
          className="gauge-fill"
          style={{
            width: anteil(value),
            // Über der Vorgabe wird der Balken heller statt bunt: mehr Licht
            // heißt mehr. Eine zweite Farbe wäre an dieser Stelle Lärm.
            background: darueber ? 'var(--color-reference)' : undefined,
          }}
        />
        {reference !== null ? (
          <div
            className="gauge-mark"
            style={{ left: anteil(reference) }}
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  )
}

/**
 * Ein Wert: kleine gesperrte Beschriftung, große Zahl im Serif, Einheit
 * klein daneben im Grotesk.
 *
 * Die Ziffern laufen tabellarisch (gleiche Breite). Das ist keine Ästhetik:
 * Zwischen zwei Sätzen wechselt die Zahl ständig, und mit unterschiedlich
 * breiten Ziffern springt dabei die ganze Zeile. Beim Zählen ist das genau
 * die Bewegung, die ablenkt.
 */
export function Readout({
  label,
  value,
  unit,
  hint,
  tone = 'signal',
  size = 'lg',
}: {
  label: string
  value: string
  unit?: string
  hint?: string
  tone?: 'signal' | 'reference' | 'plain'
  size?: 'lg' | 'xl'
}) {
  const farbe =
    tone === 'signal' ? 'text-primary' : tone === 'reference' ? 'text-accent' : 'text-text'

  return (
    <div>
      <p className="instrument-label">{label}</p>
      {/*
        Die Zahl im Serif, die Einheit klein im Grotesk. Das ist die
        typografische Signatur: Der Größenunterschied und der Schriftwechsel
        machen aus einer Angabe eine Aussage.
      */}
      <p
        className={`display mt-1.5 ${farbe} ${size === 'xl' ? 'text-6xl' : 'text-4xl'}`}
      >
        {value}
        {unit ? (
          <span className="font-sans text-muted text-sm ml-2 tracking-normal">
            {unit}
          </span>
        ) : null}
      </p>
      {hint ? <p className="text-xs text-muted mt-1.5 leading-snug">{hint}</p> : null}
    </div>
  )
}
