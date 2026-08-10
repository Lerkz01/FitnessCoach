# Oberfläche & Training-Tracking — Spezifikation

> **Zweck:** Design der Benutzeroberfläche, mit Fokus auf den Workout-Logger — die
> Stelle, an der die App im Gym tatsächlich benutzt wird.
>
> **Stand:** 2026-08-06
>
> **Leitgedanke:** Die beste Coaching-Logik ist wertlos, wenn das Loggen im Studio
> nervt. Wird nicht geloggt, gibt es keine Daten — und ohne Daten funktioniert
> keiner der vier Regelkreise aus `PLAN-ENGINE.md`.

---

## 1. Designprinzipien (aus der Gym-Realität abgeleitet)

| Prinzip | Warum | Konsequenz |
|---|---|---|
| **Einhandbedienung** | Handy in einer Hand, oft im Stehen oder auf der Bank liegend | **Alle primären Aktionen im unteren Drittel** des Bildschirms. Nie oben rechts. |
| **Null Tippen im Normalfall** | Verschwitzte Finger + Zahlentastatur = Frust | Wiederholungen als antippbare Zahlen-Buttons, nicht als Eingabefeld |
| **Aus Armlänge lesbar** | Handy liegt neben der Bank | Gewicht und Wiederholungen in **sehr großer** Schrift (48–64 px) |
| **Genau 2 Taps pro Satz** | Zwischen den Sätzen ist die Aufmerksamkeit kurz | Wiederholungen antippen + Abgleich antippen. Der Abgleich ist ein *Vergleich* mit der Vorgabe, keine abstrakte Bewertung — deshalb bei jedem Satz tragbar (§5.3) |
| **Kontext statt Erinnerung** | „Was hatte ich letztes Mal?" ist die häufigste Frage | Letzte Leistung steht **immer** sichtbar bei der Übung |
| **Fokusmodus** | Im Training will man nichts anderes | Training ist ein **Modus**, kein Tab: Vollbild, keine Tab-Bar, keine Ablenkung |
| **Offline zuerst** | Kellergeschoss, kein Netz | Logger funktioniert **immer**. Sync passiert später und unsichtbar |
| **Transparenz** | Vertrauen entsteht durch Begründung | Jede Anpassung wird benannt: „War zu leicht — ich gehe auf 85 kg" |

---

## 2. Navigation & Informationsarchitektur

**Vier Tabs** am unteren Rand (Daumenreichweite). Profil über das Avatar-Icon im
Header — kein fünfter Tab, keine Hamburger-Menüs.

```
┌──────────────────────────────────────────────┐
│  [Avatar]  Fitness Coach                     │  Header
│                                              │
│                Inhalt                        │
│                                              │
├──────────────────────────────────────────────┤
│   Heute   │ Fortschritt │ Ernährung │ Coach  │  Tab-Bar
└──────────────────────────────────────────────┘
```

| Tab | Inhalt |
|---|---|
| **Heute** | Tagestraining, Start-Button, Tagesziele, Check-in-Hinweis |
| **Fortschritt** | Gewichtsverlauf, Kraftkurven, Wochenvolumen, Rekorde, Fotos/Umfänge |
| **Ernährung** | Kalorien-/Makroziele + Begründung, Verlauf der Anpassungen |
| **Coach** | KI-Chat, kontextbewusst (kennt den heutigen Plan) |

**Training** öffnet sich als Vollbild-Modus über allem — mit `✕` verlassbar, Zustand
bleibt erhalten.

### 2.1 Aufklappen statt Scrollen — der Grundsatz (Nutzeranforderung)

**Nicht alles auf einen Bildschirm.** Jeder Bereich außerhalb des Trainings ist
zugeklappt und zeigt in der Kopfzeile die **eine Kennzahl**, die von außen zählt:

```
▸ Ernährung                              2956 kcal
▸ Woche                                4 Einheiten
▸ Wochenvolumen                         18 Muskeln
▸ Profil                                      Luca
```

Man sieht also die Kalorien, ohne aufzuklappen — und klappt nur auf, wenn man die
Aufteilung wissen will. Ein Bildschirm hat damit höchstens **einen** immer offenen
Bereich: den, um den es gerade geht.

Umgesetzt mit `<details>`/`<summary>`, nicht mit eigenem Zustand:

* Tastatur und Screenreader funktionieren von sich aus
* kein Zustand, der beim Neuaufbau verloren geht
* die Browsersuche findet auch zugeklappten Text

**Die eine Ausnahme: der Workout-Modus.** Wer mit Hanteln in der Hand zwischen zwei
Sätzen steht, darf nichts erst aufklappen müssen. Dort ist alles gleichzeitig
sichtbar — aktueller Satz groß, Rest der Einheit als schmale Liste darunter (§4).

---

## 3. Screen „Heute"

```
┌─────────────────────────────────┐
│ (L)  Moin Luca          Woche 6 │
├─────────────────────────────────┤
│ ⚠ Check-in fällig — 60 Sekunden │  ← nur am Check-in-Tag
├─────────────────────────────────┤
│                                 │
│   HEUTE · Oberkörper A          │
│   8 Übungen · ca. 72 Min        │
│   Fokus: Brust · Rücken         │
│                                 │
│   ┌───────────────────────────┐ │
│   │   ▶  TRAINING STARTEN     │ │  ← primär, groß, unten
│   └───────────────────────────┘ │
│                                 │
│   Vorschau ⌄                    │  ← aufklappbar
├─────────────────────────────────┤
│   ERNÄHRUNG HEUTE               │
│   2.870 kcal · 140 P · 75 F · 355 K │
├─────────────────────────────────┤
│   DIESE WOCHE                   │
│   M● D● M○ D◦ F◦ S· S·          │  ● erledigt ◦ geplant
└─────────────────────────────────┘
```

**Am Ruhetag** statt des Start-Buttons: nächste Einheit mit Datum und ein kurzer Satz,
warum Pause heute richtig ist. Kein Cardio-Vorschlag — das regelt der Nutzer selbst.

---

## 4. Der Workout-Modus — Aufbau (Hybrid)

**Aktuelle Übung groß, die anderen als schmale Zeilen darüber und darunter.** So bleibt
der Überblick über die Einheit erhalten, ohne die Tap-Flächen der aktiven Übung zu
verkleinern.

```
┌─────────────────────────────────┐
│ ✕         Oberkörper A      ⋯   │  Header minimal
│ ▓▓▓▓▓▓▓░░░░░░░  Übung 3 / 8     │  Fortschritt
├─────────────────────────────────┤
│ ✓ 1  Bankdrücken flach     4/4  │  ← erledigt, gedimmt
│ ✓ 2  Klimmzug breit        4/4  │
├═════════════════════════════════┤
│                                 │
│ 3  INCLINE CHEST PRESS          │  ← AKTIV, groß
│    Brust (oben) · geführt       │
│    Letztes Mal 55 kg · 11·10·9  │  ← Kontext, immer sichtbar
│                                 │
│    ✓ Satz 1  12 Wdh · genau so  │  erledigte Sätze, kompakt
│    ✓ Satz 2  11 Wdh · genau so  │
│                                 │
│    ═══ SATZ 3 von 3 ═══         │
│                                 │
│         57,5 kg                 │  ← sehr groß, antippbar
│         10 Wdh                  │  ← Zielzahl, groß
│         Bereich 8–12 · bis Limit│  ← Kontext, klein
│                                 │
│  Wie viele Wiederholungen?      │
│  ┌─┐ ┌─┐ ┌─┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐│
│  │7│ │8│ │9│ │10│ │11│ │12│ │13││  ← 1 Tap = geloggt
│  └─┘ └─┘ └─┘ └──┘ └──┘ └──┘ └──┘│
│                                 │
│  ⇄ Tauschen   ℹ Info   📝 Notiz │  ← Sekundäraktionen
├═════════════════════════════════┤
│   4  Rudermaschine breit        │  ← kommend, gedimmt
│   5  Kurzhantel Seitheben       │
│   6  Reverse Butterfly          │
└─────────────────────────────────┘
```

- Zusammengeklappte Zeilen sind **antippbar** → springt zu der Übung (z. B. wenn ein
  Gerät gerade frei ist)
- Die aktive Übung scrollt automatisch in die Mitte
- Alles Interaktive der aktiven Übung liegt im **unteren Drittel** — erreichbar mit dem
  Daumen der haltenden Hand
- Die Zielzahl (`10 Wdh`) ist prominent, der Bereich (`8–12`) nur Kontext — siehe
  `PLAN-ENGINE.md` §6

---

## 5. Die Kern-Interaktion: einen Satz loggen

### 5.1 Wiederholungen — ein Tap

Die Zahlen-Buttons sind um die **Zielzahl** herum angeordnet (Zielzahl ± 3). Die
Zielzahl ist hervorgehoben, die Ränder sind gedimmt. Ein Tap loggt den Satz.

- Mehr Wiederholungen geschafft als angezeigt? → letzter Button `13+` öffnet einen Stepper
- Satz abgebrochen? → `⋯` → „Satz abgebrochen" (gilt als Ausfall, nicht als 0 Wdh.)

**Kein Zahlenfeld, keine Tastatur.** Das ist der wichtigste einzelne UX-Entscheid für
die Nutzung im Gym.

### 5.2 Gewicht abweichend — Stepper mit echten Gerätestufen

Tap auf das Gewicht öffnet einen Stepper, der **in den real einstellbaren Stufen des
Geräts** springt (direkter Nutzen aus `gym-geraete.md`):

| Gerät | Stepper-Schritt |
|---|---|
| Steckgewicht | 5 kg |
| Plate-Loaded / Langhantel | 2,5 kg |
| Kurzhantel | 1 kg (bis 10) / 2 kg (darüber) |

**Sonderfall FRE-11** (unterstützte Klimmzüge/Dips) wird explizit gelabelt:
> `Unterstützung 30 kg` · *weniger Unterstützung = schwerer*

So kann der Nutzer nicht versehentlich in die falsche Richtung „progressieren".

### 5.3 Der Abgleich — bei jedem Satz, ein Tap

Nach dem Loggen der Wiederholungen erscheint **immer** eine Zeile, die die
*tatsächliche* mit der *geplanten* Anstrengung abgleicht. Die Frage ist **kontextabhängig
formuliert** — sie richtet sich nach der Vorgabe des Satzes:

**Vorgabe „bis zum Limit" (RIR 0):**
```
│  Warst du wirklich am Limit?    │
│  ┌────────┐┌────────┐┌────────┐│
│  │ genau  ││  mehr  ││ vorher ││
│  │   so   ││  drin  ││ am Ende││
│  └────────┘└────────┘└────────┘│
```

**Vorgabe „2 Wiederholungen Reserve" (RIR 2):**
```
│  Hattest du noch ~2 übrig?      │
│  ┌────────┐┌────────┐┌────────┐│
│  │ genau  ││  mehr  ││ war am ││
│  │   so   ││  drin  ││  Limit ││
│  └────────┘└────────┘└────────┘│
```

Bei „RIR bekannt = ja" (Onboarding S10) sind die Buttons zusätzlich mit Zahlen
beschriftet: `genau 2 · 3+ · 0–1`

**Warum ein Abgleich und keine Bewertungsskala?**

Eine 5-stufige Skala („wie hart war das?") verlangt bei jedem Satz eine neue *absolute*
Einschätzung — das ist anstrengend und wird nach 20 Sätzen unzuverlässig. Der Abgleich
verlangt nur einen *Vergleich* mit einer bekannten Vorgabe: „Sollte 2 Reserve haben —
war das so?" Das ist kognitiv deutlich leichter, ein Tap, **und deshalb bei jedem Satz
tragbar.**

Für die Logik ist es außerdem präziser: Sie braucht die **Abweichung** vom Ziel-RIR,
nicht einen absoluten Anstrengungswert. Der Abgleich liefert genau das direkt
(`PLAN-ENGINE.md` §9).

**Loggen eines Satzes = 2 Taps** (Wiederholungen + Abgleich). Bei ~24 Sätzen sind das
48 Taps pro Einheit — verteilt über 70 Minuten, jeweils in der Pause.

### 5.4 Sofortkorrektur sichtbar machen (Regelkreis 1)

Greift die Anpassung, wird sie **benannt** — nicht still verändert. Und sie wird als
*Korrektur eines Schätzfehlers* formuliert, nicht als Leistungssteigerung:

```
┌─────────────────────────────────┐
│  ⚡ Das Gewicht war zu niedrig   │
│  angesetzt. Ich korrigiere für   │
│  Satz 2 und 3 auf 62,5 kg.       │
│                    [Passt] [Nein]│
└─────────────────────────────────┘
```

Der Nutzer kann ablehnen — die App merkt sich das und wird bei dieser Übung
zurückhaltender.

**Diese Korrektur erscheint bewusst selten.** Sie greift nur bei klarer Fehlschätzung
(≥ 3 Wiederholungen über dem Ziel *und* „mehr drin"), maximal einmal pro Übung, und
maximal eine Stufe. Ein einzelner guter Satz löst **nichts** aus — dafür ist der
Fortschritt zu verrauscht (`PLAN-ENGINE.md` §9).

### 5.5 Aufwärmsätze

Werden **visuell abgesetzt** (gedimmt, mit `W` markiert) und mit einem Tap
durchgeklickt — keine Wiederholungsabfrage, sie zählen nicht ins Volumen.

---

## 6. Der Pausen-Timer

Startet **automatisch** nach dem Loggen. Das ist die Belohnung fürs Eintragen.

```
┌─────────────────────────────────┐
│           Pause                 │
│                                 │
│          1:47                   │  ← sehr groß
│      ○○○○○○●○○○○                │  Ring/Fortschritt
│                                 │
│  Als Nächstes                   │
│  Satz 3 · 57,5 kg · 8–12 Wdh    │
│                                 │
│  ┌─────────┐   ┌─────────────┐  │
│  │  +30 s  │   │  Weiter  →  │  │
│  └─────────┘   └─────────────┘  │
└─────────────────────────────────┘
```

- Vibration + optionaler Ton am Ende
- Läuft weiter, wenn die App im Hintergrund ist (Benachrichtigung mit Restzeit)
- `Weiter` überspringt die Restzeit
- Beim letzten Satz einer Übung zeigt die Vorschau schon die **nächste Übung**

### 6.1 Wann KEIN Timer läuft

Ein Durchlauf der fertigen Oberfläche zeigte zwei Fälle, in denen der Timer falsch war
und die Einheit dadurch länger dauerte als angekündigt:

| Nach … | Pause | Warum |
|---|---|---|
| Aufwärmsatz | **50 s** | Aufwärmen ist keine Arbeit. Mit der vollen Arbeitspause kämen pro Übung mehrere Minuten Totzeit dazu. |
| letztem Satz einer Übung | **kein Timer** | Das Umbauen — Gerät wechseln, Scheiben tauschen — IST die Pause. |
| Arbeitssatz | volle Pause | wie geplant |

Beide Werte entsprechen genau der Annahme in `estimateExerciseSeconds`. Die
angezeigte Dauer der Einheit stimmt damit mit dem tatsächlichen Ablauf überein —
vorher lief der Timer auch nach Aufwärmsätzen 2:30.

Die Zeitmessung selbst rechnet mit **Zeitstempeln**, nicht mit Intervall-Ticks: Mobile
Browser drosseln Hintergrund-Intervalle stark, ein hochzählender Zähler wäre nach der
Pause deutlich zu niedrig.

---

## 7. Trainingsende

Nach jeder Einheit läuft die vollständige **Nach-Training-Analyse**
(`PLAN-ENGINE.md` §9) — lokal, also auch offline. Ihr Ergebnis wird in drei Blöcken
gezeigt:

```
┌─────────────────────────────────┐
│        Oberkörper A ✓        ☁︎  │
│     68 Min · 24 Sätze           │
│                                 │
│  ── GESCHAFFT ──                │
│  🏆 Bankdrücken  82,5 kg × 6    │
│  🏆 Klimmzug     +5 kg × 8      │
│  Volumenlast  8.240 kg   ▲ 6 %  │
│  Brust diese Woche  8,5 / 16    │
│                                 │
│  ── GEÄNDERT ──                 │
│  Bankdrücken  → 85 kg           │
│    „zweimal bestätigt"          │
│  Butterfly    → 11 statt 10 Wdh │
│  Nächste Einheit: +1 Satz Lat   │
│    „Wochenziel hinkt nach"      │
│                                 │
│  ── BEOBACHTET ──               │
│  Seitheben  3 Wochen kein       │
│    Fortschritt → Tauschvorschlag│
│    beim Check-in am Sonntag     │
│  Erholung  2× RIR unter Ziel    │
│    → bei Fortdauer Entlastung   │
│                                 │
│  Ziel Muskelaufbau: auf Kurs ✓  │
│                                 │
│  Wie war die Einheit?           │
│  ┌────┐┌────┐┌────┐┌────┐       │
│  │ 😀 ││ 🙂 ││ 😐 ││ 😞 │       │
│  └────┘└────┘└────┘└────┘       │
│                                 │
│  ┌───────────────────────────┐  │
│  │        Speichern          │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

| Block | Zweck |
|---|---|
| **GESCHAFFT** | Rekorde, Volumenlast im Vergleich, Wochenvolumen-Stand |
| **GEÄNDERT** | konkrete neue Vorgaben — **jeweils mit Grund** |
| **BEOBACHTET** | was aufgefallen ist, aber bewusst noch keine Änderung auslöst |

Der dritte Block ist der wichtigste für das Vertrauen: Er zeigt, dass die App etwas
*gesehen* hat und **bewusst noch nicht handelt** — statt still nichts zu tun. Das ist
genau der Unterschied zwischen einer trägen App und einem Coach, der abwartet, bis er
sicher ist.

Ganz unten steht der Zielbezug in einer Zeile („Ziel Muskelaufbau: auf Kurs"), damit
jede Einheit sichtbar auf etwas hinarbeitet.

---

## 8. Screen „Fortschritt"

Vier Bereiche, per Segment-Umschalter:

| Bereich | Inhalt |
|---|---|
| **Körper** | Gewichtsverlauf mit **7-Tage-Trendlinie** (Rohwerte gedimmt — Tagesschwankungen sind Wasser, nicht Gewebe) · Umfänge · Fotos-Vergleich (Vorher/Nachher-Slider) |
| **Kraft** | e1RM-Kurve pro Übung (auswählbar) · Rekordliste · Verlauf „Gewicht × Wdh." je Übung |
| **Volumen** | Balken pro Muskelgruppe für die Woche, mit Zielkorridor als Band. **Zeigt die fraktionale Zählung** — inkl. indirektem Anteil in anderer Farbe |
| **Konstanz** | Kalender-Heatmap der Einheiten · Check-in-Quote |

Der Volumen-Balken ist bewusst prominent: Er macht sichtbar, dass Klimmzüge auch den
Bizeps versorgen — und erklärt, warum die App weniger direkte Armarbeit plant.

---

## 9. Screen „Ernährung"

Bewusst **schlank** — hier wird nicht getrackt (das läuft in der anderen App).

```
┌─────────────────────────────────┐
│      2.870 kcal                 │
│                                 │
│  Protein       140 g  ████████  │
│  Fett           75 g  ████      │
│  Kohlenhydrate 355 g  ██████████│
│                                 │
│  ── Warum diese Zahlen? ──      │
│  Erhaltungsbedarf 2.620 kcal    │
│  + 250 Überschuss (Aufbau)      │
│  Zielrate +0,16 kg/Woche        │
│                                 │
│  Zuletzt angepasst: KW 4        │
│  „Gewicht stieg zu langsam      │
│   (+0,05 kg/Woche) → +200 kcal" │
│                                 │
│  Verlauf der Anpassungen ⌄      │
└─────────────────────────────────┘
```

Der Abschnitt **„Warum diese Zahlen?"** ist Pflicht. Eine Kalorienzahl ohne Begründung
ist eine Behauptung; mit Begründung ist sie Coaching.

---

## 10. Screen „Coach" (KI)

- Chat, der den aktuellen Plan, die Historie und das Profil kennt
- Vorgeschlagene Fragen als Chips: *„Warum heute Beine?"* · *„Erklär mir diese Übung"*
  · *„Ich hab morgen keine Zeit"* · *„Meine Schulter zwickt"*
- Im Workout-Modus über `⋯` erreichbar, ohne das Training zu verlassen
- **Wichtig:** Der Übungstausch geht auch ohne KI (Button, regelbasiert, sofort,
  offline). Die KI ist für *Erklärungen* und *freie Anliegen* — nie ein Nadelöhr.

### 10.1 Der Übungstausch — gebaut und wie er entscheidet

Im Trainingsbildschirm steht unter der Eingabe **„Gerät besetzt — andere Übung"**. Ein
Tipp, höchstens vier Vorschläge, sofort, ohne Netz.

**Was „besetzt" heißt, hängt am Gerätetyp.** Das ist die eigentliche Logik:

| Gerätetyp | Bei „besetzt" | Warum |
|---|---|---|
| Maschine, Bank mit Ablage | fällt weg | gibt es einmal |
| Kurzhanteln, Langhantel, verstellbare Bänke | bleibt verfügbar | gibt es mehrfach |
| „Mehrere vorhanden" in der Gerätedatenbank | bleibt verfügbar | ausdrücklich vermerkt |
| Zubehör (Fußschlaufen) | bleibt verfügbar | keine Station |

Ist also die Flachbank belegt, bleibt die Langhantel im Spiel und Schrägbankdrücken wird
vorgeschlagen. Ohne diese Unterscheidung wäre der Tausch entweder nutzlos (schlägt
dieselbe Maschine vor) oder unnötig streng (streicht alle Kurzhantelübungen, weil eine
Bank belegt ist).

`loadType: 'body'` gilt **nicht** als mehrfach vorhanden — das war ein Fehlschluss im
ersten Entwurf. Der Wert beschreibt, WIE die Last wirkt, nicht WIE VIELE es gibt: Die
45°-Hyperextension ist eine Körpergewichtsübung an genau einer Station. Im Zweifel wird
gesperrt, weil die Kosten unsymmetrisch sind — zu streng heißt ein etwas anderer
Vorschlag, zu lasch macht die Funktion nutzlos.

**Die Auswahl erhält den Reiz, nicht die Qualität.** Vorgeschlagen wird nur, was
dieselbe Muskulatur trifft (Überlappung ≥ 0,5). Eine „bessere" Übung, die andere Muskeln
trifft, wäre falsch: Das Wochenvolumen ist pro Muskel geplant, und ein Tausch darf es
nicht verschieben.

**Vielfalt statt Bestenliste.** Höchstens zwei Vorschläge pro Gerät, keine zwei
praktisch identischen Übungen. Wären alle vier Vorschläge Kurzhantelübungen und die
Kurzhanteln das Problem, stünde man wieder da.

**Angezeigt wird kein Ähnlichkeitswert.** Sortiert wird nach einer Punktzahl, in die
auch Bewegungsmuster und die Güte der Gewichtsschätzung eingehen — eine Prozentzahl
würde der Reihenfolge sichtbar widersprechen und wie ein Fehler wirken. Stattdessen
steht dort, was im Gym zählt: **an welches Gerät man geht**, und ob die Bewegung
dieselbe ist.

### 10.2 Was beim Tausch mit der Vorgabe passiert

Der **Übungsplatz behält seine Aufgabe**, nur die Last wird übersetzt.

| Bleibt | Wird neu gerechnet |
|---|---|
| Sätze, Ziel-Wdh., Wdh.-Bereich, RIR, Pause | Gewicht |
| Position in der Einheit | Aufwärmsätze (hängen am Arbeitsgewicht) |

Das Gewicht kommt, wenn möglich, aus der **eigenen Historie** — wer die Ersatzübung
schon einmal gemacht hat, hat einen echten Wert, und der schlägt jede Schätzung. Erst
sonst wird über die Bewegungsmuster-Koeffizienten umgerechnet. Die App sagt, welcher
Fall vorliegt.

Beispiel aus dem Durchlauf: `4 × 5 @ 72,5 kg` Langhantelbankdrücken wird zu
`4 × 5 @ 26 kg` Kurzhantelbankdrücken, Aufwärmsätze von 37,5/50/62,5 auf 12/18/22 kg.

**Getauscht wird nur VOR dem ersten Arbeitssatz.** Danach würde ein Übungsplatz auf zwei
Übungen aufgeteilt, und keine von beiden wäre für die Progression auswertbar. Die App
sagt das an der Stelle des Knopfes.

Ein besetztes Gerät bleibt für die **restliche Einheit** gesperrt: Wer zweimal tauscht,
soll nicht auf dem Gerät landen, das er gerade als besetzt gemeldet hat.

Jeder Tausch geht ins Anpassungsprotokoll (`exercise_rotation`, Kreis 1) — mit
Vorher, Nachher und Grund.

---

## 11. Check-in-Flow

Am gewählten Wochentag als Banner auf „Heute". Ein Screen, scrollbar, ~60 Sekunden:

```
┌─────────────────────────────────┐
│  Wochen-Check-in · Woche 6      │
│                                 │
│  Gewicht (Ø der Woche)          │
│         [ 78,4 ] kg             │
│                                 │
│  Optik vs. letzte Woche         │
│  ┌──┐┌──┐┌──┐┌──┐┌──┐           │
│  │++││ +││ =││ −││−−│           │
│  └──┘└──┘└──┘└──┘└──┘           │
│                                 │
│  Energie & Erholung             │
│  Schlaf                         │
│  Gelenke                        │
│  Lust aufs Training             │
│  Kalorienziel getroffen?        │
│                                 │
│  ┌───────────────────────────┐  │
│  │        Absenden           │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**Danach — der wichtigste Screen der Woche:**

```
┌─────────────────────────────────┐
│    Das habe ich angepasst       │
│                                 │
│  📈 Volumen                     │
│  Brust 15 → 16 Sätze            │
│  Rücken 15 → 16 Sätze           │
│  „Kraft steigt, Erholung ok"    │
│                                 │
│  🍽 Kalorien                    │
│  unverändert (2.870)            │
│  „Gewichtstrend passt zum Ziel" │
│                                 │
│  🔄 Übungen                     │
│  Seitheben Maschine →           │
│  Kabel Seitheben einarmig       │
│  „3 Wochen kein Fortschritt"    │
│                                 │
│              [Verstanden]       │
└─────────────────────────────────┘
```

Wird nichts geändert, sagt die App das auch — inklusive Grund. „Nichts ändern" ist
eine Entscheidung, keine Untätigkeit.

---

## 12. Profil & Einstellungen

Über das Avatar-Icon:

- **Profilwechsel** (zwei Nutzer, strikt getrennte Daten)
- Ziel · Level · Trainingstage · Zeitbudget ändern → löst Plan-Neuberechnung aus
- **Intensität:** `moderat` · `fordernd` (Standard) · `sehr fordernd`
- Abgleich-Buttons: `Worte` (Standard) · `RIR-Zahlen` — folgt zunächst der
  Onboarding-Antwort S10, jederzeit umschaltbar
- Geräte deaktivieren (falls dauerhaft nicht verfügbar)
- Gerätestufen korrigieren (die offenen Punkte aus `gym-geraete.md`)
- Benachrichtigungen: Trainingserinnerung · Pausen-Timer · Check-in
- Datenexport (CSV) · Konzept- und Wissensdokumente einsehen

---

## 13. Visuelle Sprache

| Element | Entscheidung |
|---|---|
| **Theme** | Dunkel als Standard. Gym-Beleuchtung, Akkuschonung, wirkt hochwertig. Hell umschaltbar |
| **Zahlen** | Tabellarische Ziffern (`tabular-nums`), damit Werte beim Zählen nicht springen |
| **Typo-Hierarchie** | Gewicht/Wdh. 48–64 px · Übungsname 20–24 px · Metadaten 13–14 px |
| **Farbe** | Eine Akzentfarbe für Aktionen. Semantisch: grün = erledigt/Rekord, gelb = Warnung, rot = Ausfall/Abbruch |
| **Tap-Flächen** | Minimum 48 px, im Workout-Modus **64 px** |
| **Bewegung** | Sparsam und funktional: Satz eingerastet, Timer-Ring, Screen-Übergänge. Keine Deko-Animationen |
| **Orientierung** | Nur Hochformat |
| **Sichere Bereiche** | `env(safe-area-inset-*)` für Notch und Home-Indicator |

### 13.1 Übungsinfo — das „i"

Neben jedem Übungsnamen steht ein kleines `i`: auf dem Startbildschirm in der
Liste „Heute", im Training über der aktuellen Übung und in der Einheiten-
Übersicht darunter.

| Entscheidung | Warum |
|---|---|
| Sichtbar 20 px, Tap-Fläche 44 px | Unauffällig im Layout, aber mit verschwitzten Fingern treffbar. Die Fläche wächst über negative Ränder nach außen, ohne die Zeile zu verschieben |
| `stopPropagation` im Knopf | Das `i` sitzt in Zeilen, die selbst anklickbar sind. Sonst würde ein Tipp beides auslösen |
| **Überlagerung**, kein Bildschirmwechsel | Wer im Training auf das `i` tippt, hat oft einen Pausentimer laufen. Ein Bildschirmwechsel würde den Timer abbauen und neu starten |
| Schließen über ×, Hintergrund und Escape | Einhändige Bedienung |
| Scrollcontainer außen, `items-end` innen | Steht `items-end` am scrollenden Element, schneidet der Browser lange Blätter oben ab und lässt sich nicht dorthin scrollen. Das war ein echter Fehler: Name und Schema waren unerreichbar |

**Inhalt** in dieser Reihenfolge — was man am Gerät zuerst braucht:
Schema · Aufbau · Bewegung · häufigster Fehler. Darunter zugeklappt: welche
Muskeln, welches Gerät, welche Rolle im Plan.

**Texte je Bewegungsfamilie, nicht je Übung** (`src/domain/instructions.ts`).
372 Einzeltexte wären zu 90 % Wiederholung und im Rest erfunden. „Kurzhantel
Bankdrücken flach" und „… Schrägbank" unterscheiden sich im Winkel, nicht in
der Technik. 35 Familien deckt alles ab; genau eine Übung fällt auf den
allgemeinen Auffangtext (Tibialis Raises), und der ist dafür geräteneutral
formuliert.

Die Zuordnung läuft über Namensmuster von spezifisch nach allgemein, mit dem
Zielmuskel als Rückfallebene. Das ist zerbrechlich, und zwar nachweislich:
`Handgelenkcurls` enthält „curl" und hätte Bizeps-Hinweise bekommen, ein
`Klimmzug mit Zusatzgewicht (… kein Dipgürtel vorhanden)` wurde zum Dip,
„Wa**ll Sit**" zum Beinheben, und Nordic Curls zur Armübung. Deshalb prüft
`instructions.test.ts` die kniffligen Fälle namentlich und schlägt Alarm, wenn
eine neue Regel eine bestehende überschattet.

### 13.2 Bewegungs-Schema

Die Animation zeigt **Richtung und Umfang** der Bewegung — sie ist keine
Formvorlage, und das steht auch als Bildunterschrift darunter. Ein Strichbild
kann eine Kniebeuge nicht zeigen und würde es täuschend versuchen.

35 Familien teilen sich **neun Muster** (`src/ui/MovementAnimation.tsx`):
Drücken, Ziehen nach unten, Ziehen zum Rumpf, Bogen um ein Gelenk, Beugen und
Aufrichten, kurzer Weg, Halten, Drehung, Bewegungsfolge. Eigene SVG statt
Videos: keine Rechtefragen, keine Ladezeit, funktioniert im Flugmodus, wenige
Zeilen groß. `prefers-reduced-motion` schaltet auf das Standbild der
Ausgangsposition.

---

## 14. Offline, Fehler und Robustheit

| Fall | Verhalten |
|---|---|
| Kein Netz | Alles außer KI-Chat funktioniert vollständig. Sync-Symbol zeigt „wird später übertragen" |
| App im Training geschlossen | Zustand wird nach **jedem Satz** persistiert. Beim Öffnen: „Training fortsetzen?" |
| Akku leer / Absturz | Kein Datenverlust — jeder Satz ist sofort gespeichert, nicht erst am Ende |
| Zwei Geräte gleichzeitig | Letzte Änderung gewinnt pro Satz; Konflikt wird protokolliert, nicht still überschrieben |
| KI nicht erreichbar | Chat zeigt Hinweis; Tausch-Button und alles andere bleiben nutzbar |

---

## 15. Barrierefreiheit

- Kontrastverhältnis mindestens 4,5:1 für Text, 3:1 für große Zahlen
- Alle Aktionen per Screenreader erreichbar und sinnvoll benannt
- Keine Information nur über Farbe (Symbole + Text ergänzen)
- Schriftgröße folgt der Systemeinstellung
- Timer-Ende zusätzlich haptisch und optisch, nicht nur akustisch

---

## 16. Offene Punkte

1. **Übungsanleitungen** — Text sicher; Bilder/Videos später (Rechte, Speicherplatz).
   Zwischenlösung: kurze Textbeschreibung + Hinweis auf die Gerätebezeichnung
2. **Pausen-Timer im Hintergrund** braucht Benachrichtigungsrechte — muss beim ersten
   Training sauber erklärt und angefragt werden
3. **Fotos** bleiben lokal (keine Cloud-Synchronisation) — bewusste
   Datenschutzentscheidung, aber dadurch kein Gerätewechsel für Fotos
4. **Watch-/Wearable-Anbindung** ausdrücklich später
5. **Onboarding-Wizard** braucht ein eigenes visuelles Muster (Fortschrittsbalken,
   große Auswahlkarten) — abgeleitet aus diesen Prinzipien
