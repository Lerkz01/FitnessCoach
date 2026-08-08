// ====================================================================
//  Anmeldung
//
//  Die Anmeldung hat hier eine Aufgabe, die über „Zugang" hinausgeht:
//  Sie liefert die PROFILKENNUNG.
//
//  Das ist der Kern der Wiederherstellbarkeit. Die lokale Datenbank heißt
//  `fitness-coach.<userId>`, und jeder Datensatz trägt dieselbe Kennung.
//  Wäre sie lokal erzeugt, würde sie bei einem Totalverlust — Gerät weg,
//  Speicher geleert — verschwinden, und beim nächsten Start entstünde eine
//  NEUE. Die aus der Cloud geladenen Datensätze trügen dann eine andere
//  Kennung als die App: Der Fortschritt wäre da, aber nicht zuordenbar.
//
//  Mit der Konto-Kennung ist es umgekehrt: Anmelden stellt genau denselben
//  Zustand wieder her, auf jedem Gerät.
//
//  Zwei Nutzer, zwei Konten, zwei Kennungen — damit ist die Trennung der
//  Profile dieselbe Mechanik wie die Wiederherstellung.
// ====================================================================

import type { Session } from '@supabase/supabase-js'
import { hasAnyRecords } from '../sync/restore'
import { supabase } from '../sync/supabaseClient'

/**
 * Kennung im lokalen Betrieb ohne Cloud.
 *
 * Nur ein Notnagel, damit die App auch ohne Cloud-Konfiguration läuft. Sie
 * ist ausdrücklich NICHT wiederherstellbar — deshalb warnt die Oberfläche.
 */
const LOCAL_USER_KEY = 'fitness-coach.localUserId'

export interface AuthState {
  /** Profilkennung für Ablage und Datensätze. */
  userId: string | null
  email: string | null
  /** `true` = Anmeldung nötig, aber noch nicht erfolgt. */
  needsSignIn: boolean
  /** `true` = keine Cloud eingerichtet, alles nur lokal. */
  localOnly: boolean
}

/**
 * Aktueller Anmeldezustand.
 *
 * Liest die gespeicherte Sitzung, OHNE das Netz zu befragen. Damit startet
 * die App auch im Funkloch — was Voraussetzung dafür ist, dass man im
 * Keller-Gym trainieren kann.
 */
export async function currentAuth(): Promise<AuthState> {
  const client = supabase()

  if (!client) {
    return {
      userId: await adoptOrphanedLocalData(localUserId()),
      email: null,
      needsSignIn: false,
      localOnly: true,
    }
  }

  const { data } = await client.auth.getSession()
  const session = data.session
  if (!session) {
    return { userId: null, email: null, needsSignIn: true, localOnly: false }
  }

  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    needsSignIn: false,
    localOnly: false,
  }
}

/**
 * Schlüssel aus der Zeit vor der Anmeldung.
 *
 * Wird noch gelesen, damit Daten, die vor dem Umbau lokal entstanden sind,
 * nicht verwaisen: Eine neue Kennung würde eine neue, leere Datenbank
 * bedeuten — die alte läge unerreichbar daneben. Genau der Datenverlust, den
 * die Cloud verhindern soll, entstünde dann durch ein Update.
 */
const LEGACY_USER_KEY = 'fitness-coach.activeUserId'

/** Fällt auf eine lokal erzeugte Kennung zurück. */
function localUserId(): string {
  try {
    const existing = localStorage.getItem(LOCAL_USER_KEY)
    if (existing) return existing

    const legacy = localStorage.getItem(LEGACY_USER_KEY)
    if (legacy) {
      localStorage.setItem(LOCAL_USER_KEY, legacy)
      return legacy
    }

    const created = crypto.randomUUID()
    localStorage.setItem(LOCAL_USER_KEY, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

/**
 * Nimmt eine verwaiste lokale Datenbank an, falls die aktuelle leer ist.
 *
 * Die Kennung nur über den Speicherschlüssel zu wählen reicht nicht: Wurde
 * die neue Kennung EINMAL geschrieben, bevor die Übernahme der alten
 * eingebaut war, liegt daneben eine gefüllte Datenbank, die niemand mehr
 * öffnet. Genau das ist beim Testen passiert.
 *
 * Deshalb wird nicht nach Schlüsseln entschieden, sondern nach der einzigen
 * Frage, die zählt: WELCHE Datenbank enthält Daten? Läuft nur im lokalen
 * Betrieb — mit Konto liefert das Konto die Kennung.
 */
export async function adoptOrphanedLocalData(current: string): Promise<string> {
  try {
    if (await hasAnyRecords(current)) return current

    const legacy = localStorage.getItem(LEGACY_USER_KEY)
    if (!legacy || legacy === current) return current
    if (!(await hasAnyRecords(legacy))) return current

    localStorage.setItem(LOCAL_USER_KEY, legacy)
    return legacy
  } catch {
    return current
  }
}

export interface SignInResult {
  ok: boolean
  /** Für die Anzeige, auf Deutsch und ohne Fachbegriffe. */
  error: string | null
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const client = supabase()
  if (!client) return { ok: false, error: 'Keine Cloud eingerichtet.' }

  const { error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  return { ok: !error, error: error ? translate(error.message) : null }
}

export async function signUp(email: string, password: string): Promise<SignInResult> {
  const client = supabase()
  if (!client) return { ok: false, error: 'Keine Cloud eingerichtet.' }

  const { error } = await client.auth.signUp({ email: email.trim(), password })
  return { ok: !error, error: error ? translate(error.message) : null }
}

/**
 * Abmelden.
 *
 * Die LOKALEN Daten bleiben absichtlich liegen. Sie zu löschen wäre der
 * schnellste Weg, Fortschritt zu verlieren — etwa wenn jemand sich abmeldet,
 * während noch Sätze in der Warteschlange stehen.
 */
export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut()
}

/** Reagiert auf Anmelden, Abmelden und erneuertes Token. */
export function onAuthChange(handler: (session: Session | null) => void): () => void {
  const client = supabase()
  if (!client) return () => {}
  const { data } = client.auth.onAuthStateChange((_event, session) => handler(session))
  return () => data.subscription.unsubscribe()
}

/** Übersetzt die häufigsten Meldungen. */
function translate(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) {
    return 'E-Mail oder Passwort stimmt nicht.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Die E-Mail ist noch nicht bestätigt. Schau in dein Postfach.'
  }
  if (lower.includes('user already registered')) {
    return 'Für diese E-Mail gibt es schon ein Konto — melde dich einfach an.'
  }
  if (lower.includes('password should be at least')) {
    return 'Das Passwort ist zu kurz (mindestens 6 Zeichen).'
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Keine Verbindung. Bei der ersten Anmeldung brauchst du Internet.'
  }
  return message
}
