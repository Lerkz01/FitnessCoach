// ====================================================================
//  Übungsinfo — das kleine „i" und was dahinter steckt
//
//  Zwei Teile:
//   · InfoButton: ein unauffälliges „i" neben dem Übungsnamen. Klein im
//     Aussehen, aber mit 44 px Tap-Fläche — sonst trifft man es mit
//     verschwitzten Fingern nicht. Der Kreis ist nur 20 px, der
//     anklickbare Bereich drumherum unsichtbar größer.
//   · ExerciseInfoSheet: das Blatt selbst. Reihenfolge nach dem, was man
//     am Gerät zuerst braucht: Schema, Aufbau, Bewegung, Fehler. Alles
//     Weitere (Muskeln, Geräte, Rolle im Plan) steht darunter und
//     zugeklappt — es beantwortet Neugier, nicht die Frage „wie mache
//     ich das jetzt".
//
//  Kein Netz, keine Ladezeit: Texte und Schema stecken im Bundle.
// ====================================================================

import { buildInstruction } from '../domain/instructions'
import type { Exercise } from '../types'
import { MovementAnimation } from './MovementAnimation'
import { Disclosure } from './Disclosure'

// ── Das „i" ─────────────────────────────────────────────────────────

export function InfoButton({
  exerciseName,
  onClick,
}: {
  exerciseName: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={`Infos zu ${exerciseName}`}
      onClick={(event) => {
        // Das „i" sitzt oft in einer Zeile, die selbst anklickbar ist
        // (Aufklappen, Übung wählen). Ohne das hier würde ein Tipp beides
        // auslösen.
        event.stopPropagation()
        onClick()
      }}
      className={
        // Negative Ränder: die Tap-Fläche wächst nach außen, ohne das
        // Layout der Zeile zu verschieben.
        'shrink-0 grid place-items-center w-11 h-11 -m-3 rounded-full ' +
        'text-muted hover:text-text transition-colors ' +
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
      }
    >
      <span
        aria-hidden="true"
        className={
          'grid place-items-center w-5 h-5 rounded-full border border-current ' +
          'text-[11px] font-serif italic leading-none'
        }
      >
        i
      </span>
    </button>
  )
}

// ── Das Blatt ───────────────────────────────────────────────────────

export function ExerciseInfoSheet({
  exercise,
  onClose,
}: {
  exercise: Exercise
  onClose: () => void
}) {
  const info = buildInstruction(exercise)

  return (
    <section
      role="dialog"
      aria-label={`Infos zu ${exercise.name}`}
      className="rounded-2xl border border-border bg-surface p-5"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{info.instruction.label}</p>
          <h2 className="text-xl font-bold mt-1 leading-tight">{exercise.name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Infos schließen"
          className={
            'ml-auto shrink-0 grid place-items-center w-11 h-11 -mt-2 -mr-2 rounded-full ' +
            'text-muted hover:text-text transition-colors ' +
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
          }
        >
          <span aria-hidden="true" className="text-2xl leading-none">
            ×
          </span>
        </button>
      </div>

      <div className="mt-4">
        <MovementAnimation family={info.family} />
      </div>

      <dl className="mt-4 space-y-3">
        <Step term="Aufbau" description={info.instruction.setup} />
        <Step term="Bewegung" description={info.instruction.execution} />
        <Step
          term="Häufigster Fehler"
          description={info.instruction.mistake}
          tone="warning"
        />
      </dl>

      {info.unilateral && (
        <p className="text-xs text-muted mt-3 leading-relaxed">
          Einseitig: Die angegebenen Wiederholungen gelten <strong>pro Seite</strong>.
          Beginn mit der schwächeren Seite, die andere macht dann genauso viele.
        </p>
      )}

      <div className="mt-4 space-y-2">
        <Disclosure title="Was trainiert wird">
          <MuscleList label="Hauptsächlich" muscles={info.primaryMuscles} />
          {info.secondaryMuscles.length > 0 && (
            <MuscleList label="Mit dabei" muscles={info.secondaryMuscles} />
          )}
          {info.equipment.length > 0 && (
            <MuscleList label="Gerät" muscles={info.equipment} />
          )}
        </Disclosure>

        <Disclosure title={`Rolle im Plan — ${info.tierLabel}`}>
          <p className="text-sm text-muted leading-relaxed">{info.roleNote}</p>
        </Disclosure>
      </div>

      <p className="text-xs text-muted mt-4 leading-relaxed">
        Diese Hinweise nennen Aufbau, Bewegung und den häufigsten Fehler — keine
        Einweisung. Wenn etwas schmerzt oder du unsicher bist, frag jemanden vor Ort.
      </p>
    </section>
  )
}

function Step({
  term,
  description,
  tone = 'normal',
}: {
  term: string
  description: string
  tone?: 'normal' | 'warning'
}) {
  return (
    <div>
      <dt
        className={`text-xs font-semibold uppercase tracking-wide ${
          tone === 'warning' ? 'text-warning' : 'text-muted'
        }`}
      >
        {term}
      </dt>
      <dd className="text-sm leading-relaxed mt-0.5">{description}</dd>
    </div>
  )
}

function MuscleList({ label, muscles }: { label: string; muscles: readonly string[] }) {
  return (
    <p className="text-sm leading-relaxed">
      <span className="text-muted">{label}: </span>
      {muscles.join(', ')}
    </p>
  )
}
