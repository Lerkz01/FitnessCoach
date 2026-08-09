// ====================================================================
//  „Das habe ich angepasst"
//
//  Der wichtigste Bildschirm der Woche (docs/UI-UX.md §11). Er zeigt, was
//  sich geändert hat — und vor allem WARUM.
//
//  Regel: Wird nichts geändert, sagt die App das auch, mit Grund. „Nichts
//  ändern" ist eine Entscheidung, keine Untätigkeit. Ohne diese Anzeige
//  wirkt eine ruhige Woche wie ein Aussetzer der App.
// ====================================================================

import type { WeeklyReview } from '../domain/weeklyReview'
import { Button, Notice, Stack } from '../ui/controls'
import { Disclosure, Row } from '../ui/Disclosure'

export function ReviewResult({
  review,
  onDeload,
  onDone,
}: {
  review: WeeklyReview
  /** `null` = nicht entschieden. */
  onDeload: (accepted: boolean) => void
  onDone: () => void
}) {
  const changedVolume = review.volume.filter((v) => v.after !== v.before)
  const nutritionChanged = review.nutrition.next !== null

  const nothingChanged =
    changedVolume.length === 0 &&
    !nutritionChanged &&
    review.rotations.length === 0 &&
    review.deload.recommendation === 'none'

  return (
    <div className="min-h-svh flex flex-col">
      <header className="px-5 pt-8 pb-5">
        <h1 className="text-3xl font-bold tracking-tight">Das habe ich angepasst</h1>
        <p className="text-muted text-sm mt-1">
          {review.recovery.ok
            ? 'Erholung sieht gut aus.'
            : `Erholung eingeschränkt: ${review.recovery.reasons.join(', ')}.`}
        </p>
      </header>

      <main className="px-5 pb-8 flex-1">
        <Stack gap={3}>
          {nothingChanged ? (
            <Notice>
              <span className="font-medium text-text">Nichts geändert — mit Absicht. </span>
              {review.nutrition.reason} Die Vorgaben laufen weiter wie bisher.
            </Notice>
          ) : null}

          {/* ── Deload zuerst: Es ist die einzige Entscheidung, die dir gehört ── */}
          {review.deload.recommendation !== 'none' ? (
            <section
              className={
                'rounded-2xl border p-5 ' +
                (review.deload.recommendation === 'urgent'
                  ? 'border-warning/50 bg-warning/10'
                  : 'border-primary/50 bg-primary/10')
              }
            >
              <p className="text-sm text-muted">
                {review.deload.recommendation === 'urgent'
                  ? 'Dringende Empfehlung'
                  : 'Vorschlag'}
              </p>
              <p className="text-xl font-bold mt-1">Entlastungswoche</p>
              <ul className="mt-3 space-y-1">
                {review.deload.signals.map((signal, index) => (
                  <li key={index} className="text-sm text-muted flex gap-2">
                    <span aria-hidden="true">·</span>
                    <span>{signal}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm mt-3 leading-relaxed">{review.deload.shape}</p>
              {review.deload.recommendation === 'urgent' ? (
                <p className="text-xs text-muted mt-2 leading-relaxed">
                  Bei so vielen Signalen lohnt auch ein Blick auf Schlaf, Essen und
                  Stress außerhalb des Gyms — Training ist nur ein Teil der Belastung.
                </p>
              ) : null}
              <div className="mt-4 space-y-2">
                <Button full onClick={() => onDeload(true)}>
                  Entlastungswoche einlegen
                </Button>
                <Button variant="ghost" full onClick={() => onDeload(false)}>
                  Normal weitertrainieren
                </Button>
              </div>
            </section>
          ) : null}

          {/* ── Volumen ── */}
          <Disclosure
            title="Volumen"
            summary={
              changedVolume.length === 0
                ? 'unverändert'
                : `${changedVolume.length} angepasst`
            }
            defaultOpen={changedVolume.length > 0}
            tone={changedVolume.length > 0 ? 'attention' : 'normal'}
          >
            {changedVolume.length === 0 ? (
              <p className="text-sm text-muted py-1">
                Alle Muskelgruppen bleiben bei ihren Sätzen pro Woche.
              </p>
            ) : (
              <ul className="space-y-3 pt-1">
                {changedVolume.map((change) => (
                  <li key={change.muscle}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium truncate">{change.muscle}</span>
                      <span className="tabular text-sm font-semibold shrink-0">
                        {format(change.before)} → {format(change.after)} Sätze
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

          {/* ── Kalorien ── */}
          <Disclosure
            title="Kalorien"
            summary={
              review.nutrition.next
                ? `${review.nutrition.next.kcal} kcal`
                : review.nutrition.blocked
                  ? 'gesperrt'
                  : 'unverändert'
            }
            defaultOpen={nutritionChanged || review.nutrition.blocked}
            tone={review.nutrition.blocked ? 'attention' : 'normal'}
          >
            {review.nutrition.next ? (
              <>
                <Row label="Kalorien" value={`${review.nutrition.next.kcal} kcal`} />
                <Row label="Protein" value={`${review.nutrition.next.proteinG} g`} />
                <Row label="Fett" value={`${review.nutrition.next.fatG} g`} />
                <Row label="Kohlenhydrate" value={`${review.nutrition.next.carbsG} g`} />
              </>
            ) : null}
            <p className="text-xs text-muted mt-2 leading-relaxed">
              {review.nutrition.reason}
            </p>
            {review.nutrition.blocked ? (
              <p className="text-xs text-muted mt-2 leading-relaxed">
                Sobald eine Woche sauber umgesetzt ist, kann ich die Zahl wieder
                nachziehen.
              </p>
            ) : null}
          </Disclosure>

          {/* ── Übungen ── */}
          {review.rotations.length > 0 ? (
            <Disclosure
              title="Übungen"
              summary={`${review.rotations.length} zum Tausch`}
              defaultOpen
            >
              <ul className="space-y-3 pt-1">
                {review.rotations.map((rotation) => (
                  <li key={rotation.exerciseId}>
                    {rotation.replacementName !== null ? (
                      <p className="text-sm font-medium leading-snug">
                        {rotation.exerciseName}
                        <span aria-hidden="true" className="text-muted mx-1.5">
                          →
                        </span>
                        <span className="sr-only"> wird ersetzt durch </span>
                        {rotation.replacementName}
                      </p>
                    ) : (
                      <p className="text-sm font-medium leading-snug">
                        {rotation.exerciseName}
                        <span className="text-muted font-normal">
                          {' '}
                          — kein passender Ersatz gefunden
                        </span>
                      </p>
                    )}
                    <p className="text-xs text-muted mt-0.5 leading-snug">
                      {rotation.reason}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted mt-3 leading-relaxed">
                Der Tausch greift beim nächsten Planaufbau, nicht mitten in der Woche —
                sonst wäre der Kraftverlauf nicht mehr vergleichbar. Die alte Übung
                kommt nach sechs Wochen wieder in Frage. Schwere Grundübungen werden
                nie getauscht, sie sind der Maßstab, an dem ich Kraft überhaupt messe.
              </p>
            </Disclosure>
          ) : null}

          {review.notes.length > 0 ? (
            <Stack gap={2}>
              {review.notes.map((note, index) => (
                <Notice key={index} tone="warning">
                  {note}
                </Notice>
              ))}
            </Stack>
          ) : null}

          <Button full onClick={onDone}>
            Verstanden
          </Button>
        </Stack>
      </main>
    </div>
  )
}

function format(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',')
}
