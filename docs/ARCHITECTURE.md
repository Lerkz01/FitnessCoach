# Architektur, Datenhaltung & Betrieb

> **Zweck:** Wie die App läuft, wie Daten offline und in der Cloud gespeichert werden,
> und wie der Trainingsfortschritt **unabhängig von dieser App** gesichert wird.
>
> **Stand:** 2026-08-06
>
> **Anforderungen des Nutzers, die hier beantwortet werden:**
> 1. Trainings-Tracking muss **komplett offline** funktionieren (KI-Chat darf ausfallen)
> 2. Alles muss **in der Cloud** liegen — App-Absturz darf keinen Fortschritt kosten
> 3. Daten müssen **app-unabhängig** gespeichert sein — bei einer künftigen Neuentwicklung
>    muss der Fortschritt wieder eingelesen werden können
> 4. **Zwei Profile**, komplett unabhängig und getrennt gespeichert

---

## 1. Das Grundprinzip: Rohdaten sind die Wahrheit

Die wichtigste Architekturentscheidung, aus der alles andere folgt:

> **Gespeichert werden nur Rohdaten. Alles Abgeleitete wird berechnet, nie gespeichert.**

| Wird gespeichert (Wahrheit) | Wird berechnet (jederzeit neu) |
|---|---|
| Jeder Satz: Gewicht, Wiederholungen, Abgleich, Zeitstempel | e1RM, Volumenlast, Rekorde |
| Jeder Check-in: Gewicht, Optik, Energie, Schlaf … | Gewichtstrend, gleitende Mittel |
| Jede Messung: Umfänge, Fotos | Fortschrittskurven, Diagramme |
| Die *verordnete* Vorgabe pro Satz | Progressions-Status, nächste Vorgabe |
| Jede Anpassung + **Begründung** | Volumen pro Muskelgruppe (fraktional) |

**Warum das der Kern der App-Unabhängigkeit ist:**

Eine neue oder umgebaute App braucht nur den Rohdaten-Log — sie rechnet alles daraus
neu. Hätten wir stattdessen den *Zustand* gespeichert („Bankdrücken steht bei Stufe 7
der Progression"), wäre das an unsere heutige Logik gekettet und in einer neuen App
bedeutungslos.

**Angenehmer Nebeneffekt:** Wenn wir die Progressionslogik später verbessern, können wir
die **gesamte Historie neu durchrechnen** — weil die Rohdaten noch da sind. Mit
gespeichertem Zustand ginge das nicht.

### 1.0 Aufwachen aus dem Hintergrund

Ein gesperrtes Handy ist der Normalfall, nicht die Ausnahme: Zwischen zwei Sätzen geht
der Bildschirm aus. Die App muss das überleben, ohne etwas zu tun.

**Ein erneuertes Token ist kein Nutzerwechsel.** Supabase erneuert das Zugangstoken,
sobald die App wieder sichtbar wird, und meldet das über denselben Kanal wie An- und
Abmelden. Wer daraufhin bedingungslos auf „Laden" schaltet, hängt fest: Das Laden wird
von einer Änderung der Profilkennung ausgelöst, und die hat sich beim Token-Erneuern
nicht geändert. Genau das ist passiert — nach dem Aufwecken zeigte die App nur noch
„Lade …" und ließ sich nur durch einen Neustart retten.

Deshalb entscheidet `screenAfterAuthChange()` anhand der Kennung:

| vorher → nachher | Folge |
|---|---|
| Kennung unverändert | **nichts anfassen** — nur ein neues Token |
| andere oder erste Kennung | neu laden |
| keine Kennung mehr | Anmeldung zeigen |

**Ein Ladezustand darf nie endgültig sein.** Scheitert das Laden, zeigt die App den
Fehler und einen Knopf zum Wiederholen. Ein stummes, dauerhaftes „Lade …" ist der
schlechteste denkbare Zustand: Es erklärt nichts und lässt sich nur durch einen
Neustart auflösen.

### 1.1 Datumsregeln — die Achse jeder Zeitreihe

Weil alles Abgeleitete aus Zeitreihen entsteht, entscheidet die Datumsbehandlung über
die Richtigkeit fast aller Auswertungen. Drei Regeln, jede aus einem echten Fehler:

**Kalendertage sind LOKAL, nie UTC.**
`stamp.slice(0, 10)` auf einen ISO-Zeitstempel liefert den UTC-Tag. In Deutschland
liegt der lokale Tag ein bis zwei Stunden voraus — ein Eintrag von 00:55 lokaler Zeit
trägt in UTC noch das Datum des Vortags. Ein Check-in nach Mitternacht rutschte damit
*vor* das Onboarding, und der Fortschritt zeigte „−0,4 kg", obwohl das Gewicht
gestiegen war. Dafür gibt es `localDayOf()`; `slice(0, 10)` ist in Datumslogik
verboten.

**Bei gleichem Tag entscheidet `createdAt`.**
Mehrere Einträge am selben Tag sind der Normalfall: Wer sich einrichtet und noch am
selben Tag den ersten Check-in macht, hat zwei Gewichte mit demselben Datum. Ohne
Zweitschlüssel ist ihre Reihenfolge beliebig. Dafür gibt es `chronologically()`.

**Das Datum eines Datensatzes ist der Tag seiner Entstehung, nicht der Zeitraum, den
er beschreibt.**
Das Wochengewicht eines Check-ins wird auf den Tag der Abgabe datiert, nicht auf den
Wochenanfang — sonst läge ein Check-in vom Sonntag vor einem Onboarding vom Donnerstag
derselben Woche. Die Wochenzuordnung steckt im `weekOf`-Feld des Check-ins, nicht in
der Zeitachse der Messreihe.

---

## 2. Gesamtarchitektur

```
┌──────────────────────────────────────────────────────────┐
│  HANDY / PC  —  PWA (React)                              │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ IndexedDB  =  vollständige lokale Kopie            │  │
│  │ • Training funktioniert 100 % offline              │  │
│  │ • Jeder Satz sofort gespeichert (nicht am Ende!)   │  │
│  │ • Sync-Warteschlange für noch nicht Übertragenes   │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Service Worker  =  App startet auch ohne Netz      │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────┬──────────────────────────────────┘
                        │  Sync (wenn online, im Hintergrund)
                        ▼
┌──────────────────────────────────────────────────────────┐
│  CLOUD                                                   │
│                                                          │
│  PostgreSQL      → die zentrale Kopie aller Rohdaten     │
│  Auth            → Login, zwei getrennte Konten          │
│  Row Level Sec.  → Profil-Trennung auf DB-Ebene          │
│  Storage         → automatische Export-Archive           │
│  Edge Function   → KI-Proxy (hält den Claude-Schlüssel)  │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│  EXPORT-ARCHIV  (dir gehörend, app-unabhängig)           │
│  JSON + CSV · wöchentlich automatisch · jederzeit manuell│
│  → ablegbar in deiner eigenen Cloud (Drive/Dropbox)      │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Offline-First: wie das Training ohne Netz funktioniert

### Schreibweg

```
Nutzer tippt „10 Wdh" an
   ↓  (sofort, < 10 ms)
1. Satz wird in IndexedDB geschrieben        ← ab hier ist er sicher
2. Eintrag in die Sync-Warteschlange
3. UI aktualisiert, Pausen-Timer startet
   ↓  (Sekunden später, im Hintergrund)
4. Warteschlange wird an die Cloud übertragen
5. Eintrag als „synchronisiert" markiert
```

**Es gibt keinen Zeitpunkt, an dem ein Satz „noch nicht gespeichert" ist.** Auch nicht
für eine Sekunde. Absturz, Akku leer, App weggewischt — der Satz ist da.

### Der Upload läuft live, nicht am Ende

| Situation | Verhalten |
|---|---|
| **Internet während des Trainings vorhanden** | Jeder Satz geht **innerhalb von Sekunden** nach dem Loggen in die Cloud. Nicht gesammelt, nicht erst am Trainingsende — Satz für Satz. |
| **Kein Internet** | Sätze bleiben in der Warteschlange. Das Training läuft völlig normal weiter, ohne Hinweis oder Verzögerung. |
| **Internet kommt mitten im Training zurück** | Die Warteschlange wird **automatisch** und sofort abgearbeitet, ohne Zutun. Ab dann läuft es wieder live. |
| **App wird geschlossen, Warteschlange nicht leer** | Übertragung passiert beim nächsten Öffnen automatisch — und, wo der Browser es unterstützt, über Background Sync auch schon vorher. |

**Umsetzung:**
- Der Upload ist **fire-and-forget**: Er läuft asynchron und blockiert das Loggen niemals.
  Auch ein hängender Upload verzögert keinen Satz und keinen Timer.
- Ausgelöst wird die Warteschlangen-Abarbeitung durch: neuen Eintrag · `online`-Ereignis
  des Browsers · App wird wieder sichtbar (`visibilitychange`) · Timer alle 30 Sekunden
  als Rückfalloption · Background Sync des Service Workers, wo verfügbar
- Fehlgeschlagene Uploads werden mit **exponentieller Verzögerung** wiederholt und
  bleiben in der Warteschlange, bis sie bestätigt sind
- Die Übertragung ist **idempotent**: Jeder Satz hat eine geräteseitig erzeugte UUID.
  Ein doppelt gesendeter Satz erzeugt keinen Duplikat-Eintrag

### Sichtbar für den Nutzer, aber unaufdringlich

Im Workout-Header steht ein kleiner Status:

| Anzeige | Bedeutung |
|---|---|
| ☁︎ | alles in der Cloud |
| ☁︎ 3 | 3 Sätze warten auf Übertragung |
| ☁︎ ⚠ | offline — wird nachgeholt |

Kein Dialog, keine Warnung, kein Blockieren. Der Nutzer soll sehen können, dass alles
angekommen ist — sich aber nie darum kümmern müssen.

### Was offline funktioniert und was nicht

| Funktion | Offline |
|---|---|
| Training durchführen und loggen | ✅ vollständig |
| Pausen-Timer | ✅ |
| Progression berechnen (Kreis 1 + 2) | ✅ läuft lokal |
| Übung tauschen (Gerät belegt) | ✅ regelbasiert, lokal |
| Übungsdatenbank, Anleitungen | ✅ liegt lokal in der App |
| Fortschritts-Diagramme, Historie | ✅ aus lokalen Daten |
| Check-in ausfüllen | ✅ wird nachgereicht |
| Ernährungsziele ansehen | ✅ |
| **KI-Chat** | ❌ braucht Internet |

Bewusst so gebaut: **Die KI ist nirgends ein Nadelöhr.** Der Übungstausch läuft
regelbasiert und offline; die KI ist nur für Erklärungen und freie Anliegen zuständig.

### Warum die Synchronisation konfliktfrei ist

Der Trainings-Log ist **append-only** — es werden nur neue Zeilen angelegt, nie
bestehende überschrieben. Jede Zeile bekommt beim Anlegen auf dem Gerät eine eigene
UUID.

Konsequenz: **Zwei Geräte können sich nicht in die Quere kommen.** Wenn du auf dem Handy
loggst und später am PC etwas anschaust, gibt es nichts zusammenzuführen — es sind
verschiedene Zeilen. Korrekturen sind neue Zeilen, die alte ersetzen; Löschungen sind
Markierungen (`deleted_at`), keine echten Löschungen.

Nur *veränderliche* Dinge (Profileinstellungen) nutzen „letzte Änderung gewinnt" — und
dort ist ein Konflikt harmlos.

---

## 4. Drei Speicherebenen (die Antwort auf „nichts darf weg sein")

| Ebene | Wo | Wann | Schützt gegen |
|---|---|---|---|
| **1 · Gerät** | IndexedDB im Browser | sofort bei jedem Satz | App-Absturz, Akku leer, kein Netz |
| **2 · Cloud** | PostgreSQL | bei jedem Sync (Sekunden) | Handy verloren/kaputt, Browserdaten gelöscht, Gerätewechsel |
| **3 · Archiv** | JSON/CSV-Datei | wöchentlich automatisch + jederzeit manuell | Cloud-Anbieter weg, Account verloren, App-Neuentwicklung |

Ebene 3 ist die entscheidende für deine Anforderung. Sie ist eine **Datei, die dir
gehört** — kein Dienst, kein Konto, keine Abhängigkeit von uns.

### Ausfallszenarien konkret

| Was passiert | Folge |
|---|---|
| App stürzt mitten im Training ab | Nichts verloren. Beim Öffnen: „Training fortsetzen?" |
| Handy im Keller ohne Netz | Alles funktioniert, Sync läuft später automatisch nach |
| Handy verloren oder kaputt | Neues Gerät → einloggen → vollständige Wiederherstellung |
| Browserdaten gelöscht | Wie oben |
| Cloud-Projekt pausiert (Inaktivität) | Daten bleiben erhalten, erste Anfrage weckt es |
| Cloud-Anbieter oder Account komplett weg | Export-Archiv einlesen — vollständige Wiederherstellung |
| Wir bauen die App neu | Export einlesen, alles rekonstruiert (§5) |
| Progressionslogik wird verbessert | Historie kann komplett neu durchgerechnet werden |

### 4.1 Die vier Bedingungen der Zusage

„Fortschritt geht nie verloren" ist nur so belastbar wie die vier Stellen, an denen es
schiefgehen kann. Jede davon ist eine bewusste Entscheidung, keine Selbstverständlichkeit
— und drei davon waren beim ersten Bauen falsch.

**1. Die Profilkennung muss aus dem KONTO kommen, nicht vom Gerät.**
Die lokale Datenbank heißt `fitness-coach.<userId>`, und jeder Datensatz trägt dieselbe
Kennung. Wäre sie lokal erzeugt, verschwände sie beim Totalverlust mit — beim nächsten
Start entstünde eine neue, und die aus der Cloud geladenen Datensätze trügen eine
andere. Der Fortschritt wäre da, aber nicht zuordenbar. Deshalb ist die Anmeldung nicht
Schutz vor Fremden, sondern die Voraussetzung der Wiederherstellbarkeit.

**2. Das Hochladen muss bestätigt werden — auch wenn nichts zu tun war.**
`upsert_records` schrieb ursprünglich mit `returning`, das nur TATSÄCHLICH geschriebene
Zeilen liefert. Ein Datensatz, den der Server schon in dieser Fassung hat, fiel durch
die „nur wenn neuer"-Bedingung und kam nicht zurück. Die App hielt ihn für nicht
angekommen und sendete ihn endlos erneut — die Warteschlange wäre nie leer geworden,
und die Anzeige „alles gesichert" hätte es nie gegeben. Bestätigt wird jetzt getrennt
vom Schreiben: alles, was serverseitig mindestens auf dem gesendeten Stand ist.

**3. Ein nicht bestätigter Datensatz darf weder verschwiegen noch aussortiert werden.**
Aussortieren verliert ihn. Verschweigen lässt den Versuchszähler auf 0, dann greift die
Wartezeit nicht — und weil nach jedem Satz ein Abgleich angefragt wird, entsteht ein
Wiederholungssturm. Er wird deshalb als *vorübergehend* fehlgeschlagen gemeldet.

**4. Zurückgeholtes darf lokal Neueres nicht überschreiben.**
`putRemoteRecord` überschrieb bedingungslos. Wer noch nicht hochgeladene Sätze hat und
die Wiederherstellung antippt, hätte sie damit verloren — die Rettung hätte die Arbeit
vernichtet, die sie retten soll. Die Bedingung sitzt jetzt an der einen Stelle, durch
die alles von außen Kommende muss.

Dazu eine Falle bei der Wiederherstellung selbst: Supabase liefert höchstens 1000 Zeilen
pro Abfrage. Ohne seitenweisen Abruf fehlte der Rest — **ohne jeden Fehler**. Stiller
Teilverlust genau beim Retten wäre der schlimmste denkbare Fall.

---

## 5. Der app-unabhängige Export (Kernstück)

### Format

Eine **selbsterklärende JSON-Datei** plus CSVs für Tabellenkalkulation:

```jsonc
{
  "schema_version": "1.0",          // versioniert → künftige Apps wissen, was sie lesen
  "exported_at": "2026-08-06T18:00:00Z",
  "app_version": "0.4.2",
  "profile_id": "…",

  // ── Referenzdaten: macht die Datei selbst-erklärend ──
  "equipment_reference": [ /* Snapshot aller 61 Geräte */ ],
  "exercises_reference": [ /* Snapshot aller Übungen mit IDs, Muskeln, Geräten */ ],

  // ── Rohdaten ──
  "profile":            { /* Onboarding-Antworten + Einstellungsverlauf */ },
  "sessions":           [ /* jede Einheit: Datum, Plan, Dauer, Status */ ],
  "set_logs":           [ /* JEDER Satz: verordnet + tatsächlich */ ],
  "checkins":           [ /* wöchentliche Rückmeldungen */ ],
  "measurements":       [ /* monatliche Umfänge */ ],
  "nutrition_targets":  [ /* Verlauf aller Kalorien-/Makrovorgaben */ ],
  "adjustments":        [ /* JEDE automatische Anpassung + Begründung */ ]
}
```

**Der entscheidende Trick: `exercises_reference` und `equipment_reference` sind im Export
enthalten.** Ohne sie wäre `BRU-001` in fünf Jahren bedeutungslos, falls sich die
Datenbank geändert hat. Mit ihnen ist die Datei **für sich allein verständlich** — sie
enthält ihr eigenes Wörterbuch.

### Beispiel: ein Satz-Datensatz

Jede Zeile enthält **Vorgabe und Realität** — deshalb ist die Historie später
nachvollziehbar und neu auswertbar:

```jsonc
{
  "id": "018f2c…",                  // UUID, auf dem Gerät erzeugt
  "session_id": "018f2b…",
  "exercise_id": "BRU-001",
  "exercise_name": "Langhantel Bankdrücken flach",
  "set_number": 3,
  "is_warmup": false,

  "prescribed_weight_kg": 82.5,     // was die App vorgab
  "prescribed_reps": 8,
  "prescribed_rir": 2,

  "actual_weight_kg": 82.5,         // was tatsächlich passiert ist
  "actual_reps": 9,
  "feedback": "genau_so",           // genau_so | mehr_drin | am_limit
  "rir_delta": 0,

  "logged_at": "2026-08-06T17:42:11Z",
  "device_id": "handy-luca"
}
```

### Wann exportiert wird

- **Automatisch wöchentlich** → in den Cloud-Speicher, plus Download-Hinweis
- **Manuell jederzeit** → Einstellungen → „Daten exportieren"
- **Vor jedem größeren App-Update** → automatisch, als Sicherheitsnetz
- Du kannst die Datei in deine **eigene Cloud** legen (Drive, Dropbox, Festplatte) —
  dann liegt eine Kopie völlig außerhalb unserer Reichweite

### Import

Der Import ist von Anfang an eingebaut, nicht nachträglich angeflanscht:
`Einstellungen → Daten importieren` liest eine Export-Datei und stellt alles wieder her.
Bei abweichender `schema_version` läuft eine dokumentierte Migration.

**Dass der Import existiert und funktioniert, ist die einzige echte Garantie dafür, dass
der Export brauchbar ist.** Ein Export, der nie eingelesen wurde, ist ein Versprechen —
kein Backup. Deshalb: Import wird in Phase 1 mitgebaut und getestet.

### Dokumentiertes Schema

Ein eigenes Dokument `DATA-SCHEMA.md` beschreibt jedes Feld, jede Einheit (kg, cm,
Sekunden, ISO-8601-Zeitstempel) und jeden Aufzählungswert. Damit kann eine künftige App —
oder ein Skript, oder Excel — die Datei lesen, ohne unseren Code zu kennen.

---

## 6. Die zwei Profile

**Anforderung: komplett unabhängig und getrennt gespeichert.** Umsetzung auf drei
Ebenen:

### Eigene Konten — technisch echt, im Alltag unsichtbar

Jedes Profil ist ein **eigenes Konto** (E-Mail + Passwort), kein gemeinsames Konto mit
Umschalter.

> **Warum überhaupt ein Login, wenn nur zwei Personen die App nutzen?**
>
> Weil der Login **der Trennmechanismus selbst ist.** Die RLS-Regel filtert auf
> `auth.uid()` — die Identität aus der Anmeldung. Ohne Login gibt es keine `uid`, und
> die Datenbank kann nicht entscheiden, wessen Zeilen sie herausgeben darf: dann ist
> entweder alles offen oder nichts nutzbar.
>
> Dazu: Eine Supabase-Datenbank ist aus dem Internet erreichbar, und der Client-Schlüssel
> in der App ist absichtlich öffentlich. Die gesamte Absicherung läuft über Auth + RLS.
> Ohne beide wäre die Datenbank für jeden lesbar **und beschreibbar**, der die URL kennt.

**Bewusst reibungsarm konfiguriert** (Anforderung: „muss nicht abgesichert sein, nur
getrennt und unterschiedlich benannt"):

| Entscheidung | Umsetzung |
|---|---|
| Anmeldung | **einmalig** pro Gerät — Sitzung wird unbegrenzt verlängert, danach nie wieder |
| Passwortregeln | keine (keine Mindestkomplexität, kein Ablauf) |
| E-Mail-Verifizierung | aus |
| Zwei-Faktor | aus |
| Registrierung | geschlossen — die zwei Konten werden einmal beim Einrichten angelegt |
| Anzeigename | frei wählbar, sichtbar im Header („Luca" / „…") |

Im Alltag heißt das: **App öffnen und trainieren.** Der Login erscheint genau einmal pro
Gerät und danach nicht mehr.

Weitere Vorteile der Konten-Trennung:
- Kein versehentliches Loggen aufs falsche Profil
- Getrennte Wiederherstellung und getrennter Export
- Passwörter nur als Hash (macht die Auth-Ebene automatisch)

### Trennung auf Datenbankebene (nicht nur im Code)

Jede Datenzeile trägt eine `user_id`. Durchgesetzt wird die Trennung per **Row Level
Security** — also von der Datenbank selbst, nicht von unserem Anwendungscode:

```sql
-- Beispielregel: jeder sieht ausschließlich eigene Zeilen
create policy "eigene_daten_nur"
  on set_logs for all
  using (user_id = auth.uid());
```

Das ist deutlich stärker als eine Prüfung im Anwendungscode: Selbst wenn wir einen
Programmierfehler machen und versehentlich fremde Daten abfragen, gibt die Datenbank
sie **nicht heraus**. Profil-Trennung wird damit zu einer Eigenschaft des Systems, nicht
zu einer Frage der Sorgfalt.

### Trennung auf dem Gerät

IndexedDB wird pro `user_id` in einem eigenen Namensraum geführt. Ein Profilwechsel auf
demselben Gerät mischt nichts.

### Was getrennt bleibt (also alles)

Plan · Trainings-Log · Check-ins · Messungen · Fotos · Ernährungsziele · Progression ·
KI-Chatverlauf · Einstellungen · Export.

Ein späteres **freiwilliges** Teilen (z. B. „gemeinsame Trainingstage sehen") wäre eine
zusätzliche Funktion — Standard ist vollständige Trennung.

---

## 7. Betrieb & Hosting

### Der Render-Befund

**Renders kostenlose PostgreSQL-Datenbank läuft nach 30 Tagen ab** und wird nach
weiteren 14 Tagen Kulanzfrist **samt aller Daten gelöscht**. Pro Konto ist genau eine
kostenlose Datenbank erlaubt — die du für Cohen-Bot vielleicht schon nutzt.

Für „mein Trainingsfortschritt darf nicht verloren gehen" ist das die falsche Grundlage.
Zwei Wege raus:

### Empfehlung: PWA statisch hosten + Supabase als Datenschicht

| Baustein | Wo | Kosten |
|---|---|---|
| PWA (statische Dateien) | Render **Static Site** oder Cloudflare Pages | 0 € — statische Seiten schlafen nicht ein, kein Kaltstart |
| PostgreSQL | Supabase Free (500 MB, **dauerhaft**) | 0 € |
| Login / Auth | Supabase Auth (eingebaut) | 0 € |
| Profil-Trennung | Supabase Row Level Security | 0 € |
| Export-Archive | Supabase Storage | 0 € |
| KI-Proxy (Claude-Schlüssel) | Supabase Edge Function | 0 € |
| Claude API | Anthropic, nach Verbrauch | wenige € / Monat |

**Warum Supabase statt Render-Datenbank:**
1. Daten laufen **nicht ab** (der ausschlaggebende Punkt)
2. **Auth ist eingebaut** — kein selbstgebautes Login, das ich falsch machen könnte
3. **Row Level Security** gibt die Profil-Trennung auf Datenbankebene (§6)
4. Wir brauchen **keinen eigenen Server** → weniger Teile, weniger Ausfälle, kein
   Kaltstart-Problem eines schlafenden Render-Web-Service

Nachteil: Ein Supabase-Free-Projekt pausiert nach etwa einer Woche **Inaktivität**. Bei
täglicher Nutzung nie relevant — und Daten gehen dabei nicht verloren, die erste Anfrage
weckt es wieder.

### Alternative: alles bei Render

Wenn du bewusst bei einem Anbieter bleiben willst (du kennst Render von Cohen-Bot):
Render Web Service + **bezahlte** PostgreSQL-Instanz. Kostet rund 7 $/Monat für die
Datenbank, dazu ggf. 7 $ für einen Web-Service ohne Schlafmodus. Technisch völlig in
Ordnung — nur eben nicht kostenlos, und Auth müsste ich selbst bauen.

### Datenmenge (zur Beruhigung)

Ein Satz-Datensatz ist ~100 Byte. Bei 24 Sätzen × 4 Einheiten/Woche sind das etwa
**0,5 MB pro Jahr und Person**. Zwei Personen über zehn Jahre: ~10 MB. Von 500 MB.
Die Datenmenge wird nie das Problem sein.

---

## 8. Sicherheit

Bewusst pragmatisch: Die App ist nicht öffentlich, es gibt zwei bekannte Nutzer. Es gibt
kein Rollenkonzept, keine Freigabelogik, keine Audit-Anforderungen. Was bleibt, ist das
Minimum, ohne das die App nicht funktionieren *könnte*:

- **Auth + RLS** — nicht als Sicherheitsmaßnahme im engeren Sinn, sondern weil sie der
  Trennmechanismus der beiden Profile sind (§6) und weil die Datenbank im Internet steht
- Der **Claude-API-Schlüssel liegt ausschließlich serverseitig** (Edge Function) — nie
  im Browser, nie im App-Code, nie in einem Repository. Sonst könnte ihn jeder aus der
  App auslesen und auf deine Kosten nutzen
- Alle Verbindungen über HTTPS (macht die Plattform automatisch)
- Passwörter nur als Hash, von der Auth-Ebene verwaltet
- **Fortschrittsfotos bleiben standardmäßig lokal** auf dem Gerät (bewusste
  Datenschutzentscheidung). Optional in den verschlüsselten Cloud-Speicher, dann aber
  privat und pro Profil isoliert
- Export-Dateien enthalten Gesundheitsdaten → die App weist beim Export darauf hin

---

## 9. Entschiedenes und Offenes

**Entschieden (2026-08-06):**

1. **Hosting:** PWA als statische Seite (Render Static Site), Datenschicht bei
   **Supabase** — Daten laufen nicht ab, Auth und RLS eingebaut, kein eigener Server
2. **Login:** E-Mail + Passwort, aber **maximal reibungsarm** konfiguriert — einmal pro
   Gerät anmelden, danach dauerhaft eingeloggt, keine Passwortregeln, keine
   Verifizierung (§6)

**Noch offen:**

3. **Fotos in die Cloud?** Standard bleibt lokal (Datenschutz); Cloud wäre komfortabler
   beim Gerätewechsel. Entscheidung kann warten, bis die Fotofunktion gebaut wird
4. **Automatischer Export in deine eigene Cloud** (Drive/Dropbox) oder nur manueller
   Download plus wöchentliches Archiv im Cloud-Speicher
5. `DATA-SCHEMA.md` wird in Phase 1 zusammen mit dem Datenmodell geschrieben
