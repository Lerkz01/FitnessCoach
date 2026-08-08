# Trainingswissenschaft — Evidenzbasis des Coaching-Motors

> **Zweck:** Dieses Dokument ist die verbindliche Grundlage für den regelbasierten
> Trainings- und Ernährungsmotor der App. Jede Regel im Code muss hier eine
> Entsprechung haben. Jeder Parameter ist mit der Studienlage begründet.
>
> **Stand:** 2026-08-06 · Recherche: Meta-Analysen und Meta-Regressionen bis 2025/26
>
> **Grundhaltung:** Wo die Evidenz stark ist, folgen wir ihr streng. Wo sie schwach
> ist, sagen wir das offen und regeln über Nutzer-Feedback (Autoregulation) statt
> über erfundene Präzision. Ein Coach, der Unsicherheit versteckt, ist ein
> schlechter Coach.

---

## 1. Volumen — der Haupttreiber (starke Evidenz)

Die aktuellste und beste Arbeit dazu ist die Meta-Regression von **Pelland et al.
(2025, Sports Medicine)** — 67 Studien, 2.058 Teilnehmer.

**Befunde:**
- Muskelwachstum steigt mit dem Wochenvolumen (Posterior-Wahrscheinlichkeit 100 %),
  aber mit **abnehmendem Grenznutzen**.
- Konkret: **+0,24 % Hypertrophie pro zusätzlichem Satz** beim Durchschnittsvolumen
  von 12,25 Sätzen/Woche.
- **Kraft** zeigt ebenfalls einen positiven Effekt, aber mit **deutlich stärker
  abnehmendem Grenznutzen** als Hypertrophie → für Kraft braucht man weniger Volumen.
- Für die Vorhersage entscheidend ist die **„fraktionale" Zählweise**: direkte Sätze
  zählen 1,0, indirekte (mittrainierte) Sätze **0,5**.

### → Konsequenz für unseren Algorithmus

**Das ist unser wichtigster technischer Vorteil.** Unsere Übungsdatenbank hat bereits
`primary` und `secondary` Muskeln pro Übung. Also zählen wir Volumen **fraktional**:

```
Volumen(Muskel) = Σ Sätze(primär) × 1,0  +  Σ Sätze(sekundär) × 0,5
```

Beispiel: Klimmzüge zählen voll für den Lat und **halb für den Bizeps**. Das heißt,
die App weiß, dass nach 12 Sätzen Rücken der Bizeps schon ~4–6 Sätze mitbekommen hat
— und plant entsprechend weniger direkte Bizeps-Arbeit. Genau das machen die meisten
Apps (auch MCI) falsch: sie zählen nur direkte Sätze und produzieren so Überlastung
an den Armen und Schultern.

**Zielkorridore (fraktionale Sätze pro Muskel pro Woche):**

| Situation | Startvolumen | Obergrenze |
|---|---|---|
| Anfänger | 8–10 | 14 |
| Fortgeschritten (Muskelaufbau) | 12–14 | 20 |
| Erfahren (Muskelaufbau) | 14–16 | 22+ |
| Ziel Maximalkraft | 8–12 | 15 (Kraft sättigt früher) |
| **Diät / Fettverlust (Muskelerhalt)** | **8–10** | 14 |

Der Motor startet bewusst am **unteren Ende** und steigert wöchentlich, solange
Leistung und Erholungs-Feedback es zulassen. Volumen ist die Variable, die über
Wochen wächst — nicht das Gewicht allein.

**Unilaterale Übungen zählen beide Seiten** (1 Satz links + 1 Satz rechts = 2 Sätze).

---

## 2. Frequenz — kein Selbstzweck (starke Evidenz)

- Schoenfeld et al. (2016): 2×/Woche > 1×/Woche.
- **Schoenfeld et al. (2019, volumenangeglichen): kein signifikanter Unterschied.**
- Pelland (2025): Für Hypertrophie „vereinbar mit vernachlässigbaren Effekten"; für
  **Kraft** hingegen ein klarer positiver Effekt der Frequenz.

**Fazit:** Frequenz ist kein biologischer Wachstumsreiz, sondern ein **Verteilungs-
Werkzeug**. 16 Sätze verteilen sich sauberer auf 2 Einheiten als auf 1 (weniger
Ermüdung pro Session, mehr Qualität pro Satz).

### → Konsequenz

Frequenz wird **abgeleitet, nicht gewählt**: aus dem Zielvolumen und der
Trainingsfrequenz des Nutzers. Regel: **max. ~10 fraktionale Sätze pro Muskel pro
Einheit** — wird das überschritten, splittet der Motor auf mehr Einheiten.

Daraus ergeben sich die Splits automatisch:

| Tage/Woche | Split | Frequenz/Muskel |
|---|---|---|
| 3 | Ganzkörper A/B/C | ~3× (wenig Volumen/Session) |
| 4 | Ober-/Unterkörper 2× | 2× |
| 5 | Push/Pull/Legs + Ober/Unter | ~2× |
| 6 | Push/Pull/Legs 2× | 2× |

Bei **Ziel Maximalkraft** wird die Frequenz der Hauptübungen bewusst höher gesetzt
(Technik-Übung + Frequenzeffekt auf Kraft).

---

## 3. Last & Wiederholungen (starke Evidenz)

- **Hypertrophie ist last-unabhängig.** Schoenfeld et al.: kein Unterschied zwischen
  schwer (>60 % 1RM) und leicht (<60 % 1RM); Effektstärke 0,03. Wachstum ist über ein
  breites Spektrum (~5–30+ Wdh.) erreichbar, **sofern nah genug ans Versagen trainiert
  wird**.
- **Maximalkraft ist last-spezifisch.** 1RM-Zuwächse deutlich größer mit schweren
  Lasten. Effektstärken: hohe/moderate Last 0,60–0,63 vs. niedrige Last 0,34–0,35.
- Typ-I-Fasern profitieren leicht stärker von niedrigen Lasten (20–30 % 1RM).

### → Konsequenz

Die App wählt Wiederholungsbereiche **nach Übungstyp und Ziel**, nicht nach Dogma:

| Ziel | Grundübungen | Isolationsübungen |
|---|---|---|
| Muskelaufbau | 5–10 Wdh. | 10–20 Wdh. |
| Maximalkraft | 3–6 Wdh. (≥ 80 % 1RM) | 6–12 Wdh. |
| Fettverlust (Erhalt) | 5–10 Wdh. (Last halten!) | 10–15 Wdh. |
| Allgemeine Fitness | 6–12 Wdh. | 10–15 Wdh. |

**Wichtig bei Diät:** Last **nicht** reduzieren und Wiederholungen erhöhen — schwere
Last ist das Signal für Muskelerhalt. Volumen darf runter, Intensität nicht.

Schwere Grundübungen bekommen niedrigere Wiederholungen, weil sie dort effizienter
sind (weniger Kreislauf-Limitierung); Isolation höhere, weil Gelenkbelastung geringer
und die Zielmuskulatur direkter limitiert.

---

## 4. Nähe zum Muskelversagen (starke, aber differenzierte Evidenz)

Die zentrale Arbeit: **Robinson et al. (2024, Sports Medicine)** — Meta-Regressionen
über 55 Hypertrophie- und 67 Kraftstudien, RIR als kontinuierlicher Prädiktor.

- **Hypertrophie:** nimmt signifikant zu, je näher am Versagen — aber die Kurve
  **flacht ab**. Die letzten 1–2 Wdh. bringen wenig zusätzlichen Reiz bei stark
  erhöhter Ermüdung.
- **Kraft:** **kein** Zusammenhang, tendenziell sogar leicht **negativ** — näher am
  Versagen = eher geringere Kraftzuwächse (weil Ermüdung die Trainingsqualität
  senkt).
- Frühere Meta-Analyse (Grgic et al. 2021): kein signifikanter Unterschied
  Versagen vs. nicht-Versagen; bei Trainierten kleiner Vorteil fürs Versagen bei
  Hypertrophie (ES 0,15).

### → Konsequenz

Das ist der Grund, warum die App **RIR (Wiederholungen in Reserve) als Feedback
abfragt** — es ist der präziseste Steuerungsparameter, den wir haben:

| Übungstyp | Ziel-RIR (Muskelaufbau) | Ziel-RIR (Maximalkraft) |
|---|---|---|
| Schwere Grundübungen (Kniebeuge, Kreuzheben, Bankdrücken) | 2–3 | 2–4 |
| Maschinen / geführte Verbundübungen | 1–2 | 2–3 |
| Isolationsübungen | 0–1 | 1–2 |
| Letzter Satz einer Isolationsübung | 0 (bis Versagen erlaubt) | – |

**Begründung der Aufteilung:** Isolation nah ans Versagen zu bringen ist billig
(geringe systemische Ermüdung, geringes Verletzungsrisiko). Kniebeuge bis zum
Versagen ist teuer (hohe Ermüdung, Technikverfall, Risiko) und bringt laut Robinson
für Kraft **nichts**. Also: Versagen dort, wo es günstig ist.

---

## 5. Satzpausen (moderate Evidenz)

Bayesianische Meta-Analyse (Singer et al., „Give it a Rest", 2024):

- Optimum bei **1–2 Minuten**; zwischen 1–2, 2–3 und 3+ Minuten kaum Unterschied.
- **Unter 60 Sekunden schadet** der Hypertrophie.
- Über 2–3 Minuten: minimal weniger Wachstum in den Daten, aber praktisch
  irrelevant — dafür **doppelte Trainingsdauer**.

### → Konsequenz

Der Pausen-Timer wird kontextabhängig gesetzt (nie unter 60 s):

| Kontext | Pause |
|---|---|
| Schwere Grundübung, niedrige Wdh. (Kraft) | 180 s |
| Grundübung, Muskelaufbau | 120–150 s |
| Maschine / Verbundübung | 90–120 s |
| Isolationsübung | 60–90 s |
| Bauch / Waden / Unterarme | 60 s |

Bei aktivem **Zeitbudget** („heute nur 45 Min") kürzt der Motor zuerst die Pausen
der Isolationsübungen — nicht die der schweren Grundübungen, denn dort kostet die
Kürzung Leistung.

---

## 6. Übungsauswahl (moderate bis starke Evidenz)

**a) Regionale Hypertrophie ist real.**
Ein Muskel wächst nicht gleichmäßig. Studie: 9 Sätze Beinpresse/Woche → Wachstum nur
im oberen und unteren Quadrizeps, **nicht in der Mitte**. Die Gruppe mit Variation
(Beinpresse + Smith-Kniebeuge + Hack Squat) wuchs **über alle Bereiche**. Analog bei
Bizeps: drei Übungsvarianten > eine Variante (nur die Mehr-Übungs-Gruppe steigerte
den proximalen Bizeps signifikant).

**b) Lange Muskellänge priorisieren (stretch-mediated hypertrophy).**
Meta-Analytisch: voller vs. teilweiser Bewegungsumfang im Mittel ähnlich — **aber bei
Teilwiederholungen in gedehnter Position kippt der Effekt zu deren Gunsten**. Die
gedehnte Phase ist die hypertrophisch priorisierte.

**c) Übungsreihenfolge zählt.**
Übungen am **Anfang** der Einheit erzielen größere Zuwächse — unabhängig davon, ob
Grund- oder Isolationsübung. Mehr Wiederholungen, mehr Last, weniger Ermüdung.
Praxis-Regel aus der Literatur: *Was wichtig ist, kommt zuerst.*

### → Konsequenz

1. **3–4 verschiedene Übungen pro großer Muskelgruppe pro Woche**, gezielt nach
   unterschiedlichen Reizwinkeln — unsere DB hat dafür die Unterregionen
   (`Brust (oben/mittel/unten/innen/außen)`, `Bizeps (langer/kurzer Kopf)` etc.).
   Der Generator wählt so, dass die Unterregionen **abgedeckt** sind.
2. Übungen, die den Zielmuskel in **gedehnter Position** belasten, werden bevorzugt
   (z. B. Schrägbank-Curls, Overhead-Trizeps, Beinbeuger, Fliegende). Wir taggen die
   Übungsdatenbank entsprechend.
3. **Reihenfolge = Priorität**, nicht Dogma „Grundübung immer zuerst": Der Motor setzt
   die Übung für die aktuell priorisierte (schwache/gewünschte) Muskelgruppe nach
   vorne — auch wenn es eine Isolationsübung ist. Standard bleibt aber: schwere
   Grundübungen früh (Technik + Sicherheit bei Ermüdung).
4. **Rotation statt Chaos:** Übungen bleiben mehrere Wochen stabil (Progression
   braucht Vergleichbarkeit), dann wird gezielt rotiert.

---

## 7. Progression & Autoregulation (starke Evidenz)

- **Autoregulation schlägt starre Prozentvorgaben.** Meta-Analyse (Sports Medicine
  Open 2021): Lastvorgabe per RIR-basiertem RPE ergibt signifikant größere
  1RM-Zuwächse (Kniebeuge, Frontkniebeuge) bei angeglichenem Volumen.
- Netzwerk-Meta-Analyse (2025): **APRE, geschwindigkeitsbasiert und RPE-basiert alle
  besser als prozentbasiert**; APRE rangiert auf Platz 1.
- Volumen-Autoregulation: Geschwindigkeitsverlust-Schwellen ≤ 25 % (also weniger
  intra-set-Ermüdung) → größere 1RM-Zuwächse.

### → Konsequenz: die Progressions-Engine

Kern der App. **Doppelte Progression** (erst Wdh., dann Gewicht), gesteuert durch
RIR-Feedback:

```
Nach jedem Satz erfasst: Gewicht, Wiederholungen, RIR (bzw. „wie schwer?")

Regel pro Übung, ausgewertet über alle Sätze der letzten Einheit:

  Zielwiederholungen erreicht UND RIR ≥ Ziel-RIR + 1  (= war zu leicht)
      → Gewicht rauf (Schrittweite des Geräts, s. u.)
      → Wiederholungen auf Bereichs-Untergrenze zurück

  Zielwiederholungen erreicht UND RIR ≈ Ziel-RIR
      → Wiederholungen +1 (innerhalb des Bereichs)
      → Bereichsobergrenze erreicht? → Gewicht rauf, Wdh. zurück

  Zielwiederholungen knapp verfehlt (−1 bis −2)
      → gleiches Gewicht wiederholen

  Zielwiederholungen deutlich verfehlt (≥ −3) ODER RIR = 0 bei Zielverfehlung
      → Gewicht runter (~5–10 %)
      → 2× hintereinander in derselben Übung = Ermüdungssignal (s. Deload)
```

**Gerätegerechte Rundung ist Pflicht** (aus `gym-geraete.md`):

| Ladeart | Schrittweite |
|---|---|
Steckgewicht (`stack`) | 5 kg (pro Gerät konfigurierbar) |
| Plate-Loaded (`plate`) | 2,5 kg (2× 1,25 kg) |
| Langhantel / SZ | 2,5 kg (2× 1,25 kg) |
| Kurzhantel (FRE-01) | 1 kg bis 10 kg, darüber 2 kg |
| Körpergewicht | Wiederholungen statt Gewicht; Zusatzgewicht via Scheibe/KH |

**Sonderfall FRE-11** (unterstützte Klimmzug-/Dip-Maschine): **invertiert** —
Progression bedeutet hier **weniger** Unterstützungsgewicht. Muss im Code explizit
behandelt werden, sonst trainiert der Nutzer rückwärts.

**Realistische Steigerungserwartung** (verhindert unrealistische Vorgaben):
Anfänger können in Grundübungen nahezu jede Einheit steigern; Fortgeschrittene eher
alle 2–4 Wochen pro Übung; Erfahrene noch langsamer. Der Motor darf also nicht
„jede Session +2,5 kg" erwarten, sonst produziert er Dauer-Frust.

---

## 8. Deload — hier ist die Evidenz schwächer als der Ruf

Ehrliche Einordnung: **Die Studienlage stützt geplante Deloads nicht.**

- PeerJ (2024), 9-Wochen-Programm mit 1-Wochen-Deload zur Hälfte: **keine
  Unterschiede** in Muskelwachstum, lokaler Ausdauer und Power. Die
  **durchgehend** trainierende Gruppe hatte sogar **größere Kraftzuwächse**
  (isometrisch und dynamisch).
- Theoretisch plausibel (Ermüdungsmanagement, Re-Sensibilisierung), empirisch aber
  kein Nachweis der Überlegenheit bei Trainierten.

### → Konsequenz

**Keine fix eingeplanten Deload-Wochen.** Stattdessen **ermüdungsgetriggert** — die
App reagiert auf Daten statt auf den Kalender:

Deload (1 Woche, Volumen ~50 %, Last ~90 %, RIR +2) wird ausgelöst, wenn **≥ 2** der
folgenden Signale über 1–2 Wochen auftreten:
- Leistungsabfall in ≥ 2 Übungen (Gewicht/Wdh. sinkt trotz gleicher Vorgabe)
- RIR-Rückmeldung systematisch niedriger als Ziel (alles fühlt sich schwerer an)
- Check-in meldet anhaltend schlechten Schlaf / hohe Erschöpfung / Gelenkschmerz
- 2× Gewichtsreduktion in derselben Übung (s. Progressions-Engine)

Das ist ehrlicher **und** effizienter: keine verschenkte Woche ohne Grund, aber
Entlastung, wenn sie objektiv nötig ist.

---

## 9. Cardio & Interferenz (moderate Evidenz)

- Drei aktuelle Meta-Analysen: Concurrent Training beeinträchtigt Kraft und
  Hypertrophie **nicht signifikant**.
- Auf **Faserebene** kleiner negativer Effekt; Hinweise, dass **Laufen** stärker
  interferiert als **Radfahren** (v. a. Typ-I-Fasern).
- **Power** ist am empfindlichsten (signifikant gedämpft).
- Hohe Ausdauervolumina + häufiges Krafttraining erhöhen das Interferenzrisiko.
- Enorme interindividuelle Streuung (MVC-Reaktion −12 % bis +87 %).

### → Konsequenz

> **Die App plant kein Cardio** (Nutzerentscheidung 2026-08-06) — die Nutzer regeln
> Ausdauertraining selbst. Dieser Abschnitt bleibt als **Hintergrundwissen** erhalten:
> für den KI-Coach, wenn danach gefragt wird, und für die Fehlersuche bei
> unerklärlichem Leistungsabfall.

Praktische Empfehlungen, falls das Thema aufkommt:

- **Radfahren/Ergometer und StairMaster** interferieren weniger als Laufen, wenn
  Muskelaufbau/Beinkraft im Fokus steht (CAR-04/CAR-05/CAR-03 aus dem Inventar).
- Cardio möglichst **nicht vor** dem Krafttraining derselben Muskelgruppe, idealerweise
  in separaten Einheiten oder danach.
- Kein Cardio direkt vor dem Beintraining.
- Ausdauervolumen fließt indirekt über die **Alltagsaktivität** (Onboarding Screen 13)
  in den Kalorienbedarf ein.

---

## 10. Ernährung (starke Evidenz)

**Protein.** Morton et al. (2018), 49 Studien, 1.863 Personen: Bruchpunkt bei
**~1,62 g/kg/Tag**, Konfidenzintervall bis **~2,2 g/kg**.
→ App-Vorgabe: **1,8 g/kg** (Muskelaufbau) bis **2,2 g/kg** (Diät — höherer Bedarf zum
Muskelschutz, plus Sättigung).

**Kalorienbedarf.** Mifflin-St Jeor für den Grundumsatz × Aktivitätsfaktor. Das ist
eine **Schätzung** — der wahre Wert kommt aus der Gewichtsverlaufs-Rückmeldung. Genau
deshalb ist der wöchentliche Check-in nicht optional, sondern der Kern der
Ernährungslogik.

**Fettverlust-Rate.** Garthe et al. (2011), Elite-Athleten: 0,7 %/Woche vs.
1,4 %/Woche Körpergewichtsverlust. Die langsame Gruppe **baute fettfreie Masse auf
(+2,1 %)**, die schnelle nicht. Weitere Evidenz: FFM wird bei ≤ 0,5 %/Woche noch
besser geschützt als bei 0,7 % oder 1 %.
→ **Zielrate: 0,5–0,7 % Körpergewicht/Woche.** Bei höherem Körperfettanteil eher am
oberen Ende, bei niedrigem am unteren.

**Aufbau-Rate.** Größere Überschüsse (> 500 kcal) erhöhen vor allem die Fettmasse,
nicht die Muskelrate.
→ Überschuss **ca. 200–350 kcal**; Zielrate nach Level:

| Level | Zunahme/Woche |
|---|---|
| Anfänger | 0,25–0,5 % KG |
| Fortgeschritten | 0,1–0,25 % KG |
| Erfahren | ~0,1 % KG |

**Muskelerhalt im Defizit.** Krafttraining ist das Hauptsignal. Studien mit ≥ 10
Wochensätzen/Muskel zeigten kaum bis keinen Verlust fettfreier Masse. Erhalt ist
schon mit **6–10 Sätzen/Muskel/Woche** möglich.
→ Im Defizit senkt der Motor das Volumen in Richtung 8–10 Sätze und **hält die Last**.

**Makro-Aufteilung:**
1. Protein zuerst (s. o.)
2. Fett: ≥ 0,8 g/kg (Hormonfunktion), typisch 20–30 % der Kalorien
3. Kohlenhydrate: der Rest (Trainingsleistung)

### → Der adaptive Regelkreis

```
Wöchentlicher Check-in: Körpergewicht (Ø der Woche!), Kraftverlauf, Gefühl/Schlaf

  Gewichtstrend != Zielrate  → Kalorien anpassen (~±150–250 kcal, geglättet)
  Kraft fällt über 2+ Wochen → Defizit zu aggressiv → Kalorien rauf / Volumen runter
  Gewicht steigt zu schnell  → Überschuss kürzen (Fett statt Muskel)
  Gefühl anhaltend schlecht  → Deload prüfen + Kalorien Richtung Erhalt
```

**Wichtig:** Immer den **Wochendurchschnitt** verwenden, nie Tageswerte —
Wasserschwankungen sind größer als die tatsächliche Gewebeveränderung. Und nie
mehrere Variablen gleichzeitig ändern, sonst ist die Ursache nicht mehr zuordenbar.

---

## 11. Geschlechtsunterschiede (moderate Evidenz)

Relevant, weil die App für zwei Nutzer gebaut wird.

- **Hypertrophie: kein signifikanter Unterschied** bei gleichem Protokoll.
- **Relative** Kraft- und Muskelzuwächse **ähnlich**; absolute Kraftzuwächse bei
  Männern größer (Ausgangsniveau).
- Frauen: teils **größere Zuwächse in der Oberkörperkraft** (mehr Aufholpotenzial),
  höhere **Ermüdungsresistenz** (können tendenziell mehr Volumen/Wiederholungen
  vertragen).

### → Konsequenz

**Keine „Frauen-Version" des Programms** — das wäre unwissenschaftlich und
kontraproduktiv. Gleiche Logik, gleiche Übungen, gleiche Progression. Individualisiert
wird über **Onboarding-Ziele, Prioritäten und Feedback**, nicht über das Geschlecht.
Geschlecht fließt ausschließlich in die **Kalorienberechnung** ein (Mifflin-St Jeor).

Einzige praktische Ableitung: höhere Ermüdungsresistenz heißt, die
Volumensteigerung darf bei entsprechendem Feedback etwas zügiger erfolgen — das
regelt aber die Autoregulation von allein.

---

## 12. Zusammenfassung: Parameter-Tabelle für den Code

| Parameter | Wert | Quelle/§ |
|---|---|---|
| Volumen-Zählweise | fraktional (primär 1,0 / sekundär 0,5) | §1 |
| Startvolumen (Aufbau, fortgeschritten) | 12–14 Sätze/Muskel/Woche | §1 |
| Volumen-Obergrenze | ~20–22 Sätze/Muskel/Woche | §1 |
| Volumen im Defizit | 8–10 Sätze/Muskel/Woche | §1, §10 |
| Max. Sätze pro Muskel pro Einheit | ~10 (sonst splitten) | §2 |
| Wdh. Grundübung (Aufbau) | 5–10 | §3 |
| Wdh. Isolation (Aufbau) | 10–20 | §3 |
| Wdh. Maximalkraft | 3–6 (≥ 80 % 1RM) | §3 |
| Ziel-RIR schwere Grundübung | 2–3 | §4 |
| Ziel-RIR Maschine/Verbund | 1–2 | §4 |
| Ziel-RIR Isolation | 0–1 | §4 |
| Pause Grundübung | 120–180 s | §5 |
| Pause Isolation | 60–90 s | §5 |
| Pause Minimum | 60 s (nie darunter) | §5 |
| Übungen pro große Muskelgruppe/Woche | 3–4 | §6 |
| Progressionsmodell | Doppelprogression + RIR-Autoregulation | §7 |
| Deload | ermüdungsgetriggert, nicht kalendarisch | §8 |
| Protein | 1,8 g/kg (Aufbau) – 2,2 g/kg (Diät) | §10 |
| Fett-Minimum | 0,8 g/kg | §10 |
| Fettverlust-Rate | 0,5–0,7 % KG/Woche | §10 |
| Aufbau-Rate | 0,1–0,5 % KG/Woche (nach Level) | §10 |
| Kalorien-Anpassung pro Check-in | ±150–250 kcal | §10 |

---

## 13. Was wir bewusst NICHT tun

- **Keine fixen Deload-Wochen** — Evidenz stützt das nicht (§8).
- **Keine geschlechtsspezifischen Programme** — Evidenz stützt das nicht (§11).
- **Keine „Muskelverwirrung"/ständige Übungswechsel** — Progression braucht
  Vergleichbarkeit; Variation gezielt und geplant, nicht zufällig (§6).
- **Kein Volumen-Maximalismus** — abnehmender Grenznutzen ist real, und Volumen, das
  nicht erholt wird, ist verschenkt (§1).
- **Keine Last-Reduktion in der Diät** — kostet Muskelmasse (§3, §10).
- **Kein Versagen bei schweren Grundübungen** — teuer, riskant, für Kraft sogar
  kontraproduktiv (§4).
- **Keine Vorgabe nicht einstellbarer Gewichte** — immer auf die reale Stufe des
  Geräts runden (§7).
- **Keine erfundene Präzision.** Wo die Evidenz endet, entscheidet Nutzer-Feedback.

---

## 14. Offene Punkte / Limitierungen

Ehrlich benannt, damit wir sie nicht vergessen:

1. **Startgewicht-Schätzung** hat keine gute Evidenzbasis. Wir schätzen aus
   Körperdaten + Erfahrung und **kalibrieren über die ersten 1–2 Einheiten**. Die
   erste Session ist explizit eine Einmessung, das kommuniziert die App auch so.
2. **Individuelle Streuung ist groß** (Cardio-Interferenz: −12 % bis +87 %). Deshalb
   ist Autoregulation kein Beiwerk, sondern die Hauptmechanik.
3. **Kettlebell-Gewichte im Studio unbekannt** → KET-Übungen zunächst ohne konkrete
   Gewichtsvorgabe.
4. **Maximalgewichte und abweichende Steckgewicht-Stufen** einiger Geräte noch nicht
   erfasst → pro Gerät konfigurierbar halten, Nutzer kann korrigieren.
5. **Meta-Analysen sind Durchschnitte.** Sie sagen, was im Mittel funktioniert, nicht
   was für *diesen* Nutzer optimal ist. Der Regelkreis schließt diese Lücke.

---

## Quellen

**Volumen & Frequenz**
- Pelland et al. (2025). *The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains.* Sports Medicine. https://pubmed.ncbi.nlm.nih.gov/41343037/
- Schoenfeld et al. (2016/2019). Frequency meta-analyses. https://pubmed.ncbi.nlm.nih.gov/30558493/
- Schoenfeld et al. (2017). Dose-response weekly volume. https://pubmed.ncbi.nlm.nih.gov/27433992/

**Last & Wiederholungen**
- Schoenfeld et al. (2017). *Strength and Hypertrophy Adaptations Between Low- vs. High-Load Resistance Training.* JSCR. https://pubmed.ncbi.nlm.nih.gov/28834797/
- Lopez et al. (2021). *Resistance Training Load Effects on Muscle Hypertrophy and Strength Gain: Network Meta-analysis.* https://pubmed.ncbi.nlm.nih.gov/33433148/
- Schoenfeld et al. (2021). *Loading Recommendations… Re-Examination of the Repetition Continuum.* https://www.mdpi.com/2075-4663/9/2/32

**Nähe zum Versagen**
- Robinson et al. (2024). *Exploring the Dose–Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy.* Sports Medicine 54(9). https://link.springer.com/article/10.1007/s40279-024-02069-2
- Grgic et al. (2021). *Effects of resistance training performed to repetition failure or non-failure.* JSHS. https://pubmed.ncbi.nlm.nih.gov/33497853/

**Satzpausen**
- Singer et al. (2024). *Give it a Rest: Bayesian meta-analysis on inter-set rest interval duration and hypertrophy.* Frontiers in Sports and Active Living. https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full

**Übungsauswahl, ROM & Reihenfolge**
- Systematic review on exercise variation. https://www.researchgate.net/publication/358212528
- Regional hypertrophy at long vs. short muscle lengths. https://pubmed.ncbi.nlm.nih.gov/37559762/
- Lengthened partial repetitions vs. full ROM (2025). https://www.researchgate.net/publication/388949912
- Simão et al. (2012). *Exercise order in resistance training.* https://pubmed.ncbi.nlm.nih.gov/22292516/
- Umbrella review: hypertrophy variables. https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2022.949021/full

**Autoregulation**
- Greig et al. (2021). *The Effect of Load and Volume Autoregulation on Muscular Strength and Hypertrophy.* Sports Medicine Open. https://sportsmedicine-open.springeropen.com/articles/10.1186/s40798-021-00404-9
- Network meta-analysis (2025). *Autoregulated resistance training for maximal strength enhancement.* https://pubmed.ncbi.nlm.nih.gov/40791980/

**Deload**
- Coleman et al. (2024). *Gaining more from doing less? Effects of a one-week deload period.* PeerJ. https://peerj.com/articles/16777/

**Cardio / Concurrent Training**
- Concurrent training fiber hypertrophy meta-analysis. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9474354/
- Petré et al. (2023). *Concurrent Strength and Endurance Training: Impact of Sex and Training Status.* Sports Medicine. https://link.springer.com/article/10.1007/s40279-023-01943-9

**Ernährung**
- Morton et al. (2018). *Protein supplementation meta-analysis and meta-regression.* BJSM. https://pubmed.ncbi.nlm.nih.gov/28698222/
- Garthe et al. (2011). *Effect of Two Different Weight-Loss Rates on Body Composition and Performance in Elite Athletes.* IJSNEM. https://pubmed.ncbi.nlm.nih.gov/21558571/
- Murphy & Koehler (2022). *Lean mass sparing during caloric restriction: role of resistance training volume.* https://pmc.ncbi.nlm.nih.gov/articles/PMC9012799/
- Ruiz-Castellano et al. (2021). *Achieving an Optimal Fat Loss Phase in Resistance-Trained Athletes: A Narrative Review.* https://pubmed.ncbi.nlm.nih.gov/34579132/

**Geschlechtsunterschiede**
- Roberts et al. (2020). *Sex Differences in Resistance Training: A Systematic Review and Meta-Analysis.* JSCR. https://journals.lww.com/nsca-jscr/fulltext/2020/05000/sex_differences_in_resistance_training__a.30.aspx
- Resistance training induces similar adaptations between sexes. Scientific Reports. https://www.nature.com/articles/s41598-021-02867-y
