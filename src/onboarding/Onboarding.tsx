// ====================================================================
//  Onboarding-Wizard
//
//  Rahmen um die 20 Schritte: Fortschritt, Zurück-Navigation,
//  Zwischenspeichern und der Abschluss, der die Datensätze anlegt.
// ====================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Notice, ProgressBar } from '../ui/controls'
import {
  clearDraft,
  completeOnboarding,
  emptyDraft,
  loadDraft,
  saveDraft,
  type OnboardingDraft,
} from './draft'
import { STEPS } from './steps'

interface OnboardingProps {
  userId: string
  onComplete: () => void
}

export function Onboarding({ userId, onComplete }: OnboardingProps) {
  const restored = useMemo(() => loadDraft(), [])
  const [draft, setDraft] = useState<OnboardingDraft>(restored?.draft ?? emptyDraft())
  const [stepIndex, setStepIndex] = useState(restored?.step ?? 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resumed, setResumed] = useState(Boolean(restored && (restored.step ?? 0) > 0))

  const step = STEPS[stepIndex]
  const isLast = stepIndex === STEPS.length - 1

  const patch = useCallback((partial: Partial<OnboardingDraft>) => {
    setDraft((current) => ({ ...current, ...partial }))
  }, [])

  // Nach jeder Änderung sichern — ein Abbruch darf nichts verlieren.
  useEffect(() => {
    saveDraft(draft, stepIndex)
  }, [draft, stepIndex])

  // Bei jedem Schritt nach oben, sonst startet man mitten im Inhalt.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [stepIndex])

  const canContinue = step.canContinue(draft)

  const goBack = () => {
    setError(null)
    setStepIndex((index) => Math.max(0, index - 1))
  }

  const goForward = async () => {
    setError(null)
    if (!isLast) {
      setStepIndex((index) => Math.min(STEPS.length - 1, index + 1))
      return
    }

    setSaving(true)
    try {
      await completeOnboarding(userId, draft)
      onComplete()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Das Profil konnte nicht angelegt werden.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-svh flex flex-col">
      {/* Kopf mit Fortschritt */}
      <header className="px-5 pt-6 pb-4">
        <ProgressBar current={stepIndex + 1} total={STEPS.length} />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted tabular">
            Schritt {stepIndex + 1} von {STEPS.length}
          </span>
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={() => {
                clearDraft()
                setDraft(emptyDraft())
                setStepIndex(0)
                setResumed(false)
              }}
              className="text-xs text-muted hover:text-text"
            >
              Neu beginnen
            </button>
          ) : null}
        </div>
      </header>

      {/* Inhalt */}
      <main className="flex-1 px-5 pb-4">
        {resumed ? (
          <div className="mb-4">
            <Notice>
              Ich mache dort weiter, wo du aufgehört hast.
              <button
                type="button"
                onClick={() => setResumed(false)}
                className="ml-2 underline text-text"
              >
                Verstanden
              </button>
            </Notice>
          </div>
        ) : null}

        {step.render({ draft, patch })}

        {error ? (
          <div className="mt-4">
            <Notice tone="warning">{error}</Notice>
          </div>
        ) : null}
      </main>

      {/* Fuß — alle Aktionen unten, einhändig erreichbar */}
      <footer className="px-5 pb-6 pt-2 sticky bottom-0 bg-bg/95 backdrop-blur">
        <div className="flex gap-3">
          {stepIndex > 0 ? (
            <Button variant="secondary" onClick={goBack} disabled={saving}>
              Zurück
            </Button>
          ) : null}
          <div className="flex-1">
            <Button full onClick={goForward} disabled={!canContinue || saving}>
              {saving
                ? 'Erstelle Plan …'
                : (step.continueLabel ?? (isLast ? 'Plan erstellen' : 'Weiter'))}
            </Button>
          </div>
        </div>
        {!canContinue ? (
          <p className="text-xs text-muted mt-2 text-center">
            Bitte die Angabe oben ausfüllen.
          </p>
        ) : null}
      </footer>
    </div>
  )
}
