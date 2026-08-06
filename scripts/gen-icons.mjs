// Erzeugt die Icons von Vegvisir im einheitlichen Icon-Stil:
// flaeche #D4A373, Lucide-Symbol "compass" in dunkler Ink mit weichem
// Schlagschatten in einer dunklen Toenung der Hintergrundfarbe.
//
// Ergebnis: assets/icon-192.png, assets/icon-512.png (normale Icons, mit
// runden Ecken, Symbol 41,7 %), assets/icon-maskable-512.png (randlos fuer
// Android, Symbol 55 % — Chrome polstert Maskable-Icons um Faktor 1,31 auf)
// und assets/apple-touch-icon.png (randlos, iOS maskiert selbst).
//
// Braucht sharp – absichtlich KEINE Abhaengigkeit des Projekts. Zum
// Neuerzeugen einmalig:
//   npm i --no-save sharp && node scripts/gen-icons.mjs
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = process.argv[2] || resolve(here, '../assets')

const S = 1024                        // Arbeitsgroesse
const RAD = Math.round(S * 120 / 512) // Eckenradius wie im bestehenden Favicon

const BG = '#D4A373'                          // Flaeche (Icon-Farbe der App)
const INK = '#1A1A1A'                         // Symbolfarbe
const SHADOW = { r: 0x7a, g: 0x5c, b: 0x3e }  // dunkle Toenung von #D4A373

// Symbolgroesse = Anteil der bemalten Flaeche am Canvas (siehe Icon-Standard)
const COVERAGE_ANY = 0.417
const COVERAGE_MASKABLE = 0.55

// Lucide "compass" (v1.28.0), unveraendert uebernommen
const ICON_NODES = [
  ['circle', { cx: '12', cy: '12', r: '10' }],
  ['path', { d: 'm16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z' }],
]

const iconBody = () => ICON_NODES
  .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')} />`)
  .join('')

const symbolSvg = (scale, tx, ty) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">` +
  `<g transform="translate(${tx},${ty}) scale(${scale})" fill="none" stroke="${INK}" ` +
  `stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${iconBody()}</g></svg>`)

async function alphaOf(buffer) {
  const { data } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const a = new Uint8Array(S * S)
  for (let p = 0; p < S * S; p++) a[p] = data[p * 4 + 3]
  return a
}

// Bounding-Box der soliden Symbolpixel – nachmessen statt schaetzen
function boundsOf(alpha) {
  let x0 = S, y0 = S, x1 = -1, y1 = -1
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (alpha[y * S + x] > 200) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

// Symbol so skalieren und schieben, dass die bemalte Flaeche exakt der
// Zielgroesse entspricht und mittig sitzt
async function fitSymbol(coverage) {
  const target = coverage * S
  let scale = target / 24
  let tx = 0, ty = 0, box
  for (let i = 0; i < 3; i++) {
    box = boundsOf(await alphaOf(symbolSvg(scale, tx, ty)))
    scale *= target / Math.max(box.w, box.h)
    box = boundsOf(await alphaOf(symbolSvg(scale, tx, ty)))
    tx += (S - box.w) / 2 - box.x0
    ty += (S - box.h) / 2 - box.y0
  }
  return { scale, tx, ty, box: boundsOf(await alphaOf(symbolSvg(scale, tx, ty))) }
}

const bgSvg = (rounded) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">` +
  `<rect width="${S}" height="${S}" rx="${rounded ? RAD : 0}" ry="${rounded ? RAD : 0}" fill="${BG}"/></svg>`)

async function tinted(alpha, opacity) {
  const raw = Buffer.alloc(S * S * 4, 0)
  for (let p = 0; p < S * S; p++) {
    const a = Math.round(alpha[p] * opacity)
    if (a > 0) {
      raw[p * 4] = SHADOW.r; raw[p * 4 + 1] = SHADOW.g; raw[p * 4 + 2] = SHADOW.b; raw[p * 4 + 3] = a
    }
  }
  return sharp(raw, { raw: { width: S, height: S, channels: 4 } }).png().toBuffer()
}

// Weicher Schlagschatten wie im bestehenden Favicon (dy 6 / Blur 8 bei 512 px)
async function shadowLayer(alpha) {
  const blurred = await sharp(await tinted(alpha, 0.45)).blur(16).png().toBuffer()
  return sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: blurred, left: 0, top: 12 }])
    .png().toBuffer()
}

async function render(coverage, rounded) {
  const fit = await fitSymbol(coverage)
  const svg = symbolSvg(fit.scale, fit.tx, fit.ty)
  const alpha = await alphaOf(svg)

  const png = await sharp(await sharp(bgSvg(rounded)).png().toBuffer())
    .composite([{ input: await shadowLayer(alpha) }, { input: await sharp(svg).png().toBuffer() }])
    .png().toBuffer()

  return { png, fit }
}

const normal = await render(COVERAGE_ANY, true)
const maskable = await render(COVERAGE_MASKABLE, false)
const apple = await render(COVERAGE_ANY, false)

const save = async (name, png, size) => writeFile(resolve(outDir, name),
  await sharp(png).resize(size, size).png({ compressionLevel: 9 }).toBuffer())

await save('icon-192.png', normal.png, 192)
await save('icon-512.png', normal.png, 512)
await save('icon-maskable-512.png', maskable.png, 512)
await save('apple-touch-icon.png', apple.png, 180)

const pct = (b) => (Math.max(b.w, b.h) / S * 100).toFixed(1) + ' %'
console.log(`icon-192.png / icon-512.png   Symbol ${pct(normal.fit.box)} der Flaeche (Soll 41,7 %)`)
console.log(`icon-maskable-512.png         Symbol ${pct(maskable.fit.box)} der Flaeche (Soll ~55 %)`)
console.log(`apple-touch-icon.png  180 px, Symbol ${pct(apple.fit.box)} der Flaeche (Soll 41,7 %)`)
