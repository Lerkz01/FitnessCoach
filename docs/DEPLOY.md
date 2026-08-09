# Veröffentlichen und aufs Handy holen

Ziel: Die App liegt auf deinem Homescreen, startet ohne Adressleiste und funktioniert
auch im Keller ohne Netz.

**Reihenfolge beachten.** Zuerst Supabase, dann veröffentlichen. Grund: Vite backt die
`VITE_*`-Variablen beim **Build** in die Dateien ein, sie werden nicht zur Laufzeit
gelesen. Wer erst veröffentlicht und dann die Zugangsdaten nachträgt, hat eine App im
rein lokalen Betrieb, bis er erneut deployt.

---

## 1. Supabase einrichten

Siehe **[SETUP-CLOUD.md](SETUP-CLOUD.md)**. Am Ende hast du die Projekt-URL und den
`anon`-Schlüssel.

Eine Einstellung zusätzlich, sobald die Adresse der veröffentlichten App feststeht:
Unter **Authentication → URL Configuration** die **Site URL** auf deine
Render-Adresse setzen. Das braucht nur, wer Bestätigungs-Mails aktiv lässt — schaltest
du **Confirm email** aus, ist es gleichgültig.

## 2. Auf GitHub bringen

Das Repository ist lokal angelegt, der erste Commit steht. Es fehlt nur die
Gegenstelle:

```bash
gh repo create fitness-coach --private --source=. --remote=origin --push
```

Ohne die GitHub-CLI: Repository im Browser anlegen (**privat**), dann

```bash
git remote add origin https://github.com/DEIN-NAME/fitness-coach.git
git branch -M main
git push -u origin main
```

`.env` ist von `.gitignore` ausgenommen und landet nicht im Repository. Der
`anon`-Schlüssel wäre auch nicht schlimm — er ist öffentlich vorgesehen — aber die
Zugangsdaten gehören in die Render-Oberfläche, damit ein Projektwechsel kein Commit
braucht.

## 3. Auf Render veröffentlichen

Im Repository liegt `render.yaml`, das alles beschreibt. Also:

1. Auf [render.com](https://render.com) → **New** → **Blueprint**
2. Repository auswählen, Render liest `render.yaml`
3. Render fragt nach zwei Variablen. **Wichtig: In das Wertfeld gehört nur der WERT,
   nicht die ganze Zeile.** Genau hier ist es beim Einrichten schiefgegangen — die
   komplette Zeile `VITE_SUPABASE_ANON_KEY=…` landete als Wert im Feld, und die App
   meldete beim Anmelden „Invalid API key", ohne zu sagen, warum.
   
   | Key (Name der Variable) | Value (nur das hier) |
   |---|---|
   | `VITE_SUPABASE_URL` | die Projektadresse, z. B. `https://abcdefgh.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | der öffentliche Schlüssel, z. B. `sb_publishable_…` |
   
   Kein `=`, keine Anführungszeichen, kein Leerzeichen am Anfang oder Ende.
   
   Die App erkennt diesen Fehler inzwischen selbst und sagt es auf dem Anmeldebildschirm —
   aber verhindern ist besser.
4. **Apply**

Was `render.yaml` mitbringt und warum:

| Einstellung | Grund |
|---|---|
| `runtime: static` | Kein Server nötig — reine Dateiauslieferung. Statische Seiten schlafen bei Render **nicht** ein, anders als Web Services im Gratistarif. |
| `npm ci` | Baut exakt die Versionen aus dem Lockfile, nicht „irgendwas Passendes". |
| `NODE_VERSION 22.12` | Vite 8 verlangt Node 20.19+ oder 22.12+. |
| Rewrite `/*` → `/index.html` | Einzelseiten-App: ohne das gibt ein Neuladen unter einem Unterpfad 404. |
| `no-store` für `sw.js` und `index.html` | Der klassische PWA-Fehler: Ein zwischengespeicherter Service Worker lässt die App auf einer alten Fassung stehen, obwohl längst eine neue ausgeliefert wird. |
| `immutable` für `/assets/*` | Die Dateien tragen einen Hash im Namen und ändern sich nie unter demselben Namen. |

## 4. Aufs Handy legen

**Android (Chrome):** Adresse öffnen → Menü → *App installieren*. Chrome bietet es oft
selbst an.

**iPhone (Safari):** Adresse öffnen → Teilen-Symbol → *Zum Home-Bildschirm*. Andere
Browser können das auf iOS nicht, es muss Safari sein.

Danach startet die App ohne Adressleiste im Vollbild.

## 5. Prüfen, dass es hält

1. **Offline:** Flugmodus einschalten, App vom Homescreen starten. Sie muss vollständig
   laden. (Lokal geprüft: Sie lädt mit gestopptem Server.)
2. **Training offline:** Ein paar Sätze eintragen. Die Statuszeile oben zeigt „Offline",
   die Sätze werden gespeichert.
3. **Netz an:** Innerhalb von Sekunden verschwindet die Zeile. Unter „Heute" →
   *Sicherung* muss stehen: *Noch nicht hochgeladen: nichts*.
4. **Der eigentliche Test:** siehe [SETUP-CLOUD.md](SETUP-CLOUD.md) §5 — Speicher
   löschen, anmelden, zurückholen.

## Neue Fassung ausliefern

`git push` genügt — Render baut automatisch. Die App aktualisiert sich beim nächsten
Start selbst (`registerType: 'autoUpdate'`).

**Nach einer Änderung der Umgebungsvariablen** reicht das nicht: Dann in Render
**Manual Deploy → Deploy latest commit**, weil die Werte nur beim Build eingebacken
werden.

---

## Icons ändern

Der Entwurf steckt in `scripts/build-icons.mjs` — als Code, nicht als Bilddatei.

```bash
npm run build:icons
```

Erzeugt `favicon.svg`, `icon-192`, `icon-512`, die maskable-Variante mit weitem Rand
und das apple-touch-icon. Die maskable-Variante ist eine **eigene Datei**: Android
schneidet solche Icons in Kreise oder Squircles und garantiert nur die inneren 80 % —
mit derselben Datei wie das normale Icon wären die äußeren Hantelscheiben abgeschnitten.
