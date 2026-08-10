import { describe, expect, it } from 'vitest'
import { screenAfterAuthChange } from './session'

/**
 * Diese Entscheidung war der Grund eines echten Fehlers: Wer sein Handy
 * sperrte und wieder aufweckte, sah nur noch „Lade …" und musste die App neu
 * starten. Supabase erneuert beim Sichtbarwerden das Token, die App schaltete
 * daraufhin bedingungslos auf „Laden" — und der Effekt, der das Laden
 * auslöst, hängt an der Profilkennung, die sich nicht geändert hatte.
 */
describe('screenAfterAuthChange', () => {
  const luca = 'user-luca'
  const freundin = 'user-freundin'

  it('lässt den Bildschirm beim erneuerten Token in Ruhe', () => {
    // DER Fehlerfall. Gleicher Nutzer, neues Token — nichts anfassen.
    expect(screenAfterAuthChange(luca, luca)).toBe('keep')
  })

  it('lädt beim erstmaligen Anmelden', () => {
    expect(screenAfterAuthChange(null, luca)).toBe('reload')
  })

  it('lädt beim Wechsel auf ein anderes Konto', () => {
    // Zwei Profile auf einem Gerät: Die Daten des anderen müssen geladen
    // werden, sonst zeigt die App fremden Fortschritt.
    expect(screenAfterAuthChange(luca, freundin)).toBe('reload')
  })

  it('zeigt beim Abmelden die Anmeldung', () => {
    expect(screenAfterAuthChange(luca, null)).toBe('signin')
  })

  it('zeigt die Anmeldung auch ohne vorherige Sitzung', () => {
    expect(screenAfterAuthChange(null, null)).toBe('signin')
  })

  it('kennt nur diese drei Ausgänge', () => {
    const alle = [
      screenAfterAuthChange(null, null),
      screenAfterAuthChange(null, luca),
      screenAfterAuthChange(luca, luca),
      screenAfterAuthChange(luca, freundin),
      screenAfterAuthChange(luca, null),
    ]
    for (const ausgang of alle) {
      expect(['signin', 'reload', 'keep']).toContain(ausgang)
    }
  })
})
