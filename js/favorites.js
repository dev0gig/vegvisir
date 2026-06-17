/* ============ FAVORITEN & ZULETZT VERWENDET ============ */
/* Stellt ein Werkzeug (Stern-Knopf) bereit, das in einem Bottom-Sheet die als
   Favorit markierten Bookmarks (aus dem Toride-Import, Feld `isFavorite`) sowie
   die zuletzt geöffneten Bookmarks zeigt. Die "zuletzt verwendeten" werden hier
   selbst mitgeschrieben: jeder Klick auf eine Bookmark-Kachel wird gemerkt. */

import { loadData, allBookmarks } from "./data.js";
import { hrefOf } from "./dom.js";
import { tileHTML } from "./templates.js";

const RECENT_KEY = "vegvisir.recent";
const MAX_RECENT = 5;

function loadRecent() {
  try { const r = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(r) ? r : []; }
  catch { return []; }
}
function saveRecent(list) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch {} }

/* Merkt sich ein geöffnetes Bookmark als zuletzt verwendet (neueste zuerst,
   ohne Dubletten, höchstens MAX_RECENT Einträge). Schlüssel ist der fertige
   Link (hrefOf), damit er beim Anzeigen wieder zum Bookmark passt. */
export function recordRecent(href) {
  if (!href) return;
  const list = loadRecent().filter((u) => u !== href);
  list.unshift(href);
  saveRecent(list.slice(0, MAX_RECENT));
}

function sectionHTML(title, bookmarks, emptyText) {
  const body = bookmarks.length
    ? `<div class="grid">${bookmarks.map(tileHTML).join("")}</div>`
    : `<p class="fav-empty">${emptyText}</p>`;
  return `<div class="fav-section"><h3 class="sheet-sub fav-title">${title}</h3>${body}</div>`;
}

function buildBody(container) {
  const data = loadData();
  const all = allBookmarks(data);
  const favorites = all.filter((bm) => bm.isFavorite);
  // Zuletzt-verwendet-Links auf aktuelle Bookmarks abbilden, gelöschte überspringen.
  const byHref = new Map(all.map((bm) => [hrefOf(bm.url), bm]));
  const recents = loadRecent().map((u) => byHref.get(u)).filter(Boolean).slice(0, MAX_RECENT);

  container.innerHTML =
    sectionHTML("Favoriten", favorites, "Noch keine Favoriten. Markiere Bookmarks in Toride mit dem Stern.") +
    sectionHTML("Zuletzt verwendet", recents, "Noch nichts geöffnet.");
  if (window.lucide) lucide.createIcons();
}

/* Einmalig beim Start: Werkzeug registrieren (vor buildDock) und Klicks auf
   Bookmark-Kacheln als "zuletzt verwendet" mitschreiben. */
export function initFavorites() {
  if (Array.isArray(window.VEG_TOOLS)) {
    window.VEG_TOOLS.push({
      id: "favoriten",
      name: "Favoriten",
      icon: "star",
      display: "sheet",
      render(container) { buildBody(container); },
    });
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a.tile[href]");
    if (a) recordRecent(a.getAttribute("href"));
  }, true);
}
