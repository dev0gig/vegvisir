/* ============ SUCHE ============ */
/* Das Suchfeld filtert live die Bookmarks. Drückt man Enter ohne Treffer
   anzuklicken, startet stattdessen eine Web-Suche bei DuckDuckGo. */

import { render } from "./render.js";

const searchbar = document.getElementById("searchbar");
const searchInput = document.getElementById("searchInput");

let query = "";

export function getQuery() { return query; }

/* Suche zuruecksetzen (z.B. nach Klick auf ein Icon). */
export function resetSearch() {
  if (!query) return;
  query = "";
  searchInput.value = "";
  searchbar.classList.remove("has-query");
  render();
}

/* Hängt die Such-Ereignisse an (einmalig beim Start aufgerufen). */
export function initSearch() {
  searchInput.addEventListener("input", () => {
    query = searchInput.value;
    searchbar.classList.toggle("has-query", query.trim() !== "");
    render();
  });
  // Enter im Suchfeld: DuckDuckGo-Suche mit dem getippten Text in neuem Tab.
  // (DuckDuckGo wegen Privatsphaere.)
  searchInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = searchInput.value.trim();
    if (!q) return;
    e.preventDefault();
    window.open("https://duckduckgo.com/?q=" + encodeURIComponent(q),
                "_blank", "noopener,noreferrer");
  });
  document.getElementById("searchClear").addEventListener("click", () => {
    resetSearch();
    searchInput.focus();
  });
  // Nach Klick auf ein Icon (Link oeffnet sich in neuem Tab) die Suche zuruecksetzen.
  document.getElementById("homeGrid").addEventListener("click", (e) => {
    if (e.target.closest(".tile")) setTimeout(resetSearch, 0);
  });
}
