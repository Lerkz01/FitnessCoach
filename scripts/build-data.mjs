// ====================================================================
//  build-data.mjs
//  Liest data/source/gym-geraete.md + gym-uebungen.md und erzeugt
//  daraus src/data/equipment.json und src/data/exercises.json.
//
//  Ausführen:  npm run build:data
//
//  Die Markdown-Dateien sind die EINZIGE Quelle der Wahrheit. Ergänzt
//  du dort Geräte/Übungen, lauf dieses Skript neu – die App-Daten
//  aktualisieren sich automatisch.
// ====================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'data', 'source')
const OUT = join(ROOT, 'src', 'data')

// --------------------------------------------------------------------
//  Hilfsfunktionen
// --------------------------------------------------------------------

const EQUIP_ID = /^[A-Z]{3}-\d{2}$/
const EXERCISE_ID = /^[A-Z]{3}-\d{3}$/
const EQUIP_ID_TOKEN = /[A-Z]{3}-\d{2}\b/g

/** Zerlegt eine Markdown-Tabellenzeile "| a | b |" in getrimmte Zellen. */
function parseRow(line) {
  return line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim())
}

/** Ist die Zeile eine Tabellen-Datenzeile (kein Header/Trenner)? */
function isTableRow(line) {
  const t = line.trim()
  return t.startsWith('|') && !t.includes('---')
}

// --------------------------------------------------------------------
//  Geräte parsen
// --------------------------------------------------------------------

/** Standard-Schrittweite (kg) je Ladeart. Pro Gerät später überschreibbar. */
function defaultStep(loadType, id) {
  switch (loadType) {
    case 'stack':
      return 5 // Standardannahme, gerätespezifisch anpassbar
    case 'plate':
      return 2.5 // kleinste Scheibe 1,25 kg pro Seite
    case 'free':
      // Kurzhanteln: 1 kg bis 10 kg, darüber 2 kg (im Rundungs-Helper behandelt).
      // Langhantel & SZ-Stange: 1,25 kg pro Seite = 2,5 kg gesamt.
      return id === 'FRE-01' ? 2 : 2.5
    default:
      return null // body, cardio, accessory
  }
}

function parseEquipment(md) {
  const lines = md.split(/\r?\n/)
  const out = []
  let category = ''

  for (const line of lines) {
    const heading = line.match(/^##\s+\d+\.\s+(.*)$/)
    if (heading) {
      category = heading[1].trim()
      continue
    }
    if (!isTableRow(line)) continue

    const cells = parseRow(line)
    if (cells.length < 4) continue
    const [id, name, loadRaw, description] = cells
    if (!EQUIP_ID.test(id)) continue

    let loadType = loadRaw
    if (!['stack', 'plate', 'free', 'body', 'cardio'].includes(loadType)) {
      loadType = 'accessory' // "–" o.ä.
    }

    out.push({
      id,
      name,
      category,
      loadType,
      description,
      stepKg: defaultStep(loadType, id),
      inverted: id === 'FRE-11', // unterstützte Klimmzug-/Dip-Maschine
      maxKg: null,
    })
  }

  // Synthetische "Geräte" für Körpergewicht & lose Scheiben,
  // damit der Verfügbarkeits-Filter einheitlich funktioniert.
  out.push({
    id: 'BODY',
    name: 'Körpergewicht',
    category: 'Körpergewicht',
    loadType: 'body',
    description: 'Übungen ohne Zusatzgerät (nur Körpergewicht).',
    stepKg: null,
    inverted: false,
    maxKg: null,
  })
  out.push({
    id: 'PLATES',
    name: 'Hantelscheiben (lose)',
    category: 'Freihantel & Multifunktion',
    loadType: 'free',
    description: 'Lose Hantelscheiben, z.B. für Svend Press, Frontheben, Russian Twists.',
    stepKg: 1.25,
    inverted: false,
    maxKg: null,
  })

  return out
}

// --------------------------------------------------------------------
//  Übungen parsen
// --------------------------------------------------------------------

function mapGroup(heading) {
  const h = heading.toLowerCase()
  if (h.includes('brust')) return 'Brust'
  if (h.includes('trapez') || h.includes('nacken')) return 'Trapez'
  if (h.includes('rücken')) return 'Rücken'
  if (h.includes('schulter')) return 'Schultern'
  if (h.includes('bizeps')) return 'Bizeps'
  if (h.includes('trizeps')) return 'Trizeps'
  if (h.includes('unterarm') || h.includes('griffkraft')) return 'Unterarme'
  if (h.includes('quadrizeps')) return 'Quadrizeps'
  if (h.includes('hamstring')) return 'Hamstrings'
  if (h.includes('gesäß')) return 'Gesäß'
  if (h.includes('adduktor')) return 'Adduktoren'
  if (h.includes('waden')) return 'Waden'
  if (h.includes('bauch') || h.includes('rumpf')) return 'Bauch'
  if (h.includes('cardio')) return 'Cardio'
  if (h.includes('ganzkörper') || h.includes('explosiv') || h.includes('kondition'))
    return 'Ganzkörper'
  return 'Ganzkörper'
}

/** Wandelt eine Alternative wie "FRE-01", "body" oder "Scheiben" in eine Geräte-ID. */
function tokenToEquipId(token) {
  const idMatch = token.match(EQUIP_ID_TOKEN)
  if (idMatch) return idMatch[0]
  const t = token.toLowerCase()
  if (t.includes('body')) return 'BODY'
  if (t.includes('scheibe')) return 'PLATES'
  return null
}

/**
 * Parst die Geräte-Zelle in eine UND/ODER-Struktur.
 * Komma = UND (mehrere Gruppen), Schrägstrich = ODER (Alternativen).
 */
function parseEquipmentGroups(cell) {
  const groups = []
  for (const part of cell.split(',')) {
    const alternatives = []
    for (const alt of part.split('/')) {
      const id = tokenToEquipId(alt)
      if (id && !alternatives.includes(id)) alternatives.push(id)
    }
    if (alternatives.length) groups.push(alternatives)
  }
  return groups
}

function splitMuscles(cell) {
  if (!cell || cell === '–' || cell === '-') return []
  return cell
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
}

const UNILATERAL_KW = [
  'einarm',
  'einbein',
  'einseit',
  'im wechsel',
  'cross-body',
  'quer über',
  'konzentration',
  'suitcase',
  'overhead carry',
  'split squat',
  'bulgarian',
  'lunge',
  'ausfallschritt',
  'step-up',
  'curtsy',
  'cossack',
  'get-up',
  'einbeiniges',
  'einbeinig',
]

const TIME_KW = [
  'plank',
  'planke',
  'hold',
  'halten',
  'hang',
  // Bewusst NICHT 'walk': das würde auch "Walking Lunges" treffen, eine
  // wiederholungsbasierte Übung. Die echten Geh-Übungen sind über
  // 'farmer', 'carry' und 'bear crawl' erfasst.
  'carry',
  'wall sit',
  'static',
  'hollow',
  'farmer',
  'seitstütz',
  'bear crawl',
]

const ISOLATION_KW = [
  'curl',
  'fly',
  'fliegende',
  'seitheben',
  'frontheben',
  'raise',
  'beinheben',
  'knieheben',
  'extension',
  'strecker',
  'beuger',
  'pushdown',
  'crunch',
  'shrug',
  'kickback',
  'pullover',
  'überzug',
  'butterfly',
  'woodchopper',
  'twist',
  'pallof',
  'svend',
  'face pull',
  'around the world',
  'halo',
  'windmill',
  'wadenheben',
  'wadendrücken',
  'handgelenk',
  'pinch',
  'außenrotation',
  'innenrotation',
  'y-raise',
  'reverse fly',
  // Aufrechtes Rudern ist trotz des Namens keine Ruderbewegung, sondern
  // ein Heben mit gebeugten Armen — programmatisch eine Isolationsübung.
  // Als „Grundübung" eingestuft bekäme es schwere Lasten bei wenigen
  // Wiederholungen, was für die Schulter ein unnötiges Risiko ist.
  'aufrechtes rudern',
]

const COMPOUND_KW = [
  'bankdrücken',
  'kniebeuge',
  'squat',
  'kreuzheben',
  'deadlift',
  'rudern',
  'row',
  'klimmzug',
  'chin-up',
  'pull-up',
  'dips',
  'dip-maschine',
  'schulterdrücken',
  'military',
  'push press',
  'press',
  'clean',
  'snatch',
  'thruster',
  'hip thrust',
  'glute bridge',
  'beinpresse',
  // Ein- und zweibeinige Kniebeugenvarianten sind mehrgelenkig (Hüfte +
  // Knie) und gehören zu den Grundübungen — sie fehlten hier zunächst und
  // wurden dadurch fälschlich als Isolation eingestuft.
  'lunge',
  'ausfallschritt',
  'split squat',
  'bulgarian',
  'step-up',
  'cossack',
  'v-squat',
  'pull-through',
  'good morning',
  'high pull',
  'burpee',
  'renegade',
  'liegestütz',
  'push-up',
  'chest press',
]

function anyKw(name, list) {
  const n = name.toLowerCase()
  return list.some((kw) => n.includes(kw))
}

function classifyMetric(name, group) {
  if (group === 'Cardio') return 'cardio'
  if (anyKw(name, TIME_KW)) return 'time'
  return 'reps'
}

function classifyCompound(name) {
  if (anyKw(name, ISOLATION_KW)) return false
  if (anyKw(name, COMPOUND_KW)) return true
  return false
}

function parseExercises(md) {
  const lines = md.split(/\r?\n/)
  const out = []
  let group = 'Ganzkörper'

  for (const line of lines) {
    const heading = line.match(/^##\s+[\d.]+\s+(.*)$/)
    if (heading) {
      group = mapGroup(heading[1])
      continue
    }
    if (!isTableRow(line)) continue

    const cells = parseRow(line)
    if (cells.length < 5) continue
    const [id, name, equipCell, primaryCell, secondaryCell] = cells
    if (!EXERCISE_ID.test(id)) continue

    const equipmentGroups = parseEquipmentGroups(equipCell)
    const equipmentIds = [...new Set(equipmentGroups.flat())]

    out.push({
      id,
      name,
      group,
      equipmentGroups,
      equipmentIds,
      primary: splitMuscles(primaryCell),
      secondary: splitMuscles(secondaryCell),
      unilateral: anyKw(name, UNILATERAL_KW),
      metric: classifyMetric(name, group),
      compound: classifyCompound(name),
    })
  }

  return out
}

// --------------------------------------------------------------------
//  Ausführen
// --------------------------------------------------------------------

const equipmentMd = readFileSync(join(SRC, 'gym-geraete.md'), 'utf8')
const exercisesMd = readFileSync(join(SRC, 'gym-uebungen.md'), 'utf8')

const equipment = parseEquipment(equipmentMd)
const exercises = parseExercises(exercisesMd)

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'equipment.json'), JSON.stringify(equipment, null, 2) + '\n')
writeFileSync(join(OUT, 'exercises.json'), JSON.stringify(exercises, null, 2) + '\n')

// Kurzer Report
const validEquipIds = new Set(equipment.map((e) => e.id))
const missing = new Set()
for (const ex of exercises) {
  for (const eid of ex.equipmentIds) {
    if (!validEquipIds.has(eid)) missing.add(eid)
  }
}

console.log(`✅ ${equipment.length} Geräte  →  src/data/equipment.json`)
console.log(`✅ ${exercises.length} Übungen  →  src/data/exercises.json`)
console.log(`   davon Grundübungen: ${exercises.filter((e) => e.compound).length}`)
console.log(`   davon unilateral:   ${exercises.filter((e) => e.unilateral).length}`)
console.log(`   Metrik time:        ${exercises.filter((e) => e.metric === 'time').length}`)
console.log(`   Metrik cardio:      ${exercises.filter((e) => e.metric === 'cardio').length}`)
if (missing.size) {
  console.warn(`⚠️  Unbekannte Geräte-IDs referenziert: ${[...missing].join(', ')}`)
}
