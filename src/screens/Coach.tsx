// ====================================================================
//  Screen „Coach"
//
//  Ein Chat, der den Plan kennt und ihn in engen Grenzen ändern darf
//  (docs/UI-UX.md §10).
//
//  Drei Dinge, die diesen Chat von einem beliebigen Chatfenster
//  unterscheiden:
//
//  1. JEDE PLANÄNDERUNG WIRD ANGEZEIGT. Wenn das Gespräch etwas verschiebt,
//     steht das als eigene Karte unter der Antwort — nicht nur im Text. Der
//     Fließtext eines Modells ist keine verlässliche Quittung.
//  2. ER IST NIE EIN NADELÖHR. Ohne Netz sagt der Chat das und alles andere
//     in der App läuft weiter: Training, Loggen, Übungsinfos, Tausch.
//  3. VORSCHLÄGE ZUM ANTIPPEN. Wer im Studio steht, tippt keine Sätze.
// ====================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import type { GeneratedWeek } from '../domain/generator'
import type {
  Adjustment,
  BodyMetric,
  CheckIn,
  NutritionTarget,
  SetLog,
  TrainingPlan,
  UserProfile,
  Weekday,
  WorkoutSession,
} from '../domain/records'
import { localDay } from '../domain/week'
import { buildCoachContext } from '../coach/context'
import {
  clearHistory,
  loadHistory,
  saveHistory,
  toApiMessages,
  type ChatEntry,
} from '../coach/history'
import { coachAvailable } from '../coach/stream'
import { coachTools } from '../coach/tools'
import { runCoachTurn } from '../coach/turn'
import { newId } from '../domain/ids'
import { Button, Notice } from '../ui/controls'

/** Fragen, die man wirklich stellt — als Knopf statt als Tipparbeit. */
const SUGGESTIONS = [
  'Warum steht heute genau dieses Training?',
  'Mein Bankdrücken steigt nicht mehr — warum?',
  'Ich möchte etwas mehr Fokus auf meine Arme.',
  'Ich habe morgen keine Zeit. Was mache ich?',
]

export function Coach({
  userId,
  profile,
  plan,
  nutrition,
  week,
  sessions,
  setLogs,
  checkins,
  metrics,
  adjustments,
  today,
  onChanged,
}: {
  userId: string
  profile: UserProfile
  plan: TrainingPlan | null
  nutrition: NutritionTarget | null
  week: GeneratedWeek | null
  sessions: readonly WorkoutSession[]
  setLogs: readonly SetLog[]
  checkins: readonly CheckIn[]
  metrics: readonly BodyMetric[]
  adjustments: readonly Adjustment[]
  today: Weekday
  /** Ruft die App, wenn der Chat etwas geschrieben hat. */
  onChanged: (written: readonly Adjustment[]) => void
}) {
  const [entries, setEntries] = useState<ChatEntry[]>(() => loadHistory(userId))
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)

  const available = coachAvailable()

  // Beim Profilwechsel den Verlauf des anderen Kontos nicht zeigen.
  useEffect(() => {
    setEntries(loadHistory(userId))
  }, [userId])

  useEffect(() => {
    saveHistory(userId, entries)
  }, [userId, entries])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [entries, streaming, thinking])

  /** Übungen der Woche — Grundlage für die Werkzeuge und die Anzeige. */
  const planned = useMemo(() => {
    const map = new Map<string, string>()
    for (const session of week?.sessions ?? []) {
      for (const exercise of session.exercises) {
        map.set(exercise.exerciseId, exercise.exerciseName)
      }
    }
    return map
  }, [week])

  async function send(question: string) {
    const text = question.trim()
    if (text.length === 0 || busy) return

    setError(null)
    setDraft('')
    setBusy(true)
    setThinking(false)
    setStreaming('')

    const mine: ChatEntry = {
      id: newId(),
      role: 'user',
      text,
      at: new Date().toISOString(),
    }
    const verlauf = [...entries, mine]
    setEntries(verlauf)

    let laufend = ''
    const result = await runCoachTurn({
      messages: toApiMessages(verlauf),
      context: buildCoachContext({
        profile,
        plan,
        nutrition,
        week,
        sessions,
        setLogs,
        checkins,
        metrics,
        adjustments,
        today,
        todayIso: localDay(new Date()),
      }),
      tools: coachTools(
        [...planned].map(([exerciseId, exerciseName]) => ({ exerciseId, exerciseName })),
      ),
      handlers: {
        onText: (chunk) => {
          laufend += chunk
          setThinking(false)
          setStreaming(laufend)
        },
        onThinking: () => setThinking(true),
        onError: (message) => setError(message),
      },
      apply: {
        userId,
        profile,
        plan,
        adjustments,
        exerciseNames: planned,
      },
    })

    setStreaming(null)
    setThinking(false)
    setBusy(false)

    if (result.text.length > 0 || result.changes.length > 0) {
      setEntries((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'coach',
          text: result.text,
          changes: result.changes.map((change) => change.label),
          at: new Date().toISOString(),
        },
      ])
    }

    if (result.adjustments.length > 0) onChanged(result.adjustments)
  }

  return (
    <div className="flex flex-col gap-4">
      {!available ? (
        <Notice tone="warning">
          Der Coach braucht die Cloud-Verbindung. Sie ist auf diesem Gerät nicht
          eingerichtet — alles andere in der App funktioniert trotzdem.
        </Notice>
      ) : null}

      {entries.length === 0 ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-lg font-bold">Frag den Coach</h2>
          <p className="text-sm text-muted mt-2 leading-relaxed">
            Er kennt deinen Plan, deinen Verlauf und dein Volumen. Du kannst auch
            Wünsche äußern — „mehr Fokus auf die Arme" verschiebt den Plan ein wenig.
            Was sich ändert, steht danach als Karte unter der Antwort.
          </p>
          <p className="text-xs text-muted mt-3 leading-relaxed">
            Er braucht Internet. Training, Loggen und Übungsinfos gehen auch offline.
          </p>
        </section>
      ) : null}

      <ol className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id}>
            {entry.role === 'user' ? (
              <div className="ml-8 rounded-2xl rounded-br-sm bg-primary/20 border border-primary/40 px-4 py-3">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{entry.text}</p>
              </div>
            ) : (
              <div className="mr-4">
                {entry.text.length > 0 ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {entry.text}
                  </p>
                ) : null}
                {entry.changes && entry.changes.length > 0 ? (
                  <ul className="mt-3 space-y-1">
                    {entry.changes.map((change, index) => (
                      <li
                        key={index}
                        className={
                          'flex items-baseline gap-2 text-xs rounded-xl px-3 py-2 ' +
                          'bg-surface-2 border border-border'
                        }
                      >
                        <span aria-hidden="true" className="text-accent">
                          ✎
                        </span>
                        <span className="leading-snug">
                          <strong className="font-semibold">Plan geändert:</strong>{' '}
                          {change}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ol>

      {thinking ? (
        <p className="text-sm text-muted" aria-live="polite">
          überlegt …
        </p>
      ) : null}

      {streaming !== null && streaming.length > 0 ? (
        <p className="text-sm leading-relaxed whitespace-pre-wrap mr-4">{streaming}</p>
      ) : null}

      {error ? <Notice tone="warning">{error}</Notice> : null}

      <div ref={endRef} />

      {/* ── Eingabe ── */}
      {entries.length === 0 && available ? (
        <ul className="space-y-2">
          {SUGGESTIONS.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void send(suggestion)}
                className={
                  'w-full text-left min-h-12 px-4 py-3 rounded-2xl border border-border ' +
                  'bg-bg text-sm hover:border-muted transition-colors ' +
                  'disabled:opacity-40 ' +
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
                }
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void send(draft)
        }}
        // Klebt über der TAB-LEISTE, nicht am Bildschirmrand: 3,5 rem ist ihre
        // Höhe, dazu der sichere Bereich für die Gestenleiste. Ohne diesen
        // Versatz liegt „Senden" hinter „Ernährung" — gemessen 57 px
        // Überlappung, und getroffen hätte man den falschen Knopf.
        className={
          'sticky z-10 bg-bg pt-2 pb-2 flex items-end gap-2 ' +
          'bottom-[calc(3.5rem+env(safe-area-inset-bottom))]'
        }
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter sendet, Shift+Enter macht einen Absatz — auf dem Handy
            // gibt es keine bequeme Alternative.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send(draft)
            }
          }}
          rows={1}
          disabled={!available || busy}
          placeholder="Frage oder Wunsch …"
          aria-label="Nachricht an den Coach"
          className={
            'flex-1 min-h-14 max-h-40 px-4 py-3.5 rounded-2xl resize-y ' +
            'bg-surface border border-border text-base leading-snug ' +
            'placeholder:text-muted disabled:opacity-40 ' +
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
          }
        />
        <Button type="submit" disabled={!available || busy || draft.trim().length === 0}>
          {busy ? '…' : 'Senden'}
        </Button>
      </form>

      {entries.length > 0 ? (
        <Button
          variant="ghost"
          full
          onClick={() => {
            clearHistory(userId)
            setEntries([])
            setError(null)
          }}
        >
          Gespräch löschen
        </Button>
      ) : null}

      <p className="text-xs text-muted leading-relaxed">
        Das Gespräch liegt nur auf diesem Gerät und wird nicht übertragen. Was am Plan
        geändert wurde, steht dagegen im Anpassungsprotokoll und ist gesichert.
      </p>
    </div>
  )
}
