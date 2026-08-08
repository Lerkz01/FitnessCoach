// ====================================================================
//  App-Icons erzeugen
//
//  Ein Skript statt Bilddateien von Hand: So bleibt das Icon
//  reproduzierbar, und eine Änderung am Entwurf ist eine Zeile Code statt
//  fünf neu exportierter Dateien.
//
//    node scripts/build-icons.mjs
//
//  Entwurfsentscheidungen:
//
//  · BLAUER Hintergrund, helles Symbol — nicht der dunkle App-Hintergrund.
//    Ein fast schwarzes Icon verschwindet auf einem dunklen Hintergrundbild.
//  · Eine Hantel, keine Wortmarke. Bei 48 Pixeln auf dem Homescreen ist
//    Text unlesbar; eine Form erkennt man sofort.
//  · Dicke Scheiben und ein kräftiger Griff. Feine Linien verschwinden beim
//    Verkleinern.
//  · Zwei Größenvarianten: normal mit engem Rand, „maskable" mit weitem.
//    Android schneidet maskable-Icons in beliebige Formen (Kreis, Squircle)
//    und garantiert nur den inneren Bereich von 80 %. Ohne eigene Variante
//    wären die äußeren Scheiben abgeschnitten.
// ====================================================================

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, '..', 'public')

const BLAU = '#2563eb'
const BLAU_DUNKEL = '#1d4ed8'
const HELL = '#eef4fb'

/**
 * Der Entwurf, auf einem Raster von 512 × 512.
 *
 * `scale` skaliert nur das Symbol, nicht den Hintergrund — damit lässt sich
 * derselbe Entwurf für enge und weite Ränder verwenden.
 */
function icon({ scale = 1, rounded = false } = {}) {
  const size = 512
  const mitte = size / 2

  // Hantel, Maße vor der Skalierung
  const griffLaenge = 232
  const griffDicke = 34
  const scheibeInnenBreite = 40
  const scheibeInnenHoehe = 152
  const scheibeAussenBreite = 30
  const scheibeAussenHoehe = 104

  const s = (wert) => wert * scale

  const griffX = mitte - s(griffLaenge / 2)
  const scheibeInnenX = griffX - s(scheibeInnenBreite) + s(6)
  const scheibeAussenX = scheibeInnenX - s(scheibeAussenBreite) - s(5)

  const spiegel = (x, breite) => size - x - breite

  const teile = [
    // Griff
    `<rect x="${griffX}" y="${mitte - s(griffDicke / 2)}" width="${s(griffLaenge)}" height="${s(griffDicke)}" rx="${s(griffDicke / 2)}" fill="${HELL}"/>`,
    // Innere Scheiben
    `<rect x="${scheibeInnenX}" y="${mitte - s(scheibeInnenHoehe / 2)}" width="${s(scheibeInnenBreite)}" height="${s(scheibeInnenHoehe)}" rx="${s(16)}" fill="${HELL}"/>`,
    `<rect x="${spiegel(scheibeInnenX, s(scheibeInnenBreite))}" y="${mitte - s(scheibeInnenHoehe / 2)}" width="${s(scheibeInnenBreite)}" height="${s(scheibeInnenHoehe)}" rx="${s(16)}" fill="${HELL}"/>`,
    // Äußere Scheiben
    `<rect x="${scheibeAussenX}" y="${mitte - s(scheibeAussenHoehe / 2)}" width="${s(scheibeAussenBreite)}" height="${s(scheibeAussenHoehe)}" rx="${s(12)}" fill="${HELL}"/>`,
    `<rect x="${spiegel(scheibeAussenX, s(scheibeAussenBreite))}" y="${mitte - s(scheibeAussenHoehe / 2)}" width="${s(scheibeAussenBreite)}" height="${s(scheibeAussenHoehe)}" rx="${s(12)}" fill="${HELL}"/>`,
  ]

  // Der Hintergrund ist immer deckend: Ein durchsichtiges Icon würde auf
  // hellen Hintergrundbildern unsichtbar.
  const hintergrund = rounded
    ? `<rect width="${size}" height="${size}" rx="112" fill="url(#g)"/>`
    : `<rect width="${size}" height="${size}" fill="url(#g)"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BLAU}"/>
      <stop offset="1" stop-color="${BLAU_DUNKEL}"/>
    </linearGradient>
  </defs>
  ${hintergrund}
  ${teile.join('\n  ')}
</svg>`
}

async function png(svg, groesse, datei) {
  await sharp(Buffer.from(svg))
    .resize(groesse, groesse)
    .png({ compressionLevel: 9 })
    .toFile(join(publicDir, datei))
  return datei
}

await mkdir(publicDir, { recursive: true })

// Favicon: als SVG, damit es in jeder Größe scharf bleibt. Abgerundet,
// weil es im Browser-Tab frei steht.
const faviconSvg = icon({ scale: 1, rounded: true })
await writeFile(join(publicDir, 'favicon.svg'), faviconSvg, 'utf-8')

// Normale Icons: enger Rand.
const normal = icon({ scale: 1.08 })
// Maskable: Symbol auf 72 % verkleinert, damit es auch im Kreis vollständig
// bleibt. Der Sicherheitsbereich ist ein Kreis mit 80 % Durchmesser.
const maskable = icon({ scale: 0.78 })

const erzeugt = [
  await png(normal, 192, 'icon-192.png'),
  await png(normal, 512, 'icon-512.png'),
  await png(maskable, 512, 'icon-512-maskable.png'),
  // iOS maskiert nicht, schneidet aber eigene Ecken. Deckender Hintergrund
  // ist dort Pflicht, sonst wird Transparenz schwarz gefüllt.
  await png(normal, 180, 'apple-touch-icon.png'),
  // Für Browser, die noch eine .ico-Vertretung erwarten.
  await png(normal, 32, 'favicon-32.png'),
]

console.log('Erzeugt:', ['favicon.svg', ...erzeugt].join(', '))
