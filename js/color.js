/* ============ KACHELFARBE AUS DEM FAVICON ============ */
/* Jede Metro-Kachel bekommt eine Farbe, die zum Favicon passt.
 *
 * WICHTIG — was geht und was nicht:
 * Der Browser darf die Bildpunkte NUR dann auslesen, wenn das Bild direkt in
 * den Daten steckt (eine `data:`-Adresse). Liegt das Favicon als fremde
 * Internet-Adresse vor (z.B. Googles Favicon-Dienst t2.gstatic.com), verbietet
 * der Browser das Auslesen — dieser Dienst schickt die dafür nötige Freigabe
 * (den CORS-Header) nicht mit. Solche Kacheln bekommen deshalb die
 * Standardfarbe. Fügt man das Icon später in vegvisir selbst per Zwischen-
 * ablage ein, ist es eingebettet und die Farbe wird berechnet.
 *
 * Vorgehen (bewusst NICHT der Durchschnitt aller Punkte — der ergibt bei fast
 * jedem Favicon ein schmutziges Grau):
 *   1. Bild klein zeichnen (32x32) und alle Punkte durchgehen.
 *   2. Durchsichtige, fast weiße, fast schwarze und blasse Punkte überspringen.
 *   3. Die restlichen Farbtöne in 24 Fächer sortieren und das schwerste Fach
 *      nehmen — das ist die häufigste kräftige Farbe.
 *   4. Sättigung und Helligkeit auf einen festen Bereich zwingen, damit alle
 *      Kacheln nach EINEM System aussehen; die Helligkeit wird so weit
 *      abgedunkelt, bis die weiße Schrift sicher lesbar ist (Kontrast 4.5:1).
 */

import { isEmbeddedImg } from "./dom.js";

/* Standardfarbe für alles ohne auslesbares Bild — ein ruhiges Anthrazit aus
   der Design-Palette (--color-ink-soft), passt zum Creme-Hintergrund. */
export const DEFAULT_TILE_COLOR = "#4B4A44";

/* ---- Farbraum-Umrechnungen ---- */

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(hue(h + 1 / 3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1 / 3) * 255)];
}

function toHex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/* ---- Lesbarkeit: Kontrast nach WCAG gegen Weiß ---- */

function luminance(r, g, b) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/* Kontrastverhältnis zwischen Weiß und der gegebenen Farbe (1 = gleich, 21 = max). */
export function contrastToWhite(r, g, b) {
  return 1.05 / (luminance(r, g, b) + 0.05);
}

/* Farbton + Sättigung auf eine Kachelfarbe bringen: feste Sättigung, und die
   Helligkeit so weit herunter, bis weiße Schrift sicher lesbar ist.
   Gelb muss dafür deutlich dunkler werden als Blau — deshalb wird gemessen
   statt geraten. */
export function toTileColor(hue, sat) {
  const s = Math.min(0.68, Math.max(0.42, sat));
  for (let l = 0.46; l >= 0.2; l -= 0.02) {
    const [r, g, b] = hslToRgb(hue, s, l);
    if (contrastToWhite(r, g, b) >= 4.5) return toHex(r, g, b);
  }
  const [r, g, b] = hslToRgb(hue, s, 0.2);
  return toHex(r, g, b);
}

/* ---- Hauptfarbe eines Bildes bestimmen ---- */

const SIZE = 32;
let canvas = null, ctx = null;
function getCtx() {
  if (!ctx) {
    canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    // willReadFrequently: wir lesen die Bildpunkte, das ist der schnelle Modus.
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  return ctx;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const BUCKETS = 24; // 15 Grad je Fach

/* Berechnet die Kachelfarbe zu einer Bild-Adresse.
   Gibt die Standardfarbe zurück, wenn das Bild fehlt, nicht auslesbar ist
   (fremde Adresse) oder gar keine kräftige Farbe enthält (z.B. reines
   Schwarz-Weiß-Logo). Wirft nie. */
export async function colorFromImage(src) {
  if (!isEmbeddedImg(src)) return DEFAULT_TILE_COLOR;
  try {
    const img = await loadImage(src);
    if (!img || !img.width || !img.height) return DEFAULT_TILE_COLOR;

    const c = getCtx();
    c.clearRect(0, 0, SIZE, SIZE);
    c.drawImage(img, 0, 0, SIZE, SIZE);
    const px = c.getImageData(0, 0, SIZE, SIZE).data;

    // Gewicht je Farbton-Fach, dazu Summen für den Mittelwert im Gewinner-Fach.
    const weight = new Array(BUCKETS).fill(0);
    const sumSin = new Array(BUCKETS).fill(0);
    const sumCos = new Array(BUCKETS).fill(0);
    const sumSat = new Array(BUCKETS).fill(0);

    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3];
      if (a < 128) continue;                                  // durchsichtig
      const r = px[i], g = px[i + 1], b = px[i + 2];
      if (r > 232 && g > 232 && b > 232) continue;            // fast weiß
      if (r < 24 && g < 24 && b < 24) continue;               // fast schwarz
      const [h, s, l] = rgbToHsl(r, g, b);
      if (s < 0.12) continue;                                 // blass/grau
      if (l < 0.08 || l > 0.95) continue;                     // zu dunkel/hell

      const idx = Math.min(BUCKETS - 1, Math.floor((h / 360) * BUCKETS));
      // Kräftige Farben zählen stärker als blasse.
      const w = s * s;
      weight[idx] += w;
      const rad = (h * Math.PI) / 180;
      sumSin[idx] += Math.sin(rad) * w;
      sumCos[idx] += Math.cos(rad) * w;
      sumSat[idx] += s * w;
    }

    let best = -1, bestW = 0;
    for (let i = 0; i < BUCKETS; i++) if (weight[i] > bestW) { bestW = weight[i]; best = i; }
    if (best < 0 || bestW <= 0) return DEFAULT_TILE_COLOR;

    // Mittlerer Farbton im Gewinner-Fach (über Sinus/Kosinus, damit der
    // Übergang von 350 Grad zu 10 Grad nicht in der Mitte bei 180 landet).
    let hue = (Math.atan2(sumSin[best], sumCos[best]) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    const sat = sumSat[best] / bestW;
    return toTileColor(hue, sat);
  } catch {
    // Fremde Adresse ohne Freigabe: der Browser wirft hier einen
    // Sicherheitsfehler. Kein Grund zur Aufregung — Standardfarbe nehmen.
    return DEFAULT_TILE_COLOR;
  }
}
