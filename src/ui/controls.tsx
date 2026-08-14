// ====================================================================
//  Bausteine der Oberfläche
//
//  Umsetzung der Prinzipien aus docs/UI-UX.md §1 und §13:
//   · große Tap-Flächen (Onboarding 56 px, Workout 64 px)
//   · Zahlen tabellarisch, damit Werte beim Zählen nicht springen
//   · alles über Antippen, Tastatur nur wo unvermeidbar
//   · sichtbarer Fokus für Bedienung ohne Maus
// ====================================================================

import type { ReactNode } from 'react'

// ── Knöpfe ──────────────────────────────────────────────────────────

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  type?: 'button' | 'submit'
  full?: boolean
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  type = 'button',
  full = false,
}: ButtonProps) {
  const base =
    'min-h-14 px-6 rounded-lg font-semibold text-base transition-colors ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
    'disabled:opacity-40 disabled:cursor-not-allowed'

  // Signal-Türkis ist hell. Weiße Schrift darauf wäre kaum lesbar —
  // der Knopf trägt deshalb die Grundfarbe als Schrift, wie eine
  // beleuchtete Taste an einem Gerät.
  const look =
    variant === 'primary'
      ? 'bg-primary text-bg hover:bg-primary-hover'
      : variant === 'secondary'
        ? 'bg-surface-2 text-text border border-border hover:border-muted'
        : 'text-muted hover:text-text'

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${look} ${full ? 'w-full' : ''}`}
    >
      {children}
    </button>
  )
}

// ── Auswahlkarte ────────────────────────────────────────────────────

interface ChoiceCardProps {
  label: string
  description?: string
  selected: boolean
  onClick: () => void
  /** Kurzes Zusatzzeichen rechts, z.B. eine Zahl. */
  badge?: string
}

/**
 * Die Standard-Auswahl im Onboarding: eine Karte pro Option, mindestens
 * 56 px hoch, komplett antippbar.
 */
export function ChoiceCard({
  label,
  description,
  selected,
  onClick,
  badge,
}: ChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        'w-full text-left min-h-14 px-4 py-3 rounded-lg border transition-colors ' +
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
        (selected
          ? 'border-primary bg-primary/15 text-text'
          : 'border-border bg-surface text-text hover:border-muted')
      }
    >
      <span className="flex items-center justify-between gap-3">
        <span className="font-medium">{label}</span>
        {badge ? <span className="text-sm text-muted tabular">{badge}</span> : null}
      </span>
      {description ? (
        <span className="block text-sm text-muted mt-1 leading-snug">{description}</span>
      ) : null}
    </button>
  )
}

// ── Zahleneingabe ───────────────────────────────────────────────────

interface NumberFieldProps {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  unit?: string
  min?: number
  max?: number
  step?: number
  placeholder?: string
  hint?: string
}

/**
 * Zahlenfeld mit numerischer Tastatur. Kommt im Onboarding nur dort vor,
 * wo Antippen nicht geht (Körperdaten, Referenzgewichte).
 */
export function NumberField({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  step,
  placeholder,
  hint,
}: NumberFieldProps) {
  return (
    <label className="block">
      <span className="block text-sm text-muted mb-1">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ''}
          min={min}
          max={max}
          step={step ?? 'any'}
          placeholder={placeholder}
          onChange={(event) => {
            const raw = event.target.value
            onChange(raw === '' ? null : Number(raw))
          }}
          className={
            'flex-1 min-h-14 px-4 rounded-lg bg-surface border border-border ' +
            'text-text text-lg tabular placeholder:text-muted/60 ' +
            'focus:outline-2 focus:outline-offset-0 focus:outline-primary'
          }
        />
        {unit ? <span className="text-muted w-10">{unit}</span> : null}
      </span>
      {hint ? <span className="block text-xs text-muted mt-1">{hint}</span> : null}
    </label>
  )
}

// ── Textfeld ────────────────────────────────────────────────────────

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: TextFieldProps) {
  return (
    <label className="block">
      <span className="block text-sm text-muted mb-1">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className={
          'w-full min-h-14 px-4 rounded-lg bg-surface border border-border ' +
          'text-text text-lg placeholder:text-muted/60 ' +
          'focus:outline-2 focus:outline-offset-0 focus:outline-primary'
        }
      />
    </label>
  )
}

// ── Umschalter für Mehrfachauswahl ──────────────────────────────────

interface ToggleChipProps {
  label: string
  selected: boolean
  onClick: () => void
  disabled?: boolean
}

export function ToggleChip({ label, selected, onClick, disabled }: ToggleChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={
        'min-h-12 px-4 rounded-xl border text-sm font-medium transition-colors ' +
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
        'disabled:opacity-35 disabled:cursor-not-allowed ' +
        (selected
          ? 'border-primary bg-primary/15 text-text'
          : 'border-border bg-surface text-muted hover:text-text')
      }
    >
      {label}
    </button>
  )
}

// ── Fortschritt ─────────────────────────────────────────────────────

export function ProgressBar({ current, total }: { current: number; total: number }) {
  const percent = Math.round((current / total) * 100)
  return (
    <div
      className="h-1.5 rounded-full bg-surface-2 overflow-hidden"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={current}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

// ── Textbausteine ───────────────────────────────────────────────────

export function StepTitle({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-bold tracking-tight leading-tight">{title}</h1>
      {subtitle ? (
        <p className="text-sm text-muted mt-2 leading-relaxed">{subtitle}</p>
      ) : null}
    </div>
  )
}

/**
 * Hinweiskasten. `tone="info"` erklärt, `tone="warning"` warnt —
 * beides mit Text, nicht nur über Farbe (docs/UI-UX.md §15).
 */
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode
  tone?: 'info' | 'warning'
}) {
  const look =
    tone === 'warning'
      ? 'border-warning/40 bg-warning/10 text-text'
      : 'border-border bg-surface text-muted'
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${look}`}>
      {tone === 'warning' ? <span className="mr-1">⚠</span> : null}
      {children}
    </div>
  )
}

export function Stack({ children, gap = 3 }: { children: ReactNode; gap?: 2 | 3 | 4 }) {
  const gapClass = gap === 2 ? 'space-y-2' : gap === 4 ? 'space-y-4' : 'space-y-3'
  return <div className={gapClass}>{children}</div>
}
