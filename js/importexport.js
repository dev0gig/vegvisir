/* ============ IMPORT / EXPORT ============ */
/* Import: eine JSON-Datei kann per Knopf gewählt, per /import geöffnet oder
   einfach auf die Seite gezogen werden. Sind schon Bookmarks da, FRAGT die App
   nach — ersetzen oder zusammenführen. Verstanden werden beide Formate: der
   Toride-Export ({folders, bookmarks}) und die eigene Sicherung (Version 2).

   Export: schreibt den kompletten Stand als JSON-Datei. Das ist die einzige
   Sicherung, die es gibt — die Daten liegen sonst nur in diesem Browser. */

import {
  getData, migrate, replaceAll, save, isEmpty, allBookmarks,
  pushUndo, markExported, ensureColors, normalizeItem,
} from "./store.js";
import { normUrl } from "./dom.js";
import { showDialog } from "./editor.js";
import { render } from "./render.js";
import { flash } from "./commands.js";

const importFile = document.getElementById("importFile");

export function pickFile() { importFile.click(); }

/* ---- Einlesen ---- */

/* Text prüfen und in Version-2-Form bringen. Gibt null zurück, wenn die Datei
   weder Ordner noch Bookmarks enthält. */
function parseJson(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== "object") return null;
  const hasV1 = Array.isArray(raw.folders) || Array.isArray(raw.bookmarks);
  const hasV2 = Array.isArray(raw.items);
  if (!hasV1 && !hasV2) return null;
  const data = migrate(raw);
  return data.items.length ? data : null;
}

function countOf(data) {
  let folders = 0, marks = 0;
  data.items.forEach((it) => {
    if (it.type === "folder") { folders++; marks += it.items.length; }
    else marks++;
  });
  return { folders, marks };
}

/* ---- Zusammenführen ---- */

/* Vorhandenes bleibt unangetastet (Reihenfolge, Größe, Farbe, eigene Icons).
   Ergänzt werden nur Bookmarks, deren Adresse noch nicht vorkommt. Ordner
   werden über den Namen erkannt und aufgefüllt statt doppelt angelegt. */
function mergeInto(incoming) {
  const data = getData();
  const known = new Set(allBookmarks().map((b) => normUrl(b.url)));
  const folderByName = new Map(
    data.items.filter((it) => it.type === "folder").map((f) => [f.name.trim().toLowerCase(), f])
  );

  let added = 0, skipped = 0;
  const createdFolders = new Set();

  const addBm = (bm, target) => {
    const key = normUrl(bm.url);
    if (!key || known.has(key)) { skipped++; return; }
    known.add(key);
    target.push(normalizeItem({ ...bm, id: undefined }));
    added++;
  };

  incoming.items.forEach((it) => {
    if (it.type === "folder") {
      const key = it.name.trim().toLowerCase();
      let folder = folderByName.get(key);
      if (!folder) {
        folder = normalizeItem({ type: "folder", name: it.name, items: [] });
        data.items.push(folder);
        folderByName.set(key, folder);
        createdFolders.add(folder.id);
      }
      it.items.forEach((b) => addBm(b, folder.items));
    } else {
      addBm(it, data.items);
    }
  });

  // Nur die HIER neu angelegten Ordner wieder entfernen, wenn sie durch lauter
  // Doppelte leer geblieben sind. Selbst angelegte leere Ordner bleiben.
  if (createdFolders.size) {
    data.items = data.items.filter((it) => !(createdFolders.has(it.id) && it.items.length === 0));
  }

  save(data);
  return { added, skipped };
}

/* ---- Ablauf ---- */

async function handleJson(file, text) {
  const incoming = parseJson(text);
  if (!incoming) {
    await showDialog({
      title: "Datei passt nicht",
      body: `<p class="dlg-text">Das ist kein gültiger Bookmark-Export. Erwartet wird eine
             JSON-Datei mit Ordnern (<code>folders</code>) oder Bookmarks
             (<code>bookmarks</code>) — oder eine Sicherung aus vegvisir selbst.
             Es wurde nichts geändert.</p>`,
      buttons: [{ label: "Verstanden", value: "ok", kind: "primary" }],
    });
    return;
  }

  const c = countOf(incoming);
  const summary = `${c.marks} ${c.marks === 1 ? "Bookmark" : "Bookmarks"}` +
    (c.folders ? ` in ${c.folders} ${c.folders === 1 ? "Ordner" : "Ordnern"}` : "");

  // Noch nichts da? Dann gibt es nichts zu entscheiden.
  if (isEmpty()) {
    replaceAll(incoming);
    await after(`${summary} importiert.`);
    return;
  }

  const choice = await showDialog({
    title: "Wie importieren?",
    body: `
      <p class="dlg-text"><strong>${escapeText(file.name)}</strong> enthält ${summary}.</p>
      <ul class="dlg-list">
        <li><strong>Zusammenführen</strong> — nur neue Adressen kommen dazu. Deine
            Reihenfolge, Kachelgrößen und selbst eingefügten Icons bleiben.</li>
        <li><strong>Ersetzen</strong> — alles Bestehende wird verworfen und durch die
            Datei ersetzt. Mit <code>/undo</code> lässt sich das zurücknehmen.</li>
      </ul>`,
    buttons: [
      { label: "Abbrechen", value: "cancel" },
      { label: "Ersetzen", value: "replace", kind: "danger" },
      { label: "Zusammenführen", value: "merge", kind: "primary" },
    ],
  });

  if (choice === "cancel") return;

  if (choice === "replace") {
    replaceAll(incoming);           // legt selbst eine Sicherung für /undo an
    await after(`Ersetzt: ${summary}.`);
    return;
  }

  pushUndo();
  const res = mergeInto(incoming);
  await after(res.added
    ? `${res.added} neu dazugekommen, ${res.skipped} waren schon da.`
    : `Nichts Neues dabei — alle ${res.skipped} Adressen waren schon vorhanden.`);
}

/* Nach jedem Import: Farben der neuen Kacheln berechnen und neu zeichnen. */
async function after(message) {
  render();
  flash(message, "ok");
  await ensureColors(render);
}

function escapeText(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

/* Endung einer Datei in Kleinbuchstaben ("json" | ""). */
function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ""));
  return m ? m[1].toLowerCase() : "";
}

export function importAnyFile(file) {
  if (!file) return;
  if (extOf(file.name) !== "json") {
    flash("Nur .json-Dateien (Bookmarks) werden unterstützt.", "warn");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => handleJson(file, String(reader.result));
  reader.readAsText(file);
}

/* ---- Export (die einzige Sicherung) ---- */

export function exportData() {
  const data = getData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vegvisir-bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  markExported();
  render();
  flash("Sicherung heruntergeladen.", "ok");
}

/* ---- Anhängen (einmalig beim Start) ---- */

export function initImport() {
  importFile.addEventListener("change", (e) => {
    importAnyFile(e.target.files && e.target.files[0]);
    e.target.value = "";
  });

  /* Eine Datei irgendwo auf die Seite ziehen. */
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => {
    if (e.dataTransfer && [...e.dataTransfer.items].some((i) => i.kind === "file")) {
      e.preventDefault(); dragDepth++; document.body.classList.add("dropping");
    }
  });
  window.addEventListener("dragover", (e) => {
    if (document.body.classList.contains("dropping")) e.preventDefault();
  });
  window.addEventListener("dragleave", () => {
    if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dropping"); }
  });
  window.addEventListener("drop", (e) => {
    dragDepth = 0;
    document.body.classList.remove("dropping");
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    e.preventDefault();
    importAnyFile(file);
  });
}
