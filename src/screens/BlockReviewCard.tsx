// ====================================================================
//  Block-Review — die Anzeige zu Regelkreis 4
//
//  Erscheint auf „Heute", wenn ein Block um ist und genug Daten da sind.
//
//  Wichtig an der Gestaltung: Der Review ÄNDERT NICHTS. Er legt Befunde hin
//  und nennt bei jedem, was er vorschlägt und wo man es einstellt.
//  Entscheidet wird im Profil oder im Chat. Deshalb gibt es hier keinen
//  „Übernehmen"-Knopf, sondern nur „Gelesen" — alles andere würde eine
//  Automatik vorspiegeln, die es bewusst nicht gibt.
// ====================================================================

import type { BlockReview } from '../domain/blockReview'
import { Button } from '../ui/controls'

export function BlockReviewCard({
  review,
  onAcknowledge,
}: {
  review: BlockReview
  /** Block abschließen — der nächste beginnt. */
  onAcknowledge: () => void
}) {
  const zuTun = review.findings.filter((finding) => finding.severity === 'action')

  return (
    <section className="rounded-2xl border border-accent/50 bg-accent/10 p-5">
      <p className="text-sm text-muted">
        Block-Review · {review.weeks} {review.weeks === 1 ? 'Woche' : 'Wochen'}
      </p>
      <h2 className="text-xl font-bold mt-1 leading-tight">
        {zuTun.length === 0
          ? 'Der Block ist durch — es passt'
          : zuTun.length === 1
            ? 'Ein Punkt zum Entscheiden'
            : `${zuTun.length} Punkte zum Entscheiden`}
      </h2>

      <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-bg border border-border py-2">
          <dt className="text-xs text-muted">Einheiten</dt>
          <dd className="tabular font-semibold">
            {review.sessionsDone}
            <span className="text-muted font-normal">/{review.sessionsExpected}</span>
          </dd>
        </div>
        <div className="rounded-xl bg-bg border border-border py-2">
          <dt className="text-xs text-muted">Einhaltung</dt>
          <dd className="tabular font-semibold">{Math.round(review.adherence * 100)} %</dd>
        </div>
        <div className="rounded-xl bg-bg border border-border py-2">
          <dt className="text-xs text-muted">Dauer</dt>
          <dd className="tabular font-semibold">
            {review.medianMinutes === null ? '—' : Math.round(review.medianMinutes)}
            <span className="text-muted font-normal"> min</span>
          </dd>
        </div>
      </dl>

      <ul className="mt-4 space-y-3">
        {review.findings.map((finding, index) => (
          <li
            key={index}
            className={
              'rounded-xl border p-4 ' +
              (finding.severity === 'action'
                ? 'border-warning/50 bg-surface'
                : 'border-border bg-surface/60')
            }
          >
            <p className="font-semibold text-sm leading-snug">{finding.title}</p>
            <p className="text-xs text-muted mt-1 leading-relaxed tabular">
              {finding.detail}
            </p>
            {finding.suggestion ? (
              <p className="text-sm mt-2 leading-relaxed">{finding.suggestion}</p>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-5">
        <Button full onClick={onAcknowledge}>
          Gelesen — nächsten Block starten
        </Button>
      </div>
      <p className="text-xs text-muted mt-2 leading-relaxed">
        Der Review ändert von sich aus nichts. Was du übernehmen willst, stellst du im
        Profil ein oder sagst es dem Coach.
      </p>
    </section>
  )
}
