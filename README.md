# Fitness Coach

Persönliche Trainings- und Ernährungs-PWA für zwei Nutzer. Die App gibt jeden Tag
vor, was zu trainieren ist — mit Übungen, Sätzen, Wiederholungen und Gewicht — und
passt sich fortlaufend an das an, was tatsächlich passiert.

Kein Produkt, keine Nutzerverwaltung, keine Abstriche für Fremde: gebaut für genau
zwei Personen und deren Gym.

## Loslegen

```bash
npm install
npm run dev
```

Ohne Cloud-Konfiguration läuft alles lokal — die App sagt das auf dem Startbildschirm
auch deutlich.

**Zum ersten Mal einrichten und aufs Handy holen:
[docs/LOSLEGEN.md](docs/LOSLEGEN.md)** — Schritt für Schritt, etwa 40 Minuten.

| Befehl | Wozu |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm test` | Testlauf (aktuell 466 Tests) |
| `npm run build` | Produktionsbau nach `dist/` |
| `npm run build:data` | Übungs- und Gerätedatenbank aus den Markdown-Quellen erzeugen |
| `npm run build:icons` | App-Icons aus dem Entwurf in `scripts/build-icons.mjs` rendern |
| `npm run lint` | Oxlint |

## Wie es funktioniert

Zwei Grundsätze tragen die ganze Architektur:

**1. Gespeichert werden nur Rohdaten.** Alles Abgeleitete — geschätztes 1RM,
Volumenlast, Progressionsstand, Diagramme — wird berechnet, nie gespeichert. Deshalb
kann eine verbesserte Progressionslogik die gesamte Historie neu durchrechnen, und
deshalb kann eine völlig andere App die Daten später übernehmen.

**2. Vier Regelkreise mit unterschiedlicher Taktung.** Was ein einzelner Satz zeigt,
darf den Plan nicht umwerfen; was eine ganze Woche zeigt, muss es.

| Kreis | Wann | Entscheidet |
|---|---|---|
| 1 | im Satz | Gewicht war falsch angesetzt → sofort korrigieren |
| 2 | nach der Einheit | Vorgabe fürs nächste Mal (Doppelprogression mit Bestätigung) |
| 2b | nach der Einheit | war die *ganze* Einheit zu leicht? |
| 3 | nach dem Check-in | Wochenvolumen, Kalorien, Deload, Übungsrotation |
| 4 | alle 4–6 Wochen | Erhaltungsbedarf, Zielübergänge, Level *(noch offen)* |

## Aufbau des Quellcodes

```
src/
  domain/      Die gesamte Fachlogik, ohne React und ohne Datenbank
               muscles, volume, weights, planning, generator,
               progression, history, postSession, weeklyReview, nutrition
  data/        Übungs-/Gerätedatenbank (aus Markdown erzeugt) + IndexedDB
  sync/        Warteschlange, Supabase-Adapter, Wiederherstellung
  auth/        Anmeldung — liefert die Profilkennung
  export/      App-unabhängiger Export und Import
  workout/     Trainingsbildschirm und Schreibpfad
  checkin/     Wochen-Check-in und Auswertungsanzeige
  screens/     Fortschritt, Ernährung, Sicherung
  ui/          Bausteine der Oberfläche
```

Die Fachlogik in `domain/` kennt weder React noch IndexedDB. Das ist der Grund, warum
sie so dicht getestet werden kann — und warum die Tests echte Fehler finden statt nur
Zeilen abzudecken.

## Dokumentation

Verbindlich, nicht beschreibend: Wenn Code und Dokument sich widersprechen, ist das
ein Fehler.

| Datei | Inhalt |
|---|---|
| [TRAINING-SCIENCE.md](docs/TRAINING-SCIENCE.md) | Evidenzbasis — Meta-Analysen übersetzt in konkrete Algorithmusparameter |
| [PLAN-ENGINE.md](docs/PLAN-ENGINE.md) | Die vier Regelkreise im Detail |
| [ONBOARDING.md](docs/ONBOARDING.md) | 20 Schritte, Frage für Frage |
| [UI-UX.md](docs/UI-UX.md) | Bedienung, abgeleitet aus der Gym-Realität |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Offline-First, drei Sicherungsebenen, Datumsregeln |
| [DATA-SCHEMA.md](docs/DATA-SCHEMA.md) | Exportformat, Feld für Feld |
| [LOSLEGEN.md](docs/LOSLEGEN.md) | **Von null bis zum ersten echten Training** |
| [SETUP-CLOUD.md](docs/SETUP-CLOUD.md) | Supabase im Detail, Ausfallverhalten |
| [DEPLOY.md](docs/DEPLOY.md) | Veröffentlichen und aufs Handy holen |

Mehrere Abschnitte tragen den Vermerk, welcher Fehler eine Regel erzwungen hat — etwa
`PLAN-ENGINE.md` §9 („Vier Regeln, die erst die Simulation erzwungen hat") und
`ARCHITECTURE.md` §4.1. Diese Begründungen sind wichtiger als die Regeln selbst: Ohne
sie wird eine Regel beim nächsten Umbau wieder herausgenommen.

## Deployment

`render.yaml` beschreibt eine statische Seite auf Render. Schritt für Schritt:
**[docs/DEPLOY.md](docs/DEPLOY.md)**.

**Achtung:** Die `VITE_*`-Variablen werden beim *Build* eingebacken, nicht zur Laufzeit
gelesen — nach einer Änderung muss neu deployt werden.

## Stand

Läuft: Onboarding, Trainingsplanung, Training tracken, Analyse nach jeder Einheit,
Wochen-Check-in mit Anpassung von Volumen und Kalorien, Fortschritt, Ernährung,
Sicherung auf drei Ebenen.

Dazu der „Gerät besetzt"-Übungstausch: regelbasiert, offline, höchstens vier
Vorschläge, Gewicht aus der Historie oder umgerechnet (`docs/UI-UX.md` §10.1).

Fehlt noch: Ausführung der Rotationsvorschläge aus dem Check-in, monatlicher Check-in
mit Umfängen, Regelkreis 4, Übungsanleitungen, KI-Chat.
