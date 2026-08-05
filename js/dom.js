/* ============ DOM-HELFER ============ */
/* Kleine, reine Hilfsfunktionen ohne Seiteneffekte: HTML/Attribute escapen,
   Hostnamen/Links normalisieren, Anfangsbuchstaben bestimmen, IDs erzeugen. */

export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
export function escAttr(s) { return esc(s).replace(/'/g, "&#39;"); }

export function hostOf(u) {
  try { return new URL(hrefOf(u)).hostname.replace(/^www\./, ""); } catch { return String(u || ""); }
}
export function hrefOf(u) { return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : "https://" + u; }

/* Vergleichsform einer URL: ohne Protokoll, ohne "www.", ohne Schrägstrich am
   Ende und klein geschrieben. Damit erkennt das Zusammenführen beim Import,
   dass "https://www.orf.at/" und "orf.at" dasselbe Bookmark sind. */
export function normUrl(u) {
  return String(u || "")
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function initial(s) {
  s = String(s || "").trim();
  const m = s.match(/[\p{L}\p{N}]/u);
  return (m ? m[0] : (s[0] || "?")).toUpperCase();
}

export function isImg(u) { return typeof u === "string" && u.trim() !== ""; }

/* Ist das Bild direkt in den Daten eingebettet (data:-Adresse)? Nur dann darf
   der Browser die Bildpunkte auslesen — bei fremden Adressen (z.B. Googles
   Favicon-Dienst) verbietet er es, siehe js/color.js. */
export function isEmbeddedImg(u) { return typeof u === "string" && u.startsWith("data:"); }

/* Kurze, eindeutige ID für Bookmarks und Ordner. */
export function uid() {
  return "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
