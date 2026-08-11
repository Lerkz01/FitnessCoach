// ====================================================================
//  Coach-Chat — der einzige Ort, an dem der Claude-Schlüssel liegt
//
//  Warum eine Edge Function und nicht direkt aus der App:
//
//  Der API-Schlüssel darf niemals in den Browser. Alles, was im Bundle
//  landet, ist öffentlich — auch bei einer PWA, die nur zwei Leute
//  benutzen. Der Schlüssel liegt deshalb als Supabase-Secret hier auf dem
//  Server, und die App bekommt ihn nie zu sehen.
//
//  Was diese Funktion tut und was ausdrücklich nicht:
//
//   · Sie prüft, dass der Aufrufer angemeldet ist. Ohne gültiges Konto
//     keine Antwort — sonst könnte jeder Fremde auf Lucas Rechnung
//     Anfragen stellen.
//   · Sie schreibt den Systemtext (die Coaching-Regeln) und leitet die
//     Antwort als Datenstrom weiter.
//   · Sie schreibt NICHTS in die Datenbank. Alle Änderungen am Plan
//     passieren in der App, über denselben Weg wie jede andere Änderung.
//     Damit kann ein Fehler hier keinen Trainingsfortschritt beschädigen.
//   · Sie führt keine Werkzeuge aus. Was das Modell tun möchte, geht als
//     Vorschlag zurück an die App; die entscheidet und protokolliert.
//
//  Bereitstellen:
//    supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//    supabase functions deploy coach
// ====================================================================

import Anthropic from 'npm:@anthropic-ai/sdk@0.116.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * Das Modell.
 *
 * Opus 5 ist das stärkste Modell und kostet 5 $ je Million Wörter hinein,
 * 25 $ hinaus. Eine Chatfrage mit vollem Trainingskontext liegt bei etwa
 * 4000–8000 Token hinein und wenigen hundert hinaus — also grob 3–5 Cent
 * pro Nachricht. Wer sparen will, ändert diese eine Zeile auf
 * 'claude-sonnet-5' (etwa ein Drittel davon).
 */
const MODEL = 'claude-opus-5'

/**
 * Wie ausführlich das Modell denken darf.
 *
 * 'medium' ist für einen Trainingschat der richtige Punkt: Es muss Verlauf
 * und Volumen zusammenbringen, aber keine Forschungsarbeit leisten. Höher
 * hieße längeres Warten und mehr Kosten pro Frage.
 */
const EFFORT = 'medium' as const

/**
 * Obergrenze der Antwortlänge.
 *
 * Achtung: Bei Opus 5 ist Denken standardmäßig AN, und `max_tokens` deckelt
 * Denken UND Antwort zusammen. Zu knapp bemessen bricht die Antwort mitten
 * im Satz ab, nachdem das Denken das Budget aufgebraucht hat.
 */
const MAX_TOKENS = 4000

/** Nur diese Werkzeuge darf das Modell benutzen. */
const ALLOWED_TOOLS = new Set([
  'set_focus',
  'clear_focus',
  'avoid_exercise',
  'allow_exercise',
])

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ────────────────────────────────────────────────────────────────────
//  Der Systemtext
//
//  Getrennt in zwei Blöcke: Der erste ist bei jedem Aufruf identisch und
//  wird zwischengespeichert (Prompt-Caching) — das kostet beim ersten Mal
//  ein Viertel mehr und danach nur noch ein Zehntel. Der zweite trägt den
//  aktuellen Trainingskontext und ändert sich ständig, steht deshalb
//  DAHINTER: Zwischengespeichert wird immer nur der Anfang, jede Änderung
//  weiter vorn macht den Rest wertlos.
// ────────────────────────────────────────────────────────────────────

const COACH_RULES = `Du bist der Trainingscoach in einer persönlichen Fitness-App. Du sprichst mit
genau einer Person, deren Plan, Verlauf und Ziele du im Kontext unten bekommst.
Antworte auf Deutsch, per Du.

## Wer du bist

Ein erfahrener Coach, der die Zahlen dieser Person kennt. Du redest wie jemand
im Studio: knapp, konkret, ohne Motivationsfloskeln. Keine Emojis. Keine
Aufzählungen, wo zwei Sätze reichen.

Antworte so kurz, wie die Frage es zulässt. Auf „warum heute Beine?" gehören
zwei Sätze, nicht ein Absatz mit Überschriften. Wer nach einer Erklärung fragt,
bekommt zuerst die Antwort und dann den Grund — nicht umgekehrt.

## Was du weißt und was nicht

Der Kontext unten ist deine einzige Quelle für diese Person. Steht etwas nicht
darin, weißt du es nicht — dann sag das, statt zu raten. Erfinde nie Gewichte,
Wiederholungen, Übungsnamen oder Verlaufsdaten. Erfinde keine Übungs-IDs.

Du bist kein Arzt. Bei Schmerzen, Verletzungen oder Krankheitsanzeichen: sag
klar, dass das jemand vor Ort ansehen muss, und beschränke dich darauf, wie das
Training darum herum aussehen kann.

## Wie der Plan funktioniert

Die App plant das WOCHENVOLUMEN pro Muskel (Sätze pro Woche) und wählt daraus
die Übungen, Gewichte und Wiederholungen automatisch. Vier Regelkreise
korrigieren laufend: während des Satzes, nach der Einheit, nach der Woche.
Der Nutzer muss also nichts von Hand nachstellen — und du sollst es auch nicht.

Progression läuft über doppelte Progression mit Bestätigungsregel: erst mehr
Wiederholungen im Zielbereich, dann mehr Gewicht, und ein Sprung wird erst
gemacht, wenn die Leistung zweimal getragen hat. Ein einzelner starker Tag
ändert nichts. Wenn jemand fragt, warum das Gewicht nicht steigt, ist das
meistens die Antwort.

## Was du am Plan ändern darfst

Du hast vier Werkzeuge, und sie sind absichtlich eng:

- set_focus: verschiebt das Wochenvolumen EINES Muskels um zwei Sätze, nach
  oben oder unten. Es ist eine Nullsumme — mehr an einer Stelle heißt etwas
  weniger woanders, weil sonst die Einheiten länger werden und die Erholung
  nicht mehr reicht. Höchstens drei Muskeln gleichzeitig betont.
- clear_focus: nimmt einen Schwerpunkt zurück.
- avoid_exercise / allow_exercise: nimmt eine Übung aus dem Plan oder wieder
  hinein. Nur Übungen, die im Kontext mit ihrer ID aufgeführt sind.

Regeln dafür:

1. Benutze ein Werkzeug nur, wenn die Person eine Änderung WILL. „Ich möchte
   mehr Fokus auf die Arme" ist ein Wunsch. „Warum sind meine Arme dünn?" ist
   eine Frage — die beantwortest du.
2. „Arme" sind zwei Muskeln: Bizeps und Trizeps. Rufe set_focus für beide
   auf. „Beine" sind Quadrizeps, Hamstrings, Gesäß. Benutze nur Muskelnamen
   aus der Liste im Kontext — andere kennt die App nicht.
3. Sag VORHER in einem Satz, was du gleich änderst, und danach was der
   Ausgleich kostet. Die Person soll nicht überrascht werden.
4. Änderungen wirken beim nächsten Planaufbau, nicht mitten in der Woche.
   Ein Tausch innerhalb einer laufenden Woche würde die Vergleichbarkeit
   zerstören, auf der die Progression beruht. Sag das dazu.
5. Größere Wünsche — anderer Split, andere Trainingstage, anderes Ziel,
   andere Kalorien — kannst du NICHT umsetzen. Verweise auf das Profil bzw.
   den Wochen-Check-in und erklär in einem Satz, was dort einzustellen ist.

## Was du nie tust

Kein Werkzeug ohne erkennbaren Wunsch. Keine Änderung „vorsichtshalber".
Keine Zahl, die nicht im Kontext steht. Und wenn du unsicher bist, ob ein
Wunsch gemeint war: frag nach, statt zu handeln — eine Rückfrage kostet einen
Satz, eine falsche Planänderung eine Woche.`

// ────────────────────────────────────────────────────────────────────

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (request.method !== 'POST') {
    return json({ error: 'Nur POST.' }, 405)
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    // Genaue Fehlermeldung, weil dieser Fall beim Einrichten passiert und
    // sonst nur als „geht nicht" ankommt.
    return json(
      {
        error:
          'Auf dem Server fehlt ANTHROPIC_API_KEY. Setzen mit: ' +
          'supabase secrets set ANTHROPIC_API_KEY=sk-ant-…',
      },
      500,
    )
  }

  // ── Anmeldung prüfen ──
  //
  // Ohne diese Prüfung könnte jeder, der die Adresse kennt, auf fremde
  // Rechnung Anfragen stellen.
  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'Nicht angemeldet.' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } } },
  )
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth?.user) {
    return json({ error: 'Anmeldung ungültig oder abgelaufen.' }, 401)
  }

  // ── Anfrage lesen ──
  let body: {
    messages?: unknown
    context?: unknown
    tools?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Anfrage ist kein gültiges JSON.' }, 400)
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: 'Es fehlen Nachrichten.' }, 400)
  }
  if (typeof body.context !== 'string' || body.context.length === 0) {
    return json({ error: 'Es fehlt der Trainingskontext.' }, 400)
  }

  // Werkzeuge kommen aus der App, weil dort die gültigen Muskelnamen und
  // Übungs-IDs stehen. Die Namen werden hier trotzdem geprüft: Diese
  // Funktion soll kein allgemeiner Zugang zu Claude werden.
  const tools = Array.isArray(body.tools) ? body.tools : []
  const unknown = tools
    .map((tool) => (tool as { name?: string }).name ?? '?')
    .filter((name) => !ALLOWED_TOOLS.has(name))
  if (unknown.length > 0) {
    return json({ error: `Unbekannte Werkzeuge: ${unknown.join(', ')}` }, 400)
  }

  const anthropic = new Anthropic({ apiKey })

  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Denken bleibt AN. Bei abgeschaltetem Denken schreibt Opus 5
      // gelegentlich einen Werkzeugaufruf als normalen Text — der Aufruf
      // würde dann stillschweigend nie ausgeführt. Für einen Chat, der den
      // Plan ändern soll, ist das der schlimmste mögliche Fehler.
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: EFFORT },
      system: [
        // Erster Block: unveränderlich, wird zwischengespeichert.
        { type: 'text', text: COACH_RULES, cache_control: { type: 'ephemeral' } },
        // Zweiter Block: der aktuelle Stand. Ändert sich bei jedem Aufruf und
        // steht deshalb HINTER dem Sprungpunkt.
        { type: 'text', text: body.context },
      ],
      tools: tools as never,
      messages: body.messages as never,
    })

    // Der Datenstrom geht unverändert weiter an die App. Sie entscheidet,
    // was sie anzeigt und was sie mit einem Werkzeugwunsch macht.
    const encoder = new TextEncoder()
    const out = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'coach_error', message })}\n\n`,
            ),
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(out, {
      headers: {
        ...CORS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ error: `Claude nicht erreichbar: ${message}` }, 502)
  }
})

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
