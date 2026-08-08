// ====================================================================
//  Die 20 Bildschirme des Onboardings
//
//  Reihenfolge und Inhalt nach docs/ONBOARDING.md. Jeder Schritt sagt,
//  wann weitergeklickt werden darf — optionale Schritte immer.
// ====================================================================

import { useMemo, useState, type ReactNode } from 'react'
import { exercises } from '../data'
import type { VolumeMuscle } from '../domain/muscles'
import type {
  DailyActivity,
  Goal,
  InjuryRegion,
  Level,
  SessionMinutes,
  Sex,
  TrainingYears,
  Weekday,
} from '../domain/records'
import { WEEKDAYS } from '../domain/records'
import {
  Button,
  ChoiceCard,
  NumberField,
  Notice,
  Stack,
  StepTitle,
  TextField,
  ToggleChip,
} from '../ui/controls'
import {
  LIMITS,
  REFERENCE_PATTERNS,
  ageOf,
  summarize,
  type OnboardingDraft,
} from './draft'

export interface StepContext {
  draft: OnboardingDraft
  patch: (partial: Partial<OnboardingDraft>) => void
}

export interface Step {
  id: string
  render: (ctx: StepContext) => ReactNode
  canContinue: (draft: OnboardingDraft) => boolean
  continueLabel?: string
  /** Zählt nicht in den Fortschrittsbalken (Begrüßung, Abschluss). */
  chromeless?: boolean
}

// ── Hilfsmittel ─────────────────────────────────────────────────────

const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Mo',
  tue: 'Di',
  wed: 'Mi',
  thu: 'Do',
  fri: 'Fr',
  sat: 'Sa',
  sun: 'So',
}

const WEEKDAY_LONG: Record<Weekday, string> = {
  mon: 'Montag',
  tue: 'Dienstag',
  wed: 'Mittwoch',
  thu: 'Donnerstag',
  fri: 'Freitag',
  sat: 'Samstag',
  sun: 'Sonntag',
}

/**
 * Deutsche Anführungszeichen als Escape-Folgen.
 *
 * In einem JSX-Attribut sind wörtliche Anführungszeichen mehrdeutig — ein
 * typografisches Schlusszeichen, das versehentlich als ASCII-Zeichen
 * geschrieben wird, beendet das Attribut. Deshalb hier explizit.
 */
function q(text: string): string {
  return `„${text}“`
}

function toggle<T>(list: T[], value: T, max?: number): T[] {
  if (list.includes(value)) return list.filter((item) => item !== value)
  if (max !== undefined && list.length >= max) return list
  return [...list, value]
}

const BODY_FAT_MALE = [
  { value: 'lt10', label: 'unter ~10 %', hint: 'sehr definiert, Bauchmuskeln klar sichtbar' },
  { value: '10-14', label: '~10–14 %', hint: 'Bauchmuskeln sichtbar' },
  { value: '15-19', label: '~15–19 %', hint: 'schlank, Bauchmuskeln angedeutet' },
  { value: '20-24', label: '~20–24 %', hint: 'normal, weiche Mitte' },
  { value: '25-29', label: '~25–29 %', hint: '' },
  { value: 'gt30', label: 'über ~30 %', hint: '' },
]

const BODY_FAT_FEMALE = [
  { value: 'lt18', label: 'unter ~18 %', hint: 'sehr definiert' },
  { value: '18-22', label: '~18–22 %', hint: 'sportlich definiert' },
  { value: '23-27', label: '~23–27 %', hint: 'schlank' },
  { value: '28-32', label: '~28–32 %', hint: 'normal' },
  { value: '33-37', label: '~33–37 %', hint: '' },
  { value: 'gt38', label: 'über ~38 %', hint: '' },
]

const INJURY_LABELS: Record<InjuryRegion, string> = {
  knee: 'Knie',
  shoulder: 'Schulter',
  lower_back: 'Unterer Rücken',
  elbow: 'Ellenbogen',
  wrist: 'Handgelenk',
  hip: 'Hüfte',
  neck: 'Nacken',
  ankle: 'Sprunggelenk',
}

/** Muskelgruppen für die Prioritätsauswahl — gröber als die 18 Volumen-Muskeln. */
const PRIORITY_GROUPS: { label: string; muscles: VolumeMuscle[] }[] = [
  { label: 'Brust', muscles: ['Brust'] },
  { label: 'Rücken', muscles: ['Lat', 'Oberer Rücken'] },
  { label: 'Schultern', muscles: ['Seitliche Schulter', 'Hintere Schulter'] },
  { label: 'Arme', muscles: ['Bizeps', 'Trizeps'] },
  { label: 'Beine', muscles: ['Quadrizeps', 'Hamstrings'] },
  { label: 'Gesäß', muscles: ['Gesäß'] },
  { label: 'Bauch', muscles: ['Bauch'] },
  { label: 'Waden', muscles: ['Waden'] },
]

// ── Blacklist-Suche ─────────────────────────────────────────────────

function BlacklistPicker({ draft, patch }: StepContext) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle.length < 2) return []
    return exercises
      .filter((ex) => ex.metric !== 'cardio')
      .filter((ex) => ex.name.toLowerCase().includes(needle))
      .slice(0, 8)
  }, [query])

  const selected = draft.blacklistedExerciseIds
    .map((id) => exercises.find((ex) => ex.id === id))
    .filter((ex): ex is NonNullable<typeof ex> => Boolean(ex))

  return (
    <Stack gap={4}>
      <TextField
        label="Übung suchen"
        value={query}
        onChange={setQuery}
        placeholder="z. B. Kreuzheben"
      />

      {results.length > 0 ? (
        <Stack gap={2}>
          {results.map((ex) => (
            <ChoiceCard
              key={ex.id}
              label={ex.name}
              description={ex.primary.join(' · ')}
              selected={draft.blacklistedExerciseIds.includes(ex.id)}
              onClick={() =>
                patch({
                  blacklistedExerciseIds: toggle(draft.blacklistedExerciseIds, ex.id),
                })
              }
            />
          ))}
        </Stack>
      ) : null}

      {selected.length > 0 ? (
        <div>
          <p className="text-sm text-muted mb-2">Ausgeschlossen:</p>
          <div className="flex flex-wrap gap-2">
            {selected.map((ex) => (
              <ToggleChip
                key={ex.id}
                label={`${ex.name} ✕`}
                selected
                onClick={() =>
                  patch({
                    blacklistedExerciseIds: toggle(draft.blacklistedExerciseIds, ex.id),
                  })
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <Notice>
          Wenn du nichts auswählst, stehen alle Übungen zur Verfügung. Du kannst das
          später jederzeit ändern.
        </Notice>
      )}
    </Stack>
  )
}

// ── Referenzwerte ───────────────────────────────────────────────────

function ReferenceTable({ draft, patch }: StepContext) {
  const update = (pattern: string, partial: Partial<(typeof draft.references)[number]>) => {
    patch({
      references: draft.references.map((entry) =>
        entry.pattern === pattern ? { ...entry, ...partial } : entry,
      ),
    })
  }

  return (
    <Stack gap={4}>
      {REFERENCE_PATTERNS.map((group) => {
        const entry = draft.references.find((r) => r.pattern === group.pattern)
        if (!entry) return null
        const isPullup = entry.exerciseId === 'RUE-012'

        return (
          <div key={group.pattern} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-sm font-semibold text-text mb-2">{group.title}</p>

            <div className="flex flex-wrap gap-2 mb-3">
              {group.options.map((option) => (
                <ToggleChip
                  key={option.exerciseId}
                  label={option.label}
                  selected={entry.exerciseId === option.exerciseId}
                  onClick={() => update(group.pattern, { exerciseId: option.exerciseId })}
                />
              ))}
            </div>

            {entry.skipped ? (
              <Button variant="ghost" onClick={() => update(group.pattern, { skipped: false })}>
                Doch angeben
              </Button>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {!isPullup ? (
                    <NumberField
                      label="Gewicht"
                      unit="kg"
                      value={entry.weightKg}
                      min={0}
                      max={400}
                      onChange={(weightKg) => update(group.pattern, { weightKg })}
                    />
                  ) : (
                    <div className="flex items-end pb-4 text-sm text-muted">Körpergewicht</div>
                  )}
                  <NumberField
                    label="Wiederholungen"
                    value={entry.reps}
                    min={LIMITS.reps.min}
                    max={LIMITS.reps.max}
                    onChange={(reps) => update(group.pattern, { reps })}
                  />
                </div>
                <div className="mt-2">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      update(group.pattern, { skipped: true, weightKg: null, reps: null })
                    }
                  >
                    Kenne ich nicht
                  </Button>
                </div>
                {entry.reps !== null && entry.reps > 12 ? (
                  <div className="mt-2">
                    <Notice tone="warning">
                      Über 12 Wiederholungen wird die Kraftschätzung unschärfer. Wenn du
                      einen schwereren Satz kennst, nimm lieber den.
                    </Notice>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )
      })}
    </Stack>
  )
}

// ── Zusammenfassung ─────────────────────────────────────────────────

function Summary({ draft }: StepContext) {
  const summary = summarize(draft)
  if (!summary) {
    return <Notice tone="warning">Es fehlen noch Angaben. Geh bitte einen Schritt zurück.</Notice>
  }

  const row = (label: string, value: ReactNode) => (
    <div className="flex justify-between gap-4 py-2 border-b border-border last:border-0">
      <span className="text-muted text-sm">{label}</span>
      <span className="text-text text-sm text-right font-medium tabular">{value}</span>
    </div>
  )

  const goalLabels: Record<Goal, string> = {
    muscle: 'Muskelaufbau',
    strength: 'Maximalkraft',
    fatloss: 'Fettverlust',
    fitness: 'Allgemeine Fitness',
  }

  return (
    <Stack gap={4}>
      <div className="rounded-2xl border border-border bg-surface px-4 py-2">
        {row('Ziel', goalLabels[draft.goal!])}
        {row('Split', summary.splitLabelText)}
        {row(
          'Trainingstage',
          draft.trainingDays.map((d) => WEEKDAY_LABELS[d]).join(' · '),
        )}
        {row('Kalorien', `${summary.kcal} kcal`)}
        {row(
          'Makros',
          `${summary.proteinG} P · ${summary.fatG} F · ${summary.carbsG} K`,
        )}
        {row(
          'Zielrate',
          summary.expectedKgPerWeek === 0
            ? 'Gewicht halten'
            : `${summary.expectedKgPerWeek > 0 ? '+' : ''}${String(
                summary.expectedKgPerWeek,
              ).replace('.', ',')} kg / Woche`,
        )}
        {row('Check-in', WEEKDAY_LONG[draft.checkinWeekday!])}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold mb-2">Startvolumen pro Woche</p>
        <div className="space-y-1">
          {summary.startVolumeExample.map(({ muscle, sets }) => (
            <div key={muscle} className="flex justify-between text-sm">
              <span className="text-muted">{muscle}</span>
              <span className="tabular">{String(sets).replace('.', ',')} Sätze</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted mt-3 leading-relaxed">
          Fraktional gezählt: mittrainierte Muskeln zählen halb. Das Volumen steigt
          wöchentlich, solange Leistung und Erholung mitgehen.
        </p>
      </div>

      <Notice>
        <span className="font-medium text-text">Warum diese Kalorien? </span>
        {summary.reason}
      </Notice>

      <Notice tone="warning">
        Die Startgewichte sind Schätzungen
        {summary.usedReferences > 0
          ? ` (${summary.usedReferences} von 6 Referenzwerten angegeben)`
          : ' — du hast keine Referenzwerte angegeben'}
        . Die erste Woche ist eine Einmessung: Ich korrigiere nach jedem Satz
        automatisch.
      </Notice>
    </Stack>
  )
}

// ── Die Schritte ────────────────────────────────────────────────────

export const STEPS: Step[] = [
  // 1 — Begrüßung
  {
    id: 'welcome',
    chromeless: true,
    canContinue: () => true,
    continueLabel: "Los geht's",
    render: () => (
      <Stack gap={4}>
        <StepTitle
          title="Willkommen"
          subtitle="Ich richte dir jetzt einen Trainings- und Ernährungsplan ein, der sich fortlaufend an dich anpasst."
        />
        <div className="rounded-2xl border border-border bg-surface p-4 space-y-3 text-sm text-muted leading-relaxed">
          <p>
            <span className="text-text font-medium">Etwa 7 Minuten.</span> 20 Fragen, die
            meisten mit einem Tap.
          </p>
          <p>
            <span className="text-text font-medium">Danach steht dein erstes Training.</span>{' '}
            Mit Übungen, Sätzen, Wiederholungen und Gewicht.
          </p>
          <p>
            Alles ist später änderbar. Wenn du abbrichst, mache ich an derselben Stelle
            weiter.
          </p>
        </div>
      </Stack>
    ),
  },

  // 2 — Name
  {
    id: 'name',
    canContinue: (d) => d.displayName.trim().length > 0,
    render: ({ draft, patch }) => (
      <Stack gap={4}>
        <StepTitle title="Wie heißt du?" subtitle="Nur als Anzeigename in der App." />
        <TextField
          label="Name"
          value={draft.displayName}
          onChange={(displayName) => patch({ displayName })}
          placeholder="Vorname"
          maxLength={40}
        />
      </Stack>
    ),
  },

  // 3 — Geschlecht
  {
    id: 'sex',
    canContinue: (d) => d.sex !== null,
    render: ({ draft, patch }) => (
      <Stack gap={4}>
        <StepTitle
          title="Geschlecht"
          subtitle="Brauche ich nur für die Kalorienformel. Auf den Trainingsplan hat es keinen Einfluss."
        />
        <Stack gap={2}>
          {(
            [
              ['male', 'Männlich'],
              ['female', 'Weiblich'],
              ['unspecified', 'Keine Angabe'],
            ] as [Sex, string][]
          ).map(([value, label]) => (
            <ChoiceCard
              key={value}
              label={label}
              description={
                value === 'unspecified' ? 'Ich rechne dann mit dem Mittelwert' : undefined
              }
              selected={draft.sex === value}
              onClick={() => patch({ sex: value })}
            />
          ))}
        </Stack>
      </Stack>
    ),
  },

  // 4 — Körperdaten
  {
    id: 'body',
    canContinue: (d) => {
      const age = ageOf(d)
      return (
        age !== null &&
        age >= LIMITS.age.min &&
        age <= LIMITS.age.max &&
        d.heightCm !== null &&
        d.heightCm >= LIMITS.heightCm.min &&
        d.heightCm <= LIMITS.heightCm.max &&
        d.weightKg !== null &&
        d.weightKg >= LIMITS.weightKg.min &&
        d.weightKg <= LIMITS.weightKg.max
      )
    },
    render: ({ draft, patch }) => {
      const currentYear = new Date().getFullYear()
      return (
        <Stack gap={4}>
          <StepTitle
            title="Deine Körperdaten"
            subtitle="Grundlage für den Kalorienbedarf und die ersten Gewichtsschätzungen."
          />
          <NumberField
            label="Geburtsjahr"
            value={draft.birthYear}
            min={currentYear - LIMITS.age.max}
            max={currentYear - LIMITS.age.min}
            onChange={(birthYear) => patch({ birthYear })}
            placeholder={String(currentYear - 25)}
          />
          <NumberField
            label="Größe"
            unit="cm"
            value={draft.heightCm}
            min={LIMITS.heightCm.min}
            max={LIMITS.heightCm.max}
            onChange={(heightCm) => patch({ heightCm })}
          />
          <NumberField
            label="Gewicht"
            unit="kg"
            value={draft.weightKg}
            min={LIMITS.weightKg.min}
            max={LIMITS.weightKg.max}
            step={0.1}
            onChange={(weightKg) => patch({ weightKg })}
            hint="Am besten morgens nach dem Aufstehen."
          />
        </Stack>
      )
    },
  },

  // 5 — Ziel
  {
    id: 'goal',
    canContinue: (d) => d.goal !== null,
    render: ({ draft, patch }) => (
      <Stack gap={4}>
        <StepTitle
          title="Was ist dein Hauptziel?"
          subtitle="Bestimmt Wiederholungsbereiche, Volumen und die Kalorienrichtung."
        />
        <Stack gap={2}>
          {(
            [
              ['muscle', 'Muskelaufbau', 'Mittlere Wiederholungen, hohes Volumen, leichter Kalorienüberschuss'],
              ['strength', 'Maximalkraft', 'Schwere Grundübungen, wenige Wiederholungen, lange Pausen'],
              ['fatloss', 'Fettverlust', 'Muskeln halten im Defizit — Last bleibt schwer, Volumen sinkt'],
              ['fitness', 'Allgemeine Fitness', 'Ausgewogener Mix, Gewicht halten'],
            ] as [Goal, string, string][]
          ).map(([value, label, description]) => (
            <ChoiceCard
              key={value}
              label={label}
              description={description}
              selected={draft.goal === value}
              onClick={() => patch({ goal: value })}
            />
          ))}
        </Stack>
      </Stack>
    ),
  },

  // 6 — Feinabstimmung (optional)
  {
    id: 'fine',
    canContinue: () => true,
    render: ({ draft, patch }) => {
      const buckets = draft.sex === 'female' ? BODY_FAT_FEMALE : BODY_FAT_MALE
      return (
        <Stack gap={4}>
          <StepTitle
            title="Feinabstimmung"
            subtitle="Beides freiwillig. Die Körperfett-Schätzung entscheidet, wie schnell ich ein Defizit ansetze."
          />
          <NumberField
            label="Zielgewicht (optional)"
            unit="kg"
            value={draft.targetWeightKg}
            min={LIMITS.weightKg.min}
            max={LIMITS.weightKg.max}
            step={0.5}
            onChange={(targetWeightKg) => patch({ targetWeightKg })}
          />
          <div>
            <p className="text-sm text-muted mb-2">Körperfett-Schätzung (optional)</p>
            <Stack gap={2}>
              {buckets.map((bucket) => (
                <ChoiceCard
                  key={bucket.value}
                  label={bucket.label}
                  description={bucket.hint || undefined}
                  selected={draft.bodyFatBucket === bucket.value}
                  onClick={() =>
                    patch({
                      bodyFatBucket:
                        draft.bodyFatBucket === bucket.value ? null : bucket.value,
                    })
                  }
                />
              ))}
            </Stack>
          </div>
        </Stack>
      )
    },
  },

  // 7 — Prioritäten (optional)
  {
    id: 'priorities',
    canContinue: () => true,
    render: ({ draft, patch }) => {
      const groupSelected = (group: (typeof PRIORITY_GROUPS)[number]) =>
        group.muscles.every((m) => draft.priorityMuscles.includes(m))

      const toggleGroup = (group: (typeof PRIORITY_GROUPS)[number]) => {
        if (groupSelected(group)) {
          patch({
            priorityMuscles: draft.priorityMuscles.filter((m) => !group.muscles.includes(m)),
          })
          return
        }
        // Höchstens zwei Gruppen — sonst ist es keine Priorität mehr.
        const activeGroups = PRIORITY_GROUPS.filter(groupSelected).length
        if (activeGroups >= 2) return
        patch({
          priorityMuscles: [...new Set([...draft.priorityMuscles, ...group.muscles])],
        })
      }

      const count = PRIORITY_GROUPS.filter(groupSelected).length

      return (
        <Stack gap={4}>
          <StepTitle
            title="Schwerpunkte"
            subtitle="Höchstens zwei. Sie kommen in der Einheit zuerst und bekommen etwas mehr Volumen — was zuerst kommt, wächst am besten."
          />
          <div className="flex flex-wrap gap-2">
            {PRIORITY_GROUPS.map((group) => (
              <ToggleChip
                key={group.label}
                label={group.label}
                selected={groupSelected(group)}
                disabled={!groupSelected(group) && count >= 2}
                onClick={() => toggleGroup(group)}
              />
            ))}
          </div>
          {count === 0 ? (
            <Notice>Ohne Auswahl verteile ich das Volumen ausgewogen.</Notice>
          ) : null}
        </Stack>
      )
    },
  },

  // 8 — Level
  {
    id: 'level',
    canContinue: (d) => d.level !== null,
    render: ({ draft, patch }) => (
      <Stack gap={4}>
        <StepTitle
          title="Wie viel Erfahrung hast du?"
          subtitle="Bestimmt Startvolumen und wie schnell ich steigere."
        />
        <Stack gap={2}>
          {(
            [
              ['beginner', 'Anfänger', 'Technik im Aufbau — ich setze konservativ an und steigere zügig'],
              ['intermediate', 'Fortgeschritten', 'Grundübungen sitzen, Fortschritt wird langsamer'],
              ['advanced', 'Erfahren', 'Ich kenne meine Zahlen und meinen Körper'],
            ] as [Level, string, string][]
          ).map(([value, label, description]) => (
            <ChoiceCard
              key={value}
              label={label}
              description={description}
              selected={draft.level === value}
              onClick={() => patch({ level: value })}
            />
          ))}
        </Stack>
      </Stack>
    ),
  },

  // 9 — Trainingsjahre
  {
    id: 'years',
    canContinue: (d) => d.trainingYears !== null,
    render: ({ draft, patch }) => (
      <Stack gap={4}>
        <StepTitle
          title="Wie lange trainierst du schon regelmäßig?"
          subtitle="Damit ich dir kein unrealistisches Steigerungstempo vorgebe."
        />
        <Stack gap={2}>
          {(
            [
              ['lt6m', 'Weniger als 6 Monate'],
              ['6to12m', '6 bis 12 Monate'],
              ['1to2y', '1 bis 2 Jahre'],
              ['2to5y', '2 bis 5 Jahre'],
              ['gt5y', 'Über 5 Jahre'],
            ] as [TrainingYears, string][]
          ).map(([value, label]) => (
            <ChoiceCard
              key={value}
              label={label}
              selected={draft.trainingYears === value}
              onClick={() => patch({ trainingYears: value })}
            />
          ))}
        </Stack>
      </Stack>
    ),
  },

  // 10 — RIR
  {
    id: 'rir',
    canContinue: (d) => d.knowsRir !== null,
    render: ({ draft, patch }) => (
      <Stack gap={4}>
        <StepTitle
          title={`Kennst du ${q('RIR')} oder ${q('RPE')}?`}
          subtitle="Danach richtet sich, wie ich dich nach jedem Satz nach der Anstrengung frage."
        />
        <Stack gap={2}>
          <ChoiceCard
            label="Ja, kenne ich"
            description={`Ich frage dann mit Zahlen: ${q('Ziel war 2 RIR — genau 2, 3+, oder 0–1?')}`}
            selected={draft.knowsRir === true}
            onClick={() => patch({ knowsRir: true })}
          />
          <ChoiceCard
            label="Nein, lieber einfach"
            description={`Ich frage dann in Worten: ${q('genau so')}, ${q('mehr drin')}, ${q('war am Limit')}`}
            selected={draft.knowsRir === false}
            onClick={() => patch({ knowsRir: false })}
          />
        </Stack>
        <Notice>
          Beide Wege füttern dieselbe Logik. Du kannst das später jederzeit umstellen.
        </Notice>
      </Stack>
    ),
  },

  // 11 — Trainingstage
  {
    id: 'days',
    canContinue: (d) => d.trainingDays.length >= 3 && d.trainingDays.length <= 6,
    render: ({ draft, patch }) => (
      <Stack gap={4}>
        <StepTitle
          title="An welchen Tagen willst du trainieren?"
          subtitle="Daraus leite ich den Split ab — und die Reihenfolge, damit belastete Muskeln Zeit zur Erholung haben."
        />
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((day) => (
            <button
              key={day}
              type="button"
              aria-pressed={draft.trainingDays.includes(day)}
              onClick={() => patch({ trainingDays: toggle(draft.trainingDays, day, 6) })}
              className={
                'min-h-16 rounded-xl border text-sm font-semibold transition-colors ' +
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
                (draft.trainingDays.includes(day)
                  ? 'border-primary bg-primary/20 text-text'
                  : 'border-border bg-surface text-muted')
              }
            >
              {WEEKDAY_LABELS[day]}
            </button>
          ))}
        </div>
        {draft.trainingDays.length > 0 && draft.trainingDays.length < 3 ? (
          <Notice tone="warning">
            Unter 3 Tagen kann ich keinen sinnvollen Split bauen. Bitte mindestens 3
            auswählen.
          </Notice>
        ) : (
          <Notice>
            {draft.trainingDays.length === 0
              ? '3 bis 6 Tage sind möglich.'
              : `${draft.trainingDays.length} Tage ausgewählt.`}
          </Notice>
        )}
      </Stack>
    ),
  },

  // 12 — Zeitbudget
  {
    id: 'duration',
    canContinue: (d) => d.sessionMinutes !== null,
    render: ({ draft, patch }) => (
      <Stack gap={4}>
        <StepTitle
          title="Wie viel Zeit hast du pro Einheit?"
          subtitle="Bestimmt Übungsanzahl und Pausenlängen."
        />
        <Stack gap={2}>
          {([45, 60, 75, 90] as SessionMinutes[]).map((value) => (
            <ChoiceCard
              key={value}
              label={value === 90 ? '90 Minuten oder mehr' : `${value} Minuten`}
              description={
                value === 45
                  ? 'Fokus auf Grundübungen, kürzere Pausen bei Isolation'
                  : undefined
              }
              selected={draft.sessionMinutes === value}
              onClick={() => patch({ sessionMinutes: value })}
            />
          ))}
        </Stack>
      </Stack>
    ),
  },

  // 13 — Alltagsaktivität
  {
    id: 'activity',
    canContinue: (d) => d.dailyActivity !== null,
    render: ({ draft, patch }) => (
      <Stack gap={4}>
        <StepTitle
          title="Wie aktiv ist dein Alltag?"
          subtitle="Ohne das Krafttraining — das kenne ich schon und rechne es separat drauf. Eigenes Cardio zählt hier mit hinein."
        />
        <Stack gap={2}>
          {(
            [
              ['sedentary', 'Sitzend', 'Büro, wenig Gehen'],
              ['light', 'Leicht aktiv', 'Etwas unterwegs im Alltag'],
              ['active', 'Aktiv', 'Viel auf den Beinen'],
              ['very_active', 'Sehr aktiv', 'Körperliche Arbeit'],
            ] as [DailyActivity, string, string][]
          ).map(([value, label, description]) => (
            <ChoiceCard
              key={value}
              label={label}
              description={description}
              selected={draft.dailyActivity === value}
              onClick={() => patch({ dailyActivity: value })}
            />
          ))}
        </Stack>
      </Stack>
    ),
  },

  // 14 — Beschwerden
  {
    id: 'injuries',
    canContinue: () => true,
    render: ({ draft, patch }) => {
      const has = (region: InjuryRegion) => draft.injuries.some((i) => i.region === region)
      const severityOf = (region: InjuryRegion) =>
        draft.injuries.find((i) => i.region === region)?.severity

      const toggleRegion = (region: InjuryRegion) => {
        if (has(region)) {
          patch({ injuries: draft.injuries.filter((i) => i.region !== region) })
        } else {
          patch({ injuries: [...draft.injuries, { region, severity: 'history' }] })
        }
      }

      const setSeverity = (region: InjuryRegion, severity: 'acute' | 'history') => {
        patch({
          injuries: draft.injuries.map((i) => (i.region === region ? { ...i, severity } : i)),
        })
      }

      return (
        <Stack gap={4}>
          <StepTitle
            title="Beschwerden oder Verletzungen?"
            subtitle="Ich plane dann um die betroffene Region herum."
          />
          <div className="flex flex-wrap gap-2">
            {(Object.keys(INJURY_LABELS) as InjuryRegion[]).map((region) => (
              <ToggleChip
                key={region}
                label={INJURY_LABELS[region]}
                selected={has(region)}
                onClick={() => toggleRegion(region)}
              />
            ))}
          </div>

          {draft.injuries.length > 0 ? (
            <Stack gap={2}>
              {draft.injuries.map((injury) => (
                <div
                  key={injury.region}
                  className="rounded-2xl border border-border bg-surface p-3"
                >
                  <p className="text-sm font-medium mb-2">{INJURY_LABELS[injury.region]}</p>
                  <div className="flex gap-2">
                    <ToggleChip
                      label="Aktuell akut"
                      selected={severityOf(injury.region) === 'acute'}
                      onClick={() => setSeverity(injury.region, 'acute')}
                    />
                    <ToggleChip
                      label="Alte Sache, vorsichtig sein"
                      selected={severityOf(injury.region) === 'history'}
                      onClick={() => setSeverity(injury.region, 'history')}
                    />
                  </div>
                </div>
              ))}
            </Stack>
          ) : (
            <Notice>Keine Angabe = keine Einschränkungen.</Notice>
          )}

          <Notice tone="warning">
            Ich bin kein Arzt. Bei akuten oder anhaltenden Schmerzen lass das bitte
            medizinisch abklären — ich plane um das Problem herum, aber ich kann es nicht
            beurteilen.
          </Notice>
        </Stack>
      )
    },
  },

  // 15 — Blacklist
  {
    id: 'blacklist',
    canContinue: () => true,
    render: (ctx) => (
      <Stack gap={4}>
        <StepTitle
          title="Übungen, die du nicht machen willst?"
          subtitle="Ich ersetze sie durch gleichwertige für denselben Muskel."
        />
        <BlacklistPicker {...ctx} />
      </Stack>
    ),
  },

  // 16 — Referenz-Intro
  {
    id: 'refIntro',
    canContinue: (d) => d.wantsReferences !== null,
    render: ({ draft, patch }) => (
      <Stack gap={4}>
        <StepTitle
          title="Kennst du deine aktuellen Gewichte?"
          subtitle="Wenn ja, treffe ich den Start genauer."
        />
        <Stack gap={2}>
          <ChoiceCard
            label="Ich gebe Werte an"
            description="6 Übungen, jede einzeln überspringbar"
            selected={draft.wantsReferences === true}
            onClick={() => patch({ wantsReferences: true })}
          />
          <ChoiceCard
            label="Überspringen"
            description="Ich schätze konservativ und messe in den ersten Einheiten ein"
            selected={draft.wantsReferences === false}
            onClick={() =>
              patch({
                wantsReferences: false,
                references: draft.references.map((r) => ({
                  ...r,
                  skipped: true,
                  weightKg: null,
                  reps: null,
                })),
              })
            }
          />
        </Stack>
      </Stack>
    ),
  },

  // 17 — Referenzwerte
  {
    id: 'references',
    canContinue: () => true,
    render: (ctx) =>
      ctx.draft.wantsReferences === false ? (
        <Stack gap={4}>
          <StepTitle title="Übersprungen" subtitle="Ich messe in den ersten Einheiten ein." />
          <Notice>
            Die erste Woche setzt bewusst konservativ an. Nach jedem Satz korrigiere ich
            das Gewicht, sodass es sich innerhalb einer Einheit einstellt.
          </Notice>
        </Stack>
      ) : (
        <Stack gap={4}>
          <StepTitle
            title="Deine Referenzwerte"
            subtitle="Gewicht und Wiederholungen eines Satzes, den du sicher schaffst. Alles einzeln überspringbar."
          />
          <ReferenceTable {...ctx} />
        </Stack>
      ),
  },

  // 18 — Körpergewichtsübungen
  {
    id: 'bodyweight',
    canContinue: () => true,
    render: ({ draft, patch }) => (
      <Stack gap={4}>
        <StepTitle
          title="Körpergewichtsübungen"
          subtitle="Maximale Wiederholungen, soweit du sie kennst. Auch das ist freiwillig."
        />
        <NumberField
          label="Klimmzüge"
          value={draft.maxPullups}
          min={0}
          max={60}
          onChange={(maxPullups) => patch({ maxPullups })}
        />
        <NumberField
          label="Liegestütze"
          value={draft.maxPushups}
          min={0}
          max={150}
          onChange={(maxPushups) => patch({ maxPushups })}
        />
        <NumberField
          label="Dips"
          value={draft.maxDips}
          min={0}
          max={60}
          onChange={(maxDips) => patch({ maxDips })}
        />
      </Stack>
    ),
  },

  // 19 — Check-in
  {
    id: 'checkin',
    canContinue: (d) => d.checkinWeekday !== null,
    render: ({ draft, patch }) => {
      // Vorschlag: der erste trainingsfreie Tag nach dem letzten Trainingstag.
      const suggestion = WEEKDAYS.filter((d2) => !draft.trainingDays.includes(d2)).at(-1)

      return (
        <Stack gap={4}>
          <StepTitle
            title="Wann soll ich dich wöchentlich fragen?"
            subtitle="Gewicht und Befinden, etwa 60 Sekunden. Daraus passe ich Volumen und Kalorien an."
          />
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                aria-pressed={draft.checkinWeekday === day}
                onClick={() => patch({ checkinWeekday: day })}
                className={
                  'min-h-16 rounded-xl border text-sm font-semibold transition-colors ' +
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
                  (draft.checkinWeekday === day
                    ? 'border-primary bg-primary/20 text-text'
                    : 'border-border bg-surface text-muted')
                }
              >
                {WEEKDAY_LABELS[day]}
              </button>
            ))}
          </div>
          {suggestion && draft.checkinWeekday === null ? (
            <Notice>
              Vorschlag: {WEEKDAY_LONG[suggestion]} — ein trainingsfreier Tag passt gut.
            </Notice>
          ) : null}
          <Notice>
            Bitte den <span className="text-text font-medium">Wochendurchschnitt</span> deines
            Gewichts angeben. Tageswerte schwanken durch Wasser stärker als echtes Gewebe.
          </Notice>
        </Stack>
      )
    },
  },

  // 20 — Zusammenfassung
  {
    id: 'summary',
    chromeless: true,
    canContinue: () => true,
    continueLabel: 'Plan erstellen',
    render: (ctx) => (
      <Stack gap={4}>
        <StepTitle title="Dein Plan steht" subtitle="Alles hiervon passt sich fortlaufend an." />
        <Summary {...ctx} />
      </Stack>
    ),
  },
]
