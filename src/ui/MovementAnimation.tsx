// ====================================================================
//  Bewegungs-Schema
//
//  Eine kleine Animation, die RICHTUNG und UMFANG der Bewegung zeigt.
//  Ausdrücklich keine Formvorlage: Ein Strichbild kann nicht zeigen, wie
//  eine Kniebeuge aussieht, und würde es täuschend versuchen. Es zeigt, was
//  sich wohin bewegt — das reicht, um eine unbekannte Übung im Studio
//  wiederzuerkennen.
//
//  Warum eigene SVG statt Videos oder GIFs: Fremdmaterial hätte Rechte- und
//  Speicherfragen, müsste geladen werden und wäre offline nicht da. Diese
//  Schemata sind wenige Zeilen groß, funktionieren im Flugmodus und lassen
//  sich anpassen.
//
//  34 Bewegungsfamilien teilen sich NEUN Bewegungsmuster. Für jede Familie
//  ein eigenes Bild zu zeichnen wäre neunmal dieselbe Arbeit — die
//  Kniebeuge und der Ausfallschritt falten beide den Körper.
// ====================================================================

import type { MovementFamily } from '../domain/instructions'

/** Die neun Muster, auf die sich alle Familien abbilden. */
type Archetype =
  | 'press'
  | 'pull_down'
  | 'pull_in'
  | 'arc'
  | 'fold'
  | 'short_lift'
  | 'hold'
  | 'twist'
  | 'flow'

const ARCHETYPE: Record<MovementFamily, Archetype> = {
  bench_press: 'press',
  overhead_press: 'press',
  dip: 'press',
  pushup: 'press',
  leg_press: 'press',
  triceps_pushdown: 'press',

  pulldown: 'pull_down',
  pullup: 'pull_down',

  row: 'pull_in',

  fly: 'arc',
  curl: 'arc',
  triceps_extension: 'arc',
  lateral_raise: 'arc',
  front_raise: 'arc',
  rear_delt: 'arc',
  pullover: 'arc',
  leg_extension: 'arc',
  leg_curl: 'arc',
  abduction: 'arc',

  squat: 'fold',
  hinge: 'fold',
  lunge: 'fold',
  hip_thrust: 'fold',

  calf_raise: 'short_lift',
  shrug: 'short_lift',
  wrist: 'short_lift',

  plank: 'hold',
  carry: 'hold',

  rotation: 'twist',
  // Kleiner Bogen um den Ellbogen, nicht um den Rumpf.
  shoulder_rotation: 'arc',

  crunch: 'fold',
  leg_raise: 'arc',
  core_dynamic: 'flow',
  explosive: 'flow',
  full_body_flow: 'flow',
  generic: 'flow',
}

/** Beschreibung für Screenreader und als Bildunterschrift. */
const CAPTION: Record<Archetype, string> = {
  press: 'Last wird vom Körper weg gedrückt und kontrolliert zurückgeführt',
  pull_down: 'Last wird von oben nach unten zum Körper gezogen',
  pull_in: 'Last wird waagerecht zum Rumpf gezogen',
  arc: 'Bewegung im Bogen um ein Gelenk',
  fold: 'Körper beugt sich und richtet sich wieder auf',
  short_lift: 'kurzer Weg, oben halten',
  hold: 'Position halten, Rumpf bleibt fest',
  twist: 'Drehung aus dem Rumpf',
  flow: 'mehrere Abschnitte in einem Fluss',
}

export function MovementAnimation({ family }: { family: MovementFamily }) {
  const archetype = ARCHETYPE[family]

  return (
    <figure className="m-0">
      <div className="rounded-2xl bg-bg border border-border overflow-hidden">
        <svg
          viewBox="0 0 200 110"
          role="img"
          aria-label={`Bewegungsschema: ${CAPTION[archetype]}`}
          className="w-full h-28"
        >
          {/* Bezugslinie: Boden bzw. Auflage — gibt dem Schema Orientierung */}
          <line
            x1="20"
            y1="92"
            x2="180"
            y2="92"
            stroke="var(--color-border)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <Shape archetype={archetype} />
        </svg>
      </div>
      <figcaption className="text-xs text-muted mt-2 leading-snug">
        Schema — zeigt Richtung und Umfang, keine Formvorlage.
      </figcaption>
    </figure>
  )
}

function Shape({ archetype }: { archetype: Archetype }) {
  const load = 'var(--color-primary)'
  const body = 'var(--color-muted)'

  switch (archetype) {
    case 'press':
      return (
        <g>
          {/* Rumpf als feste Bezugsgröße */}
          <rect x="86" y="62" width="28" height="30" rx="8" fill={body} opacity="0.35" />
          <g className="anim-press">
            <rect x="70" y="26" width="60" height="12" rx="6" fill={load} />
          </g>
        </g>
      )

    case 'pull_down':
      return (
        <g>
          <rect x="86" y="52" width="28" height="40" rx="8" fill={body} opacity="0.35" />
          <g className="anim-pulldown">
            <rect x="66" y="16" width="68" height="11" rx="5.5" fill={load} />
          </g>
        </g>
      )

    case 'pull_in':
      return (
        <g>
          <rect x="34" y="50" width="26" height="42" rx="8" fill={body} opacity="0.35" />
          <g className="anim-pullin">
            <rect x="132" y="60" width="12" height="26" rx="6" fill={load} />
          </g>
        </g>
      )

    case 'arc':
      return (
        <g>
          {/* Gelenk als Drehpunkt */}
          <circle cx="100" cy="80" r="5" fill={body} />
          <g className="anim-arc" style={{ transformOrigin: '100px 80px' }}>
            <line
              x1="100"
              y1="80"
              x2="100"
              y2="30"
              stroke={body}
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle cx="100" cy="28" r="9" fill={load} />
          </g>
        </g>
      )

    case 'fold':
      return (
        <g>
          <circle cx="100" cy="88" r="4" fill={body} />
          <g className="anim-fold" style={{ transformOrigin: '100px 88px' }}>
            <line
              x1="100"
              y1="88"
              x2="100"
              y2="34"
              stroke={body}
              strokeWidth="5"
              strokeLinecap="round"
            />
            <rect x="82" y="22" width="36" height="11" rx="5.5" fill={load} />
          </g>
        </g>
      )

    case 'short_lift':
      return (
        <g>
          <rect x="86" y="56" width="28" height="36" rx="8" fill={body} opacity="0.35" />
          <g className="anim-short">
            <rect x="72" y="44" width="56" height="11" rx="5.5" fill={load} />
          </g>
        </g>
      )

    case 'hold':
      return (
        <g className="anim-hold">
          <line
            x1="46"
            y1="66"
            x2="154"
            y2="66"
            stroke={body}
            strokeWidth="6"
            strokeLinecap="round"
          />
          <circle cx="158" cy="60" r="8" fill={body} opacity="0.5" />
          <line
            x1="60"
            y1="66"
            x2="60"
            y2="92"
            stroke={load}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <line
            x1="140"
            y1="66"
            x2="140"
            y2="92"
            stroke={load}
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
      )

    case 'twist':
      return (
        <g>
          <circle cx="100" cy="82" r="5" fill={body} />
          <g className="anim-twist" style={{ transformOrigin: '100px 82px' }}>
            <line
              x1="100"
              y1="82"
              x2="100"
              y2="40"
              stroke={body}
              strokeWidth="4"
              strokeLinecap="round"
            />
            <rect x="64" y="32" width="72" height="10" rx="5" fill={load} />
          </g>
        </g>
      )

    case 'flow':
      return (
        <g>
          <rect x="86" y="58" width="28" height="34" rx="8" fill={body} opacity="0.35" />
          <g className="anim-flow">
            <circle cx="100" cy="40" r="10" fill={load} />
          </g>
        </g>
      )
  }
}
