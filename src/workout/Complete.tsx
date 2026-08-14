// ====================================================================
//  Abschluss der Einheit
//
//  Drei Blöcke (docs/UI-UX.md §7, docs/PLAN-ENGINE.md §9):
//
//    GESCHAFFT   Rekorde, erledigte Sätze, Volumenlast
//    GEÄNDERT    konkrete neue Vorgaben fürs nächste Mal, mit Grund
//    BEOBACHTET  was auffällt, aber noch keine Änderung auslöst
//
//  Der dritte Block ist der wichtigste für das Vertrauen: Er zeigt, dass
//  die App etwas GESEHEN hat und bewusst noch nicht handelt — statt still
//  nichts zu tun.
//
//  Hier sind die Blöcke aufklappbar, weil sie unterschiedlich dringend
//  sind: GESCHAFFT und GEÄNDERT offen, BEOBACHTET zugeklappt mit der Zahl
//  in der Kopfzeile.
// ====================================================================

import { useEffect, useState } from 'react'
import { equipmentById, exerciseById } from '../data'
import type { PostSessionAnalysis } from '../domain/postSession'
import { analyzePostSession } from '../domain/postSession'
import type { Goal, Level, SetLog, WorkoutSession } from '../domain/records'
import { loadBearingEquipment } from '../domain/weights'
import { Button, Notice, Stack } from '../ui/controls'
import { Disclosure } from '../ui/Disclosure'
import { completeSession } from './session'

export function Complete({
  userId,
  session,
  logs,
  previousSessions,
  logsBySession,
  level,
  goal,
  calibrationWeek,
  bodyweightTrendKg,
  onDone,
}: {
  userId: string
  session: WorkoutSession
  logs: readonly SetLog[]
  previousSessions: readonly WorkoutSession[]
  logsBySession: ReadonlyMap<string, readonly SetLog[]>
  level: Level
  goal: Goal
  calibrationWeek: boolean
  bodyweightTrendKg?: readonly number[]
  onDone: () => void
}) {
  const [analysis, setAnalysis] = useState<PostSessionAnalysis | null>(null)
  const [feeling, setFeeling] = useState<1 | 2 | 3 | 4 | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    // Die Analyse läuft lokal und synchron — sie braucht kein Netz.
    setAnalysis(
      analyzePostSession({
        session,
        logs,
        previousSessions,
        logsBySession,
        level,
        goal,
        calibrationWeek,
        equipmentForExercise: (exerciseId) => {
          const exercise = exerciseById.get(exerciseId)
          return exercise ? loadBearingEquipment(exercise, equipmentById) : null
        },
        bodyweightTrendKg,
      }),
    )
  }, [session, logs, previousSessions, logsBySession, level, goal, calibrationWeek, bodyweightTrendKg])

  if (!analysis) {
    return (
      <div className="min-h-svh grid place-items-center">
        <p className="text-muted text-sm">Werte die Einheit aus …</p>
      </div>
    )
  }

  return (
    <div className="min-h-svh flex flex-col">
      <header className="px-5 pt-8 pb-5">
        <h1 className="text-3xl font-bold tracking-tight">Einheit fertig</h1>
        <p className="text-muted text-sm mt-1">{session.label}</p>
      </header>

      <main className="px-5 pb-8 flex-1">
        <Stack gap={3}>
          <Disclosure
            title="Geschafft"
            summary={`${analysis.achieved.length}`}
            defaultOpen
          >
            {analysis.achieved.length === 0 ? (
              <p className="text-sm text-muted py-1">Keine Sätze erfasst.</p>
            ) : (
              <ul className="space-y-2 pt-1">
                {analysis.achieved.map((item, index) => (
                  <li key={index} className="text-sm flex gap-2">
                    <span aria-hidden="true" className="text-success shrink-0">
                      ✓
                    </span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </Disclosure>

          <Disclosure
            title="Geändert fürs nächste Mal"
            summary={analysis.changed.length === 0 ? 'nichts' : `${analysis.changed.length}`}
            defaultOpen={analysis.changed.length > 0}
            tone={analysis.changed.length > 0 ? 'attention' : 'normal'}
          >
            {analysis.changed.length === 0 ? (
              <p className="text-sm text-muted py-1">
                Die Vorgaben bleiben, wie sie sind.
              </p>
            ) : (
              <ul className="space-y-3 pt-1">
                {analysis.changed.map((change) => (
                  <li key={change.exerciseId}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium truncate">
                        {change.exerciseName}
                      </span>
                      <span className="tabular text-sm font-semibold shrink-0">
                        {change.text}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5 leading-snug">
                      {change.reason}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Disclosure>

          <Disclosure
            title="Beobachtet"
            summary={analysis.observed.length === 0 ? 'nichts' : `${analysis.observed.length}`}
          >
            {analysis.observed.length === 0 ? (
              <p className="text-sm text-muted py-1">Nichts Auffälliges.</p>
            ) : (
              <ul className="space-y-3 pt-1">
                {analysis.observed.map((item, index) => (
                  <li key={index}>
                    <p className="text-sm">{item.text}</p>
                    <p className="text-xs text-muted mt-0.5 leading-snug">
                      → {item.consequence}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Disclosure>

          {analysis.deloadSignal ? (
            <Notice tone="warning">
              Die Einheit lag deutlich unter Plan. Wenn das anhält, schlage ich beim
              Check-in eine Entlastungswoche vor.
            </Notice>
          ) : null}

          <section className="rounded-lg border border-border bg-surface p-4">
            <p className="text-sm font-medium mb-3">Wie war die Einheit insgesamt?</p>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  [1, 'Stark'],
                  [2, 'Gut'],
                  [3, 'Zäh'],
                  [4, 'Schlecht'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={feeling === value}
                  onClick={() => setFeeling(value)}
                  className={
                    'min-h-14 rounded-xl border text-sm font-medium transition-colors ' +
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
                    (feeling === value
                      ? 'border-primary bg-primary/15 text-text'
                      : 'border-border bg-bg text-muted hover:text-text')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <Button
            full
            disabled={saved}
            onClick={() => {
              setSaved(true)
              void completeSession({ userId, session, sessionFeeling: feeling }).then(onDone)
            }}
          >
            Einheit abschließen
          </Button>
        </Stack>
      </main>
    </div>
  )
}
