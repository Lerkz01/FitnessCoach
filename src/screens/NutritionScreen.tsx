// ====================================================================
//  Ernährung
//
//  Die App gibt Ziele vor, sie trackt kein Essen — das läuft in einer
//  anderen App (Nutzerentscheidung). Dieser Bildschirm hat deshalb nur zwei
//  Aufgaben:
//
//    1. Die aktuellen Ziele so zeigen, dass man sie abtippen kann
//    2. Nachvollziehbar machen, WARUM sie so sind und wann sie sich
//       geändert haben
//
//  Punkt 2 ist der eigentliche Wert. Eine Zahl ohne Begründung ist eine
//  Behauptung; mit Verlauf wird sie überprüfbar (docs/UI-UX.md §9).
// ====================================================================

import type { Adjustment, NutritionTarget, UserProfile } from '../domain/records'
import { localDayOf } from '../domain/week'
import { Notice, Stack } from '../ui/controls'
import { Disclosure, Row } from '../ui/Disclosure'

export function NutritionScreen({
  profile,
  nutrition,
  history,
  adjustments,
}: {
  profile: UserProfile
  nutrition: NutritionTarget | null
  /** Alle Ernährungsvorgaben, älteste zuerst. */
  history: readonly NutritionTarget[]
  adjustments: readonly Adjustment[]
}) {
  if (!nutrition) {
    return (
      <div className="min-h-svh flex flex-col">
        <Header />
        <main className="px-5 pb-8">
          <Notice>Noch keine Ernährungsvorgabe vorhanden.</Notice>
        </main>
      </div>
    )
  }

  const nutritionAdjustments = adjustments
    .filter((entry) => entry.scope === 'nutrition' && entry.deletedAt === null)
    .sort((a, b) => (a.appliedAt < b.appliedAt ? 1 : -1))

  const proteinKcal = nutrition.proteinG * 4
  const fatKcal = nutrition.fatG * 9
  const carbsKcal = nutrition.carbsG * 4
  const totalKcal = proteinKcal + fatKcal + carbsKcal

  return (
    <div className="min-h-svh flex flex-col">
      <Header />
      <main className="px-5 pb-8 flex-1">
        <Stack gap={3}>
          {/* ── Die Zahlen selbst: immer offen, das ist der Zweck ── */}
          <section className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-4xl font-bold tabular">{nutrition.kcal} kcal</p>
            <p className="text-xs text-muted mt-1">pro Tag</p>

            <div className="mt-4 space-y-2">
              <Macro
                label="Protein"
                grams={nutrition.proteinG}
                kcal={proteinKcal}
                total={totalKcal}
              />
              <Macro label="Fett" grams={nutrition.fatG} kcal={fatKcal} total={totalKcal} />
              <Macro
                label="Kohlenhydrate"
                grams={nutrition.carbsG}
                kcal={carbsKcal}
                total={totalKcal}
              />
            </div>
          </section>

          <Disclosure title="Warum diese Zahlen" summary={`${nutrition.maintenanceKcal} kcal Bedarf`}>
            <p className="text-sm leading-relaxed py-1">{nutrition.reason}</p>
            <div className="mt-2">
              <Row
                label="Geschätzter Erhaltungsbedarf"
                value={`${nutrition.maintenanceKcal} kcal`}
              />
              <Row
                label="Zielrate"
                value={`${format(nutrition.targetRatePercentPerWeek)} % pro Woche`}
                hint={
                  nutrition.targetRatePercentPerWeek === 0
                    ? 'Gewicht halten'
                    : nutrition.targetRatePercentPerWeek > 0
                      ? 'Aufbau — langsam genug, damit der Zuwachs überwiegend Muskel ist'
                      : 'Abbau — langsam genug, um die Muskelmasse zu schützen'
                }
              />
              <Row label="Gültig ab" value={germanDate(nutrition.effectiveFrom)} />
            </div>
            <p className="text-xs text-muted mt-3 leading-relaxed">
              Der Erhaltungsbedarf ist eine Formelschätzung. Sobald mehrere Wochen mit
              umgesetzter Vorgabe vorliegen, ersetze ich sie durch den Wert, der sich
              aus deiner tatsächlichen Gewichtsveränderung ergibt.
            </p>
          </Disclosure>

          <Disclosure
            title="Anpassungen"
            summary={
              nutritionAdjustments.length === 0
                ? 'keine'
                : `${nutritionAdjustments.length}`
            }
          >
            {nutritionAdjustments.length === 0 ? (
              <p className="text-sm text-muted py-1">
                Bisher unverändert. Ich passe die Kalorien nur nach einem Check-in an —
                und nur, wenn die Vorgabe auch umgesetzt wurde.
              </p>
            ) : (
              <ul className="space-y-3 pt-1">
                {nutritionAdjustments.map((entry) => (
                  <li key={entry.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs text-muted shrink-0">
                        {germanDate(localDayOf(entry.appliedAt))}
                      </span>
                      <span className="tabular text-sm font-medium">
                        {entry.applied ? `${entry.before} → ${entry.after}` : entry.after}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5 leading-snug">{entry.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </Disclosure>

          {history.length > 1 ? (
            <Disclosure title="Frühere Vorgaben" summary={`${history.length}`}>
              <ul className="space-y-1 pt-1">
                {[...history]
                  .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))
                  .map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-baseline justify-between gap-3 text-sm py-1"
                    >
                      <span className="text-muted text-xs shrink-0">
                        {germanDate(entry.effectiveFrom)}
                      </span>
                      <span className="tabular">
                        {entry.kcal} kcal · {entry.proteinG} P / {entry.fatG} F /{' '}
                        {entry.carbsG} K
                      </span>
                    </li>
                  ))}
              </ul>
            </Disclosure>
          ) : null}

          <Notice>
            {profile.goal === 'fatloss'
              ? 'Getrackt wird in deiner Ernährungs-App. Ich brauche nur den Wochenschnitt deines Gewichts und die Antwort, wie gut du das Ziel getroffen hast.'
              : 'Getrackt wird in deiner Ernährungs-App. Ich gebe die Ziele vor und ziehe sie nach, wenn der Gewichtstrend nicht passt.'}
          </Notice>
        </Stack>
      </main>
    </div>
  )
}

function Header() {
  return (
    <header className="px-5 pt-8 pb-5">
      <h1 className="text-3xl tracking-tight">Ernährung</h1>
    </header>
  )
}

/** Makro mit Anteil an den Gesamtkalorien — macht die Aufteilung greifbar. */
function Macro({
  label,
  grams,
  kcal,
  total,
}: {
  label: string
  grams: number
  kcal: number
  total: number
}) {
  const percent = total === 0 ? 0 : Math.round((kcal / total) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted">{label}</span>
        <span className="tabular">
          {grams} g
          <span className="text-muted text-xs ml-2">{percent} %</span>
        </span>
      </div>
      <div className="h-1 rounded-full bg-surface-2 overflow-hidden mt-1">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function germanDate(day: string): string {
  const parts = day.split('-')
  if (parts.length !== 3) return day
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

function format(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',')
}
