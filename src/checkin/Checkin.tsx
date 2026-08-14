// ====================================================================
//  Wochen-Check-in
//
//  Sieben Fragen, Zielzeit 60 Sekunden (docs/UI-UX.md §11).
//
//  Zum Aufbau: Der Grundsatz „nicht alles auf einen Bildschirm" gilt hier
//  ANDERS als sonst. Sieben Fragen hinter Aufklappmenüs würden die Zahl der
//  Tipps verdoppeln — erst öffnen, dann antworten — und aus einer
//  Minutenaufgabe eine Fleißaufgabe machen.
//
//  Stattdessen: Alle Fragen stehen offen, aber jede BEANTWORTETE schrumpft
//  auf eine Zeile zusammen. Der Bildschirm wird beim Ausfüllen kürzer statt
//  länger, man sieht immer, was noch fehlt, und kann jede Antwort mit einem
//  Tipp wieder öffnen.
// ====================================================================

import { useState } from 'react'
import { newId, nowIso } from '../domain/ids'
import type {
  CalorieAdherence,
  CheckIn,
  Goal,
  JointStatus,
  LooksChange,
  Motivation,
  SleepQuality,
} from '../domain/records'
import { Button, NumberField, Notice, StepTitle } from '../ui/controls'
import { mondayOf } from '../domain/week'

interface Draft {
  weightKgAvg: number | null
  looks: LooksChange | null
  energy: 1 | 2 | 3 | 4 | 5 | null
  sleep: SleepQuality | null
  joints: JointStatus | null
  motivation: Motivation | null
  calorieAdherence: CalorieAdherence | null
}

const EMPTY: Draft = {
  weightKgAvg: null,
  looks: null,
  energy: null,
  sleep: null,
  joints: null,
  motivation: null,
  calorieAdherence: null,
}

/**
 * Die Optik-Frage wird zielabhängig formuliert.
 *
 * „Muskulöser" bei einer Diät zu fragen wäre sinnlos — und umgekehrt.
 */
function looksOptions(goal: Goal): { value: LooksChange; label: string }[] {
  const better = goal === 'fatloss' ? 'definierter' : 'muskulöser'
  const worse = goal === 'fatloss' ? 'weicher' : 'flacher'
  return [
    { value: 2, label: `deutlich ${better}` },
    { value: 1, label: `etwas ${better}` },
    { value: 0, label: 'unverändert' },
    { value: -1, label: `etwas ${worse}` },
    { value: -2, label: `deutlich ${worse}` },
  ]
}

export function Checkin({
  goal,
  weekNumber,
  lastWeightKg,
  onSubmit,
  onCancel,
}: {
  goal: Goal
  /** Fortlaufende Wochennummer, nur zur Einordnung. */
  weekNumber: number | null
  /** Gewicht der Vorwoche als Anhaltspunkt. */
  lastWeightKg: number | null
  onSubmit: (checkin: CheckIn) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [reopened, setReopened] = useState<Set<keyof Draft>>(new Set())
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setReopened((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const reopen = (key: keyof Draft) =>
    setReopened((prev) => new Set(prev).add(key))

  const isOpen = (key: keyof Draft) => draft[key] === null || reopened.has(key)

  const missing = (Object.keys(EMPTY) as (keyof Draft)[]).filter(
    (key) => draft[key] === null,
  )

  const submit = () => {
    if (busy || missing.length > 0) return
    setBusy(true)
    const at = nowIso()
    onSubmit({
      id: newId(),
      userId: '', // wird vom Aufrufer gesetzt
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      weekOf: mondayOf(),
      weightKgAvg: draft.weightKgAvg,
      looks: draft.looks,
      energy: draft.energy,
      sleep: draft.sleep,
      joints: draft.joints,
      motivation: draft.motivation,
      calorieAdherence: draft.calorieAdherence,
      submittedAt: at,
      notes: null,
    })
  }

  return (
    <div className="min-h-svh flex flex-col">
      <header className="px-5 pt-8 pb-2">
        <StepTitle
          title="Wochen-Check-in"
          subtitle={
            weekNumber !== null
              ? `Woche ${weekNumber} · dauert etwa eine Minute`
              : 'Dauert etwa eine Minute'
          }
        />
      </header>

      <main className="px-5 pb-8 flex-1 space-y-3">
        {/* ── 1 · Gewicht ── */}
        <Block
          label="Gewicht"
          answer={draft.weightKgAvg !== null ? `${format(draft.weightKgAvg)} kg` : null}
          open={isOpen('weightKgAvg')}
          onReopen={() => reopen('weightKgAvg')}
        >
          <NumberField
            label="Durchschnitt der Woche"
            value={draft.weightKgAvg}
            onChange={(value) => setDraft((prev) => ({ ...prev, weightKgAvg: value }))}
            unit="kg"
            step={0.1}
            hint={
              lastWeightKg !== null
                ? `Letzte Woche ${format(lastWeightKg)} kg. Der Wochenschnitt zählt — ein Tageswert schwankt um mehr, als eine Woche Fortschritt ausmacht.`
                : 'Der Wochenschnitt zählt, nicht der Wert von heute Morgen.'
            }
          />
          {draft.weightKgAvg !== null ? (
            <div className="mt-3">
              <Button
                variant="secondary"
                full
                onClick={() => set('weightKgAvg', draft.weightKgAvg)}
              >
                Übernehmen
              </Button>
            </div>
          ) : null}
        </Block>

        {/* ── 2 · Optik ── */}
        <Block
          label="Optik"
          answer={
            draft.looks !== null
              ? looksOptions(goal).find((o) => o.value === draft.looks)?.label ?? null
              : null
          }
          open={isOpen('looks')}
          onReopen={() => reopen('looks')}
        >
          <Question text="Wie siehst du im Vergleich zur letzten Woche aus?" />
          <Options
            options={looksOptions(goal)}
            selected={draft.looks}
            onPick={(value) => set('looks', value)}
          />
          <Hint>
            Subjektiv, aber nützlich. Ich stütze darauf nie eine Änderung allein —
            Wahrnehmung schwankt mit Licht und Tagesform.
          </Hint>
        </Block>

        {/* ── 3 · Energie ── */}
        <Block
          label="Energie"
          answer={energyLabel(draft.energy)}
          open={isOpen('energy')}
          onReopen={() => reopen('energy')}
        >
          <Question text="Energie und Erholung diese Woche?" />
          <Options
            options={[
              { value: 1 as const, label: 'sehr frisch' },
              { value: 2 as const, label: 'gut' },
              { value: 3 as const, label: 'normal' },
              { value: 4 as const, label: 'müde' },
              { value: 5 as const, label: 'ausgelaugt' },
            ]}
            selected={draft.energy}
            onPick={(value) => set('energy', value)}
          />
        </Block>

        {/* ── 4 · Schlaf ── */}
        <Block
          label="Schlaf"
          answer={
            draft.sleep === 'good'
              ? 'gut'
              : draft.sleep === 'ok'
                ? 'mittel'
                : draft.sleep === 'bad'
                  ? 'schlecht'
                  : null
          }
          open={isOpen('sleep')}
          onReopen={() => reopen('sleep')}
        >
          <Question text="Wie war der Schlaf?" />
          <Options
            options={[
              { value: 'good' as const, label: 'gut' },
              { value: 'ok' as const, label: 'mittel' },
              { value: 'bad' as const, label: 'schlecht' },
            ]}
            selected={draft.sleep}
            onPick={(value) => set('sleep', value)}
          />
        </Block>

        {/* ── 5 · Gelenke ── */}
        <Block
          label="Gelenke"
          answer={
            draft.joints === 'none'
              ? 'keine Beschwerden'
              : draft.joints === 'mild'
                ? 'leichtes Ziehen'
                : draft.joints === 'limiting'
                  ? 'stört beim Training'
                  : null
          }
          open={isOpen('joints')}
          onReopen={() => reopen('joints')}
        >
          <Question text="Gelenke oder Schmerzen?" />
          <Options
            options={[
              { value: 'none' as const, label: 'keine' },
              { value: 'mild' as const, label: 'leichtes Ziehen' },
              { value: 'limiting' as const, label: 'stört beim Training' },
            ]}
            selected={draft.joints}
            onPick={(value) => set('joints', value)}
          />
        </Block>

        {/* ── 6 · Motivation ── */}
        <Block
          label="Lust aufs Training"
          answer={
            draft.motivation === 'high'
              ? 'hoch'
              : draft.motivation === 'normal'
                ? 'normal'
                : draft.motivation === 'low'
                  ? 'niedrig'
                  : null
          }
          open={isOpen('motivation')}
          onReopen={() => reopen('motivation')}
        >
          <Question text="Lust aufs Training?" />
          <Options
            options={[
              { value: 'high' as const, label: 'hoch' },
              { value: 'normal' as const, label: 'normal' },
              { value: 'low' as const, label: 'niedrig' },
            ]}
            selected={draft.motivation}
            onPick={(value) => set('motivation', value)}
          />
        </Block>

        {/* ── 7 · Kalorien — die Frage, ohne die nichts geht ── */}
        <Block
          label="Kalorienziel"
          answer={
            draft.calorieAdherence === 'good'
              ? 'gut getroffen'
              : draft.calorieAdherence === 'partial'
                ? 'teils'
                : draft.calorieAdherence === 'none'
                  ? 'nicht verfolgt'
                  : null
          }
          open={isOpen('calorieAdherence')}
          onReopen={() => reopen('calorieAdherence')}
        >
          <Question text="Wie gut hast du dein Kalorienziel getroffen?" />
          <Options
            options={[
              { value: 'good' as const, label: 'gut getroffen' },
              { value: 'partial' as const, label: 'teils' },
              { value: 'none' as const, label: 'gar nicht verfolgt' },
            ]}
            selected={draft.calorieAdherence}
            onPick={(value) => set('calorieAdherence', value)}
          />
          <Hint>
            Ehrlich antworten ist hier wichtiger als gut aussehen: Ich verstelle die
            Kalorien nur, wenn die Vorgabe umgesetzt wurde. Sonst würde ich eine Zahl
            korrigieren, die gar nicht gewirkt hat.
          </Hint>
        </Block>

        {missing.length > 0 ? (
          <Notice>
            Noch {missing.length} {missing.length === 1 ? 'Frage' : 'Fragen'} offen.
          </Notice>
        ) : null}

        <Button full disabled={missing.length > 0 || busy} onClick={submit}>
          Absenden
        </Button>
        <Button variant="ghost" full onClick={onCancel}>
          Später
        </Button>
      </main>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
//  Bausteine
// ────────────────────────────────────────────────────────────────────

/**
 * Eine Frage. Offen, solange unbeantwortet — danach eine Zeile, die sich
 * antippen lässt.
 */
function Block({
  label,
  answer,
  open,
  onReopen,
  children,
}: {
  label: string
  answer: string | null
  open: boolean
  onReopen: () => void
  children: React.ReactNode
}) {
  if (!open && answer !== null) {
    return (
      <button
        type="button"
        onClick={onReopen}
        className={
          'w-full flex items-center justify-between gap-3 min-h-14 px-4 rounded-2xl ' +
          'border border-border bg-surface text-left transition-colors hover:border-muted ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
        }
      >
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="text-success">
            ✓
          </span>
          <span className="text-sm text-muted">{label}</span>
        </span>
        <span className="text-sm font-medium truncate">{answer}</span>
      </button>
    )
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">{children}</section>
  )
}

function Question({ text }: { text: string }) {
  return <p className="text-base font-semibold mb-3 leading-snug">{text}</p>
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted mt-3 leading-relaxed">{children}</p>
}

/** Antwortknöpfe, mindestens 56 px hoch (docs/UI-UX.md §1). */
function Options<T extends string | number>({
  options,
  selected,
  onPick,
}: {
  options: readonly { value: T; label: string }[]
  selected: T | null
  onPick: (value: T) => void
}) {
  return (
    <div className="space-y-2">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={selected === option.value}
          onClick={() => onPick(option.value)}
          className={
            'w-full text-left min-h-14 px-4 rounded-2xl border transition-colors ' +
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
            (selected === option.value
              ? 'border-primary bg-primary/15 text-text'
              : 'border-border bg-bg text-text hover:border-muted')
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function energyLabel(energy: Draft['energy']): string | null {
  if (energy === null) return null
  return ['sehr frisch', 'gut', 'normal', 'müde', 'ausgelaugt'][energy - 1]
}

function format(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',')
}
