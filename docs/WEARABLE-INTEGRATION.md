# Garmin-Anbindung — Machbarkeit und sinnvolle Nutzung

> ## ⏸️ ZURÜCKGESTELLT (2026-08-06)
>
> **Nicht Teil des aktuellen Plans.** Keine Check-in-Felder, keine Roadmap-Phase, keine
> Capacitor-Hülle. Dieses Dokument bleibt nur als Recherche-Notiz liegen, falls das Thema
> später wieder aufkommt — damit die Machbarkeitsprüfung nicht zweimal gemacht werden
> muss.

> **Frage:** Kann die App regelmäßig den Kalorienverbrauch von der Garmin ziehen und
> darüber die Ernährungsvorgabe festlegen und anpassen?
>
> **Kurzantwort:** Technisch nur über einen Umweg — und für die *Kalorienvorgabe* wäre
> es sogar eine Verschlechterung. Für **Erholung und Aktivitätsveränderung** ist die
> Garmin dagegen ausgesprochen wertvoll.
>
> **Stand:** 2026-08-06

---

## 1. Technische Machbarkeit

### Der offizielle Weg ist zu

Garmin bietet eine **Health API** (Tageszusammenfassungen: Aktivkalorien,
Ruhekalorien, Schritte, Schlaf, Herzfrequenz, Stress, Body Battery). Zwei Hürden:

1. **Das Developer-Programm nimmt derzeit keine neuen Anmeldungen an** — das
   Zugangsformular ist offline, ohne angekündigtes Wiedereröffnungsdatum.
2. **Privatnutzung ist ausdrücklich nicht vorgesehen.** Man muss sich als juristische
   Person bewerben (Unternehmen, Universität, Klinik, Forschungseinrichtung) und einen
   manuellen Prüfprozess durchlaufen, der Wochen dauert.

Für ein privates Zwei-Personen-Projekt ist dieser Weg damit praktisch nicht verfügbar.

### Warum auch Apple Health / Health Connect nicht direkt gehen

Garmin Connect synchronisiert nach Apple Health (iOS) und Health Connect (Android).
Aber: **Eine PWA kann auf keines von beiden zugreifen.** Gesundheitsdaten sind auf
beiden Plattformen nur für native Apps freigegeben, nicht für Web-Anwendungen.

### Die realistischen Optionen

| Weg | Aufwand | Bewertung |
|---|---|---|
| **A · Manuelle Eingabe im Check-in** | minimal | **Empfohlen für den Start.** Zwei Zahlen aus der Garmin-Connect-App, in 10 Sekunden abgelesen |
| **B · CSV-Export aus Garmin Connect importieren** | mittel | Möglich, aber manuell und umständlich für wöchentliche Daten |
| **C · Native App-Hülle (Capacitor) → Health Connect / Apple Health** | hoch | **Der richtige Weg für später.** Die PWA wird in eine native Hülle gepackt, dann sind Schritte, Schlaf, Ruhepuls und HRV automatisch lesbar |
| **D · Unoffizielle Garmin-Connect-Bibliotheken** | mittel | **Nicht empfohlen.** Melden sich mit deinem Passwort bei Garmin an, verstoßen gegen die Nutzungsbedingungen und brechen, sobald Garmin etwas ändert. Dein Garmin-Passwort müsste dauerhaft irgendwo gespeichert werden |

---

## 2. Warum Garmin-Kalorien die Ernährungsvorgabe verschlechtern würden

Das ist der wichtigere Teil der Antwort.

### Die Messgenauigkeit ist schlecht — gerade beim Kalorienverbrauch

Validierungsstudien sind eindeutig: **Kein Hersteller ist beim Energieverbrauch
genau.** Für Garmin-Geräte werden Fehler von **6 bis 43 %** berichtet; in
Rankings liegt die Trefferquote beim Kalorienverbrauch um **50 %**. Nach Aktivität
aufgeschlüsselt: Gehen und Laufen ~31 % Fehler, **Radfahren ~52 %**.

Der Grund ist prinzipiell, nicht ein Qualitätsproblem: Die Uhr *misst* keine Kalorien.
Sie schätzt sie aus Herzfrequenz, Bewegung und deinen Profilangaben — und die
Beziehung zwischen Herzfrequenz und Energieverbrauch ist individuell sehr
unterschiedlich.

### Was das konkret bedeutet

Bei einem Erhaltungsbedarf von ~2.600 kcal:

| | Abweichung | Folge |
|---|---|---|
| Garmin-Schätzung, 20 % Fehler | **± 520 kcal** | Unterschied zwischen 0,5 kg Zunahme und 0,5 kg Abnahme pro Woche |
| Unser Gewichtstrend über 2–3 Wochen | **± ~100–150 kcal** | trifft die Zielrate |

### Unser aktueller Ansatz ist bereits der Goldstandard

Der wöchentliche Check-in **misst deine tatsächliche Energiebilanz direkt**: Wenn du
2.870 kcal isst und 0,16 kg pro Woche zunimmst, dann *ist* das deine Bilanz — unabhängig
davon, was irgendeine Formel oder Uhr schätzt.

Die Garmin schätzt dasselbe **indirekt und mit großem Fehler**. Ihre Zahl als Grundlage
der Kalorienvorgabe zu nehmen, würde eine direkte Messung durch eine verrauschte
Schätzung ersetzen. **Das wäre ein Rückschritt, kein Fortschritt.**

> Der Mifflin-St-Jeor-Wert im Onboarding ist nur der **Startpunkt**, bis zwei bis drei
> Wochen echte Daten vorliegen. Danach rechnet die App den Bedarf aus den realen Daten
> neu (`PLAN-ENGINE.md` §9, Kreis 4). Eine Garmin-Zahl wäre dafür nicht besser.

---

## 3. Wofür die Garmin-Daten dagegen wirklich gut sind

Nicht alle Wearable-Metriken sind gleich unzuverlässig. Die **Schrittzahl** ist die am
besten validierte Größe; Ruhepuls und Schlafdauer gelten ebenfalls als brauchbar
(Schlaf*phasen* deutlich weniger). Und: **relative Veränderungen sind viel
zuverlässiger als absolute Werte** — ein systematischer Messfehler kürzt sich heraus,
wenn man diese Woche mit der letzten vergleicht.

Daraus ergeben sich drei echte Verbesserungen:

### a) Objektive Erholungsdaten für den Deload-Trigger

Derzeit fragt der Check-in Schlaf und Energie **selbst eingeschätzt** ab
(`PLAN-ENGINE.md` §7). Garmin-Daten machen daraus objektive Signale:

| Signal | Nutzung |
|---|---|
| Schlafdauer (Ø der Woche) | ersetzt/ergänzt die Selbsteinschätzung im Deload-Check |
| Ruhepuls (Trend) | ein anhaltend erhöhter Ruhepuls ist ein klassisches Übermüdungszeichen |
| HRV / Body Battery (Trend) | zusätzlicher Erholungsindikator |

Das ist der **wertvollste** Beitrag der Uhr: Die Deload-Entscheidung wird von Meinung
auf Messung umgestellt.

### b) Aktivitätsveränderungen erklären Gewichtsanomalien

Der häufigste Grund, warum das Gewicht „unerklärlich" stagniert, ist eine unbemerkte
Veränderung der Alltagsaktivität — nicht ein falscher Kalorienwert.

```
Beispiel:
  Gewicht steigt nicht wie geplant
  Schritte: 11.400/Tag → 6.800/Tag  (−40 %)

  → Ohne Garmin: „Kalorien +200" (falsche Schlussfolgerung)
  → Mit Garmin:  „Deine Alltagsaktivität ist stark gefallen. Das erklärt es —
                  ich passe den Aktivitätsfaktor an, nicht die Kalorien."
```

Hier hilft die Uhr genau deshalb, weil nur die **relative** Veränderung gebraucht wird.

### c) Cardio automatisch erfassen

Auf der Garmin geloggte Cardio-Einheiten müssten nicht doppelt eingetragen werden — und
die App könnte die Interferenz-Regeln aus `TRAINING-SCIENCE.md` §9 auf echte Daten statt
auf Plandaten anwenden.

---

## 4. Konkreter Vorschlag

### Phase A — sofort, ohne Technik-Abhängigkeit

Zwei **optionale** Felder im wöchentlichen Check-in (`PLAN-ENGINE.md` §7):

| Feld | Woher | Genutzt für |
|---|---|---|
| Ø Schritte pro Tag | Garmin Connect, Wochenübersicht | Aktivitätsfaktor, Erklärung von Gewichtsanomalien |
| Ø Schlaf pro Nacht | Garmin Connect, Wochenübersicht | objektives Signal im Deload-Check |

Beides steht in Garmin Connect direkt auf der Wochenübersicht — **zwei Zahlen,
10 Sekunden.** Optional: wer nichts einträgt, bekommt das bisherige Verhalten.

Sinnvolle Erweiterung, sobald es sich bewährt: Ruhepuls als drittes Feld.

### Phase B — später, wenn die App steht

**Capacitor-Hülle** um die bestehende PWA. Dann liest die App automatisch aus
Health Connect (Android) bzw. Apple Health (iOS):

- Schritte · Schlafdauer · Ruhepuls · HRV · absolvierte Cardio-Einheiten
- Kein manuelles Eintragen mehr

Wichtig: Der Code der App bleibt derselbe — Capacitor packt die bestehende PWA nur in
eine native Hülle. Es ist also **keine Neuentwicklung**, sondern ein zusätzlicher
Baustein. Deshalb ist es richtig, das *nach* der eigentlichen App zu machen und nicht
davor.

### Was wir bewusst NICHT machen

**Die Kalorienvorgabe wird nicht aus Garmin-Kalorien abgeleitet** — weder in Phase A
noch in Phase B. Der Gewichtstrend bleibt die Grundlage, weil er die tatsächliche
Bilanz direkt misst (§2).

Garmin-Aktivkalorien könnten allenfalls als **relativer Kontext** angezeigt werden
(„diese Woche 18 % unter deinem Schnitt") — als Erklärungshilfe, nicht als Stellgröße.

---

## 5. Zusammenfassung

| Frage | Antwort |
|---|---|
| Kann man Kalorienverbrauch automatisch ziehen? | Offizielle API praktisch nicht verfügbar; automatisch erst über eine native App-Hülle (Phase B) |
| Sollte man die Kalorienvorgabe daraus ableiten? | **Nein** — 6–43 % Fehler; unser Gewichtstrend ist genauer |
| Ist die Garmin trotzdem nützlich? | **Ja, deutlich** — Schlaf und Ruhepuls machen die Deload-Entscheidung objektiv, Schritte erklären Gewichtsanomalien |
| Was ist sofort machbar? | Zwei optionale Felder im Check-in: Ø Schritte, Ø Schlaf |

---

## Quellen

- Garmin Health API — Zugangsvoraussetzungen: https://developer.garmin.com/gc-developer-program/health-api/
- Garmin Connect Developer Program FAQ: https://developer.garmin.com/gc-developer-program/program-faq/
- *Reliability and Validity of Commercially Available Wearable Devices for Measuring Steps, Energy Expenditure, and Heart Rate: Systematic Review* — JMIR mHealth uHealth (2020): https://mhealth.jmir.org/2020/9/e18694/
- *Accuracy of Wrist-Worn Activity Monitors During Common Daily Physical Activities and Types of Structured Exercise* — JMIR (2018): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6305876/
- *Validity of sports watches when estimating energy expenditure during running*: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5738849/
- Vergleichende Genauigkeitsanalyse Fitness-Tracker: https://wellnesspulse.com/research/accuracy-of-fitness-trackers/
