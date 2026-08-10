// ====================================================================
//  Übungsinfo als Überlagerung
//
//  Bewusst eine Überlagerung und kein Bildschirmwechsel: Wer während des
//  Trainings auf das „i" tippt, hat oft einen Pausentimer laufen. Würde die
//  Info den Trainingsbildschirm ersetzen, würde der Timer abgebaut und beim
//  Zurückkommen neu starten. Hier bleibt alles darunter stehen.
//
//  Schließen geht über drei Wege, weil man das mit einer Hand macht:
//  das ×, ein Tipp daneben, und Escape (Tastatur).
// ====================================================================

import { useEffect } from 'react'
import { exerciseById } from '../data'
import { ExerciseInfoSheet } from './ExerciseInfo'

export function ExerciseInfoOverlay({
  exerciseId,
  onClose,
}: {
  /** null = nichts anzeigen. Erspart jedem Aufrufer die Bedingung. */
  exerciseId: string | null
  onClose: () => void
}) {
  useEffect(() => {
    if (exerciseId === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exerciseId, onClose])

  if (exerciseId === null) return null

  const exercise = exerciseById.get(exerciseId)
  // Kann passieren, wenn eine Übung aus der Datenbank verschwindet, während
  // eine alte Einheit noch darauf zeigt. Dann lieber nichts als ein Absturz.
  if (!exercise) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto" onClick={onClose}>
      {/*
        `min-h-full` mit `items-end` in einem EIGENEN Element, nicht am
        scrollenden Container: Steht `items-end` direkt am Element mit
        `overflow-y-auto`, schneidet der Browser bei zu langem Inhalt oben ab
        und lässt sich nicht dorthin scrollen. Genau das ist hier passiert —
        Übungsname und Schema waren bei langen Blättern nicht erreichbar.
      */}
      <div className="min-h-full flex items-end justify-center">
        <div
          className="w-full max-w-[480px] p-3 pb-6"
          // Ein Tipp im Blatt selbst darf nicht schließen.
          onClick={(event) => event.stopPropagation()}
        >
          <ExerciseInfoSheet exercise={exercise} onClose={onClose} />
        </div>
      </div>
    </div>
  )
}
