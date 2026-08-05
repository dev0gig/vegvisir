/* ============ DATEN (nur im Browser, ohne Cloud) ============ */
/* Der localStorage ist die einzige Quelle der Wahrheit. Kein Server, kein
   Login, keine Synchronisierung — was hier steht, steht nur in diesem Browser.
   Deshalb gibt es den /export-Befehl und die Sicherungs-Erinnerung.
 *
 * Datenformat (Version 2):
 *   {
 *     version: 2,
 *     updatedAt: "…",          Zeitpunkt der letzten Änderung
 *     exportedAt: "…"|null,    Zeitpunkt der letzten Sicherung (fuer den Hinweis)
 *     items: [                 EINE geordnete Liste — die Reihenfolge ist die Anzeige
 *       { id, type:"bookmark", name, url, imageUrl, color, size, isFavorite },
 *       { id, type:"folder",   name, color, size, items:[ …bookmarks… ] }
 *     ]
 *   }
 *
 * Kachelgrößen: "s" = 1x1, "w" = 2x1 (breit), "l" = 2x2 (groß).
 * Ordner haben genau EINE Ebene — Ordner im Ordner gibt es bewusst nicht. */

import { uid, normUrl, hostOf } from "./dom.js";
import { colorFromImage, DEFAULT_TILE_COLOR } from "./color.js";

export const STORE_KEY = "vegvisir.data";
const UNDO_KEY = "vegvisir.undo";

/* Nur zwei Sicherungen aufheben. Grund: Der Browser-Speicher fasst rund 5 MB,
   ein voller Datensatz mit eingebetteten Icons wiegt schon ~0,7 MB. Mehr
   Sicherungen würden den Speicher sprengen. */
const UNDO_MAX = 2;

export const SIZES = ["s", "w", "l"];
export const SIZE_LABELS = { s: "Klein", w: "Breit", l: "Groß" };

function emptyData() {
  return { version: 2, updatedAt: new Date().toISOString(), exportedAt: null, items: [] };
}

/* ---- Lesen / Schreiben ---- */

let cache = null;

export function getData() {
  if (cache) return cache;
  let raw = null;
  try { raw = localStorage.getItem(STORE_KEY); } catch { raw = null; }
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
  cache = parsed ? migrate(parsed) : emptyData();
  return cache;
}

/* Schreibt den Stand weg. Läuft der Browser-Speicher über, werden zuerst die
   Sicherungen für „Rückgängig" geopfert — die eigentlichen Bookmarks sind
   wichtiger als die Möglichkeit, einen Schritt zurückzugehen. */
export function save(data) {
  const d = data || cache;
  if (!d) return false;
  d.updatedAt = new Date().toISOString();
  cache = d;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
    return true;
  } catch {
    try {
      localStorage.removeItem(UNDO_KEY);
      localStorage.setItem(STORE_KEY, JSON.stringify(d));
      return true;
    } catch {
      alert("Der Browser-Speicher ist voll. Die letzte Änderung konnte nicht gesichert werden.\n\nTipp: Exportiere deine Bookmarks (/export) und entferne sehr große Icons.");
      return false;
    }
  }
}

export function isEmpty() { return getData().items.length === 0; }

/* ---- Migration: altes Toride-Format (Version 1) → Version 2 ---- */

/* Nimmt ein beliebiges eingelesenes Objekt und macht daraus gültige Version-2-
   Daten. Versteht sowohl das alte Format ({folders, bookmarks}) als auch das
   neue ({items}). Wird vom Speicher UND vom Import benutzt. */
export function migrate(raw) {
  if (raw && raw.version === 2 && Array.isArray(raw.items)) {
    return {
      version: 2,
      updatedAt: raw.updatedAt || new Date().toISOString(),
      exportedAt: raw.exportedAt || null,
      items: raw.items.map(normalizeItem).filter(Boolean),
    };
  }

  const folders = Array.isArray(raw && raw.folders) ? raw.folders : [];
  const roots = Array.isArray(raw && raw.bookmarks) ? raw.bookmarks : [];
  const items = [];

  // Ordner zuerst, dann die losen Bookmarks — beide alphabetisch, wie es die
  // alte Ansicht auch gezeigt hat. Ab jetzt ist die Reihenfolge frei
  // verschiebbar, dies ist also nur der Startzustand.
  const byName = (a, b) =>
    String(a.name || a.url || "").localeCompare(String(b.name || b.url || ""), "de", { sensitivity: "base" });

  [...folders].sort(byName).forEach((f) => {
    items.push(normalizeItem({
      type: "folder",
      name: f.name || "Ordner",
      items: [...(f.bookmarks || [])].sort(byName).map((b) => normalizeItem({ type: "bookmark", ...b })),
    }));
  });
  [...roots].sort(byName).forEach((b) => items.push(normalizeItem({ type: "bookmark", ...b })));

  // Favoriten nach vorne holen und als breite Kachel zeigen — das gibt der
  // Kachelwand Struktur statt 90 gleich großer Quadrate. Größe ist pro Kachel
  // jederzeit über das Menü änderbar.
  items.forEach((it) => { if (it.type === "bookmark" && it.isFavorite) it.size = "w"; });
  items.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));

  return { version: 2, updatedAt: new Date().toISOString(), exportedAt: null, items };
}

/* Ein einzelnes Element auf saubere Form bringen (fehlende Felder ergänzen). */
function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;

  if (raw.type === "folder" || Array.isArray(raw.bookmarks)) {
    const inner = Array.isArray(raw.items) ? raw.items : (raw.bookmarks || []);
    return {
      id: raw.id || uid(),
      type: "folder",
      name: String(raw.name || "Ordner"),
      color: raw.color || null,
      size: SIZES.includes(raw.size) ? raw.size : "s",
      // Ordner im Ordner gibt es nicht: alles darin wird zum Bookmark.
      items: inner.map((b) => normalizeBookmark(b)).filter(Boolean),
    };
  }
  return normalizeBookmark(raw);
}

function normalizeBookmark(raw) {
  if (!raw || typeof raw !== "object") return null;
  const url = String(raw.url || "").trim();
  if (!url) return null;
  return {
    id: raw.id || uid(),
    type: "bookmark",
    name: String(raw.name || hostOf(url)),
    url,
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : "",
    color: raw.color || null,
    size: SIZES.includes(raw.size) ? raw.size : "s",
    isFavorite: !!raw.isFavorite,
  };
}

export { normalizeItem, normalizeBookmark };

/* ---- Suchen / Auslesen ---- */

/* Findet ein Element anhand seiner ID — auch in Ordnern.
   Gibt { item, list, index, folder } zurück (folder = null auf oberster Ebene). */
export function findItem(id) {
  const data = getData();
  const i = data.items.findIndex((it) => it.id === id);
  if (i >= 0) return { item: data.items[i], list: data.items, index: i, folder: null };
  for (const f of data.items) {
    if (f.type !== "folder") continue;
    const j = f.items.findIndex((b) => b.id === id);
    if (j >= 0) return { item: f.items[j], list: f.items, index: j, folder: f };
  }
  return null;
}

/* Alle Bookmarks flach (oberste Ebene + alle Ordnerinhalte) — für die Suche. */
export function allBookmarks() {
  const out = [];
  getData().items.forEach((it) => {
    if (it.type === "folder") it.items.forEach((b) => out.push(b));
    else out.push(it);
  });
  return out;
}

/* ---- Rückgängig (lokale Sicherungen) ---- */

/* Vor jeder Änderung, die Daten verlieren kann, den aktuellen Stand sichern. */
export function pushUndo() {
  try {
    const list = JSON.parse(localStorage.getItem(UNDO_KEY) || "[]");
    list.unshift({ at: new Date().toISOString(), data: getData() });
    localStorage.setItem(UNDO_KEY, JSON.stringify(list.slice(0, UNDO_MAX)));
  } catch {
    // Speicher voll oder kaputt: Sicherung ist Kür, die Änderung geht trotzdem.
    try { localStorage.removeItem(UNDO_KEY); } catch {}
  }
}

export function canUndo() {
  try { return JSON.parse(localStorage.getItem(UNDO_KEY) || "[]").length > 0; }
  catch { return false; }
}

/* Letzten gesicherten Stand zurückholen. Gibt true zurück, wenn es geklappt hat. */
export function undo() {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(UNDO_KEY) || "[]"); } catch { return false; }
  if (!list.length) return false;
  const snap = list.shift();
  try { localStorage.setItem(UNDO_KEY, JSON.stringify(list)); } catch {}
  cache = migrate(snap.data);
  save(cache);
  return true;
}

/* ---- Ändern ---- */

export function addBookmark({ name, url, imageUrl, size }, folderId) {
  const bm = normalizeBookmark({ name, url, imageUrl, size });
  if (!bm) return null;
  const data = getData();
  if (folderId) {
    const f = data.items.find((it) => it.id === folderId && it.type === "folder");
    if (f) f.items.push(bm); else data.items.push(bm);
  } else {
    data.items.push(bm);
  }
  save(data);
  return bm;
}

export function addFolder(name) {
  const data = getData();
  const f = normalizeItem({ type: "folder", name: name || "Neuer Ordner", items: [] });
  data.items.push(f);
  save(data);
  return f;
}

/* Felder eines Elements überschreiben (nur die übergebenen). */
export function updateItem(id, patch) {
  const found = findItem(id);
  if (!found) return null;
  Object.assign(found.item, patch);
  if (found.item.type === "bookmark") {
    const clean = normalizeBookmark(found.item);
    if (clean) { clean.id = found.item.id; found.list[found.index] = clean; }
  }
  save();
  return found.list[found.index];
}

/* Löschen. Bei einem Ordner wandern seine Bookmarks NICHT mit ins Nichts —
   sie werden an die Stelle des Ordners auf die oberste Ebene gesetzt, damit
   nichts unbemerkt verschwindet. */
export function removeItem(id, { keepFolderContents = true } = {}) {
  const found = findItem(id);
  if (!found) return false;
  pushUndo();
  if (found.item.type === "folder" && keepFolderContents && found.item.items.length) {
    found.list.splice(found.index, 1, ...found.item.items);
  } else {
    found.list.splice(found.index, 1);
  }
  save();
  return true;
}

/* Ordner auflösen: Inhalt an die Stelle des Ordners nach oben holen. */
export function dissolveFolder(id) {
  const found = findItem(id);
  if (!found || found.item.type !== "folder") return false;
  pushUndo();
  found.list.splice(found.index, 1, ...found.item.items);
  save();
  return true;
}

/* Element an eine neue Stelle setzen.
   `targetId` = null bedeutet ans Ende der obersten Ebene.
   `into` = ID eines Ordners bedeutet: in diesen Ordner hinein. */
export function moveItem(id, { beforeId = null, into = null, toEnd = false } = {}) {
  const found = findItem(id);
  if (!found) return false;
  const data = getData();

  // Herausnehmen (Kopie behalten).
  const [moved] = found.list.splice(found.index, 1);

  if (into) {
    const f = data.items.find((it) => it.id === into && it.type === "folder");
    if (f && moved.type === "bookmark") {
      f.items.push(moved);
      save();
      return true;
    }
    // Ordner lassen sich nicht in Ordner legen → zurück auf oberste Ebene.
    data.items.push(moved);
    save();
    return true;
  }

  const list = data.items;
  if (toEnd || !beforeId) {
    list.push(moved);
  } else {
    const at = list.findIndex((it) => it.id === beforeId);
    if (at < 0) list.push(moved); else list.splice(at, 0, moved);
  }
  save();
  return true;
}

/* Nach dem Ziehen: die im Raster sichtbare Reihenfolge in die Daten übernehmen.
 *
 * `topIds`     IDs der obersten Ebene in Anzeige-Reihenfolge.
 * `folderId`   ID des gerade aufgeklappten Ordners (oder null).
 * `folderIds`  IDs in diesem Ordner in Anzeige-Reihenfolge.
 *
 * Berührt werden bewusst NUR die oberste Ebene und der offene Ordner —
 * geschlossene Ordner behalten ihren Inhalt unangetastet. Alles, was im Raster
 * nicht auftaucht (dürfte nie vorkommen), wird hinten angehängt statt
 * verworfen: lieber eine Kachel an falscher Stelle als eine verlorene. */
export function applyOrder(topIds, folderId, folderIds) {
  const data = getData();

  const pool = new Map();
  data.items.forEach((it) => pool.set(it.id, it));
  const folder = folderId ? data.items.find((it) => it.id === folderId && it.type === "folder") : null;
  if (folder) folder.items.forEach((b) => pool.set(b.id, b));

  const placed = new Set();
  const take = (id) => {
    if (placed.has(id)) return null;
    const it = pool.get(id);
    if (!it) return null;
    placed.add(id);
    return it;
  };

  // Den Ordnerinhalt zuerst festlegen: so ist klar, welche Bookmarks drinnen
  // bleiben und welche für die oberste Ebene noch frei sind.
  if (folder && Array.isArray(folderIds)) {
    folder.items = folderIds.map(take).filter((b) => b && b.type === "bookmark");
  }

  const top = (topIds || []).map(take).filter(Boolean);
  pool.forEach((it, id) => { if (!placed.has(id)) top.push(it); });

  data.items = top;
  save(data);
}

/* Zwei Kacheln zu einem Ordner zusammenlegen (die Ordner-Geste).
   - Ziel ist ein Ordner  → das gezogene Bookmark wandert hinein.
   - Beides Bookmarks     → neuer Ordner an der Stelle des Ziels.
   Gibt die ID des Ordners zurück oder null. */
export function mergeItems(dragId, targetId) {
  if (dragId === targetId) return null;
  const data = getData();
  const drag = findItem(dragId);
  const target = findItem(targetId);
  if (!drag || !target) return null;
  if (drag.item.type === "folder") return null; // Ordner in Ordner gibt es nicht

  pushUndo();

  if (target.item.type === "folder") {
    drag.list.splice(drag.index, 1);
    target.item.items.push(drag.item);
    save();
    return target.item.id;
  }

  // Zwei Bookmarks → neuer Ordner. Erst das gezogene entfernen, dann die
  // Stelle des Ziels NEU suchen (der Index kann sich verschoben haben).
  drag.list.splice(drag.index, 1);
  const at = data.items.findIndex((it) => it.id === targetId);
  if (at < 0) { data.items.push(drag.item); save(); return null; }

  const folder = normalizeItem({
    type: "folder",
    name: "Neuer Ordner",
    items: [data.items[at], drag.item],
  });
  data.items.splice(at, 1, folder);
  save();
  return folder.id;
}

/* ---- Farben nachrechnen ---- */

/* Geht alle Kacheln durch, denen noch eine Farbe fehlt, berechnet sie aus dem
   eingebetteten Favicon und speichert sie mit. Das passiert genau EINMAL je
   Kachel — danach steht die Farbe in den Daten und muss nie neu gerechnet
   werden. `onProgress` wird nach jedem Schwung aufgerufen (zum Neuzeichnen). */
export async function ensureColors(onProgress) {
  const data = getData();
  const todo = [];
  data.items.forEach((it) => {
    if (!it.color) todo.push(it);
    if (it.type === "folder") it.items.forEach((b) => { if (!b.color) todo.push(b); });
  });
  if (!todo.length) return false;

  let changed = 0;
  for (const it of todo) {
    if (it.type === "folder") {
      // Ordnerfarbe = Farbe des ersten Bookmarks darin, sonst Standard.
      const first = it.items.find((b) => b.color) || it.items[0];
      it.color = first ? (first.color || await colorFromImage(first.imageUrl)) : DEFAULT_TILE_COLOR;
    } else {
      it.color = await colorFromImage(it.imageUrl);
    }
    changed++;
    // Alle 12 Kacheln zwischendurch neu zeichnen, damit man beim ersten Start
    // die Farben nach und nach auftauchen sieht statt einer langen Pause.
    if (changed % 12 === 0 && typeof onProgress === "function") onProgress();
  }
  save(data);
  if (typeof onProgress === "function") onProgress();
  return true;
}

/* Farbe einer einzelnen Kachel neu berechnen (nach dem Ändern des Icons). */
export async function refreshColor(id) {
  const found = findItem(id);
  if (!found) return;
  found.item.color = await colorFromImage(found.item.imageUrl);
  save();
}

/* ---- Sicherungs-Erinnerung ---- */

export function markExported() {
  const data = getData();
  data.exportedAt = new Date().toISOString();
  save(data);
}

/* Tage seit der letzten Sicherung — oder null, wenn noch nie exportiert wurde. */
export function daysSinceExport() {
  const at = getData().exportedAt;
  if (!at) return null;
  const ms = Date.now() - Date.parse(at);
  return Math.floor(ms / 86400000);
}

/* Alles ersetzen (Import „ersetzen" und Rückgängig benutzen das). */
export function replaceAll(newData) {
  pushUndo();
  cache = migrate(newData);
  save(cache);
  return cache;
}
