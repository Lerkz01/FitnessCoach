-- ====================================================================
--  Fitness-Coach — Cloud-Schema
--
--  Bewusste Entscheidung: EINE Tabelle mit einer jsonb-Spalte, nicht
--  neun Tabellen mit ausmodellierten Spalten.
--
--  Begründung:
--   · Die Cloud ist Sicherung und Sync-Ziel, nicht die Abfrage-Engine.
--     Alle Auswertungen laufen lokal auf IndexedDB (docs/ARCHITECTURE.md §2).
--   · Damit entfällt jede Feldzuordnung zwischen App und Datenbank — der
--     Datensatz wird unverändert gespeichert und unverändert zurückgelesen.
--     Das ist die zuverlässigste Variante für die Datenintegrität, weil es
--     keine stillen Abweichungen zwischen zwei Schemata geben kann.
--   · Neue Felder im Datenmodell brauchen KEINE Datenbank-Migration.
--   · Bei unserer Datenmenge (~10 MB in zehn Jahren, zwei Nutzer) hat die
--     Normalisierung keinen praktischen Vorteil.
--
--  Die verbindliche Schemadefinition ist docs/DATA-SCHEMA.md, nicht diese
--  Datei.
-- ====================================================================

-- ── Datensätze ──────────────────────────────────────────────────────

create table if not exists public.records (
  -- UUIDv7, auf dem Gerät erzeugt. Macht die Übertragung idempotent:
  -- derselbe Satz zweimal gesendet erzeugt keinen Doppeleintrag.
  id          uuid        primary key,

  user_id     uuid        not null references auth.users (id) on delete cascade,

  kind        text        not null,

  created_at  timestamptz not null,
  -- Cursor für den Abruf: die Gegenseite fragt "alles neuer als X".
  updated_at  timestamptz not null,
  -- Weiches Löschen, damit Löschungen synchronisierbar bleiben.
  deleted_at  timestamptz,

  -- Der vollständige Datensatz, unverändert wie in der App.
  data        jsonb       not null,

  constraint records_kind_bekannt check (
    kind in (
      'profiles',
      'strengthReferences',
      'plans',
      'sessions',
      'setLogs',
      'checkins',
      'bodyMetrics',
      'nutritionTargets',
      'adjustments'
    )
  )
);

-- Der Abruf-Cursor: (Profil, Änderungszeit)
create index if not exists records_user_updated_idx
  on public.records (user_id, updated_at);

-- Gezielte Abfragen einzelner Datensatzarten
create index if not exists records_user_kind_idx
  on public.records (user_id, kind);

-- ── Profil-Trennung auf Datenbankebene ──────────────────────────────
--
--  Das ist der Kern der Anforderung "beide Profile komplett unabhängig"
--  (docs/ARCHITECTURE.md §6). Die Trennung wird von der DATENBANK
--  erzwungen, nicht vom Anwendungscode. Selbst wenn die App einen Fehler
--  hätte und fremde Daten abfragte, gibt Postgres sie nicht heraus.

alter table public.records enable row level security;

drop policy if exists "eigene datensaetze lesen" on public.records;
create policy "eigene datensaetze lesen"
  on public.records for select
  using (auth.uid() = user_id);

drop policy if exists "eigene datensaetze anlegen" on public.records;
create policy "eigene datensaetze anlegen"
  on public.records for insert
  with check (auth.uid() = user_id);

drop policy if exists "eigene datensaetze aendern" on public.records;
create policy "eigene datensaetze aendern"
  on public.records for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Kein DELETE. Gelöscht wird ausschließlich weich über `deleted_at`,
-- damit eine Löschung synchronisiert werden kann und nicht als
-- "Datensatz fehlt" missverstanden wird.
revoke delete on public.records from anon, authenticated;

-- ── Idempotentes Hochladen ──────────────────────────────────────────
--
--  Serverseitiges "der neuere Stand gewinnt". Ohne die WHERE-Bedingung
--  könnte ein spät eintreffender alter Stand einen neueren überschreiben.

create or replace function public.upsert_records(payload jsonb)
returns table (id uuid)
language plpgsql
security invoker
as $$
-- Diese Zeile ist NICHT optional.
--
-- `returns table (id uuid)` legt eine Funktionsvariable namens `id` an.
-- Damit ist jede unqualifizierte Nennung von `id` im Funktionskörper
-- doppeldeutig — auch das `on conflict (id)` weiter unten, wo eine
-- Qualifizierung syntaktisch nicht erlaubt ist. Postgres bricht dann mit
-- „column reference id is ambiguous" (42702) ab.
--
-- Der Fehler trat erst beim ersten Aufruf gegen ein echtes Projekt auf,
-- nicht beim Anlegen der Funktion: Der Funktionskörper wird bei
-- `create function` nicht geplant.
--
-- `use_column` sagt: Bei Doppeldeutigkeit gewinnt die Tabellenspalte. Das
-- ist hier immer richtig — der Variable wird nie etwas zugewiesen.
#variable_conflict use_column
begin
  insert into public.records as r (
    id, user_id, kind, created_at, updated_at, deleted_at, data
  )
  select
    (item ->> 'id')::uuid,
    auth.uid(),
    item ->> 'kind',
    (item ->> 'created_at')::timestamptz,
    (item ->> 'updated_at')::timestamptz,
    nullif(item ->> 'deleted_at', '')::timestamptz,
    item -> 'data'
  from jsonb_array_elements(payload) as item
  on conflict (id) do update
    set updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        data       = excluded.data
    -- Nur übernehmen, wenn der eingehende Stand tatsächlich neuer ist.
    where r.updated_at < excluded.updated_at;

  -- Bestätigt wird getrennt vom Schreiben — und zwar ALLES, was jetzt
  -- mindestens auf dem gesendeten Stand ist.
  --
  -- Ein `returning` am Insert allein wäre falsch: Es liefert nur die
  -- tatsächlich geschriebenen Zeilen. Ein Datensatz, den der Server schon
  -- in dieser oder einer neueren Fassung hat, fiele durch die
  -- WHERE-Bedingung und käme nicht zurück. Die App hielte ihn dann für
  -- nicht angekommen und würde ihn endlos erneut senden — die
  -- Warteschlange käme nie leer.
  return query
  -- Qualifiziert als `rec.id`, nicht als Ausdruck über `item`: gleicher
  -- Wert, aber lesbar und ohne jede Doppeldeutigkeit.
  select rec.id
  from jsonb_array_elements(payload) as item
  join public.records rec on rec.id = (item ->> 'id')::uuid
  where rec.user_id = auth.uid()
    and rec.updated_at >= (item ->> 'updated_at')::timestamptz;
end;
$$;

-- ── Export-Archive ──────────────────────────────────────────────────
--
--  Ablage der wöchentlichen Sicherungen (docs/ARCHITECTURE.md §4, Ebene 3).
--  Anzulegen in der Supabase-Oberfläche unter Storage:
--
--    Bucket:  exports
--    Public:  nein
--    Policy:  Pfad muss mit der eigenen user_id beginnen
--
--  Beispielregel für den Bucket:
--    (storage.foldername(name))[1] = auth.uid()::text
