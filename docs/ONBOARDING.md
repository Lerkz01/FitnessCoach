# Onboarding — Spezifikation

> **Zweck:** Screen-für-Screen-Vorgabe für den Onboarding-Wizard. Jede Frage ist
> begründet mit dem, was sie im Motor steuert (Referenz: `TRAINING-SCIENCE.md`).
>
> **Stand:** 2026-08-06
>
> **Getroffene Entscheidungen:** vollständiges Onboarding in einem Durchlauf ·
> Wizard-Stil (eine Frage pro Screen) · Kraft-Referenzwerte optional erfragen +
> einmessen · **kein** Geräte-Auswahlschritt (die Liste *ist* das Gym)

---

## Designprinzipien

1. **Jede Frage muss sich rechtfertigen.** Wenn eine Antwort nichts im Plan ändert,
   fliegt die Frage raus. Bei nicht offensichtlichen Fragen sagt die App **warum**
   sie fragt (z. B. Geschlecht → „nur für die Kalorienformel").
2. **Tippen minimieren.** Standard ist Antippen; Zahlenfelder nur wo unvermeidbar
   (Körperdaten, Referenzgewichte), dann mit numerischer Tastatur.
3. **Keine Sackgassen.** Jede optionale Frage hat „weiß ich nicht" / „überspringen".
   Fehlende Daten führen zu konservativeren Vorgaben, nie zu einem Abbruch.
4. **Zurück ist immer möglich.** Fortschrittsbalken + Schritt-Zähler sichtbar.
5. **Zwischenspeichern.** Abbruch mitten drin verliert nichts; Fortsetzen möglich.
6. **Ehrlich bleiben.** Wo die App schätzt, sagt sie das (Startgewichte, Kalorien).

**Umfang:** 20 Screens, davon 3 überspringbar → realistisch **6–8 Minuten**.

> **Cardio wird von der App nicht geplant** (Entscheidung 2026-08-06). Der Nutzer regelt
> Ausdauertraining selbst. Es gibt deshalb keine Cardio-Frage im Onboarding und keine
> Cardio-Vorgabe im Plan.

---

## Screen-für-Screen

Legende Eingabetyp: `Tap` = eine Auswahl · `Multi` = Mehrfachauswahl ·
`Zahl` = Zahlenfeld · `Text` = Textfeld · `Toggle` = Ein/Aus je Element

### Teil 0 — Start

| # | Screen | Inhalt | Eingabe |
|---|---|---|---|
| 1 | Willkommen | Was passiert jetzt, wie lange es dauert (~7 Min), was am Ende rauskommt („dein erstes Training steht danach fest"). Hinweis: alles später änderbar. | Button „Los geht's" |

### Teil 1 — Profil

| # | Frage | Eingabe | Pflicht | Steuert |
|---|---|---|---|---|
| 2 | Wie heißt du? | `Text` | ✅ | Profil-Trennung (2 Nutzer). Bei vorhandenen Profilen: Auswahl „bestehendes Profil" vs. „neu" |
| 3 | Geschlecht *(Hinweis: „brauche ich nur für die Kalorienformel")* | `Tap`: männlich · weiblich · keine Angabe | ✅ | Mifflin-St Jeor. Bei „keine Angabe" → Mittelwert beider Formeln. **Keine sonstige Auswirkung auf den Trainingsplan** (§11) |
| 4 | Deine Körperdaten | `Zahl` ×3: Alter (J) · Größe (cm) · Gewicht (kg) | ✅ | Kalorienbedarf, Startgewicht-Schätzung, Baseline fürs Check-in |

> **Bewusste Abweichung von „1 Frage pro Screen":** Alter/Größe/Gewicht stehen
> zusammen auf einem Screen. Drei Zahlenfelder derselben Art auf drei Screens zu
> verteilen wäre reine Schikane.

### Teil 2 — Ziel & Ausrichtung

| # | Frage | Eingabe | Pflicht | Steuert |
|---|---|---|---|---|
| 5 | Was ist dein Hauptziel? | `Tap`: **Muskelaufbau** · **Maximalkraft** · **Fettverlust** · **Allgemeine Fitness** (Karten mit je 1 Satz Erklärung) | ✅ | Wdh-Bereiche, Volumenkorridor, Ziel-RIR, Kalorienrichtung (§1, §3, §4, §10) |
| 6 | Feinabstimmung *(beides optional)* | `Zahl`: Zielgewicht · `Tap`: Körperfett-Bereich · beide mit „weiß ich nicht" | ⬜ | Zielgewicht → Zeithorizont. Körperfett → Defizit-Rate am oberen (0,7 %) oder unteren Ende (0,5 %) (§10) |
| 7 | Gibt es Muskelgruppen, die dir besonders wichtig sind? *(max. 2)* | `Multi` (max. 2) aus: Brust · Rücken · Schultern · Arme · Beine · Gesäß · Bauch · **keine Präferenz** | ⬜ | Übungsreihenfolge (Priorität zuerst = mehr Zuwachs, §6) + etwas mehr Volumen, ohne die Balance zu brechen |

**Körperfett-Buckets** (verbal, keine Zahleneingabe — Schätzungen sind sowieso grob):

| männlich | weiblich |
|---|---|
| unter ~10 % (sehr definiert, Bauchmuskeln klar sichtbar) | unter ~18 % |
| ~10–14 % (Bauchmuskeln sichtbar) | ~18–22 % |
| ~15–19 % (schlank, Bauchmuskeln angedeutet) | ~23–27 % |
| ~20–24 % (normal, weiche Mitte) | ~28–32 % |
| ~25–29 % | ~33–37 % |
| über ~30 % | über ~38 % |

### Teil 3 — Erfahrung

| # | Frage | Eingabe | Pflicht | Steuert |
|---|---|---|---|---|
| 8 | Wie viel Krafttraining-Erfahrung hast du? | `Tap`: **Anfänger** (Technik im Aufbau) · **Fortgeschritten** (Grundübungen sitzen) · **Erfahren** (kenne meine Zahlen) | ✅ | Startvolumen 8–10 / 12–14 / 14–16 fraktionale Sätze (§1) |
| 9 | Wie lange trainierst du schon regelmäßig? | `Tap`: < 6 Monate · 6–12 Monate · 1–2 Jahre · 2–5 Jahre · über 5 Jahre | ✅ | Realistisches Progressionstempo (§7) — verhindert Vorgaben wie „jede Woche +2,5 kg" bei Erfahrenen |
| 10 | Kennst du „RIR" bzw. „RPE"? | `Tap`: **Ja, kenne ich** · **Nein / lieber einfach** | ✅ | Sprache des Satz-Feedbacks: „2 Wdh. in Reserve" vs. „ging leicht / war hart / grenzwertig". **Der wichtigste UX-Schalter der App** (§4) |

### Teil 4 — Rahmenbedingungen

| # | Frage | Eingabe | Pflicht | Steuert |
|---|---|---|---|---|
| 11 | An welchen Tagen willst du trainieren? | `Toggle` Mo–So (3–6 Tage wählbar) | ✅ | **Split-Auswahl + Erholungsverteilung in einem Schritt.** Anzahl leitet den Split ab, die konkreten Tage die Reihenfolge (z. B. keine 2 Beintage hintereinander) |
| 12 | Wie viel Zeit hast du pro Einheit? | `Tap`: 45 Min · 60 Min · 75 Min · 90+ Min | ✅ | Übungsanzahl + Pausenlängen. Bei 45 Min: weniger Isolation, kürzere Isolations-Pausen (§5) |
| 13 | Wie aktiv ist dein Alltag *außerhalb* des Trainings? | `Tap`: **Sitzend** (Büro, wenig Gehen) · **Leicht aktiv** (etwas unterwegs) · **Aktiv** (viel auf den Beinen) · **Sehr aktiv** (körperliche Arbeit) | ✅ | Aktivitätsfaktor. **Bewusst ohne Training gefragt** — das Training kennt die App schon aus Screen 11 und rechnet es separat drauf. Genauer als die üblichen Ein-Dropdown-Lösungen. Eigenes Cardio zählt hier mit hinein |

**Split-Ableitung** (aus Screen 11, §2):

| Tage | Split | Frequenz/Muskel |
|---|---|---|
| 3 | Ganzkörper A/B/C | ~3× |
| 4 | Oberkörper/Unterkörper 2× | 2× |
| 5 | Push/Pull/Legs + Ober/Unter | ~2× |
| 6 | Push/Pull/Legs 2× | 2× |

**Aktivitätsfaktor:**

| Alltag | Basisfaktor |
|---|---|
| Sitzend | 1,20 |
| Leicht aktiv | 1,35 |
| Aktiv | 1,50 |
| Sehr aktiv | 1,65 |

→ zzgl. **+0,025 pro Trainingseinheit/Woche** (aus Screen 11).
Beispiel: sitzend + 4 Einheiten → 1,20 + 0,10 = **1,30**.
Das ist eine **Schätzung** — der Check-in korrigiert sie (§10).

### Teil 5 — Einschränkungen

| # | Frage | Eingabe | Pflicht | Steuert |
|---|---|---|---|---|
| 14 | Hast du Beschwerden oder Verletzungen? | `Multi`: Knie · Schulter · unterer Rücken · Ellenbogen · Handgelenk · Hüfte · Nacken · Sprunggelenk · **keine** | ✅ | Übungs-Ausschluss über Muskel-/Bewegungs-Mapping. Bei Auswahl: Nachfrage „aktuell akut" vs. „alte Sache, vorsichtig sein" → akut = harter Ausschluss, sonst = Deprioritisierung |
| 15 | Übungen, die du nicht machen willst? | Suchfeld über alle 381 Übungen, Mehrfachauswahl · „keine" | ⬜ | Persönliche Blacklist wird respektiert; Motor ersetzt gleichwertig (gleicher Zielmuskel) |

> **Sicherheitshinweis (Pflicht-Text auf Screen 15):** „Ich bin kein Arzt. Bei akuten
> oder anhaltenden Schmerzen lass das bitte medizinisch abklären — ich plane dann um
> das Problem herum, aber ich kann es nicht beurteilen."

### Teil 6 — Kraft-Ausgangswerte *(überspringbar)*

| # | Screen | Inhalt | Eingabe |
|---|---|---|---|
| 16 | Intro | „Wenn du deine aktuellen Gewichte kennst, treffe ich den Start genauer. Wenn nicht: kein Problem — ich schätze konservativ und messe in den ersten Einheiten ein." | `Tap`: **Ich gebe Werte an** · **Überspringen (einmessen)** |
| 17 | Referenzübungen | 6 Zeilen, jede einzeln überspringbar: **Gewicht (kg) × Wiederholungen** | `Zahl` ×2 pro Zeile + „kenne ich nicht" |
| 18 | Körpergewichtsübungen | Max. Wiederholungen: Klimmzüge · Liegestütze · Dips | `Zahl` ×3, je überspringbar |

**Die 6 Referenzübungen** — decken die fünf Grundbewegungsmuster + Hüftstreckung ab:

| Muster | Übung (Auswahl erlaubt) |
|---|---|
| Drücken horizontal | Bankdrücken flach (Langhantel **oder** Kurzhantel) |
| Kniebeugen | Kniebeuge **oder** Beinpresse |
| Ziehen vertikal | Klimmzüge (nur Wdh.) **oder** Latzug |
| Ziehen horizontal | Rudern (Maschine / Kabel / Langhantel) |
| Drücken vertikal | Schulterdrücken (Langhantel / Kurzhantel / Maschine) |
| Hüftstreckung | Kreuzheben **oder** Rumänisches Kreuzheben |

**Ableitung der Startgewichte:**

1. Geschätztes 1RM per **Epley**: `1RM ≈ Gewicht × (1 + Wdh / 30)`
   → **nur für ≤ 12 Wiederholungen** verwenden, darüber wird die Schätzung unzuverlässig.
2. Arbeitsgewicht = Prozentsatz des 1RM passend zum Ziel-Wdh-Bereich.
3. Andere Übungen desselben Musters über einen **Schwierigkeits-Koeffizienten**
   relativ zur Referenz (z. B. Schrägbankdrücken ≈ 0,8 × Flachbankdrücken).
4. Immer auf die **real einstellbare Stufe des Geräts** runden (§7).
5. **Bewusst konservativ** ansetzen (~5–10 % unter der Schätzung): ein zu leichter
   erster Satz ist harmlos und wird sofort korrigiert, ein zu schwerer kostet
   Vertrauen und ist ein Verletzungsrisiko.

> **Offener Implementierungspunkt:** Die Koeffizienten für alle 381 Übungen müssen
> getaggt werden. Plan: pro Bewegungsmuster + Gerätetyp einen Standardwert, manuell
> verfeinert für die häufigen Übungen. Wo kein Wert existiert → konservativ schätzen
> und einmessen.

### Teil 7 — Check-in

| # | Frage | Eingabe | Pflicht | Steuert |
|---|---|---|---|---|
| 19 | An welchem Tag soll ich wöchentlich nach Gewicht und Befinden fragen? | `Tap`: Wochentag (Vorschlag: der trainingsfreie Tag nach dem letzten Trainingstag) | ✅ | Adaptiver Regelkreis (§10). Hinweis: „Bitte den **Wochendurchschnitt** deines Gewichts — Tageswerte schwanken durch Wasser stärker als echtes Gewebe" |

### Teil 8 — Abschluss

| # | Screen | Inhalt |
|---|---|---|
| 20 | Dein Plan steht | Zusammenfassung + Button „Plan erstellen" |

**Inhalt der Zusammenfassung (Beispiel):**

```
Ziel            Muskelaufbau
Split           4er Ober-/Unterkörper, Mo · Di · Do · Fr
Volumen         Start 13 Sätze/Muskel/Woche → steigt auf bis zu 20
Wiederholungen  Grundübungen 5–10 · Isolation 10–20
Intensität      2–3 Wdh. Reserve bei Grundübungen, 0–1 bei Isolation
Kalorien        2.850 kcal/Tag  (Erhalt 2.600 + 250 Überschuss)
Makros          175 g Protein · 80 g Fett · 340 g Kohlenhydrate
Zielrate        +0,2 % Körpergewicht/Woche  (~0,16 kg)
Check-in        sonntags

⚠️  Die Startgewichte sind Schätzungen. Die erste Woche ist eine Einmessung —
    ich korrigiere nach jedem Satz automatisch.
```

---

## Was die App daraus berechnet (abgeleitetes Profil)

Kein weiterer Nutzer-Input nötig:

| Berechnet | Aus |
|---|---|
| Grundumsatz (BMR) | Mifflin-St Jeor: Geschlecht, Alter, Größe, Gewicht |
| Gesamtumsatz (TDEE) | BMR × (Basisfaktor + 0,025 × Einheiten) |
| Zielkalorien | TDEE ± Ziel (Defizit 0,5–0,7 % KG/Woche · Überschuss 200–350 kcal) |
| Makros | Protein 1,8 (Aufbau) / 2,2 (Diät) g/kg · Fett ≥ 0,8 g/kg · Rest KH |
| Split + Tageszuordnung | Trainingstage |
| Volumenkorridor pro Muskel | Level + Ziel (fraktional gezählt) |
| Wdh-Bereiche + Ziel-RIR | Ziel + Übungstyp |
| Pausenzeiten | Übungstyp + Zeitbudget |
| Übungspool | 381 Übungen − Blacklist − verletzungsbedingte Ausschlüsse |
| Startgewichte | Referenzwerte (falls vorhanden) + Koeffizienten, gerätegerecht gerundet |
| Feedback-Sprache | RIR bekannt ja/nein |

---

## Validierung & Plausibilität

| Feld | Regel |
|---|---|
| Alter | 14–90; unter 16 → Hinweis auf Wachstumsphase & Betreuung |
| Größe | 120–220 cm |
| Gewicht | 30–250 kg |
| Trainingstage | 3–6 (bei 1–2 → Hinweis: „unter 3 Tagen kann ich keinen sinnvollen Split bauen") |
| Referenz-Wdh. | 1–20; über 12 → Hinweis, dass die 1RM-Schätzung unschärfer wird |
| Referenzgewicht | Plausibilitätsprüfung gegen Körpergewicht; unrealistische Werte → freundliche Rückfrage statt stiller Übernahme |
| Zielgewicht | Bei > 0,7 %/Woche nötiger Rate → **ehrlichen** Zeithorizont zeigen statt unrealistisch zu versprechen |

---

## Randfälle

| Fall | Verhalten |
|---|---|
| Alle Referenzwerte übersprungen | Explizite „Einmess-Woche": App kommuniziert das und korrigiert aggressiver als sonst |
| Anfänger + Ziel Maximalkraft | Erlaubt, aber Technik-Fokus: konservativere Lasten, mehr Wiederholungen in Woche 1–4, Hinweis im Plan |
| Fettverlust + 6 Tage + 3× Cardio | Warnung: Erholung wird knapp; Vorschlag 4–5 Tage. Nutzer darf überstimmen |
| Verletzung schließt > 30 % des Pools aus | Hinweis + Empfehlung ärztlicher Abklärung; Plan wird trotzdem gebaut, nur schmaler |
| Nutzer macht viel eigenes Cardio | Fließt über die Alltagsaktivität (Screen 13) in den Kalorienbedarf ein. Bei auffälligem Leistungsabfall weist die App im Check-in darauf hin, dass Ausdauervolumen die Erholung kosten kann |
| Zielgewicht schon erreicht / unter Zielgewicht bei „Fettverlust" | Rückfrage, ob Ziel noch stimmt |
| Onboarding abgebrochen | Zwischenstand gespeichert, Fortsetzen am letzten Screen |
| Zweites Profil auf demselben Gerät | Profilwahl beim Start; Daten strikt getrennt |

---

## Offene Punkte

1. **Übungs-Koeffizienten** für die Startgewicht-Ableitung müssen getaggt werden
   (siehe Teil 6). Größte verbleibende Fleißarbeit.
2. **Gedehnte-Position-Tag** pro Übung (§6) — noch nicht in der Datenbank, wird für
   die Übungsauswahl gebraucht.
3. **Verletzungs-Mapping**: Welche Körperregion schließt welche Übungen aus? Muss als
   Tabelle über die 381 Übungen definiert werden.
4. **Abweichende Steckgewicht-Stufen und Maximalgewichte** einzelner Geräte sind noch
   unbekannt → beim ersten Gebrauch einer Übung nachfragen statt im Onboarding
   abzufragen (sonst 61 langweilige Fragen).
5. **Kettlebell-Gewichte** unbekannt → KET-Übungen zunächst ohne Gewichtsvorgabe.
