-- ====================================================================
--  Korrektur: upsert_records war doppeldeutig
--
--  Aufgetreten beim ersten Aufruf gegen ein echtes Projekt:
--    ERROR 42702: column reference "id" is ambiguous
--
--  Ursache: `returns table (id uuid)` legt eine Funktionsvariable `id` an.
--  Dadurch ist `on conflict (id)` doppeldeutig — und dort ist eine
--  Qualifizierung syntaktisch nicht erlaubt. Beim ANLEGEN der Funktion
--  fällt das nicht auf, weil Postgres den Körper erst beim Aufruf plant.
--
--  Diese Datei einfach im SQL Editor ausführen. `create or replace`
--  ersetzt die alte Fassung, es geht nichts verloren und es muss nichts
--  gelöscht werden. Die Migration 0001 enthält bereits dieselbe Korrektur —
--  wer sie neu einspielt, braucht diese Datei nicht.
-- ====================================================================

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
