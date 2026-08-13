/* ============ BEARBEITEN (Dialoge + Kachelmenü) ============ */
/* Alles, womit Patrick seine Bookmarks selbst pflegt: anlegen, ändern,
   löschen, Größe wählen, Icon per Zwischenablage einfügen.
   Benutzt das eingebaute <dialog>-Element — das bringt Escape-Taste,
   Hintergrund-Abdunklung und Fokus-Fang von Haus aus mit. */

import { esc, escAttr, hostOf, hrefOf, initial, isImg } from "./dom.js";
import {
  findItem, addBookmark, addFolder, updateItem, removeItem,
  dissolveFolder, moveItem, refreshColor, SIZE_LABELS,
} from "./store.js";
import { render, closeFolder } from "./render.js";

/* ---- Kleiner Dialog-Baukasten ---- */

/* Zeigt einen Dialog und gibt zurück, welcher Knopf gedrückt wurde.
   `buttons`: [{ label, value, kind }] — kind: "primary" | "danger" | undefined.
   `body`: fertiges HTML für den Inhalt. `onOpen(dialogEl)` läuft nach dem
   Öffnen (zum Anhängen eigener Ereignisse). */
export function showDialog({ title, body = "", buttons, onOpen }) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "dlg";
    dlg.innerHTML = `
      <form method="dialog" class="dlg-form">
        <h2 class="dlg-title">${esc(title)}</h2>
        <div class="dlg-body">${body}</div>
        <div class="dlg-foot">
          ${buttons.map((b, i) => `
            <button class="dlg-btn ${b.kind || ""}" value="${escAttr(b.value)}"
                    data-i="${i}"${b.kind === "primary" ? " autofocus" : ""}>${esc(b.label)}</button>`).join("")}
        </div>
      </form>`;
    document.body.appendChild(dlg);
    if (window.lucide) lucide.createIcons();

    let result = null;
    // Der Formular-Knopf schreibt seinen Wert automatisch in returnValue;
    // ein Abbrechen per Escape liefert dagegen "" — das wird zu "cancel".
    dlg.addEventListener("close", () => {
      resolve(result !== null ? result : (dlg.returnValue || "cancel"));
      dlg.remove();
    });

    if (typeof onOpen === "function") {
      // finish() erlaubt dem Inhalt, den Dialog mit eigenem Ergebnis zu schließen.
      onOpen(dlg, (value) => { result = value; dlg.close(); });
    }
    dlg.showModal();
  });
}

/* Einfache Ja/Nein-Rückfrage. */
export function ask(title, text, okLabel = "OK", kind = "primary") {
  return showDialog({
    title,
    body: `<p class="dlg-text">${esc(text)}</p>`,
    buttons: [
      { label: "Abbrechen", value: "cancel" },
      { label: okLabel, value: "ok", kind },
    ],
  }).then((v) => v === "ok");
}

/* ---- Icons ---- */

/* Favicon-Adresse als Rückfall für von Hand angelegte Bookmarks. Das Bild
   lässt sich anzeigen, seine Farbe aber NICHT auslesen (siehe js/color.js) —
   solche Kacheln bekommen deshalb die Standardfarbe, bis ein eigenes Bild
   eingefügt wird. */
export function faviconUrlFor(url) {
  const host = hostOf(url);
  if (!host) return "";
  return "https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON" +
    "&fallback_opts=TYPE,SIZE,URL&url=" + encodeURIComponent(hrefOf(url)) + "&size=128";
}

/* Ein Bild (aus Zwischenablage, Datei oder Ziehen) auf 64x64 verkleinern und
   als eingebettetes WebP zurückgeben. Damit bleibt der Speicherbedarf klein
   UND die Farbe wird auslesbar. */
export function imageToDataUrl(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const S = 64;
        const cv = document.createElement("canvas");
        cv.width = cv.height = S;
        const c = cv.getContext("2d");
        // Seitenverhältnis erhalten und mittig einpassen.
        const scale = Math.min(S / img.width, S / img.height);
        const w = img.width * scale, h = img.height * scale;
        c.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        let out = cv.toDataURL("image/webp", 0.9);
        // Ältere Browser können kein WebP schreiben und liefern still PNG.
        if (!out.startsWith("data:image/webp")) out = cv.toDataURL("image/png");
        resolve(out);
      } catch { resolve(null); }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/* ---- Bookmark anlegen / bearbeiten ---- */

/* `id` = null → neu anlegen. `folderId` = in welchen Ordner (nur beim Anlegen). */
export async function openBookmarkEditor(id, folderId) {
  const found = id ? findItem(id) : null;
  const bm = found ? found.item : null;
  const isNew = !bm;

  let icon = bm ? bm.imageUrl : "";

  const sizeBtns = ["s", "w", "l"].map((s) => `
    <button type="button" class="size-btn${(bm ? bm.size : "s") === s ? " active" : ""}" data-size="${s}">
      <span class="size-demo size-demo-${s}"></span>${esc(SIZE_LABELS[s])}
    </button>`).join("");

  const body = `
    <label class="fld">
      <span class="fld-lbl">Adresse (URL)</span>
      <input class="fld-in" name="url" type="text" inputmode="url" autocomplete="off"
             placeholder="orf.at" value="${escAttr(bm ? bm.url : "")}" />
    </label>
    <label class="fld">
      <span class="fld-lbl">Name</span>
      <input class="fld-in" name="name" type="text" autocomplete="off"
             placeholder="wird aus der Adresse übernommen" value="${escAttr(bm ? bm.name : "")}" />
    </label>

    <div class="fld">
      <span class="fld-lbl">Icon</span>
      <div class="icon-pick" id="iconPick" tabindex="0">
        <div class="icon-prev" id="iconPrev"></div>
        <div class="icon-hint">
          <strong>Bild einfügen:</strong> hier klicken und <kbd>Strg</kbd>+<kbd>V</kbd> drücken,
          eine Datei hierher ziehen oder auswählen.
          <span class="icon-note">Nur eingefügte Bilder liefern eine eigene Kachelfarbe.</span>
        </div>
        <div class="icon-acts">
          <button type="button" class="dlg-btn small" id="iconFileBtn">Datei…</button>
          <button type="button" class="dlg-btn small" id="iconFavBtn">Favicon holen</button>
          <button type="button" class="dlg-btn small danger" id="iconClearBtn">Entfernen</button>
        </div>
        <input type="file" id="iconFile" accept="image/*" hidden />
      </div>
    </div>

    <div class="fld">
      <span class="fld-lbl">Kachelgröße</span>
      <div class="size-row" id="sizeRow">${sizeBtns}</div>
    </div>`;

  const buttons = isNew
    ? [{ label: "Abbrechen", value: "cancel" }, { label: "Anlegen", value: "save", kind: "primary" }]
    : [{ label: "Löschen", value: "delete", kind: "danger" },
       { label: "Abbrechen", value: "cancel" },
       { label: "Speichern", value: "save", kind: "primary" }];

  let size = bm ? bm.size : "s";
  let fields = null;

  const result = await showDialog({
    title: isNew ? "Neues Bookmark" : "Bookmark bearbeiten",
    body, buttons,
    onOpen(dlg) {
      fields = {
        url: dlg.querySelector('[name="url"]'),
        name: dlg.querySelector('[name="name"]'),
      };
      const prev = dlg.querySelector("#iconPrev");
      const pick = dlg.querySelector("#iconPick");
      const file = dlg.querySelector("#iconFile");

      const drawPrev = () => {
        prev.innerHTML = isImg(icon)
          ? `<img src="${escAttr(icon)}" alt="" />`
          : `<span class="icon-mono">${esc(initial(fields.name.value || fields.url.value || "?"))}</span>`;
      };
      drawPrev();

      const setIcon = async (blob) => {
        const data = await imageToDataUrl(blob);
        if (data) { icon = data; drawPrev(); }
      };

      // Einfügen aus der Zwischenablage (funktioniert im ganzen Dialog).
      dlg.addEventListener("paste", (e) => {
        const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
        if (!item) return;
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) setIcon(blob);
      });

      // Datei hierher ziehen.
      ["dragenter", "dragover"].forEach((t) =>
        pick.addEventListener(t, (e) => { e.preventDefault(); pick.classList.add("over"); }));
      ["dragleave", "drop"].forEach((t) =>
        pick.addEventListener(t, () => pick.classList.remove("over")));
      pick.addEventListener("drop", (e) => {
        e.preventDefault();
        const f = e.dataTransfer?.files?.[0];
        if (f && f.type.startsWith("image/")) setIcon(f);
      });

      dlg.querySelector("#iconFileBtn").addEventListener("click", () => file.click());
      file.addEventListener("change", () => {
        const f = file.files?.[0];
        if (f) setIcon(f);
        file.value = "";
      });
      dlg.querySelector("#iconFavBtn").addEventListener("click", () => {
        const u = fields.url.value.trim();
        if (!u) return;
        icon = faviconUrlFor(u);
        drawPrev();
      });
      dlg.querySelector("#iconClearBtn").addEventListener("click", () => { icon = ""; drawPrev(); });

      dlg.querySelector("#sizeRow").addEventListener("click", (e) => {
        const b = e.target.closest(".size-btn");
        if (!b) return;
        size = b.dataset.size;
        dlg.querySelectorAll(".size-btn").forEach((x) => x.classList.toggle("active", x === b));
      });

      fields.url.addEventListener("blur", drawPrev);
      setTimeout(() => fields.url.focus(), 30);
    },
  });

  if (result === "cancel") return;

  if (result === "delete") {
    if (await ask("Bookmark löschen?", `„${bm.name}" wird entfernt.`, "Löschen", "danger")) {
      removeItem(id);
      render();
    }
    return;
  }

  const url = fields.url.value.trim();
  if (!url) return;
  const name = fields.name.value.trim() || hostOf(url);
  // Kein Icon gewählt? Dann wenigstens das Favicon der Seite anzeigen.
  const imageUrl = icon || faviconUrlFor(url);

  if (isNew) {
    const created = addBookmark({ name, url, imageUrl, size }, folderId);
    if (created) await refreshColor(created.id);
  } else {
    const iconChanged = imageUrl !== bm.imageUrl;
    updateItem(id, { name, url, imageUrl, size });
    if (iconChanged) await refreshColor(id);
  }
  render();
}

/* ---- Ordner anlegen / umbenennen ---- */

export async function openFolderEditor(id) {
  const found = id ? findItem(id) : null;
  const f = found ? found.item : null;
  const isNew = !f;

  const body = `
    <label class="fld">
      <span class="fld-lbl">Name des Ordners</span>
      <input class="fld-in" name="fname" type="text" autocomplete="off"
             placeholder="z.B. Nachrichten" value="${escAttr(f ? f.name : "")}" />
    </label>`;

  let input = null;
  const result = await showDialog({
    title: isNew ? "Neuer Ordner" : "Ordner umbenennen",
    body,
    buttons: [{ label: "Abbrechen", value: "cancel" },
              { label: isNew ? "Anlegen" : "Speichern", value: "save", kind: "primary" }],
    onOpen(dlg) {
      input = dlg.querySelector('[name="fname"]');
      setTimeout(() => { input.focus(); input.select(); }, 30);
    },
  });
  if (result !== "save") return;
  const name = input.value.trim();
  if (!name) return;
  if (isNew) addFolder(name); else updateItem(id, { name });
  render();
}

/* Ordner auflösen — mit Rückfrage, weil es die Kachelwand spürbar umbaut. */
export async function dissolveFolderAsked(id) {
  const found = findItem(id);
  if (!found || found.item.type !== "folder") return;
  const n = found.item.items.length;
  const ok = await ask(
    "Ordner auflösen?",
    `„${found.item.name}" verschwindet. Die ${n} ${n === 1 ? "Kachel wandert" : "Kacheln wandern"} an seine Stelle in die Kachelwand — es geht nichts verloren.`,
    "Auflösen"
  );
  if (!ok) return;
  dissolveFolder(id);
  closeFolder();
  render();
}

/* ---- Kachelmenü (Rechtsklick / langer Druck) ---- */

let menuEl = null;

export function closeTileMenu() {
  if (menuEl) { menuEl.remove(); menuEl = null; }
}

export function openTileMenu(id, x, y) {
  closeTileMenu();
  const found = findItem(id);
  if (!found) return;
  const it = found.item;
  const inFolder = !!found.folder;
  const isFolder = it.type === "folder";

  const sizeItems = ["s", "w", "l"].map((s) => `
    <button class="tm-item tm-size${it.size === s ? " active" : ""}" data-action="size" data-size="${s}">
      <span class="size-demo size-demo-${s}"></span>${esc(SIZE_LABELS[s])}
    </button>`).join("");

  menuEl = document.createElement("div");
  menuEl.className = "tile-menu";
  menuEl.innerHTML = `
    <div class="tm-head">${esc(it.name || (isFolder ? "Ordner" : hostOf(it.url)))}</div>
    ${isFolder ? "" : `
      <button class="tm-item" data-action="open"><i data-lucide="external-link"></i>Öffnen</button>`}
    <button class="tm-item" data-action="edit"><i data-lucide="pencil"></i>${isFolder ? "Umbenennen" : "Bearbeiten"}</button>
    ${isFolder ? `<button class="tm-item" data-action="add"><i data-lucide="plus"></i>Bookmark hier anlegen</button>` : ""}
    <div class="tm-sep"></div>
    <div class="tm-sizes">${sizeItems}</div>
    <div class="tm-sep"></div>
    ${inFolder ? `<button class="tm-item" data-action="out"><i data-lucide="folder-output"></i>Aus dem Ordner holen</button>` : ""}
    ${isFolder ? `<button class="tm-item" data-action="dissolve"><i data-lucide="folder-open"></i>Ordner auflösen</button>` : ""}
    <button class="tm-item danger" data-action="delete"><i data-lucide="trash-2"></i>Löschen</button>`;
  document.body.appendChild(menuEl);
  if (window.lucide) lucide.createIcons();

  // Innerhalb des Fensters halten.
  const r = menuEl.getBoundingClientRect();
  const left = Math.min(Math.max(8, x), window.innerWidth - r.width - 8);
  const top = Math.min(Math.max(8, y), window.innerHeight - r.height - 8);
  menuEl.style.left = left + "px";
  menuEl.style.top = top + "px";

  menuEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    closeTileMenu();

    if (action === "open") window.open(hrefOf(it.url), "_blank", "noopener,noreferrer");
    else if (action === "add") openBookmarkEditor(null, id);
    else if (action === "edit") isFolder ? openFolderEditor(id) : openBookmarkEditor(id, null);
    else if (action === "size") { updateItem(id, { size: btn.dataset.size }); render(); }
    else if (action === "out") { moveItem(id, { toEnd: true }); render(); }
    else if (action === "dissolve") dissolveFolderAsked(id);
    else if (action === "delete") {
      const text = isFolder
        ? `Der Ordner „${it.name}" wird entfernt. Seine ${it.items.length} Kacheln bleiben erhalten und wandern in die Kachelwand.`
        : `„${it.name}" wird entfernt.`;
      if (await ask(isFolder ? "Ordner löschen?" : "Bookmark löschen?", text, "Löschen", "danger")) {
        removeItem(id);
        render();
      }
    }
  });

  // Klick daneben, Escape oder Scrollen schließt das Menü wieder.
  setTimeout(() => {
    document.addEventListener("pointerdown", onOutside, { once: true });
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", closeTileMenu, { once: true, passive: true });
  }, 0);
}

function onOutside(e) {
  if (menuEl && menuEl.contains(e.target)) {
    document.addEventListener("pointerdown", onOutside, { once: true });
    return;
  }
  closeTileMenu();
}
function onEsc(e) {
  if (e.key !== "Escape") return;
  if (!menuEl) { document.removeEventListener("keydown", onEsc); return; }
  e.stopPropagation();
  closeTileMenu();
  document.removeEventListener("keydown", onEsc);
}
