# Geräteinventar – mein Gym

Dieses Dokument beschreibt vollständig, welche Geräte in meinem Fitnessstudio verfügbar sind.
Die App darf **ausschließlich** Übungen vorschlagen, die mit diesen Geräten ausführbar sind.

Jedes Gerät hat eine feste ID. Diese IDs sind der Schlüssel für die Übungsdatenbank der App.

**Ladeart:**
- `stack` = Steckgewicht (Gewichtsmagazin)
- `plate` = Plate-Loaded (Hantelscheiben werden aufgesteckt)
- `free` = Freihantel
- `body` = Körpergewicht
- `cardio` = Ausdauergerät

**Hersteller:** Ein großer Teil der Maschinen ist von **gym80** (Serie vermutlich *Sygnum* für
Steckgewicht-Geräte, *Pure Kraft* für Plate-Loaded), Baujahr ca. 2017–2020. Die in Klammern
angegebenen Herstellerbezeichnungen sind **Vermutungen** und noch zu verifizieren.

---

## 1. Verfügbares Gewichtsmaterial

| Typ | Verfügbar | Kleinste Steigerung |
|---|---|---|
| Hantelscheiben | 1,25 / 2,5 / 5 / 10 / 15 / 20 kg | 1,25 kg (bzw. 2,5 kg pro Seite beidseitig) |
| Kurzhanteln | 1–60 kg | 1–10 kg in 1-kg-Schritten, ab 10 kg in 2-kg-Schritten |
| Steckgewichte | an allen `stack`-Geräten | meist **5 kg** – als Standardannahme für die App verwenden, geräteweise Abweichungen werden später nachgetragen |

> **Wichtig für die App:** Vorgeschlagene Gewichte müssen immer auf eine real einstellbare
> Stufe des jeweiligen Geräts gerundet werden. Keine Vorschläge wie „37 kg" an einem
> Steckgewicht-Gerät mit 5-kg-Blöcken.

---

## 2. Cardio

| ID | Gerät | Ladeart | Beschreibung |
|---|---|---|---|
| CAR-01 | Laufband | cardio | Mehrere vorhanden |
| CAR-02 | Stepper | cardio | Klassischer Stepper |
| CAR-03 | StairMaster | cardio | Laufende Treppe |
| CAR-04 | Liegeergometer (Recumbent Bike) | cardio | Sitzend, Pedale vorne vor dem Körper |
| CAR-05 | Ergometer / Upright Bike | cardio | Aufrechtes Fahrrad, Pedale unter dem Körper |

---

## 3. Beine

| ID | Gerät | Ladeart | Beschreibung |
|---|---|---|---|
| LEG-01 | Beinstrecker (Leg Extension) | stack | gym80 Sygnum Beinstrecker sitzend |
| LEG-02 | Beinbeuger liegend (Lying Leg Curl) | stack | Bauchlage. Es gibt **ausschließlich** die liegende Variante – keinen sitzenden Beinbeuger |
| LEG-03 | Beinpresse horizontal (Seated Leg Press) | stack | Sitzend, Platte wird waagerecht nach vorne gedrückt, kein Winkel |
| LEG-04 | Beinpresse 45° | plate | Klassische Schrägbeinpresse |
| LEG-05 | V-Squat (Hyperlever V-Squat, Atletica) | plate | Geführte Kniebeugenmaschine |
| LEG-06 | Wadenheben stehend (Standing Calf Raise) | stack | |
| LEG-07 | Wadenheben sitzend (Seated Calf Raise) | plate | |
| LEG-08 | Abduktorenmaschine | stack | Beine nach außen |
| LEG-09 | Adduktorenmaschine | stack | Beine nach innen |
| LEG-10 | Hip-Thrust-Maschine (Glute Drive) | stack | Oberer Rücken auf Polster, Gurt über der Hüfte, Hüfte drückt nach oben |
| LEG-11 | 45°-Hyperextension (Back Extension) | body | Oberschenkel liegen auf dem 45°-Polster, Oberkörper fällt nach vorne unten. Trainiert unteren Rücken, Gesäß, Hamstrings. Zusatzgewicht mit Scheibe möglich |

---

## 4. Rücken

| ID | Gerät | Ladeart | Beschreibung |
|---|---|---|---|
| BAC-01 | Latzug | stack | Klassischer Latzug, alle gängigen Griffe verfügbar (gym80 Rückenzugmaschine 3020) |
| BAC-02 | Rudermaschine mit Brustpolster | stack | Sitzend, Brust gegen Polster, zwei frei bewegliche Griffe → enges und breites Ziehen möglich (gym80 Rower Innovation 5003) |
| BAC-03 | Rudermaschine mit Brustpolster | plate | Baugleiches Prinzip wie BAC-02, aber Plate-Loaded |
| BAC-04 | Kabelzug-Rudern (Seated Cable Row) | stack | Am Stationsturm, breite und enge Griffe vorhanden |
| BAC-05 | T-Bar Row | plate | |
| BAC-06 | gym80 Pure Kraft Lat Pulldown Dual 4311 | plate | Sitzend mit Brustpolster, unabhängig bewegliche Arme (Dual). Zug im Bogen erst nach hinten, dann nach unten. **Einteilung: Latissimus UND oberer Rücken** – ich spüre dieses Gerät sehr stark im oberen Rücken, es darf daher auch als Übung für den oberen Rücken eingeplant werden |
| BAC-07 | gym80 Pure Kraft High Row Dual 4340 | plate | Sitzend mit Brustpolster, unabhängig bewegliche Arme (Dual). Zug im Bogen erst nach unten, dann nach hinten. Oberer Rücken |
| BAC-08 | Rückenstrecker sitzend (Lower Back) | stack | Rolle am oberen Rücken wird nach hinten gedrückt (gym80 Rückenstrecker 3007) |
| BAC-09 | Shrug-/Deadlift-Maschine | plate | Griffe rechts und links dicht am Boden, für Shrugs und ähnliche Bewegungen |

---

## 5. Brust

| ID | Gerät | Ladeart | Beschreibung |
|---|---|---|---|
| CHE-01 | Butterfly | stack | gym80 Butterfly 3022 |
| CHE-02 | Chest Press flach, geführt | plate | Geführtes Bankdrücken in der Waagerechten |
| CHE-03 | Incline Chest Press, geführt | plate | Geführtes Schrägbankdrücken |
| CHE-04 | Cable Crossover / Dual Pulley | stack | Zwei Kabelzüge rechts und links, man steht in der Mitte. Für Cable Flys, Crossovers etc. |
| CHE-05 | Bankdrücken flach, frei | free | Langhantel an FRE-04 **oder** Kurzhanteln auf verstellbarer Bank (FRE-03) |
| CHE-06 | Schrägbankdrücken ~45°, frei | free | Langhantel an FRE-05 **oder** Kurzhanteln auf verstellbarer Bank (FRE-03) |
| CHE-07 | Negativbankdrücken, frei | free | Langhantel an FRE-06 oder Kurzhanteln |
| CHE-08 | Bankdrücken an der Smith-Maschine | plate | FRE-08, Bank frei einstellbar → flach, schräg und negativ möglich |

> **Hinweis:** Flaches und schräges Bankdrücken sind sowohl geführt (CHE-02 / CHE-03) als auch
> komplett frei mit Lang- oder Kurzhantel (CHE-05 / CHE-06) verfügbar. Die App soll beide
> Varianten kennen und als eigenständige Übungen behandeln – die freie Ausführung ist bei mir
> die Standardvariante, die geführte die Alternative.

---

## 6. Schultern

| ID | Gerät | Ladeart | Beschreibung |
|---|---|---|---|
| SHO-01 | Schulterdrückmaschine | stack | |
| SHO-02 | Schulterdrückmaschine | plate | Separate Maschine, beide Varianten vorhanden |
| SHO-03 | Seitheben-Maschine (Lateral Raise) | stack | Rollen an den Ellenbogen, Bewegung im Bogen nach oben (gym80 Seithebemaschine 3015) |
| SHO-04 | Reverse Butterfly | stack | Hintere Schulter (gym80 Butterfly Reverse 3025) |

---

## 7. Arme

| ID | Gerät | Ladeart | Beschreibung |
|---|---|---|---|
| ARM-01 | Bizepscurl-Maschine | stack | gym80 Bizepsmaschine |
| ARM-02 | Dip-Maschine sitzend | stack | Sitzend, je eine Stange rechts und links, Drückbewegung nach unten (Trizeps) |
| ARM-05 | Trizepsmaschine | stack | Dedizierte Trizepsmaschine (gym80 Sygnum Trizepsmaschine 3011 o. ä.) |
| ARM-03 | SZ-Stange | free | |
| ARM-04 | Hammer-Curl-Stange / Multi-Grip-Bar | free | |

---

## 8. Bauch / Rumpf

| ID | Gerät | Ladeart | Beschreibung |
|---|---|---|---|
| ABS-01 | Rotationsmaschine (Twister) | stack | Drehung um die eigene Achse nach rechts und links (gym80 Twister 3024) |
| ABS-02 | Bauchmaschine (Abdominal Crunch) | stack | Rolle vor der Brust wird nach vorne gedrückt |
| ABS-03 | Beinheben-Station (Captain's Chair) | body | Unterarme auf Polstern, Rücken angelehnt, Beine hängen frei |

---

## 9. Freihantel & Multifunktion

| ID | Gerät | Ladeart | Beschreibung |
|---|---|---|---|
| FRE-01 | Kurzhanteln 1–60 kg | free | 1–10 kg in 1-kg-Schritten, darüber 2-kg-Schritte |
| FRE-02 | Langhantel (Olympiastange) | free | |
| FRE-03 | Verstellbare Bänke | free | Von flach bis 90° einstellbar |
| FRE-04 | Flachbank mit Ablage | plate | Klassisches Bankdrücken |
| FRE-05 | Schrägbank ~45° mit Ablage | plate | Bankdrücken schräg nach oben |
| FRE-06 | Negativbank mit Ablage | plate | Kopf liegt tiefer als die Beine |
| FRE-07 | Squat Racks | plate | Mehrere vorhanden |
| FRE-08 | Smith-Maschine | plate | Geführte Langhantel, Bänke können hineingestellt werden |
| FRE-09 | Kabelzugturm (High/Low Pulley) | stack | Griff von oben oder unten einhängbar, alle gängigen Griffe verfügbar |
| FRE-10 | Klimmzugstangen | body | Alle Griffvarianten möglich |
| FRE-11 | Klimmzug-/Dip-Maschine mit Unterstützung | stack | Man kniet auf einem Polster, das eingestellte Steckgewicht wird als Unterstützung abgenommen. **Achtung:** Höheres Gewicht = leichter, nicht schwerer. Muss in der App invertiert behandelt werden |
| FRE-12 | Steppbretter / Stepboxen | body | |
| FRE-13 | Kettlebells | free | Gewichtsspanne und Abstufung **noch zu ergänzen** |
| FRE-14 | Fußschlaufen für den Kabelzug (Ankle Straps) | – | Zubehör, nutzbar an FRE-09 und CHE-04 |

---

## 10. Offene Punkte

1. **Abweichende Steckgewicht-Abstufungen** – Standard ist 5 kg. Geräte, die davon abweichen, sowie evtl. vorhandene Zusatzgewichte für halbe Schritte werden noch nachgetragen. Die App sollte die Schrittweite deshalb **pro Gerät konfigurierbar** speichern, nicht global hart auf 5 kg setzen
2. **Maximalgewichte** der Steckgewicht-Geräte
3. **Kettlebells (FRE-13)** – welche Gewichte gibt es, in welchen Schritten?
4. **Anzahl** der Squat Racks, Smith-Maschinen und Flachbänke (relevant, falls die App Alternativen bei Belegung vorschlagen soll)
5. **Restliche Herstellerbezeichnungen verifizieren** – am Gerät steht meist ein Typenschild mit Modellnummer

---

## 11. Nicht vorhanden

Diese Geräte gibt es in meinem Studio **nicht**. Die App darf keine Übungen vorschlagen, die sie voraussetzen:

- **Scottbank / Preacher Bench** – Preacher Curls nur behelfsmäßig über die verstellbare Bank (FRE-03)
- **Ab Wheel / Bauchroller**
- **Landmine / Drehgelenk für die Langhantel** – keine Landmine Press, Landmine Row, Landmine Twists
- **Dipgürtel** – Zusatzgewicht bei Klimmzügen und Dips daher nur über eine zwischen den Füßen geklemmte Kurzhantel
- **Sitzender Beinbeuger** – nur die liegende Variante (LEG-02)
