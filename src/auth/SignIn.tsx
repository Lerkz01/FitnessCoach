// ====================================================================
//  Anmeldung
//
//  Zweck ist nicht Absicherung gegen Fremde — es gibt nur zwei Nutzer. Der
//  Zweck ist:
//
//    1. WIEDERHERSTELLBARKEIT. Das Konto liefert die Profilkennung. Ohne
//       Anmeldung wäre nach einem Totalverlust nicht mehr feststellbar,
//       WESSEN Fortschritt in der Cloud liegt.
//    2. TRENNUNG der beiden Profile — von der Datenbank erzwungen, nicht
//       vom App-Code.
//
//  Deshalb so wenig Reibung wie möglich: E-Mail, Passwort, fertig. Kein
//  Bestätigungsschritt, keine Profilangaben — die kommen im Onboarding.
// ====================================================================

import { useState } from 'react'
import { Button, Notice, StepTitle, TextField } from '../ui/controls'
import { signIn, signUp } from './session'

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const submit = async () => {
    if (busy) return
    setError(null)
    setHint(null)

    if (!email.includes('@')) {
      setError('Bitte eine E-Mail-Adresse eingeben.')
      return
    }
    if (password.length < 6) {
      setError('Das Passwort braucht mindestens 6 Zeichen.')
      return
    }

    setBusy(true)
    try {
      const result = mode === 'in' ? await signIn(email, password) : await signUp(email, password)
      if (result.ok) {
        if (mode === 'up') {
          // Ob eine Bestätigung nötig ist, hängt an der Projekteinstellung.
          // Deshalb nicht behaupten, es sei fertig — nachsehen lassen.
          setHint(
            'Konto angelegt. Falls eine Bestätigungs-Mail kommt, bestätige sie und melde dich dann an.',
          )
          setMode('in')
          return
        }
        onSignedIn()
        return
      }
      setError(result.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-svh flex flex-col">
      <header className="px-5 pt-10 pb-2">
        <StepTitle
          title={mode === 'in' ? 'Anmelden' : 'Konto anlegen'}
          subtitle={
            mode === 'in'
              ? 'Damit dein Fortschritt gesichert wird und du ihn auf jedem Gerät zurückholen kannst.'
              : 'Ein Konto pro Person. Beide Profile bleiben vollständig getrennt.'
          }
        />
      </header>

      <main className="px-5 pb-8 flex-1 space-y-3">
        <TextField
          label="E-Mail"
          value={email}
          onChange={setEmail}
          placeholder="name@beispiel.de"
        />

        <label className="block">
          <span className="block text-sm text-muted mb-1">Passwort</span>
          <input
            type="password"
            value={password}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            onChange={(event) => setPassword(event.target.value)}
            className={
              'w-full min-h-14 px-4 rounded-2xl bg-surface border border-border ' +
              'text-text text-lg focus:outline-2 focus:outline-offset-0 focus:outline-primary'
            }
          />
        </label>

        {error ? <Notice tone="warning">{error}</Notice> : null}
        {hint ? <Notice>{hint}</Notice> : null}

        <Button full disabled={busy} onClick={() => void submit()}>
          {busy ? 'Moment …' : mode === 'in' ? 'Anmelden' : 'Konto anlegen'}
        </Button>

        <Button
          variant="ghost"
          full
          onClick={() => {
            setMode(mode === 'in' ? 'up' : 'in')
            setError(null)
            setHint(null)
          }}
        >
          {mode === 'in' ? 'Noch kein Konto? Anlegen' : 'Ich habe schon ein Konto'}
        </Button>

        <Notice>
          Beim ersten Mal brauchst du Internet. Danach läuft die App auch offline —
          Trainings werden lokal gespeichert und hochgeladen, sobald wieder Verbindung
          da ist.
        </Notice>
      </main>
    </div>
  )
}
