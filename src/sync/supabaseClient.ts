// ====================================================================
//  Verbindung zur Cloud
//
//  Die Zugangsdaten stehen in Umgebungsvariablen und werden mitgebaut. Das
//  ist bei Supabase VORGESEHEN: Der `anon key` ist ein öffentlicher
//  Schlüssel, der nur sagt „ich bin diese App". Was ein Konto tatsächlich
//  sehen darf, entscheidet die Datenbank über Row Level Security — nicht
//  der Schlüssel (docs/ARCHITECTURE.md §8).
//
//  Nicht zu verwechseln mit dem `service_role`-Schlüssel: Der umgeht RLS
//  und darf NIE in die App. Er wird hier auch nicht gebraucht.
//
//  Fehlt die Konfiguration, läuft die App im rein lokalen Betrieb weiter.
//  Sie sagt das dann aber deutlich — stillschweigend ohne Sicherung zu
//  arbeiten wäre die schlechteste aller Möglichkeiten.
// ====================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Ist eine Cloud eingerichtet? */
export const cloudConfigured = Boolean(url && anonKey)

/**
 * Prüft die Konfiguration auf typische Eingabefehler.
 *
 * Gibt es einen, kommt sonst nur „Invalid API key" von Supabase — eine
 * Meldung, die nicht sagt, WAS falsch ist. Diese Prüfung nennt den Fehler
 * beim Namen, denn die Konfiguration wird selten angefasst und der Fehler
 * fällt erst beim Anmelden auf, also weit entfernt von seiner Ursache.
 *
 * Jede Regel hier steht für einen Fehler, der tatsächlich passiert ist.
 */
export function configProblem(): string | null {
  if (!cloudConfigured) return null

  const u = (url ?? '').trim()
  const k = (anonKey ?? '').trim()

  // Beim Einrichten passiert: die ganze .env-Zeile in das Wertfeld kopiert.
  if (k.includes('=') || k.startsWith('VITE_')) {
    return (
      'Der Cloud-Schlüssel enthält einen Variablennamen. In den ' +
      'Umgebungsvariablen gehört nur der WERT ins Feld — ohne ' +
      '„VITE_SUPABASE_ANON_KEY=" davor.'
    )
  }
  if (u.includes('VITE_')) {
    return (
      'Die Cloud-Adresse enthält einen Variablennamen. Ins Wertfeld gehört ' +
      'nur die Adresse selbst, ohne „VITE_SUPABASE_URL=" davor.'
    )
  }

  // Der geheime Schlüssel umgeht alle Zugriffsregeln und darf nie in die App.
  if (k.startsWith('sb_secret_') || k.includes('service_role')) {
    return (
      'Hier steht der GEHEIME Schlüssel. Der umgeht alle Zugriffsregeln und ' +
      'darf nicht in die App. Nimm den öffentlichen (anon bzw. publishable) ' +
      'und tausche den geheimen in Supabase aus.'
    )
  }

  // Die REST-Adresse statt der Projektadresse — schon einmal passiert.
  if (/\/rest\/v1\/?$/.test(u) || /\/auth\/v1\/?$/.test(u)) {
    return (
      'Die Cloud-Adresse zeigt auf einen Endpunkt. Es muss die reine ' +
      'Projektadresse sein, ohne „/rest/v1/" am Ende.'
    )
  }

  if (!u.startsWith('https://')) {
    return 'Die Cloud-Adresse muss mit https:// beginnen.'
  }

  return null
}

let client: SupabaseClient | null = null

/**
 * Der Client, oder `null` ohne Konfiguration.
 *
 * Einmalig erzeugt: Mehrere Instanzen würden sich um dieselbe gespeicherte
 * Sitzung streiten und sich gegenseitig abmelden.
 */
export function supabase(): SupabaseClient | null {
  if (!cloudConfigured) return null
  if (client) return client

  client = createClient(url as string, anonKey as string, {
    auth: {
      // Die Sitzung liegt in localStorage. Das ist die Voraussetzung dafür,
      // dass die App OHNE Netz starten kann: Beim Kaltstart im Flugmodus
      // wird die Kennung aus dem Speicher gelesen, nicht erfragt.
      persistSession: true,
      autoRefreshToken: true,
      // Keine Anmeldung über URL-Parameter — wir nutzen nur E-Mail und
      // Passwort, und das Auswerten der URL würde beim PWA-Start stören.
      detectSessionInUrl: false,
    },
  })
  return client
}
