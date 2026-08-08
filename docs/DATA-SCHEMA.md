# Datenschema

> **Zweck:** Verbindliche Beschreibung jedes Feldes im Export. Damit kann eine
> künftige App — oder ein Skript, oder Excel — die Datei lesen, **ohne den Code
> dieser App zu kennen**.
>
> **Format-Version:** 1.0 · **Stand:** 2026-08-06
>
> Diese Datei ist die maßgebliche Schemadefinition. Die SQL-Migration in
> `supabase/migrations/` speichert Datensätze absichtlich unverändert als `jsonb` —
> sie definiert kein eigenes Schema.

---

## Grundregeln

| Regel | Wert |
|---|---|
| Zeitstempel | ISO 8601 in **UTC**, z. B. `2026-08-06T17:42:11.000Z` |
| Kalendertage | `YYYY-MM-DD` in **lokaler** Zeit |
| Gewichte | Kilogramm (`number`) |
| Längen | Zentimeter (`number`) |
| Dauern | Sekunden (`number`) |
| Energie | Kilokalorien (`number`) |
| Makronährstoffe | Gramm (`number`) |
| Fehlender Wert | `null` — **nie** `0`, `""` oder weggelassen |
| IDs | UUIDv7 als Kleinbuchstaben-Zeichenkette mit Bindestrichen |

**Nur Rohdaten.** Abgeleitete Werte (geschätztes 1RM, Volumen, Progressionsstand,
Trends) sind absichtlich **nicht** enthalten. Sie werden aus diesen Daten berechnet.
Eine neue App braucht deshalb nur diese Datei — und wenn sich die Coaching-Logik
verbessert, kann die Historie damit neu durchgerechnet werden.

---

## Aufbau der Exportdatei

```jsonc
{
  "schemaVersion": "1.0",
  "generator": "fitness-coach",
  "appVersion": "0.1.0",
  "exportedAt": "2026-08-06T18:00:00.000Z",
  "profileId": "<uuid>",

  "equipmentReference": [ /* Schnappschuss aller Geräte */ ],
  "exercisesReference": [ /* Schnappschuss aller Übungen */ ],

  "records": {
    "profiles":           [ … ],
    "strengthReferences": [ … ],
    "plans":              [ … ],
    "sessions":           [ … ],
    "setLogs":            [ … ],
    "checkins":           [ … ],
    "bodyMetrics":        [ … ],
    "nutritionTargets":   [ … ],
    "adjustments":        [ … ]
  },

  "counts": { "setLogs": 1234, … },
  "readme": "…"
}
```

**`schemaVersion`** — erste Zahl = grundlegende Änderung (ältere Leser müssen
ablehnen), zweite Zahl = rückwärtskompatible Ergänzung (ältere Leser dürfen lesen
und neue Felder ignorieren).

**`equipmentReference` / `exercisesReference`** — der wichtigste Teil für die
Zukunftssicherheit. Ohne sie wäre `BRU-001` bedeutungslos, falls sich die
Übungsdatenbank ändert. Mit ihnen bringt die Datei ihr eigenes Wörterbuch mit.

**`counts`** — Anzahl je Datensatzart. Eine einfache Vollständigkeitsprüfung: Weicht
sie von der tatsächlichen Listenlänge ab, ist die Datei beschädigt.

---

## Gemeinsame Felder aller Datensätze

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | string | UUIDv7, auf dem Gerät erzeugt. Eindeutig über alle Geräte |
| `userId` | string | Profil-Zuordnung. Wird beim Import auf das Zielprofil umgeschrieben |
| `createdAt` | string | Zeitpunkt der Entstehung |
| `updatedAt` | string | Zeitpunkt der letzten Änderung. Dient als Sync-Cursor |
| `deletedAt` | string \| null | Weiches Löschen. `null` = aktiv |

---

## `profiles` — Profil und Einstellungen

Enthält die Onboarding-Antworten. **Nicht enthalten: das Körpergewicht** — es
ändert sich fortlaufend und lebt ausschließlich als Zeitreihe in `bodyMetrics`,
damit es nur eine Wahrheit dafür gibt.

| Feld | Typ | Werte / Bedeutung |
|---|---|---|
| `displayName` | string | Anzeigename |
| `sex` | enum | `male` · `female` · `unspecified` — **nur für die Kalorienformel** |
| `birthYear` | number | Geburtsjahr |
| `heightCm` | number | Körpergröße |
| `goal` | enum | `muscle` · `strength` · `fatloss` · `fitness` |
| `targetWeightKg` | number \| null | optional |
| `bodyFatBucket` | string \| null | verbaler Bereich, z. B. `"15-19"` |
| `priorityMuscles` | string[] | max. 2 Volumen-Muskeln (Liste unten) |
| `level` | enum | `beginner` · `intermediate` · `advanced` |
| `trainingYears` | enum | `lt6m` · `6to12m` · `1to2y` · `2to5y` · `gt5y` |
| `knowsRir` | boolean | steuert die Beschriftung der Abgleich-Buttons |
| `trainingDays` | string[] | aus `mon` `tue` `wed` `thu` `fri` `sat` `sun` |
| `sessionMinutes` | number | `45` · `60` · `75` · `90` |
| `dailyActivity` | enum | `sedentary` · `light` · `active` · `very_active` — **ohne Training**, das rechnet die App separat |
| `injuries` | object[] | `{ region, severity }`, siehe unten |
| `blacklistedExerciseIds` | string[] | vom Nutzer abgelehnte Übungen |
| `disabledEquipmentIds` | string[] | dauerhaft nicht verfügbare Geräte |
| `checkinWeekday` | enum | Wochentag des Check-ins |
| `intensity` | enum | `moderate` · `demanding` (Standard) · `very_demanding` |
| `feedbackStyle` | enum | `words` · `rir` |
| `onboardingCompletedAt` | string \| null | `null` = Onboarding unvollständig |

**`injuries[].region`** — `knee` · `shoulder` · `lower_back` · `elbow` · `wrist` ·
`hip` · `neck` · `ankle`
**`injuries[].severity`** — `acute` (schließt Übungen hart aus) · `history`
(depriorisiert nur)

---

## `strengthReferences` — Referenzwerte aus dem Onboarding

Grundlage der Startgewichte. Fehlen sie alle, läuft die App im Einmess-Modus.

| Feld | Typ | Bedeutung |
|---|---|---|
| `exerciseId` | string | Übung, auf die sich der Wert bezieht |
| `pattern` | enum | `horizontal_push` · `vertical_push` · `horizontal_pull` · `vertical_pull` · `squat` · `hinge` |
| `weightKg` | number \| null | `null` bei Körpergewichtsübungen |
| `reps` | number | erreichte Wiederholungen |
| `recordedAt` | string | Zeitpunkt der Angabe |

---

## `plans` — Planstände

Jede Neuberechnung erzeugt eine neue Version mit Begründung.

| Feld | Typ | Bedeutung |
|---|---|---|
| `version` | number | laufende Nummer |
| `splitType` | enum | `3_fullbody` · `4_upper_lower` · `5_ppl_ul` · `6_ppl` |
| `trainingDays` | string[] | Wochentage |
| `volumeTargets` | object | Volumen-Muskel → fraktionale Wochen-Zielsätze |
| `activeFrom` | string | Kalendertag |
| `activeUntil` | string \| null | `null` = aktueller Plan |
| `reason` | string | warum dieser Plan entstand |

---

## `sessions` — Trainingseinheiten

| Feld | Typ | Bedeutung |
|---|---|---|
| `planId` | string \| null | zugehöriger Plan |
| `label` | string | z. B. `"Oberkörper A"` |
| `scheduledFor` | string \| null | geplanter Kalendertag |
| `startedAt` / `completedAt` | string \| null | Zeitstempel |
| `status` | enum | `planned` · `active` · `completed` · `skipped` |
| `planned` | object[] | die Vorgabe beim Start, siehe unten |
| `sessionFeeling` | 1–4 \| null | 1 = gut … 4 = schlecht |
| `notes` | string \| null | Notiz |

### `planned[]` — Vorgabe pro Übung

| Feld | Typ | Bedeutung |
|---|---|---|
| `exerciseId` | string | Übungs-ID |
| `exerciseName` | string | Klartextname — **redundant gespeichert**, damit der Export ohne Übungsdatenbank lesbar bleibt |
| `orderIndex` | number | Position in der Einheit (0-basiert) |
| `sets` | number | Anzahl Arbeitssätze |
| `targetReps` | number \| null | **konkrete Zielzahl**, kein Bereich |
| `repRangeMin` / `repRangeMax` | number \| null | Rahmen für die Progression |
| `targetSeconds` | number \| null | bei zeitbasierten Übungen |
| `targetRir` | number | Ziel-Wiederholungen in Reserve |
| `restSeconds` | number | Satzpause |
| `weightKg` | number \| null | vorgegebenes Gewicht |
| `warmups` | object[] | `{ weightKg, reps }` — zählen **nie** ins Volumen |
| `selectionReason` | string \| null | warum diese Übung an dieser Stelle steht |

---

## `setLogs` — der Kern-Datensatz

**Append-only.** Korrekturen sind neue Zeilen mit `supersedesId`, niemals
Überschreibungen. Genau das macht die Synchronisation konfliktfrei.

Jede Zeile enthält **Vorgabe und Realität** — deshalb ist die Historie später noch
auswertbar, nicht nur anzeigbar.

| Feld | Typ | Bedeutung |
|---|---|---|
| `sessionId` | string | zugehörige Einheit |
| `exerciseId` | string | Übungs-ID |
| `exerciseName` | string | Klartextname (redundant, s. o.) |
| `orderIndex` | number | Position der Übung in der Einheit |
| `setNumber` | number | Satznummer innerhalb der Übung, 1-basiert |
| `isWarmup` | boolean | Aufwärmsätze zählen nie ins Volumen |
| `prescribedWeightKg` | number \| null | **Vorgabe:** Gewicht |
| `prescribedReps` | number \| null | **Vorgabe:** Wiederholungen |
| `prescribedSeconds` | number \| null | **Vorgabe:** Dauer |
| `prescribedRir` | number \| null | **Vorgabe:** Wiederholungen in Reserve |
| `actualWeightKg` | number \| null | **Realität:** Gewicht |
| `actualReps` | number \| null | **Realität:** Wiederholungen |
| `actualSeconds` | number \| null | **Realität:** Dauer |
| `feedback` | enum \| null | Abgleich, siehe unten |
| `rirDelta` | number \| null | abgeleitete Abweichung vom Ziel-RIR |
| `abandoned` | boolean | Satz abgebrochen — gilt als Ausfall, **nicht** als 0 Wiederholungen |
| `loggedAt` | string | Zeitpunkt des Eintragens |
| `deviceId` | string | Gerät, auf dem geloggt wurde |
| `supersedesId` | string \| null | ID des korrigierten Satzes |

### `feedback` — Abgleich statt Bewertung

Gefragt wird nicht „wie hart war das?", sondern ob die tatsächliche Anstrengung
zur **Vorgabe** passte. Ein Vergleich ist kognitiv leichter als eine absolute
Einschätzung und liefert genau die Abweichung, die die Progressionslogik braucht.

| Wert | Bedeutung | `rirDelta` |
|---|---|---|
| `as_planned` | genau wie vorgegeben | `0` |
| `more_left` | leichter als geplant, mehr drin | `+1.5` |
| `at_limit` | schwerer als geplant, am Limit | `-1.5` |

---

## `checkins` — wöchentliche Rückmeldung

| Feld | Typ | Bedeutung |
|---|---|---|
| `weekOf` | string | Montag der Woche, `YYYY-MM-DD` |
| `weightKgAvg` | number \| null | **Wochendurchschnitt**, nicht Tageswert |
| `looks` | -2…+2 \| null | Optikveränderung: −2 deutlich schlechter … +2 deutlich besser |
| `energy` | 1…5 \| null | 1 = sehr frisch … 5 = ausgelaugt |
| `sleep` | enum \| null | `good` · `ok` · `bad` |
| `joints` | enum \| null | `none` · `mild` · `limiting` |
| `motivation` | enum \| null | `high` · `normal` · `low` |
| `calorieAdherence` | enum \| null | `good` · `partial` · `none` |
| `submittedAt` | string | Zeitpunkt |
| `notes` | string \| null | Notiz |

> **`calorieAdherence` ist funktional notwendig, nicht bloß informativ.** Die App
> trackt kein Essen und kennt nur Vorgabe und Gewichtsveränderung. Reagiert das
> Gewicht nicht wie erwartet, kann die Ursache eine falsche Schätzung **oder**
> mangelnde Umsetzung sein. Ohne dieses Feld ließe sich das nicht unterscheiden —
> die App würde die Kalorien immer weiter verstellen. Kalorien werden nur bei
> `good` angepasst.

---

## `bodyMetrics` — Körperdaten als Zeitreihe

| Feld | Typ | Bedeutung |
|---|---|---|
| `measuredOn` | string | Kalendertag |
| `weightKg` | number \| null | Körpergewicht |
| `waistCm` | number \| null | **Taille auf Nabelhöhe** |
| `chestCm` · `hipCm` · `armCm` · `thighCm` · `calfCm` | number \| null | weitere Umfänge |
| `bodyFatBucket` | string \| null | verbaler Bereich |
| `source` | enum | `onboarding` · `checkin` · `monthly` · `manual` |

> **Warum die Taille der wichtigste Einzelwert ist:** Gewicht allein kann
> Muskelaufbau nicht von Fettaufbau unterscheiden — Gewicht **und** Taille
> zusammen können es. Gewicht ↑ bei stabiler Taille = idealer Aufbau; Gewicht ↑
> mit Taille ↑ = Überschuss zu groß.

---

## `nutritionTargets` — Ernährungsvorgaben

| Feld | Typ | Bedeutung |
|---|---|---|
| `effectiveFrom` | string | ab welchem Tag gültig |
| `kcal` | number | Tagesziel |
| `proteinG` · `fatG` · `carbsG` | number | Makronährstoffe |
| `maintenanceKcal` | number | zugrunde gelegter Erhaltungsbedarf |
| `targetRatePercentPerWeek` | number | Zielrate der Gewichtsveränderung in % pro Woche; negativ = Abnahme |
| `reason` | string | Begründung — wird in der App angezeigt |

---

## `adjustments` — Protokoll aller Anpassungen

Jede automatische Änderung mit Begründung. Gleichzeitig Datenquelle für die
Transparenz-Anzeigen und Prüfpfad, um die Coaching-Logik im Nachhinein zu
überprüfen.

| Feld | Typ | Bedeutung |
|---|---|---|
| `appliedAt` | string | Zeitpunkt |
| `scope` | enum | `set_correction` · `exercise_progression` · `session_wide` · `volume` · `nutrition` · `deload` · `exercise_rotation` · `plan_rebuild` |
| `circle` | 1–4 | welcher Regelkreis gehandelt hat |
| `targetId` | string \| null | Übungs-ID, Muskelname oder `null` |
| `targetLabel` | string \| null | Klartextbezeichnung |
| `before` / `after` | string | Zustand vor und nach der Änderung |
| `reason` | string | Begründung |
| `applied` | boolean | `false` = nur vorgeschlagen |
| `userAccepted` | boolean \| null | `null` = wurde nicht gefragt |

---

## Nachschlagedaten

### `equipmentReference[]`

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | string | z. B. `LEG-01` |
| `name` · `category` · `description` | string | Klartext |
| `loadType` | enum | `stack` · `plate` · `free` · `body` · `cardio` · `accessory` |
| `stepKg` | number \| null | kleinste einstellbare Stufe; `null` = kein Gewicht |
| `inverted` | boolean | `true` = **mehr Gewicht bedeutet weniger Widerstand** (unterstützte Klimmzug-/Dip-Maschine) |
| `maxKg` | number \| null | bekanntes Maximalgewicht |

### `exercisesReference[]`

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | string | z. B. `BRU-001` |
| `name` | string | Klartextname |
| `group` | string | Muskelgruppe der Quelldatei |
| `equipmentGroups` | string[][] | UND/ODER: äußeres Array = alle nötig, inneres = Alternativen |
| `equipmentIds` | string[] | flache Liste aller referenzierten Geräte |
| `primary` / `secondary` | string[] | Muskelbezeichnungen inkl. Unterregion |
| `unilateral` | boolean | einarmig/einbeinig — **beide Seiten zählen beim Volumen** |
| `metric` | enum | `reps` · `time` · `cardio` |
| `compound` | boolean | Grund- vs. Isolationsübung |

**Synthetische Geräte:** `BODY` (Körpergewicht) und `PLATES` (lose Hantelscheiben)
existieren nicht als echte Geräte, sondern machen den Verfügbarkeits-Filter
einheitlich.

---

## Volumen-Muskeln

Die 18 Muskeln, für die ein Wochenbudget geführt wird. Die ~75 Bezeichnungen der
Übungsdatenbank werden darauf abgebildet.

`Brust` · `Lat` · `Oberer Rücken` · `Unterer Rücken` · `Trapez` ·
`Vordere Schulter` · `Seitliche Schulter` · `Hintere Schulter` · `Bizeps` ·
`Trizeps` · `Unterarme` · `Quadrizeps` · `Hamstrings` · `Gesäß` · `Adduktoren` ·
`Waden` · `Bauch` · `Schienbein`

### Fraktionale Zählung

```
Volumen(Muskel) = Σ Sätze mit Muskel als PRIMÄR   × 1,0
                + Σ Sätze mit Muskel als SEKUNDÄR × 0,5
```

Drei Regeln, die beim Prüfen der echten Datenbank notwendig wurden:

1. **Eine Bezeichnung über mehrere Muskeln** (`"vord. + seitl. Schulter"`) wird
   **aufgeteilt** — die Verteilung ist unbekannt, also je die Hälfte.
2. **Mehrere getrennte Einträge** (`["Brust", "Lat"]` beim Überzug) bekommen jeweils
   das **volle** Gewicht — Volumen wird pro Muskel geführt, nicht als globales Budget.
3. **Mehrere Bezeichnungen auf denselben Muskel** (`["Brust (oben)", "Brust (mittel)"]`)
   ergeben das **Maximum**, nicht die Summe — es bleibt ein Satz Brustarbeit.

Unilaterale Übungen zählen **beide Seiten**: 3 Sätze einarmig = 6 gezählte Sätze.
Aufwärmsätze und Cardio zählen **nie**.

---

## CSV-Dateien

Neben dem JSON werden drei CSVs erzeugt — als Bequemlichkeit für Excel, nicht als
maschinenlesbare Wahrheit.

| Datei | Inhalt |
|---|---|
| `set-logs.csv` | jeder Satz mit Vorgabe und Realität |
| `checkins.csv` | wöchentliche Rückmeldungen |
| `body-metrics.csv` | Gewicht und Umfänge |

**Bewusst deutsche Excel-Konventionen:** Semikolon als Trenner, **Komma als
Dezimalzeichen**, UTF-8 mit BOM. Mit Punkt und Komma-Trenner landet in deutschem
Excel alles in einer Spalte und Zahlen werden als Text gelesen.

---

## Verhalten beim Import

| Situation | Verhalten |
|---|---|
| Gleiche erste Versionszahl | wird gelesen |
| Neuere erste Versionszahl | **abgelehnt** mit Hinweis, die App zu aktualisieren |
| Fremdes Profil | alle `userId` werden auf das Zielprofil umgeschrieben — damit funktioniert die Wiederherstellung in ein neues Konto |
| Datensatz existiert bereits | Standard `merge`: der **neuere** `updatedAt` gewinnt. Bei Gleichstand bleibt der lokale erhalten, damit ein wiederholter Import nichts verändert |
| `replace` gewählt | die Importdatei gewinnt immer |
| `updatedAt` beim Import | bleibt **unverändert** — es ist ein Datenfeld, keine Sync-Buchhaltung |
| Zählwerte weichen ab | Warnung, Import läuft weiter |
| Übungs-Schnappschuss fehlt | Warnung, dass IDs nur mit der aktuellen Datenbank auflösbar sind |
| Datei beschädigt | Abbruch **ohne** Schreibvorgang |
