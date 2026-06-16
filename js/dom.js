/* ============ DOM-HELFER ============ */
/* Kleine, reine Hilfsfunktionen ohne Seiteneffekte: HTML/Attribute escapen,
   Hostnamen/Links normalisieren, Anfangsbuchstaben bestimmen. */

export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
export function escAttr(s) { return esc(s).replace(/'/g, "&#39;"); }

export function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return String(u || ""); }
}
export function hrefOf(u) { return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : "https://" + u; }

export function initial(s) {
  s = String(s || "").trim();
  const m = s.match(/[\p{L}\p{N}]/u);
  return (m ? m[0] : (s[0] || "?")).toUpperCase();
}

export function isImg(u) { return typeof u === "string" && u.trim() !== ""; }
