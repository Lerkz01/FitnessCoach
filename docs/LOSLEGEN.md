# Loslegen — von hier bis zum ersten echten Training

Rechne mit **35–45 Minuten**. Die Reihenfolge ist nicht beliebig: Die Cloud-Zugangsdaten
werden beim *Bauen* der App eingebacken, nicht beim Starten. Wer erst veröffentlicht und
dann Supabase einrichtet, muss noch einmal von vorn bauen.

Nach Phase 2 kannst du die App schon auf dem Rechner benutzen. Phase 3–5 bringt sie aufs
Handy.

---

## Phase 1 · Supabase einrichten (~10 Min)

**1.1** Auf [supabase.com](https://supabase.com) anmelden → **New project**

* Name: `fitness-coach`
* Database Password: erzeugen lassen und **aufschreiben** (brauchst du selten, aber
  wenn, dann dringend)
* Region: **Central EU (Frankfurt)** — kurze Wege, Daten bleiben in der EU
* **Create new project**, dann etwa zwei Minuten warten

**1.2** Links **SQL Editor** → **New query**. Den vollständigen Inhalt von
`supabase/migrations/0001_init.sql` einfügen und **Run** (oder Strg+Enter).

Erwartete Antwort: *Success. No rows returned.*

**1.3** Prüfen, dass alles angekommen ist. Die Anzeige „RLS enabled" wandert zwischen
Supabase-Versionen — deshalb nicht danach suchen, sondern im **SQL Editor** eine neue
Abfrage absetzen:

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

Richtig ist genau das:

| rls_aktiv | anzahl_policies | upsert_funktion |
|---|---|---|
| `true` | `3` | `1` |

Damit sind alle drei Dinge geprüft, die das Skript anlegen musste: die Zeilensicherheit,
die drei Zugriffsregeln und die Upload-Funktion.

Stimmt etwas nicht, die Datei einfach noch einmal **vollständig** ausführen — sie ist so
geschrieben, dass mehrfaches Ausführen nichts kaputt macht. Steht `upsert_funktion` auf
`0`, war wahrscheinlich nur der obere Teil markiert; die Funktion steht weit unten.

> RLS ist nicht Formsache: Sie ist die einzige Stelle, an der eure beiden Profile
> getrennt werden. Ohne sie könnte jedes angemeldete Konto die Daten des anderen lesen.

**1.3b** Und noch eine Abfrage — die wichtigere. Die obige prüft nur, ob die Funktion
*existiert*. Diese ruft sie tatsächlich auf:

```sql
select * from public.upsert_records('[]'::jsonb);
```

Erwartete Antwort: *Success. No rows returned.*

Der Unterschied ist nicht akademisch: Postgres prüft den Körper einer Funktion erst beim
**Aufruf**, nicht beim Anlegen. Eine Funktion kann sich anstandslos anlegen lassen und
beim ersten echten Gebrauch abbrechen — genau das ist beim Einrichten passiert
(`column reference "id" is ambiguous`).

Kommt hier ein Fehler, spiel `supabase/migrations/0002_upsert_variable_conflict.sql`
ein und wiederhole die Abfrage.

**1.4** Links **Authentication** → **Sign In / Providers** → **Email** aufklappen →
**Confirm email** **ausschalten** → **Save**.

> Damit funktioniert die Anmeldung sofort ohne Bestätigungs-Mail. Vertretbar, weil es
> genau zwei bekannte Nutzer gibt.

**1.5** Links unten **Project Settings** → **API**. Zwei Werte kopieren:

| Was | Wo |
|---|---|
| **Project URL** | oben, sieht aus wie `https://abcdefgh.supabase.co` |
| **Der öffentliche Schlüssel** | je nach Projektalter `anon` `public` oder **Publishable key** |

> ⚠️ **Nicht** den `service_role`- bzw. **Secret**-Schlüssel nehmen. Der umgeht alle
> Zugriffsregeln und gehört nie in eine App. Der öffentliche Schlüssel ist dafür
> gemacht, öffentlich zu sein — was ein Konto sehen darf, entscheidet allein die
> Datenbank.

---

## Phase 2 · Auf dem Rechner prüfen (~10 Min)

**2.1** Im Projektordner `E:\Fitness-Coach` die Vorlage kopieren:

```bash
cp .env.example .env
```

**2.2** `.env` in einem Editor öffnen und beide Werte einsetzen:

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=hier-der-oeffentliche-schluessel
```

Keine Anführungszeichen, kein Schrägstrich am Ende der URL.

**2.3** Entwicklungsserver starten:

```bash
npm run dev
```

**2.4** [http://localhost:5173](http://localhost:5173) öffnen. Es muss jetzt ein
**Anmeldebildschirm** kommen. Tut er das nicht, sondern es geht direkt ins Onboarding,
dann wurde `.env` nicht gelesen — Server stoppen und neu starten, Vite liest die Datei
nur beim Start.

**2.5** **Noch kein Konto? Anlegen** → deine E-Mail, Passwort mit mindestens 6 Zeichen.
Danach anmelden.

**2.6** Onboarding durchlaufen, 20 Fragen. Bei den Referenzgewichten (Schritt 17)
ehrlich schätzen: ein Gewicht, das du für die angegebenen Wiederholungen **sicher**
schaffst — nicht dein Maximum. Die App messt sich in den ersten Einheiten selbst ein.

**2.7** Eine Einheit starten und ein paar Sätze eintragen. Dann auf **Heute** den
Abschnitt **Sicherung** aufklappen. Dort muss stehen:

* *Noch nicht hochgeladen: nichts*
* *Zuletzt hochgeladen: gerade eben*

**2.8** Der Beweis: In Supabase unter **Table Editor** → `records` nachsehen. Deine
Sätze sind da.

**Wenn das klappt, funktioniert die ganze Kette.** Alles Weitere ist nur noch
Verpackung.

> Meine Testdaten („Luca", zwei Einheiten) liegen in einer separaten lokalen Datenbank
> und tauchen nicht auf — jedes Konto bekommt eine eigene. Sie stören nicht, du kannst
> sie ignorieren.

---

## Phase 3 · Auf GitHub bringen (~5 Min)

Das Repository ist lokal fertig, zwei Commits stehen. Es fehlt nur die Gegenstelle.

**3.1** Auf [github.com](https://github.com) → **New repository**

* Name: `fitness-coach`
* **Private** auswählen
* **Keine** Häkchen bei README, .gitignore oder Lizenz — die gibt es schon
* **Create repository**

**3.2** Im Projektordner, mit deinem GitHub-Namen:

```bash
git remote add origin https://github.com/DEIN-NAME/fitness-coach.git
```

```bash
git branch -M main && git push -u origin main
```

Beim Push fragt Git nach Zugangsdaten. Unter Windows öffnet der Credential Manager
meist ein Browserfenster — dort einfach anmelden. Kommt stattdessen eine Passwortfrage
im Terminal: GitHub akzeptiert kein Kontopasswort, sondern einen **Personal Access
Token** (github.com → Settings → Developer settings → Tokens (classic) → *repo*-Recht).

`.env` wird nicht mit hochgeladen, sie steht in `.gitignore`.

---

## Phase 4 · Veröffentlichen (~10 Min)

**4.1** Auf [render.com](https://render.com) anmelden → **New** → **Blueprint**

**4.2** GitHub verbinden, Repository `fitness-coach` auswählen. Render liest
`render.yaml` und schlägt einen Dienst vor.

**4.3** Render fragt nach den beiden Variablen. Dieselben Werte wie in `.env`:

* `VITE_SUPABASE_URL`
* `VITE_SUPABASE_ANON_KEY`

**4.4** **Apply**. Der Build läuft etwa zwei Minuten. Danach steht oben die Adresse,
etwa `https://fitness-coach.onrender.com`.

**4.5** Adresse im Browser öffnen. Wieder der Anmeldebildschirm — mit demselben Konto
anmelden. Dein Profil und deine Sätze sind da, weil sie aus der Cloud kommen.

> Zeigt die veröffentlichte App stattdessen „Nur auf diesem Gerät gespeichert", waren
> die Variablen beim Build nicht gesetzt. In Render **Manual Deploy** →
> **Deploy latest commit**.

---

## Phase 5 · Aufs Handy (~5 Min)

**5.1** Die Render-Adresse auf dem Handy öffnen.

**Android (Chrome):** Menü (drei Punkte) → **App installieren**. Chrome fragt oft von
selbst.

**iPhone (Safari):** Teilen-Symbol → **Zum Home-Bildschirm**. Das geht **nur in
Safari** — Chrome auf iOS kann es nicht.

**5.2** App vom Homescreen starten. Sie muss ohne Adressleiste im Vollbild laufen.
Anmelden.

**5.3** Für deine Freundin dasselbe auf ihrem Handy, aber mit **eigener E-Mail**. Zwei
Konten, zwei getrennte Profile — das erzwingt die Datenbank, nicht die App.

---

## Phase 6 · Prüfen, dass es hält (~5 Min)

Diese vier Schritte einmal wirklich machen. Eine ungeprüfte Sicherung ist keine.

**6.1 Offline starten** — Flugmodus an, App vom Homescreen starten. Sie muss
vollständig laden.

**6.2 Offline trainieren** — ein paar Sätze eintragen. Oben erscheint „Offline", die
Sätze werden gespeichert.

**6.3 Netz zurück** — Flugmodus aus. Innerhalb von Sekunden verschwindet die Zeile.
Unter **Sicherung**: *Noch nicht hochgeladen: nichts*.

**6.4 Der Totalverlust** — am besten am Rechner:

1. Entwicklerwerkzeuge öffnen (F12) → Reiter **Application**
2. **Storage** → **Clear site data** (löscht IndexedDB *und* Local Storage)
3. Seite neu laden → anmelden
4. **Sicherung** → **Aus der Cloud zurückholen**

Alles ist wieder da: Trainings, Sätze, Check-ins, Messwerte und die Begründung jeder
Anpassung.

**6.5** Einmal **Sicherungsdatei herunterladen** und irgendwohin legen, wo du sie
wiederfindest. Das ist die Ebene, die auch dann noch hält, wenn das Supabase-Konto
verloren geht.

---

## Wenn etwas nicht klappt

| Symptom | Ursache |
|---|---|
| Kein Anmeldebildschirm, direkt Onboarding | `.env` fehlt oder Server nicht neu gestartet |
| „Keine Verbindung. Bei der ersten Anmeldung brauchst du Internet." | URL falsch — muss mit `https://` beginnen und ohne Schrägstrich enden |
| „E-Mail oder Passwort stimmt nicht" beim ersten Mal | Konto noch nicht angelegt — erst **Konto anlegen** |
| „Die E-Mail ist noch nicht bestätigt" | Schritt 1.4 nachholen oder in das Postfach schauen |
| Sätze bleiben in der Warteschlange | SQL aus Schritt 1.2 nicht vollständig gelaufen — `upsert_records` fehlt |
| Render-Build scheitert | Build-Log lesen. Meist eine fehlende Variable oder ein alter Commit |
| Veröffentlichte App sagt „nur lokal" | Variablen beim Build nicht gesetzt → Manual Deploy |
| iPhone bietet kein Installieren | Nur Safari kann das, nicht Chrome |

---

## Danach

Trainiere ein paar Wochen und schreib auf, was stört. Was fehlt, weiß ich schon:
„Gerät besetzt"-Übungstausch, monatlicher Check-in mit Umfängen, Regelkreis 4,
Übungsanleitungen. Was davon dich zuerst nervt, weiß nur du.

Beim wöchentlichen Check-in ist eine Frage wichtiger als die anderen: **wie gut du das
Kalorienziel getroffen hast**. Antworte da ehrlich statt gut — die App verstellt die
Kalorien nur, wenn die Vorgabe umgesetzt war. Sonst korrigiert sie eine Zahl, die nie
gewirkt hat.
