// ====================================================================
//  Startbildschirm
//
//  Aufbau nach dem Grundsatz „nicht alles auf einen Bildschirm":
//
//    Oben, immer offen   das Training von heute — der einzige Grund,
//                        warum man die App aufmacht
//    Darunter, zugeklappt  Ernährung, Wochenvolumen, Woche, Profil
//
//  Jeder zugeklappte Abschnitt zeigt seine Kennzahl in der Kopfzeile. Man
//  sieht also die Kalorien, ohne aufklappen zu müssen — und klappt nur auf,
//  wenn man die Aufteilung wissen will.
// ====================================================================

import { useState, type ReactNode } from 'react'
import type { GeneratedWeek } from './domain/generator'
import { splitLabel } from './domain/planning'
import type { NutritionTarget, TrainingPlan, UserProfile, Weekday } from './domain/records'
import { Button, Notice, Stack } from './ui/controls'
import { Disclosure, Row } from './ui/Disclosure'
import { InfoButton } from './ui/ExerciseInfo'
import { ExerciseInfoOverlay } from './ui/ExerciseInfoOverlay'

const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Montag',
  tue: 'Dienstag',
  wed: 'Mittwoch',
  thu: 'Donnerstag',
  fri: 'Freitag',
  sat: 'Samstag',
  sun: 'Sonntag',
}

/** Wochentag als Kürzel unserer Aufzählung — `Date.getDay()` beginnt sonntags. */
export function weekdayOf(date: Date = new Date()): Weekday {
  const order: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return order[date.getDay()]
}

export function Home({
  profile,
  plan,
  nutrition,
  week,
  today,
  checkinPending,
  backupSection,
  accountEmail,
  onSignOut,
  onCheckin,
  openSessionLabel,
  openSessionSets,
  onStart,
  onResume,
  onDiscard,
}: {
  profile: UserProfile
  plan: TrainingPlan | null
  nutrition: NutritionTarget | null
  week: GeneratedWeek | null
  today: Weekday
  /** Steht der Wochen-Check-in an? */
  checkinPending: boolean
  /** Der Sicherungs-Abschnitt, von App.tsx gestellt. */
  backupSection: ReactNode
  accountEmail: string | null
  /** `null` im rein lokalen Betrieb — dort gibt es kein Konto. */
  onSignOut: (() => void) | null
  onCheckin: () => void
  /** Bezeichnung einer begonnenen, nicht abgeschlossenen Einheit. */
  openSessionLabel: string | null
  /** Wie viele Sätze darin schon stehen. */
  openSessionSets: number
  onStart: (weekday: Weekday) => void
  onResume: () => void
  onDiscard: () => void
}) {
  // Auch hier eine Überlagerung: Man liest die Info oft, bevor man startet.
  const [infoExerciseId, setInfoExerciseId] = useState<string | null>(null)

  const todaysSession = week?.sessions.find((session) => session.weekday === today) ?? null
  const nextSession =
    todaysSession ??
    week?.sessions.find((session) => weekdayIndex(session.weekday) > weekdayIndex(today)) ??
    week?.sessions[0] ??
    null

  const volumeEntries = Object.entries(plan?.volumeTargets ?? {}).sort((a, b) => b[1] - a[1])

  return (
    <div className="min-h-svh flex flex-col">
      <header className="px-5 pt-8 pb-5">
        <h1 className="text-3xl font-bold tracking-tight">Moin {profile.displayName}</h1>
        <p className="text-muted text-sm mt-1">
          {WEEKDAY_LABEL[today]}
          {plan ? ` · ${splitLabel(plan.splitType)}` : ''}
        </p>
      </header>

      <main className="px-5 pb-8 flex-1">
        <Stack gap={3}>
          {/*
            Der Check-in steht oben, aber er blockiert nichts: Wer trainieren
            will, soll nicht erst sieben Fragen beantworten müssen.
          */}
          {checkinPending ? (
            <section className="rounded-2xl border border-accent/50 bg-accent/10 p-5">
              <p className="text-sm text-muted">Wochen-Check-in</p>
              <p className="text-xl font-bold mt-1">Wie war die Woche?</p>
              <p className="text-sm text-muted mt-1 leading-relaxed">
                Sieben Fragen, etwa eine Minute. Danach passe ich Volumen und Kalorien
                an — ohne diese Antworten rate ich nur.
              </p>
              <div className="mt-4">
                <Button full onClick={onCheckin}>
                  Check-in starten
                </Button>
              </div>
            </section>
          ) : null}

          {/*
            Solange eine Einheit offen ist, wird KEINE zweite angeboten.
            Sonst entstehen mehrere begonnene Einheiten am selben Tag, und
            die Sätze verteilen sich auf zwei Datensätze.
          */}
          {openSessionLabel ? (
            <section className="rounded-2xl border border-primary/50 bg-primary/10 p-5">
              <p className="text-sm text-muted">Angefangen und nicht abgeschlossen</p>
              <p className="text-xl font-bold mt-1">{openSessionLabel}</p>
              <p className="text-sm text-muted mt-1 tabular">
                {openSessionSets === 0
                  ? 'noch kein Satz eingetragen'
                  : `${openSessionSets} ${openSessionSets === 1 ? 'Satz' : 'Sätze'} eingetragen`}
              </p>
              <div className="mt-4 space-y-2">
                <Button full onClick={onResume}>
                  Weitermachen
                </Button>
                <Button variant="ghost" full onClick={onDiscard}>
                  {openSessionSets === 0 ? 'Verwerfen' : 'Als abgebrochen ablegen'}
                </Button>
              </div>
            </section>
          ) : null}

          {/* ── Heute: immer offen, das ist der Zweck der App ── */}
          <section
            className="rounded-2xl border border-border bg-surface p-5"
            hidden={openSessionLabel !== null}
          >
            {todaysSession ? (
              <>
                <p className="text-sm text-muted">Heute</p>
                <p className="text-2xl font-bold mt-1 tracking-tight">
                  {todaysSession.label}
                </p>
                <p className="text-sm text-muted mt-1 tabular">
                  {todaysSession.exercises.length} Übungen ·{' '}
                  {countWorkingSets(todaysSession)} Sätze · ca.{' '}
                  {todaysSession.estimatedMinutes} min
                </p>

                <ol className="mt-4 space-y-1">
                  {todaysSession.exercises.map((exercise, index) => (
                    <li
                      key={`${exercise.exerciseId}-${index}`}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="tabular text-xs text-muted w-4 shrink-0">
                        {index + 1}
                      </span>
                      <span className="flex-1 truncate">{exercise.exerciseName}</span>
                      <span className="tabular text-xs text-muted shrink-0">
                        {exercise.sets}×
                        {exercise.targetSeconds !== null
                          ? `${exercise.targetSeconds}s`
                          : exercise.targetReps}
                        {exercise.weightKg !== null
                          ? ` · ${formatKg(exercise.weightKg)} kg`
                          : ''}
                      </span>
                      <InfoButton
                        exerciseName={exercise.exerciseName}
                        onClick={() => setInfoExerciseId(exercise.exerciseId)}
                      />
                    </li>
                  ))}
                </ol>

                <div className="mt-5">
                  <Button full onClick={() => onStart(today)}>
                    Training starten
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">Heute</p>
                <p className="text-2xl font-bold mt-1 tracking-tight">Ruhetag</p>
                <p className="text-sm text-muted mt-2 leading-relaxed">
                  {nextSession
                    ? `Nächste Einheit: ${nextSession.label} am ${WEEKDAY_LABEL[nextSession.weekday]}.`
                    : 'Kein Plan vorhanden.'}
                </p>
                {nextSession ? (
                  <div className="mt-4">
                    <Button
                      variant="secondary"
                      full
                      onClick={() => onStart(nextSession.weekday)}
                    >
                      Trotzdem trainieren
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </section>

          {/* ── Ab hier: alles zugeklappt, Kennzahl in der Kopfzeile ── */}

          {/*
            Die Sicherung steht VOR Ernährung und Volumen: Sie ist die
            Antwort auf die Frage „ist mein Fortschritt in Sicherheit?" —
            und die wiegt schwerer als jede Kennzahl.
          */}
          {backupSection}

          {nutrition ? (
            <Disclosure title="Ernährung" summary={`${nutrition.kcal} kcal`}>
              <Row label="Protein" value={`${nutrition.proteinG} g`} />
              <Row label="Fett" value={`${nutrition.fatG} g`} />
              <Row label="Kohlenhydrate" value={`${nutrition.carbsG} g`} />
              <p className="text-xs text-muted mt-3 leading-relaxed">{nutrition.reason}</p>
            </Disclosure>
          ) : null}

          {week ? (
            <Disclosure title="Woche" summary={`${week.sessions.length} Einheiten`}>
              <ul className="space-y-1 pt-1">
                {week.sessions.map((session) => (
                  <li
                    key={session.weekday}
                    className={
                      'flex items-baseline justify-between gap-3 text-sm py-1 ' +
                      (session.weekday === today ? 'font-semibold' : 'text-muted')
                    }
                  >
                    <span className="w-24 shrink-0">
                      {WEEKDAY_LABEL[session.weekday]}
                    </span>
                    <span className="flex-1 truncate">{session.label}</span>
                    <span className="tabular text-xs shrink-0">
                      {session.estimatedMinutes} min
                    </span>
                  </li>
                ))}
              </ul>
              {week.notes.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {week.notes.map((note, index) => (
                    <li key={index} className="text-xs text-muted leading-relaxed">
                      {note}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Disclosure>
          ) : null}

          {volumeEntries.length > 0 ? (
            <Disclosure
              title="Wochenvolumen"
              summary={`${volumeEntries.length} Muskeln`}
            >
              <div className="space-y-1.5 pt-1">
                {volumeEntries.map(([muscle, sets]) => (
                  <div key={muscle} className="flex items-center gap-3 text-sm">
                    <span className="w-32 shrink-0 text-muted truncate">{muscle}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(100, (sets / 22) * 100)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right tabular text-muted">
                      {String(sets).replace('.', ',')}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted mt-3 leading-relaxed">
                Fraktional gezählt — mittrainierte Muskeln zählen halb.
              </p>
            </Disclosure>
          ) : null}

          <Disclosure title="Profil" summary={profile.displayName}>
            <Row label="Ziel" value={goalLabel(profile.goal)} />
            <Row label="Level" value={levelLabel(profile.level)} />
            <Row label="Trainingstage" value={String(profile.trainingDays.length)} />
            <Row label="Einheit maximal" value={`${profile.sessionMinutes} min`} />
            {accountEmail ? <Row label="Konto" value={accountEmail} /> : null}
            {onSignOut ? (
              <div className="mt-4">
                <Button variant="secondary" full onClick={onSignOut}>
                  Abmelden
                </Button>
                <p className="text-xs text-muted mt-2 leading-relaxed">
                  Die Daten auf diesem Gerät bleiben liegen. Beim erneuten Anmelden ist
                  alles wieder da.
                </p>
              </div>
            ) : null}
            <div className="mt-4">
              <Button
                variant="secondary"
                full
                onClick={() => {
                  localStorage.clear()
                  location.reload()
                }}
              >
                Onboarding zurücksetzen (Test)
              </Button>
            </div>
          </Disclosure>

          {week === null ? (
            <Notice tone="warning">
              Es konnte kein Plan erzeugt werden. Prüfe die Angaben im Profil.
            </Notice>
          ) : null}
        </Stack>
      </main>

      <ExerciseInfoOverlay
        exerciseId={infoExerciseId}
        onClose={() => setInfoExerciseId(null)}
      />
    </div>
  )
}

function countWorkingSets(session: GeneratedWeek['sessions'][number]): number {
  return session.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)
}

function weekdayIndex(weekday: Weekday): number {
  const order: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  return order.indexOf(weekday)
}

function goalLabel(goal: UserProfile['goal']): string {
  return goal === 'muscle'
    ? 'Muskelaufbau'
    : goal === 'fatloss'
      ? 'Fettverlust'
      : goal === 'strength'
        ? 'Maximalkraft'
        : 'Allgemeine Fitness'
}

function levelLabel(level: UserProfile['level']): string {
  return level === 'beginner'
    ? 'Anfänger'
    : level === 'intermediate'
      ? 'Fortgeschritten'
      : 'Erfahren'
}

function formatKg(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',')
}
