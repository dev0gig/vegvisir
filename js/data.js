/* ============ DATEN (importiertes Toride-JSON, lokal gespeichert) ============ */
/* Quelle der Wahrheit ist der localStorage. Diese Funktionen bleiben bewusst
   "rein": sie lesen/schreiben nur Daten und kennen nichts von der Oberfläche. */

export const STORE_KEY = "vegvisir.data";

export function loadData() {
  try { const r = localStorage.getItem(STORE_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
export function saveData(d) { localStorage.setItem(STORE_KEY, JSON.stringify(d)); }

/* Alle Bookmarks (lose + aus allen Ordnern) flach einsammeln. */
export function allBookmarks(data) {
  const out = [];
  const roots = (data && data.bookmarks) || [];
  const folders = (data && data.folders) || [];
  roots.forEach((b) => out.push(b));
  folders.forEach((f) => (f.bookmarks || []).forEach((b) => out.push(b)));
  return out;
}

export function isEmptyData() {
  const d = loadData();
  const folders = (d && d.folders) || [];
  const roots = (d && d.bookmarks) || [];
  return folders.length === 0 && roots.length === 0;
}
