# Plan-Engine — Trainingsplanung & stetige Anpassung

> **Zweck:** Vollständige Spezifikation der Coaching-Logik. Verbindet das
> Onboarding-Profil (`ONBOARDING.md`) mit der Evidenzbasis (`TRAINING-SCIENCE.md`)
> zum konkreten Tagestraining — und passt es fortlaufend an.
>
> **Stand:** 2026-08-06
>
> **Anforderungen des Nutzers, die hier umgesetzt werden:**
> 1. Das Training soll **fordern** → §2
> 2. **Regelmäßige Abfrage**, wie sich der Körper verändert hat — **optisch und
>    gefühlt** → §7
> 3. **Kraftdaten automatisch** aus eingetragenen Wiederholungen × Gewicht → §6
> 4. Der Plan wird **stetig angepasst** → §8

---

## 1. Architektur: vier Regelkreise

Die App passt auf vier Zeitebenen an. Das ist der zentrale Unterschied zu Apps, die
nur „nächste Woche mehr Gewicht" machen.

```
┌──────────────────────────────────────────────────────────────────┐
│ Kreis 1  ·  PRO SATZ            (Sekunden)                       │
│   Satz war deutlich zu leicht/schwer → Gewicht der Folgesätze    │
│   derselben Übung sofort korrigieren                             │
├──────────────────────────────────────────────────────────────────┤
│ Kreis 2  ·  NACH JEDER EINHEIT  (Nach-Training-Analyse)          │
│   Vollständige Analyse der Einheit: Übungs-Status, Einheits-      │
│   Qualität, Wochenvolumen, Ermüdung, Stagnation, Zielfortschritt  │
│   → Doppelprogression pro Übung + Kompensation                    │
├──────────────────────────────────────────────────────────────────┤
│ Kreis 3  ·  WÖCHENTLICH         (Check-in)                       │
│   Volumen ±, Kalorien ±, Deload-Prüfung, Übungsrotation          │
├──────────────────────────────────────────────────────────────────┤
│ Kreis 4  ·  ALLE 4–6 WOCHEN     (Block-Review)                   │
│   Split prüfen, Prioritäten neu setzen, Erhaltungsbedarf aus     │
│   echten Daten neu schätzen (statt aus der Formel)               │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. „Fordernd" — was das konkret heißt (und wo die Grenze ist)

Explizite Nutzeranforderung. Umsetzung:

| Hebel | Umsetzung |
|---|---|
| **Intensität** | Ziel-RIR am unteren Ende der evidenzbasierten Spanne: Grundübungen 2, Maschinen 1, Isolation 0–1. **Letzter Satz jeder Isolationsübung bis zum Versagen** (§4 — dort ist Versagen billig und wirksam) |
| **Volumen** | Aggressive Steigerung: +1–2 Sätze/Muskel **pro Woche**, solange Leistung und Erholung mitgehen — Ziel ist das obere Ende des Korridors (20–22 fraktionale Sätze), nicht das untere |
| **Progression** | Sobald der Zielbereich erreicht ist, wird sofort erhöht — kein „noch eine Woche das Gleiche" |
| **Übungsauswahl** | Freie Lang-/Kurzhantelvarianten als Standard (fordernder, mehr Stabilisation), geführte Maschinen als Alternative — entspricht auch deiner Notiz in `gym-geraete.md` |
| **Zeitausnutzung** | Bei knappem Zeitbudget: Intensitätstechniken (Dropsatz / Rest-Pause) auf dem letzten Isolationssatz statt Volumen zu streichen — nur ab Level *fortgeschritten* |

**Wo die Grenze ist — und warum das kein Widerspruch ist:**

Die **erste Woche ist bewusst konservativ** (~5–10 % unter Schätzung). Das ist kein
Zögern, sondern Notwendigkeit: ein zu schwerer erster Satz bei unbekanntem
Leistungsstand ist ein Verletzungsrisiko und kostet Vertrauen. Ab Woche 2 zieht die
Progression aggressiv an — und weil sie datengetrieben ist, landet sie schneller beim
richtigen Gewicht als jedes Raten.

Ebenso: **kein Versagen bei schweren Grundübungen.** Nicht aus Vorsicht, sondern weil
Robinson et al. (2024) zeigen, dass es für Kraft **nichts bringt** und die Ermüdung
das Volumen der Folgeübungen kostet. Härter ≠ dümmer.

**Voreinstellung:** `fordernd` (Standard). In den Einstellungen umstellbar auf
`moderat` (RIR +1, langsamere Volumensteigerung) oder `sehr fordernd` (RIR −1 wo
sicher, Volumen-Obergrenze +2). Der Nutzer muss nichts einstellen — aber er kann.

---

## 3. Schritt 1: Muskel-Taxonomie & Volumen-Budget

### Normalisierte Volumen-Muskeln

Die Datenbank enthält Unterregionen (`Brust (oben)`, `Bizeps (langer Kopf)` …). Für
die Volumenrechnung werden sie auf **18 Volumen-Muskeln** normalisiert; die
Unterregionen bleiben separat für die *Abdeckung* (§5) erhalten.

| # | Volumen-Muskel | Beispiel-Unterregionen aus der DB |
|---|---|---|
| 1 | Brust | oben · mittel · unten · innen · außen |
| 2 | Lat | Lat |
| 3 | Oberer Rücken | ob. Rücken · Trapez (mittel/unten) |
| 4 | Unterer Rücken | unt. Rücken · Rückenstrecker |
| 5 | Trapez (oben) | Trapez |
| 6 | Vordere Schulter | vord. Schulter |
| 7 | Seitliche Schulter | seitl. Schulter |
| 8 | Hintere Schulter | hint. Schulter · Rotatorenmanschette |
| 9 | Bizeps | Bizeps (langer/kurzer Kopf) · Brachialis · Brachioradialis |
| 10 | Trizeps | Trizeps (langer/lateraler/medialer Kopf) |
| 11 | Unterarme / Griff | Unterarmbeuger/-strecker · Griffkraft |
| 12 | Quadrizeps | Quadrizeps (Vastus, Rectus) |
| 13 | Hamstrings | Hamstrings |
| 14 | Gesäß | Gesäß · Gluteus medius |
| 15 | Adduktoren | Adduktoren |
| 16 | Waden | Gastrocnemius · Soleus |
| 17 | Bauch | gerader/schräger Bauchmuskel · Rumpfstabilität |
| 18 | Schienbein | Schienbeinmuskel |

### Fraktionale Zählung (§1 — der Kern)

```
Volumen(Muskel, Woche) = Σ Sätze mit Muskel als PRIMÄR   × 1,0
                       + Σ Sätze mit Muskel als SEKUNDÄR × 0,5

Unilaterale Übung: beide Seiten zählen (1 Satz je Seite = 2 Sätze)
Zeit-Übungen (Plank, Carry): 1 Durchgang = 1 Satz
Cardio: zählt nicht ins Krafttraining-Volumen
```

**Beispiel:** 4 Sätze Klimmzüge → Lat 4,0 · Bizeps 2,0 · oberer Rücken 2,0.
Die App weiß also, dass der Bizeps nach dem Rückentag schon versorgt ist und plant
entsprechend weniger direkte Armarbeit. Genau das ist der Punkt, an dem Apps, die nur
direkte Sätze zählen, systematisch überlasten.

### Wochen-Budget pro Muskel (fraktionale Sätze)

Große Muskeln brauchen mehr direktes Volumen, kleine bekommen viel indirekt. Werte
abgeleitet aus dem Korridor in §1 der Trainingswissenschaft.

| Volumen-Muskel | Anfänger | Fortgeschritten | Erfahren | Obergrenze | Diät |
|---|---|---|---|---|---|
| Brust | 9 | 13 | 15 | 22 | 9 |
| Lat | 9 | 13 | 15 | 22 | 9 |
| Oberer Rücken | 9 | 13 | 15 | 22 | 9 |
| Quadrizeps | 9 | 13 | 15 | 22 | 9 |
| Hamstrings | 8 | 11 | 13 | 18 | 8 |
| Gesäß | 8 | 11 | 13 | 20 | 8 |
| Seitliche Schulter | 7 | 10 | 12 | 20 | 7 |
| Hintere Schulter | 6 | 9 | 11 | 18 | 6 |
| Vordere Schulter | 5 | 7 | 8 | 12 | 5 |
| Bizeps | 7 | 10 | 12 | 18 | 7 |
| Trizeps | 7 | 10 | 12 | 18 | 7 |
| Waden | 7 | 10 | 12 | 16 | 7 |
| Bauch | 6 | 8 | 10 | 14 | 6 |
| Trapez (oben) | 4 | 6 | 8 | 12 | 4 |
| Unterer Rücken | 4 | 6 | 7 | 10 | 4 |
| Adduktoren | 3 | 4 | 6 | 10 | 3 |
| Unterarme / Griff | 2 | 3 | 4 | 8 | 2 |
| Schienbein | 0 | 2 | 2 | 6 | 0 |

**Anpassungen:**
- **Ziel Maximalkraft:** Werte × 0,8 (Kraft sättigt früher, §1), dafür schwerere Lasten
- **Prioritäts-Muskel** (Onboarding Screen 7): +3 Sätze und Slot 1 in der Einheit
- **Nicht-Prioritäts-Muskeln** bei knapper Zeit: bis auf das Erhaltungsniveau
  (~60 % des Startwerts) reduzierbar
- **Vordere Schulter** hat bewusst ein niedriges Budget: sie bekommt aus jedem
  Drückmuster massiv indirektes Volumen

---

## 4. Schritt 2: Split & Verteilung

Split aus den gewählten Trainingstagen (§2). Harte Regel: **max. 10 fraktionale
Sätze pro Muskel pro Einheit** — darüber wird gesplittet.

| Tage | Split | Einheiten |
|---|---|---|
| 3 | Ganzkörper A/B/C | A: Beine-Fokus · B: Oberkörper-Push-Fokus · C: Oberkörper-Pull-Fokus (jeweils Ganzkörper mit unterschiedlichem Schwerpunkt) |
| 4 | Ober/Unter 2× | OK-A · UK-A · OK-B · UK-B |
| 5 | PPL + Ober/Unter | Push · Pull · Legs · Oberkörper · Unterkörper |
| 6 | PPL 2× | Push-A · Pull-A · Legs-A · Push-B · Pull-B · Legs-B |

**Tagesabstände beachten:** Die konkreten Wochentage aus Screen 11 bestimmen die
Reihenfolge. Regeln:
- Keine zwei Einheiten mit demselben Hauptmuskel an aufeinanderfolgenden Tagen
- Bei 4 Tagen Mo/Di/Do/Fr → OK-A · UK-A · OK-B · UK-B (natürliche Trennung)
- Bei ungünstiger Verteilung (z. B. 3 Tage hintereinander) wird der Split so gedreht,
  dass die belastungsintensivste Einheit nach dem längsten Abstand liegt

> **Cardio wird nicht geplant** (Entscheidung 2026-08-06). Der Nutzer regelt
> Ausdauertraining selbst. Übungen mit `metric = 'cardio'` sind aus dem Pool
> ausgeschlossen. Die Interferenz-Evidenz (`TRAINING-SCIENCE.md` §9) bleibt als
> Hintergrundwissen für den KI-Coach erhalten und wird im Check-in nur dann
> thematisiert, wenn ein Leistungsabfall anders nicht erklärbar ist.

**A/B-Varianten** unterscheiden sich in der Übungsauswahl, nicht im Muskelziel — so
entsteht die regionale Abdeckung aus §6 automatisch über die Woche.

---

## 5. Schritt 3: Übungsauswahl (der Generator)

Für jede Einheit sind Zielmuskeln und Satzzahlen bekannt. Der Generator wählt die
Übungen in dieser Reihenfolge:

### 5.1 Pool filtern

```
Pool = alle 381 Übungen
     − Übungen, deren Geräte nicht verfügbar sind      (isExercisePossible)
     − persönliche Blacklist                            (Onboarding S15)
     − verletzungsbedingte Ausschlüsse                  (Onboarding S14)
     − Übungen mit metric = 'cardio'                    (App plant kein Cardio)
     − KET-* solange Kettlebell-Gewichte unbekannt
```

### 5.2 Bewertungsfunktion

Jede Kandidaten-Übung erhält einen Score. Der Generator wählt pro Slot die
höchstbewertete Übung, die nicht gegen eine Sperre verstößt.

| Kriterium | Gewicht | Begründung |
|---|---|---|
| Trifft den Ziel-Muskel als **primär** | +100 | Kernanforderung |
| Deckt eine **noch nicht abgedeckte Unterregion** ab | +40 | Regionale Hypertrophie (§6) |
| Belastet den Zielmuskel in **gedehnter Position** | +30 | Stretch-mediated Hypertrophy (§6) |
| Grundübung (`compound`) **und** früher Slot | +25 | Reihenfolge zählt (§6); Technik bei Frische |
| Freie Lang-/Kurzhantel-Variante | +15 | „Fordernd" (§2) + Nutzerpräferenz |
| Bereits im Vorwochen-Plan (Progressions-Kontinuität) | +20 | Vergleichbarkeit für die Progression (§7) |
| Übung stagniert seit ≥ 3 Wochen | −40 | Rotationssignal |
| Überlappt stark mit bereits gewählter Übung derselben Einheit | −50 | Redundanz vermeiden |
| Unilateral bei knappem Zeitbudget | −20 | Doppelte Satzdauer |
| Betrifft eine verletzungssensible Region (nicht akut) | −60 | Deprioritisieren statt ausschließen |

### 5.3 Sperren (harte Regeln)

- **3–4 verschiedene Übungen pro großem Muskel pro Woche** (§6) — nicht mehr
  (Progression braucht Vergleichbarkeit), nicht weniger (regionale Abdeckung)
- **Max. 2 Übungen pro Muskel pro Einheit** bei 3–4 Trainingstagen, max. 3 bei 5–6
- Pro Einheit **max. 3 schwere Grundübungen** (Ermüdungsmanagement)
- **Prioritäts-Muskel erhält Slot 1** — auch wenn es eine Isolationsübung ist (§6)
- Bei Level *Anfänger*: in den ersten 4 Wochen mindestens 60 % geführte/stabile
  Varianten (Technikaufbau), danach schrittweise mehr frei

### 5.4 Übungsreihenfolge in der Einheit

1. Übung für den **Prioritäts-Muskel** (falls gesetzt)
2. Schwere Grundübungen (absteigend nach Systemlast)
3. Sekundäre Verbundübungen / Maschinen
4. Isolationsübungen
5. Bauch / Waden / Griff

---

## 6. Schritt 4: Vorgabe pro Übung — Sätze, Wdh., RIR, Pause, Gewicht

### Sätze / Wiederholungen / RIR

**Die Vorgabe ist immer eine konkrete Zielzahl, kein Bereich.** Der Bereich ist nur
Kontext und Progressionsspielraum:

```
Angezeigt:   3 Sätze · 10 Wdh.        (Bereich 8–12)
Nicht:       3 Sätze · 8–12 Wdh.
```

Grund: „8–12" ist mehrdeutig — hat der Nutzer bei 8 Wiederholungen sein Ziel erreicht
oder verfehlt? Eine konkrete Zahl macht den Satz-Status eindeutig auswertbar (§9) und
ist für den Nutzer klarer. Die Zielzahl wandert über die Wochen durch den Bereich nach
oben, dann steigt das Gewicht und die Zielzahl fällt auf die Untergrenze zurück.

Bereiche aus Ziel + Übungstyp (Tabellen §3/§4 der Trainingswissenschaft):

| Ziel | Grundübung | Isolation |
|---|---|---|
| Muskelaufbau | 3–4 Sätze · 5–10 Wdh. · RIR 2 | 3 Sätze · 10–20 Wdh. · RIR 0–1 |
| Maximalkraft | 4–5 Sätze · 3–6 Wdh. · RIR 2–3 | 3 Sätze · 6–12 Wdh. · RIR 1–2 |
| Fettverlust | 3 Sätze · 5–10 Wdh. · RIR 2 | 2–3 Sätze · 10–15 Wdh. · RIR 0–1 |
| Allg. Fitness | 3 Sätze · 6–12 Wdh. · RIR 2 | 2–3 Sätze · 10–15 Wdh. · RIR 1 |

Letzter Satz Isolation: **RIR 0 erlaubt/erwünscht** (§2).

### Pausen

| Kontext | Pause | Bei Zeitbudget 45 Min |
|---|---|---|
| Schwere Grundübung, Kraft | 180 s | 150 s |
| Grundübung, Aufbau | 120–150 s | 120 s |
| Maschine / Verbund | 90–120 s | 90 s |
| Isolation | 60–90 s | 60 s |
| Bauch / Waden / Griff | 60 s | 60 s |

Nie unter 60 s (§5 — messbar schädlich).

### Aufwärmsätze (automatisch)

Nur vor der **ersten schweren Grundübung pro Muskelgruppe** in der Einheit — nicht vor
Isolation, nicht vor der zweiten Übung desselben Muskels (der ist dann warm):

| Satz | Gewicht | Wdh. | Pause |
|---|---|---|---|
| 1 | 50 % Arbeitsgewicht | 8 | 45 s |
| 2 | 70 % | 5 | 60 s |
| 3 *(nur bei ≥ 80 % 1RM)* | 85 % | 2–3 | 90 s |

Aufwärmsätze zählen **nicht** ins Volumen.

### Gewichtsvorgabe

```
1. Zielgewicht = geschätztes 1RM × Prozentsatz(Ziel-Wdh-Bereich)
2. × Schwierigkeits-Koeffizient der Übung (relativ zur Referenzübung)
3. → auf real einstellbare Stufe des Geräts runden  (§7)
4. Sonderfall FRE-11 (unterstützte Klimmzüge/Dips): INVERTIERT —
   Progression = weniger Unterstützungsgewicht
5. Körpergewichtsübungen: Wiederholungen statt Gewicht progressieren;
   Zusatzgewicht erst wenn Zielobergrenze erreicht
6. Woche 1: zusätzlich × 0,92 (Einmessung, §2)
```

---

## 7. Der Check-in — Optik, Gefühl und die eine kritische Zusatzfrage

**Explizite Nutzeranforderung.** Zwei Ebenen: wöchentlich kurz, monatlich objektiv.

### 7.1 Wöchentlich (~60 Sekunden, am gewählten Wochentag)

| # | Frage | Eingabe |
|---|---|---|
| 1 | Dein Körpergewicht — **Durchschnitt der Woche** | `Zahl` (kg) |
| 2 | **Optik:** Wie siehst du im Vergleich zur letzten Woche aus? | `Tap` 5-stufig: deutlich besser · etwas besser · unverändert · etwas schlechter · deutlich schlechter *(Label zielabhängig: „definierter" bei Diät, „muskulöser" bei Aufbau)* |
| 3 | **Energie & Erholung** | `Tap` 5-stufig: sehr frisch · gut · normal · müde · ausgelaugt |
| 4 | **Schlaf** | `Tap`: gut · mittel · schlecht |
| 5 | **Gelenke / Schmerzen** | `Tap`: keine · leichtes Ziehen · stört beim Training |
| 6 | **Lust aufs Training** | `Tap`: hoch · normal · niedrig |
| 7 | ⚠️ **Wie gut hast du dein Kalorienziel getroffen?** | `Tap`: gut getroffen · teils · gar nicht verfolgt |

### Warum Frage 7 nicht weggelassen werden darf

Wir tracken **kein** Essen (bewusste Entscheidung — das läuft in einer anderen App).
Die App kennt also nur *die Vorgabe* und *die Gewichtsveränderung*. Wenn das Gewicht
nicht wie erwartet reagiert, gibt es zwei mögliche Ursachen:

- Die Kalorienschätzung (Mifflin-St Jeor) war zu hoch/niedrig → **Vorgabe anpassen**
- Die Vorgabe wurde nicht umgesetzt → **Vorgabe anpassen wäre falsch**

Ohne Frage 7 kann die App das nicht unterscheiden und würde bei mangelnder Umsetzung
die Kalorien immer weiter verstellen — bis die Vorgabe absurd ist. **Regel:** Kalorien
werden nur angepasst, wenn Frage 7 mit „gut getroffen" beantwortet wurde. Sonst
kommt ein Hinweis auf die Umsetzung statt einer Zahlenänderung.

### 7.2 Monatlich (zusätzlich, ~3 Minuten, optional aber empfohlen)

| Erhebung | Details |
|---|---|
| **Umfänge** | Brust · **Taille (auf Nabelhöhe)** · Hüfte · Oberarm (angespannt) · Oberschenkel · Wade |
| **Fotos** | Vorne · Seite · Rücken — gleiche Beleuchtung/Pose/Tageszeit; **rein lokal gespeichert**, nicht in die Cloud |
| Körperfett-Schätzung | Bucket wie im Onboarding, neu bewertet |

### Warum die Taille der wichtigste Einzelwert ist

Gewicht allein kann Muskelaufbau nicht von Fettaufbau unterscheiden.
**Gewicht + Taillenumfang zusammen können es:**

| Gewicht | Taille | Interpretation | Reaktion |
|---|---|---|---|
| ↑ | stabil | **Idealer Aufbau** | Weiter so |
| ↑ | ↑ | Überschuss zu groß | Kalorien −150 bis −250 |
| stabil | ↓ | **Rekomposition** — läuft gut | Weiter so |
| ↓ | ↓ | Sauberer Fettverlust | Weiter so |
| ↓ | stabil | Muskelverlust-Risiko | Kalorien rauf, Volumen runter, Last halten |

Das macht die Ernährungsanpassung deutlich intelligenter als reine Gewichtssteuerung.

---

## 8. Kraftdaten aus den Logs (automatisch, ohne Extra-Eingabe)

**Explizite Nutzeranforderung.** Jeder geloggte Satz liefert: `Gewicht`,
`Wiederholungen`, `RIR/Gefühl`. Daraus berechnet die App ohne weiteres Zutun:

| Metrik | Formel / Definition | Verwendung |
|---|---|---|
| **e1RM** pro Satz | Epley: `Gewicht × (1 + Wdh/30)` (nur bei ≤ 12 Wdh.) | Primäres Kraftsignal pro Übung |
| **Best-e1RM** pro Übung pro Einheit | Max. über alle Sätze | Verlaufskurve, persönliche Rekorde |
| **Volumenlast** pro Übung | `Σ (Gewicht × Wdh.)` | Volumen-Trend, Ermüdungsindikator |
| **Volumenlast** pro Muskel | fraktional gewichtet summiert | Wochenvergleich |
| **Zielerreichung** | `erreichte Wdh. / Ziel-Wdh.` je Satz | Progressions-Entscheidung |
| **RIR-Drift** | Ist-RIR − Ziel-RIR, gemittelt | Ermüdungsfrüherkennung |
| **Stagnationszähler** pro Übung | Wochen ohne e1RM-Verbesserung | Rotations-/Deload-Trigger |

**Rauschunterdrückung:** Einzelsessions schwanken (Schlaf, Tageszeit, Stress). Alle
Trend-Entscheidungen laufen über einen **gleitenden Vergleich der letzten 2–3
Datenpunkte** derselben Übung, nie über eine einzelne Einheit. Ausnahme: Kreis 1
(Satzkorrektur), der genau *soll* sofort reagieren.

---

## 9. Die Anpassungslogik im Detail

### Grundsatz der Progression

> **Ein guter Satz ist Rauschen. Eine gute Übung ist ein Signal. Eine gute Einheit ist
> ein Auftrag.**

Die App reagiert auf drei Ebenen mit unterschiedlicher Trägheit. Ein einzelner starker
Satz ändert **nichts** an der Planung — er kann von Tagesform, Koffein oder
Motivation kommen. Erst Konsistenz löst eine Anpassung aus, und dann immer nur **einen
Schritt**.

### Das Feedback-Signal: Abgleich statt Bewertung

Nach jedem Satz wird nicht abstrakt „wie hart war das?" gefragt, sondern der
**Abgleich mit der Vorgabe**:

| Vorgabe war | Frage | Antworten |
|---|---|---|
| RIR 0 (bis zum Limit) | „Warst du wirklich am Limit?" | `Genau so` · `Mehr drin` · `Vorher schon am Ende` |
| RIR 1–3 (Reserve lassen) | „Hattest du noch ~2 übrig?" | `Genau so` · `Mehr drin` · `Weniger / am Limit` |

Intern wird das zu einer **Abweichung vom Ziel-RIR**:

```
„Genau so"                 →  Δ =  0
„Mehr drin"                →  Δ = +1,5  (leichter als geplant)
„Weniger / am Limit"       →  Δ = −1,5  (schwerer als geplant)
```

Vorteil gegenüber einer 5-stufigen Skala: Es ist ein *Vergleich*, keine *Bewertung* —
kognitiv leichter, ein Tap, und deshalb ohne Abstumpfung bei **jedem** Satz erfassbar.

### Satz-Status und Übungs-Status

```
SATZ-STATUS (pro Arbeitssatz):
  getroffen    = Wdh. ≥ Ziel-Wdh.  UND  Δ = 0
  übertroffen  = Wdh. ≥ Ziel-Wdh.  UND  Δ > 0
  verfehlt     = Wdh. <  Ziel-Wdh.
  hart         = Wdh. ≥ Ziel-Wdh.  UND  Δ < 0

ÜBUNGS-STATUS (aus allen Arbeitssätzen der Übung):
  ÜBERTROFFEN  = ALLE Sätze getroffen/übertroffen UND Mehrheit „Mehr drin"
  ERFÜLLT      = ALLE Sätze getroffen oder übertroffen
  KNAPP        = max. 1 Satz verfehlt, und zwar um max. 2 Wdh.
  VERFEHLT     = mehr als 1 Satz verfehlt, oder einer um ≥ 3 Wdh.
```

Entscheidend: Der Übungs-Status verlangt **alle** Sätze. Ein starker erster Satz
gefolgt von zwei mittelmäßigen ergibt `ERFÜLLT`, nicht `ÜBERTROFFEN` — genau so wie
es sein soll.

### Kreis 1 — innerhalb der Einheit: Fehlkorrektur, keine Progression

Kreis 1 hat **einen** Zweck: ein falsch angesetztes Gewicht retten. Er ist **kein**
Progressionsmechanismus.

```
Auslöser (nur nach Satz 1, nur einmal pro Übung pro Einheit):

  Wdh. ≥ Ziel + 3  UND  Δ > 0   (klar zu leicht)
      → Folgesätze: Gewicht +1 Stufe
      → „Das Gewicht war zu niedrig angesetzt — ich korrigiere auf 62,5 kg."

  Wdh. ≤ Ziel − 3  ODER  (Wdh. < Ziel UND Δ < 0)   (klar zu schwer)
      → Folgesätze: Gewicht −1 bis −2 Stufen
      → „Zu schwer angesetzt — ich nehme runter."

  Sonst: unverändert. Auch bei einem guten Satz.

Deckel:
  · max. 1 Korrektur pro Übung pro Einheit
  · max. +1 Stufe nach oben  (Ausnahme: Einmess-Woche, dort bis +2)
  · Eine Kreis-1-Korrektur verändert NICHT die Vorgabe für die nächste Einheit —
    sie geht als normaler Datenpunkt in Kreis 2 ein
```

**Formulierung ist wichtig:** „Das Gewicht war falsch angesetzt" — nicht „du wirst
stärker". Kreis 1 behebt einen Schätzfehler der App, er feiert keinen Fortschritt.

### Kreis 2 — nächste Einheit: Doppelprogression mit Bestätigung

```
ÜBERTROFFEN
    Anfänger ODER Einmess-Woche  → Gewicht +1 Stufe, Ziel-Wdh. zurück auf Untergrenze
    Fortgeschritten / Erfahren   → BESTÄTIGUNG ABWARTEN:
        1. Mal  → Ziel-Wdh. +1  (kein Gewichtssprung)
        2. Mal in Folge → Gewicht +1 Stufe, Ziel-Wdh. zurück auf Untergrenze

ERFÜLLT
    → Ziel-Wdh. +1
    → Ziel-Wdh. schon an der Bereichsobergrenze? → Gewicht +1 Stufe,
      Ziel-Wdh. zurück auf Untergrenze

KNAPP
    → 1.–2. Mal: Vorgabe unverändert wiederholen
    → ab 3. Mal in Folge auf derselben Vorgabe:
        an der Bereichsobergrenze → Gewicht +1 Stufe (der Wdh.-Aufbau ist fertig)
        darunter                  → Gewicht −1 Stufe, Ziel-Wdh. BLEIBT
                                    (stellt den geplanten RIR wieder her;
                                     kein Rückschritt im Sinne des Deload-Checks)

VERFEHLT
    → 1. Mal: Vorgabe unverändert wiederholen
    → 2. Mal in Folge: Gewicht −5 bis −10 %, Rückschritt-Zähler +1
      (Zähler ≥ 2 = Ermüdungssignal für den Deload-Check)
      Ziel-Wdh. auf dem reduzierten Gewicht = höchste dort schon
      erfüllte Vorgabe, nicht die Bereichsuntergrenze
```

**Harte Obergrenze: pro Übung und Einheit entweder +1 Wiederholung *oder* +1
Gewichtsstufe — niemals beides und niemals mehr.**

Das setzt die Anforderung „nicht direkt 3 Wdh. mehr, nur weil man einmal stark war"
strukturell um: Selbst wenn jemand 5 Wiederholungen über dem Ziel liegt, steigt das
Ziel nur um 1.

### Erwartetes Progressionstempo (Plausibilitätsanker)

Die Bestätigungsregel ist so kalibriert, dass sie das für das Level typische Tempo
trifft (§7 Trainingswissenschaft):

| Level | Realistisch pro Übung | Ergibt sich aus |
|---|---|---|
| Anfänger | fast jede Einheit eine Stufe | direkte Steigerung bei `ÜBERTROFFEN` |
| Fortgeschritten | 1 Stufe alle 2–4 Wochen | +1 Wdh./Einheit durch den Bereich, dann Gewicht |
| Erfahren | 1 Stufe alle 4–8 Wochen | wie oben, aber breitere Wdh-Bereiche |

Rechenbeispiel (fortgeschritten, Bereich 8–12, 2 Einheiten/Woche): 8→9→10→11→12 →
Gewicht rauf = 5 Einheiten ≈ **2,5 Wochen pro Gewichtsstufe**. Passt.

#### Vier Regeln, die erst die Simulation erzwungen hat

Die Regeln oben wurden über 10-Wochen-Simulationen mit verschiedenen Athleten-Modellen
geprüft (Wiederholungen nach Epley aus einem wachsenden echten 1RM). Vier Lücken
wurden dabei sichtbar, die sich aus dem Regelwerk allein nicht ablesen lassen:

**1. Die Bestätigung muss verbraucht werden.**
Der Bestätigungszähler darf nur Einheiten *seit der letzten Gewichtsänderung* zählen.
Zählt er die ganze Historie, bleibt er nach zwei Bestätigungen dauerhaft über der
Schwelle — das Gewicht steigt dann in **jeder** Einheit. In der Simulation ergab das
+50 kg Bankdrücken in 10 Wochen. Dieselbe Fensterung gilt für den Rückschritt-Zähler,
damit nicht zweimal hintereinander gesenkt wird.

**2. KNAPP braucht einen Ausweg — und die Richtung hängt von der Lage im Bereich ab.**
Ohne Ausweg stand ein Nutzer 16 Einheiten (8 Wochen) unverändert bei derselben
Vorgabe: Er traf die Wiederholungen, aber immer am Limit statt mit Reserve. An der
Bereichsobergrenze ist das kein Stillstand, sondern der abgeschlossene
Wiederholungsaufbau → Gewicht **rauf**. Darunter heißt dasselbe Signal, dass das
Gewicht über dem geplanten RIR liegt → Gewicht **runter**, Wiederholungen bleiben.

**3. Grobe Gerätestufen erst nehmen, wenn die Kapazität sie trägt.**
2,5 kg auf eine 10-kg-Kurzhantel sind +25 %. Ein Sprung an der Bereichsobergrenze
scheitert dort zwangsläufig, wird zurückgenommen, erneut versucht — der Nutzer pendelt
zwischen zwei Stufen ohne jeden Fortschritt. Ab **10 % relativer Stufenhöhe** wird der
Sprung deshalb an eine Epley-Kapazitätsprüfung gekoppelt, und der Wiederholungsbereich
darf bis +6 überschritten werden. Genau so arbeitet man mit festen Kurzhanteln auch
tatsächlich. Ein bereits gescheiterter Sprung wird zudem erst wiederholt, wenn die
Grundlage nachweislich besser ist (mehr Wiederholungen **und** 5 % Sicherheitsabstand).

**4. Nach einem Rückschritt auf dem bewiesenen Niveau ansetzen.**
Wer 10 kg × 14 schon geschafft hat, muss dort nicht wieder mit 6 Wiederholungen
anfangen. Ohne diese Regel kostete jeder Rückschritt acht Einheiten, in denen nur
Bekanntes wiederholt wurde.

Anfänger steigern weiterhin in fast jeder Einheit (Regel 1 greift dort nicht, weil sie
gar keine Bestätigung abwarten). Das ist gewollt und begrenzt sich in der Realität
selbst: Sobald die Reserve fehlt, endet die Steigerung.

### Die Nach-Training-Analyse (läuft nach **jeder** Einheit)

**Explizite Nutzeranforderung:** Nach jedem Training wird die Einheit vollständig
analysiert und geprüft, was angepasst werden muss, um das Ziel schneller zu erreichen.

Die Analyse läuft **lokal auf dem Gerät** — also auch offline — direkt beim Speichern
der Einheit. Sie ist reine Berechnung aus den Rohdaten und damit jederzeit reproduzierbar.

#### Was geprüft wird

| # | Prüfung | Datenbasis | Ergebnis |
|---|---|---|---|
| 1 | **Übungs-Status** je Übung | alle Arbeitssätze dieser Einheit | Vorgabe für nächstes Mal (Kreis 2) |
| 2 | **Einheits-Qualität** | Anteil erfüllter/übertroffener Übungen | ggf. breite Anhebung (Kreis 2b) |
| 3 | **Wochenvolumen-Abgleich** | fraktionales Volumen dieser Woche vs. Wochenziel je Muskel | Kompensation in der nächsten Einheit |
| 4 | **Ermüdungs-Trend** | RIR-Drift + Zielerreichungsquote der letzten 3 Einheiten | Deload-Frühwarnung |
| 5 | **Stagnation je Übung** | e1RM-Verlauf, Stagnationszähler | Rotationskandidat markieren |
| 6 | **Rekorde** | e1RM je Übung vs. bisheriges Maximum | Anzeige + Motivation |
| 7 | **Zielfortschritt** | zielabhängige Leitmetrik (s. u.) | „auf Kurs" / „hinter Plan" |
| 8 | **Ausreißer-Erkennung** | Abweichung dieser Einheit vom eigenen Schnitt | Einheit als Ausreißer markieren, nicht überreagieren |

**Zielabhängige Leitmetrik** für Prüfung 7:

| Ziel | Leitmetrik | „Auf Kurs" heißt |
|---|---|---|
| Muskelaufbau | Volumenlast-Trend je Muskel + Wochenvolumen im Korridor | beides steigt |
| Maximalkraft | e1RM-Trend der Hauptübungen | steigt über 2–3 Datenpunkte |
| Fettverlust | e1RM **hält** bei sinkendem Körpergewicht | Kraft stabil = Muskeln bleiben |
| Allg. Fitness | Zielerreichungsquote + Konstanz | stabil hohe Quote |

#### Sofort vs. aufgeschoben — die entscheidende Trennung

Die Analyse läuft nach jeder Einheit. **Nicht jede Erkenntnis darf aber sofort zu einer
Änderung führen** — sonst wäre die Progressionsbremse wirkungslos, die genau verhindern
soll, dass ein guter oder schlechter Tag den Plan umwirft.

| Wirkt **sofort** (nach der Einheit) | Wirkt erst **beim Check-in** | Nur **beobachtet** |
|---|---|---|
| Vorgabe je Übung für nächstes Mal (Kreis 2) | Wochenvolumen ± | Stagnationszähler |
| Breite Anhebung bei Einheits-Score ≥ 80 % (Kreis 2b) | Kalorien / Makros | Ermüdungs-Signale |
| Volumen-Kompensation in der nächsten Einheit | Übungsrotation | Ausreißer-Markierungen |
| Rekord-Anzeige | Deload-Entscheidung | Zielfortschritt-Trend |

**Warum Volumen und Ernährung warten:** Beide Entscheidungen brauchen die
Erholungs- und Gewichtsdaten aus dem Check-in (§7). Volumen mitten in der Woche
anzuheben, ohne zu wissen, ob die Erholung mitgeht, wäre geraten — nicht gesteuert.

**Warum die Rotation wartet:** Eine Übung mitten in der Woche zu tauschen zerstört die
Vergleichbarkeit, auf der die Progression beruht.

#### Was der Nutzer sieht

Der Abschluss-Screen (`UI-UX.md` §7) zeigt das Ergebnis in drei Blöcken:

```
GESCHAFFT      Rekorde, erledigte Sätze, Volumenlast vs. letzte Einheit
GEÄNDERT       konkrete neue Vorgaben fürs nächste Mal, jeweils mit Grund
BEOBACHTET     was auffällt, aber noch keine Änderung auslöst — mit Begründung
```

Der dritte Block ist wichtig für das Vertrauen: Er zeigt, dass die App etwas *gesehen*
hat und bewusst noch nicht handelt — statt still nichts zu tun.

```
BEOBACHTET
  Seitheben  3 Wochen kein Fortschritt
             → Tauschvorschlag beim Check-in am Sonntag
  Erholung   RIR-Rückmeldung 2 Einheiten in Folge unter Ziel
             → wenn das anhält, schlage ich eine Entlastungswoche vor
```

### Kreis 2b — Einheits-Qualität: wenn das *ganze* Training gut war

Explizite Nutzeranforderung. Ein einzelner starker Satz ist Rauschen — eine durchweg
starke **Einheit** ist ein belastbares Signal, das eine breitere Steigerung
rechtfertigt.

```
Einheits-Score = Anteil der Übungen mit Status ÜBERTROFFEN oder ERFÜLLT

≥ 80 % ÜBERTROFFEN
    → Die ganze Einheit war zu leicht.
    → Bestätigungsregel wird EINMALIG übersprungen: alle betroffenen Übungen
      gehen direkt eine Gewichtsstufe hoch (statt nur +1 Wdh.)
    → Meldung: „Die komplette Einheit war zu leicht — ich hebe auf breiter Front an."

≥ 80 % ERFÜLLT / ÜBERTROFFEN
    → Normale Progression pro Übung (Kreis 2)
    → Positives Signal für die wöchentliche Volumensteigerung (Kreis 3)

50–80 %
    → Normale Progression, keine Volumensteigerung diese Woche

< 50 %
    → Alle Vorgaben halten, Ermüdung prüfen

< 30 %
    → Zählt als Signal für den Deload-Check (§9c)
```

Damit gilt: **Einzelne Ausreißer werden gedämpft, systematische Stärke wird belohnt.**

Alle Gewichte werden gerätegerecht gerundet; FRE-11 bleibt invertiert.

### Kreis 3 — wöchentlich (nach dem Check-in)

**a) Volumen pro Muskelgruppe**

```
Erholung_ok = (Energie ≥ normal) UND (Schlaf ≠ schlecht)
              UND (Gelenke ≠ stört) UND (RIR-Drift > −1)

FÜR jeden Volumen-Muskel:
  Leistung steigt   UND Erholung_ok      → +1 Satz   (bis Obergrenze)
  Leistung stagniert UND Erholung_ok     → +2 Sätze  (mehr Reiz nötig)
  Leistung stagniert UND !Erholung_ok    → Volumen halten
  Leistung fällt                          → −20 % Volumen + Deload-Prüfung

Harte Deckel:
  · Wochensprung max. +20 % des aktuellen Volumens
  · Level-Obergrenze aus §3 nie überschreiten
  · Bei Ziel Fettverlust: Obergrenze = Startwert (Erhalt, nicht Aufbau)
```

**b) Kalorien & Makros**

```
WENN Check-in-Frage 7 ≠ „gut getroffen":
    → KEINE Kalorienänderung. Hinweis auf Umsetzung.
    → (Sonst verstellt sich die Vorgabe wegen mangelnder Adhärenz.)

SONST, auf Basis des Gewichts-Trends (gleitender Ø über 2–3 Wochen):

  Ist-Rate weicht < 50 % von der Zielrate ab   → keine Änderung (Rauschen)
  Zu langsam                                    → Kalorien +150 … +250
  Zu schnell                                    → Kalorien −150 … −250
  Aufbau: Gewicht ↑ aber Taille ↑ (Monatsdaten) → Kalorien −200
  Diät:   Gewicht ↓ aber Kraft fällt 2+ Wochen  → Kalorien +200, Volumen −20 %

Protein bleibt fix an das Körpergewicht gekoppelt (neu berechnet).
Fett-Minimum 0,8 g/kg wird nie unterschritten. Rest = Kohlenhydrate.
```

**c) Deload-Prüfung** (§8 — ermüdungsgetriggert, nie kalendarisch)

```
Signale (über 1–2 Wochen):
  □ Leistungsabfall in ≥ 2 Übungen
  □ RIR-Drift systematisch < −1 (alles fühlt sich schwerer an)
  □ Energie „ausgelaugt" ODER Schlaf „schlecht" (2 Wochen in Folge)
  □ Gelenke „stört beim Training"
  □ Rückschritt-Zähler ≥ 2 in derselben Übung
  □ Trainingslust „niedrig" (2 Wochen in Folge)

≥ 2 Signale  → Deload-Woche vorschlagen (Nutzer kann ablehnen):
                 Volumen ~50 % · Last ~90 % · RIR +2 · Übungen unverändert
≥ 4 Signale  → Deload dringend empfehlen + Hinweis auf Schlaf/Ernährung/Stress
```

**d) Übungsrotation**

```
Stagnationszähler einer Übung ≥ 3 Wochen (kein e1RM-Fortschritt)
  UND Volumen wurde bereits erhöht
    → Übung gegen bestbewertete Alternative für denselben Muskel tauschen
      (bevorzugt eine noch nicht abgedeckte Unterregion)

Schwere Grundübungen (Kniebeuge, Bankdrücken, Kreuzheben, Klimmzug) werden
LANGFRISTIG STABIL gehalten — sie sind der Kraftmaßstab. Rotiert werden
Accessory- und Isolationsübungen.
```

**e) Optik-Feedback nutzen**

Die Antwort auf Frage 2 ist ein subjektives, aber wertvolles Signal — sie fließt
zusammen mit Gewicht und Taille ein:

```
Aufbau:  Gewicht ↑ + Optik „schlechter"   → Überschuss zu groß → Kalorien −200
         Gewicht ↑ + Optik „besser"        → optimal, weiter
Diät:    Gewicht ↓ + Optik „unverändert"   → oft nur Wassereinlagerung → abwarten,
                                              nicht überreagieren (mind. 2 Wochen)
         Gewicht stabil + Optik „besser"    → Rekomposition läuft → nichts ändern
```

Wichtig: Optik-Antworten werden **nie allein** zur Grundlage einer Änderung gemacht —
subjektive Wahrnehmung schwankt stark (Beleuchtung, Tagesform, Stimmung).

#### Drei Regeln, die erst der Durchlauf im Browser erzwungen hat

**1. In der Einmess-Phase wird das Volumen NICHT erhöht.**
Der erste echte Check-in hob sieben Muskelgruppen um je einen Satz an, weil in der
zweiten Einheit überall eine Wiederholung mehr geschafft wurde. Nur: In der
Einmess-Woche sind die Gewichte absichtlich konservativ angesetzt. Ein Zuwachs dort ist
der korrigierte Schätzfehler, nicht Anpassung — dieselbe Unterscheidung, die Kreis 1
trifft („das Gewicht war zu niedrig angesetzt", nicht „du wirst stärker"). Volumen
darauf zu erhöhen bringt zusätzliche Ermüdung für einen Scheinfortschritt. Ein echter
Leistungsabfall wird dagegen auch dort nach unten korrigiert.

**2. Die Gewichtsrate wird ausschließlich aus WOCHENDURCHSCHNITTEN gerechnet.**
Kein Rückfall auf die Tages-Messreihe. Ein Wochenschnitt gegen einen Tageswert
gerechnet misst vor allem Wasser, Salz und Darminhalt. Im Browser ergab genau das
„−0,47 % — zu langsam, +200 kcal", obwohl das Gewicht von 84,0 auf 84,4 kg
**gestiegen** war. Die Folge ist gewollt: In der ersten Woche gibt es keine
Kalorienänderung, weil es noch keinen Trend gibt.

**3. Ein gleich hoher e1RM-Wert ist Stillstand, nicht Fortschritt.**
Der Stagnationszähler suchte Werte *unterhalb* des Bestwerts. Beim häufigsten
Plateaufall — viermal exakt dasselbe Gewicht bei denselben Wiederholungen — ist der
letzte Wert aber *gleich* dem Bestwert, und der Zähler meldete null. Damit blieb ein
Plateau sowohl für die Übungsrotation als auch für den „Beobachtet"-Block unsichtbar.
Gezählt wird jetzt gegen den besten Wert VOR der jeweiligen Einheit.

### Kreis 4 — Block-Review (alle 4–6 Wochen)

| Prüfung | Aktion |
|---|---|
| **Erhaltungsbedarf neu schätzen** | Aus echten Daten: verordnete Kalorien + tatsächliche Gewichtsveränderung → realer TDEE. Ersetzt die Mifflin-St-Jeor-Schätzung. **Nur bei durchgehend „gut getroffen"-Antworten.** |
| Volumen-Landmarken | Wo liegt der Muskel im Korridor? Obergrenze erreicht und Fortschritt weg → Volumen auf Startniveau zurücksetzen (Re-Sensibilisierung) und neu aufbauen |
| Übungsabdeckung | Alle Unterregionen der Prioritätsmuskeln in den letzten 6 Wochen getroffen? |
| Split noch passend? | Trainingstage tatsächlich eingehalten? Bei < 80 % Adhärenz: kleineren Split vorschlagen |
| Prioritäten | Nachfrage, ob die Schwerpunkte noch stimmen |
| Zielprüfung | Zielgewicht erreicht → Übergang vorschlagen (Diät → Erhalt → Aufbau) |
| Level-Upgrade | Trainingsjahre + Fortschrittsrate → ggf. Level anheben (höheres Volumenbudget) |

---

## 10. Sonderfälle

| Fall | Verhalten |
|---|---|
| **Gerät belegt** | Tausch-Button: bestbewertete verfügbare Alternative für denselben Zielmuskel, Gewicht über Koeffizient umgerechnet. Der Tausch wird geloggt (die neue Übung startet mit eigener Progressionshistorie) |
| **Einheit verpasst** | Kein blindes Verschieben. Die nächste Einheit absorbiert das **fehlende Volumen der am stärksten unterversorgten Muskeln** — priorisiert nach Wochendefizit |
| **Zeit reicht nicht** | Reihenfolge des Streichens: (1) Griff/Schienbein → (2) Bauch → (3) letzte Isolationsübung der Nicht-Prioritätsmuskeln → (4) Pausen der Isolation kürzen. **Nie** die Grundübungen oder den Prioritätsmuskel |
| **Viel eigenes Cardio, Kraft fällt ab** | Die App plant kein Cardio, kennt es also nicht. Wenn ein Leistungsabfall nicht anders erklärbar ist, fragt der Check-in einmalig nach dem Ausdauerumfang und weist auf die Interferenz hin (`TRAINING-SCIENCE.md` §9) — als Hinweis, nicht als Vorgabe |
| **Krankheit / Pause > 7 Tage** | Rückkehr-Protokoll: Woche 1 mit 60 % Volumen und −10 % Last, dann in 2 Wochen zurück auf Niveau. Kein Weitermachen als wäre nichts gewesen |
| **Pause > 4 Wochen** | Neue Einmessung wie in Woche 1 |
| **Schmerz während einer Übung** | Übung sofort als sensibel markieren, für diese Einheit tauschen, im Check-in nachfragen. Bei Wiederholung: aus dem Pool nehmen + Hinweis auf ärztliche Abklärung |
| **Nutzer überschreibt Vorgabe** | Immer erlaubt. Die App lernt daraus (dauerhaft höhere/niedrigere Gewichte → Schätzung korrigieren), belehrt aber nicht |
| **Check-in ausgelassen** | Plan läuft mit Kreis 1+2 weiter (die funktionieren ohne Check-in). Nach 2 verpassten Check-ins: freundliche Erinnerung, dass Volumen und Kalorien ohne Rückmeldung nicht angepasst werden können |

---

## 11. Sicherheits-Leitplanken

Harte Grenzen, die keine Regel überschreiten darf:

- **Pro Übung und Einheit entweder +1 Wiederholung *oder* +1 Gewichtsstufe — niemals
  beides, niemals mehr.** Auch nicht bei außergewöhnlich starker Leistung
  (einzige Ausnahme: Einheits-Score ≥ 80 % `ÜBERTROFFEN`, §9 Kreis 2b)
- Gewichtserhöhung bei *fortgeschritten/erfahren* erst nach **zweifacher Bestätigung**
- Gewichtssprung pro Einheit: **max. +10 %** oder +1 Gerätestufe (was größer ist)
- Volumensprung pro Woche: **max. +20 %**
- Level-Obergrenze aus §3 ist absolut
- Satzpause nie unter **60 s** (§5)
- Kein Muskelversagen bei schweren Grundübungen (§4)
- Anfänger: erste 4 Wochen Technikfokus (mehr Wdh., konservativere Last, mehr
  geführte Varianten)
- Kein vorgeschlagenes Gewicht, das am Gerät nicht einstellbar ist (§7)
- Nie mehr als **eine** Ernährungsvariable pro Check-in ändern (sonst ist die Ursache
  nicht mehr zuordenbar)
- Bei akuten Schmerzangaben: kein „Weitertrainieren"-Vorschlag, sondern Ausschluss +
  Hinweis auf medizinische Abklärung

---

## 12. Beispiel: eine generierte Woche

**Profil:** männlich · 26 J · 180 cm · 78 kg · Ziel Muskelaufbau · fortgeschritten ·
4 Tage (Mo/Di/Do/Fr) · 75 Min · Priorität Brust + Rücken · keine Einschränkungen

**Abgeleitet:** Ober-/Unterkörper-Split 2× · Volumen Brust 16 · Lat 16 ·
ob. Rücken 13 · Quad 13 · Ham 11 · Gesäß 11 (Prioritäten +3) ·
2.870 kcal · 140 g Protein · 75 g Fett · 355 g KH · Zielrate +0,16 kg/Woche

**Montag — Oberkörper A**

| # | Übung | Sätze × Wdh. | RIR | Pause |
|---|---|---|---|---|
| 1 | Langhantel Bankdrücken flach *(Priorität, + Aufwärmsätze)* | 4 × 5–8 | 2 | 150 s |
| 2 | Klimmzug Obergriff breit *(Priorität)* | 4 × 6–10 | 2 | 150 s |
| 3 | Incline Chest Press geführt | 3 × 8–12 | 1 | 120 s |
| 4 | Rudermaschine Brustpolster, breit | 3 × 8–12 | 1 | 120 s |
| 5 | Kurzhantel Seitheben sitzend | 3 × 12–18 | 0–1 | 75 s |
| 6 | Reverse Butterfly | 3 × 12–18 | 0–1 | 75 s |
| 7 | SZ Skullcrusher | 3 × 10–15 | 0–1 | 75 s |
| 8 | Schrägbank-Curls *(gedehnte Position)* | 3 × 10–15 | 0–1 | 75 s |

Fraktionales Volumen dieser Einheit: Brust 8,5 · Lat 7,0 · ob. Rücken 8,5 ·
Bizeps 6,5 · Trizeps 6,0 · Schulter seitl. 3,0 · hint. Schulter 4,5

**Freitag — Oberkörper B** nutzt andere Varianten (Kurzhantel Schrägbank ·
Lat Pulldown Dual · Butterfly · T-Bar Row · Kabel Seitheben · Face Pull ·
Kabel Pushdown Seil · Hammercurls) → über die Woche sind alle Brust- und
Rücken-Unterregionen abgedeckt, ohne dass eine Übung doppelt vorkommt.

---

## 13. Offene Punkte

1. **Schwierigkeits-Koeffizienten** pro Übung (Startgewichte + Tausch-Umrechnung) —
   größte verbleibende Datenaufgabe
2. **„Gedehnte Position"-Tag** pro Übung — für die Bewertungsfunktion (§5.2)
3. **Verletzungs-Mapping** Körperregion → auszuschließende Übungen
4. **Überlappungsmatrix** zwischen Übungen (für die Redundanz-Strafe in §5.2) —
   kann aus den `primary`/`secondary`-Listen automatisch berechnet werden
5. **Systemlast-Rang** pro Übung (für die Reihenfolge schwerer Grundübungen)
6. **Abweichende Steckgewicht-Stufen / Maximalgewichte** — beim ersten Gebrauch
   erfragen
7. **Validierung der Volumen-Budgets in §3** an echten Daten: nach ein paar Monaten
   prüfen, ob die Startwerte und Obergrenzen für euch beide realistisch waren
