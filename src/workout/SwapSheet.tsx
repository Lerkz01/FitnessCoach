// ====================================================================
//  Auswahl der Ersatzübung
//
//  Erscheint über dem Trainingsbildschirm, wenn „Gerät besetzt" getippt
//  wird. Anforderungen aus der Gym-Realität:
//
//   · Höchstens vier Vorschläge. Wer vor einer besetzten Maschine steht,
//     will entscheiden, nicht vergleichen.
//   · Jeder Vorschlag nennt das GERÄT — das ist die Information, die man
//     braucht, um losgehen zu können.
//   · Kein Laden, kein Netz. Die Auswahl steht sofort.
//   · Große Flächen, ein Tipp pro Entscheidung.
// ====================================================================

import type { Alternative } from '../domain/alternatives'
import { Button, Notice } from '../ui/controls'

export function SwapSheet({
  exerciseName,
  blockedNames,
  alternatives,
  onPick,
  onCancel,
}: {
  exerciseName: string
  /** Welche Geräte für den Rest der Einheit wegfallen. */
  blockedNames: readonly string[]
  alternatives: readonly Alternative[]
  onPick: (alternative: Alternative) => void
  onCancel: () => void
}) {
  return (
    <section
      role="dialog"
      aria-label="Ersatzübung wählen"
      className="rounded-2xl border border-primary/50 bg-surface p-5"
    >
      <p className="text-sm text-muted">Gerät besetzt</p>
      <h2 className="text-xl font-bold mt-1 leading-tight">{exerciseName}</h2>

      {blockedNames.length > 0 ? (
        <p className="text-xs text-muted mt-2 leading-relaxed">
          {blockedNames.join(', ')} fällt für den Rest der Einheit weg. Kurz- und
          Langhanteln bleiben verfügbar.
        </p>
      ) : (
        <p className="text-xs text-muted mt-2 leading-relaxed">
          Diese Übung braucht nur Freihanteln — die gibt es mehrfach. Du kannst
          trotzdem tauschen.
        </p>
      )}

      {alternatives.length === 0 ? (
        <div className="mt-4">
          <Notice tone="warning">
            Ich finde keinen Ersatz, der dieselbe Muskulatur trifft. Überspring die
            Übung besser, als etwas Unpassendes zu machen — das Wochenvolumen ist pro
            Muskel geplant.
          </Notice>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {alternatives.map((alternative) => (
            <li key={alternative.exercise.id}>
              <button
                type="button"
                onClick={() => onPick(alternative)}
                className={
                  'w-full text-left min-h-16 px-4 py-3 rounded-2xl border border-border ' +
                  'bg-bg hover:border-muted transition-colors ' +
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
                }
              >
                <span className="block font-semibold leading-snug">
                  {alternative.exercise.name}
                </span>
                <span className="block text-xs text-muted mt-1 leading-snug">
                  {alternative.reason}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Button variant="ghost" full onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </section>
  )
}
