# Cloud einrichten — damit Fortschritt nie verloren geht

Ziel dieser Anleitung: Nach zwanzig Minuten ist jeder Satz, den du trainierst, innerhalb
von Sekunden in der Cloud — und wenn Handy, App und Speicher gleichzeitig verschwinden,
holst du alles mit einer Anmeldung zurück.

Bis das eingerichtet ist, läuft die App **rein lokal**. Sie sagt das auf dem
Startbildschirm auch deutlich, statt Sicherheit vorzutäuschen.

---

## 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) anmelden, **New project**.
2. Name frei wählen, Region **Frankfurt (eu-central-1)** — kürzeste Wege, und die Daten
   bleiben in der EU.
3. Das Datenbank-Passwort wird nur für direkte Datenbankzugriffe gebraucht. Trotzdem
   aufschreiben.

Der kostenlose Tarif reicht mit großem Abstand: Unser Datenvolumen liegt bei etwa
10 MB in zehn Jahren für zwei Nutzer.

> Anders als bei Render wird ein Supabase-Projekt im Gratistarif nicht nach 30 Tagen
> gelöscht — es wird nach etwa einer Woche ohne Zugriff nur pausiert und beim nächsten
> Öffnen wieder gestartet. Da wir mehrmals pro Woche trainieren, passiert das nicht.

## 2. Schema einspielen

Im Projekt links auf **SQL Editor → New query**, den vollständigen Inhalt von
`supabase/migrations/0001_init.sql` einfügen und **Run**.

Das legt an:

| Was | Wozu |
|---|---|
| Tabelle `records` | eine Zeile pro Datensatz, Inhalt als `jsonb` |
| Row Level Security | die Trennung der beiden Profile, von der Datenbank erzwungen |
| `upsert_records` | idempotentes Hochladen — derselbe Satz zweimal gesendet erzeugt keinen Doppeleintrag |

Prüfen — nicht über die Oberfläche, deren Beschriftung sich zwischen Versionen
verschiebt, sondern per Abfrage im SQL Editor:

```sql
select
  (select relrowsecurity from pg_class where oid = 'public.records'::regclass)
    as rls_aktiv,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'records')
    as anzahl_policies,
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'upsert_records')
    as upsert_funktion;
```

Erwartet: `true`, `3`, `1`. Weicht etwas ab, die Migration noch einmal vollständig
ausführen.

Danach die Funktion **wirklich aufrufen** — das ist die aussagekräftigere Prüfung:

```sql
select * from public.upsert_records('[]'::jsonb);
```

Erwartet: *Success. No rows returned.* Postgres plant den Körper einer Funktion erst
beim Aufruf; sie kann sich also fehlerfrei anlegen lassen und beim ersten Gebrauch
abbrechen.

## 3. Zugangsdaten in die App

Unter **Settings → API** zwei Werte kopieren:

* **Project URL**
* **Project API keys → `anon` `public`**

Im Projektordner `.env.example` nach `.env` kopieren und beide Werte einsetzen.

> Der `anon`-Schlüssel ist dafür gemacht, öffentlich zu sein — er sagt nur „ich bin
> diese App". Was ein Konto tatsächlich sehen darf, entscheidet ausschließlich Row
> Level Security. Der **`service_role`**-Schlüssel umgeht RLS und darf niemals in die
> App, ins Repository oder in eine Nachricht.

Danach `npm run dev` neu starten — Vite liest `.env` nur beim Start.

## 4. Zwei Konten anlegen

Die App zeigt jetzt einen Anmeldebildschirm. Für jeden von euch **einmal** „Konto
anlegen" mit eigener E-Mail.

Bequemer wird es, wenn du in Supabase unter **Authentication → Providers → Email** die
Option **Confirm email** ausschaltest. Dann funktioniert die Anmeldung sofort ohne
Bestätigungs-Mail. Das ist hier vertretbar: Es gibt genau zwei bekannte Nutzer.

**Warum überhaupt Konten?** Nicht wegen Fremden — sondern weil das Konto die
Profilkennung liefert. Sie ist der Name der lokalen Datenbank *und* das Feld, an dem
die Datenbank die beiden Profile trennt. Wäre die Kennung lokal erzeugt, wäre nach
einem Totalverlust nicht mehr feststellbar, wessen Fortschritt in der Cloud liegt.

## 5. Prüfen, dass es wirklich funktioniert

Diesen Test einmal wirklich durchführen — eine ungeprüfte Sicherung ist keine.

1. Eine Einheit trainieren, mindestens ein paar Sätze eintragen.
2. Auf „Heute" den Abschnitt **Sicherung** aufklappen. Es muss stehen:
   *Noch nicht hochgeladen: nichts* und *Zuletzt hochgeladen: gerade eben*.
3. In Supabase unter **Table Editor → records** nachsehen: Die Sätze sind da.
4. Jetzt der eigentliche Test — **Totalverlust nachstellen**: in den
   Browser-Entwicklerwerkzeugen unter *Application → Storage* alles löschen (IndexedDB
   **und** Local Storage).
5. App neu laden, anmelden.
6. Im Abschnitt **Sicherung** auf **Aus der Cloud zurückholen** tippen.

Alles ist wieder da: Trainings, Sätze, Check-ins, Messwerte und die Begründung jeder
Anpassung.

## 6. Die dritte Ebene: eine Datei, die dir gehört

Cloud allein ist nicht genug. Sie schützt nicht gegen: vergessenes Passwort, versehentlich
gelöschtes Projekt, eingestellten Anbieter.

Deshalb gibt es im Abschnitt **Sicherung** den Knopf **Sicherungsdatei herunterladen**.
Die Datei ist lesbares JSON, beschreibt sich selbst und enthält alles — auch eine
spätere, völlig andere App kann sie einlesen. Leg sie ab und zu in deine eigene Cloud
oder auf einen Stick.

**Empfehlung:** einmal im Monat, und immer vor größeren Umbauten an der App.

---

## 7. Den Coach-Chat einschalten (optional)

Alles bisher Beschriebene funktioniert ohne diesen Schritt. Der Chat ist der einzige
Teil der App, der Geld kostet und Internet braucht.

### Was du brauchst

Einen **Anthropic-API-Schlüssel** — das ist **nicht** dasselbe wie ein Claude-Abo. Das
Abo bezahlt die Chat-Oberfläche von Anthropic, der API-Schlüssel bezahlt Anfragen aus
eigenen Programmen. Beides ist getrennt.

Anlegen musst du ihn selbst unter `console.anthropic.com` → **API keys**. Ich lege
keine Konten an und fasse den Schlüssel nicht an.

**Der Schlüssel darf nirgends in die App.** Nicht in `.env`, nicht in eine
`VITE_…`-Variable, nicht ins Repository. Alles, was mit `VITE_` beginnt, wird in das
Bundle gebaut und ist damit öffentlich. Der Schlüssel gehört ausschließlich auf den
Server.

### Was es kostet

Die App fragt Claude Opus 5 (5 $ je Million Token hinein, 25 $ hinaus). Eine Frage
schickt den ganzen Trainingskontext mit — rund 1000 Token — plus den Gesprächsverlauf.
Als Größenordnung: **etwa 3 bis 5 Cent pro Nachricht.** Zwanzig Fragen im Monat sind
unter einem Euro.

Der unveränderliche Teil des Systemtexts wird zwischengespeichert und kostet ab der
zweiten Frage nur ein Zehntel. Wer günstiger will, ändert in
`supabase/functions/coach/index.ts` die Zeile `const MODEL` auf `'claude-sonnet-5'` —
etwa ein Drittel der Kosten, merkbar schwächer bei Rückfragen zum Verlauf.

Setz dir im Anthropic-Konto ein **Ausgabenlimit**. Dann kann kein Fehler und kein
Vertippen mehr kosten als du erlaubst.

### Einrichten

Beides braucht die Supabase-CLI (`npm i -g supabase`, dann `supabase login` und
`supabase link --project-ref <deine-ref>`):

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

```bash
supabase functions deploy coach
```

Danach im Coach-Tab eine Frage stellen. Kommt „Auf dem Server fehlt
ANTHROPIC_API_KEY", war der erste Befehl nicht erfolgreich.

### Was der Chat darf und was nicht

| | |
|---|---|
| Fragen beantworten | zu Plan, Verlauf, Volumen, Übungen, Ernährungszielen |
| Schwerpunkt setzen | ±2 Sätze pro Woche für einen Muskel, höchstens drei gleichzeitig |
| Übung ablehnen | fällt beim nächsten Planaufbau weg, Ersatz kommt automatisch |
| **Nicht:** Split, Trainingstage, Ziel, Kalorien ändern | das geht über Profil und Check-in |
| **Nicht:** Trainingsdaten anfassen | Sätze, Gewichte und Verlauf sind für den Chat unerreichbar |

Der Gesprächsverlauf liegt **nur auf dem Gerät** und wird nicht übertragen. Was am Plan
geändert wurde, steht dagegen im Anpassungsprotokoll — das wird synchronisiert und ist
in der Sicherungsdatei enthalten.

---

## Was in welcher Lage passiert

| Lage | Verhalten |
|---|---|
| Training ohne Netz | Jeder Satz geht sofort in die lokale Ablage, die Statuszeile zeigt „Offline". Nichts blockiert. |
| Netz kommt zurück | Automatisch beim `online`-Ereignis, beim Öffnen der App und spätestens alle 30 s. |
| Netz während des Trainings | Jeder Satz wird direkt nach dem Eintragen hochgeladen. |
| Hochladen scheitert | Der Eintrag bleibt in der Warteschlange, Wartezeit verdoppelt sich bis maximal 5 Minuten. Nichts geht verloren. |
| Zwei Geräte | Die Datensatz-Kennungen kommen vom Gerät und sind eindeutig. Beim Zusammenführen gewinnt der neuere Stand. |
| App abgeschmiert | Die lokale Ablage bleibt. Beim Öffnen läuft die Warteschlange weiter. |
| Alles weg | Anmelden, „Aus der Cloud zurückholen". |
| Lokal Neueres vorhanden | Wird beim Zurückholen **nicht** überschrieben — ein neuerer lokaler Stand bleibt stehen. |
