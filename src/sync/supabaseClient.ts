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
