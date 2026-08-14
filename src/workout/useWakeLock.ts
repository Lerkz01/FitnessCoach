// ====================================================================
//  Bildschirm wach halten
//
//  Das eigentliche Problem beim Pausentimer ist nicht die Benachrichtigung,
//  sondern der schwarze Bildschirm. Ein Handy, das nach 30 Sekunden zusperrt,
//  zeigt keinen Timer und macht kein Geräusch — und eine echte
//  Hintergrund-Benachrichtigung ist aus einer PWA ohne Push-Server nicht
//  zuverlässig möglich: Auf iOS gibt es kein `navigator.vibrate`, und ein
//  weggeschalteter Tab bekommt weder Timer noch Audio.
//
//  Die Sperre ist deshalb der ehrliche Weg: Solange trainiert wird, bleibt
//  der Bildschirm an. Dann ist der Timer sichtbar, der Ton hörbar, und es
//  braucht keine Infrastruktur.
//
//  Sie wird automatisch freigegeben, wenn die Seite in den Hintergrund geht —
//  deshalb muss sie beim Zurückkommen neu angefordert werden. Genau das ist
//  der Teil, den man vergisst und der die Sperre nach dem ersten Wegdrücken
//  still nutzlos macht.
// ====================================================================

import { useEffect } from 'react'

interface WakeLockSentinel {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
}

interface WakeLockNavigator {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> }
}

/**
 * Hält den Bildschirm wach, solange `active` gilt.
 *
 * Fehlt die Schnittstelle (älteres iOS, Firefox), passiert nichts — kein
 * Fehler, keine Meldung. Sie ist eine Verbesserung, keine Voraussetzung.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const lockApi = (navigator as unknown as WakeLockNavigator).wakeLock
    if (!lockApi) return

    let sentinel: WakeLockSentinel | null = null
    let abgebrochen = false

    const request = async () => {
      if (abgebrochen || document.visibilityState !== 'visible') return
      try {
        sentinel = await lockApi.request('screen')
      } catch {
        // Kann fehlschlagen, wenn der Akku fast leer ist oder das System es
        // verweigert. Kein Grund für eine Meldung — der Nutzer hat nichts
        // falsch gemacht und kann nichts tun.
      }
    }

    // Das System gibt die Sperre beim Wegschalten frei. Ohne dieses
    // Nachfordern wäre sie nach dem ersten Wechsel in eine andere App weg,
    // ohne dass es auffällt.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void request()
    }

    void request()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      abgebrochen = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release().catch(() => {})
    }
  }, [active])
}

/**
 * Kurzes Signal am Ende der Pause: Vibration und ein Ton.
 *
 * Beides absichtlich zusammen und beides „wenn es geht": Vibration kennt iOS
 * nicht, Ton braucht eine vorherige Berührung. Im Training hat es die
 * gegeben — jeder Satz ist zwei Tipps.
 */
export function signalRestOver(): void {
  try {
    navigator.vibrate?.([180, 90, 180])
  } catch {
    // iOS kennt die Schnittstelle nicht.
  }

  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return
    const context = new Ctor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    // Sanft ein- und ausblenden. Ein harter Rechteck-Piep im Studio klingt
    // wie ein Alarm und erschreckt die Leute an den Nachbargeräten.
    gain.gain.setValueAtTime(0, context.currentTime)
    gain.gain.linearRampToValueAtTime(0.25, context.currentTime + 0.02)
    gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.35)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.36)
    oscillator.onended = () => void context.close().catch(() => {})
  } catch {
    // Kein Ton möglich. Der sichtbare Timer bleibt.
  }
}
