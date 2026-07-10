/* ============ PDF DUPLEX-FIXER (UI) ============
   Oberfläche für js/pdfDuplexFixer.js (reine Logik). Wird — wie der
   Dienstplan — erst beim Öffnen des Werkzeugs dynamisch nachgeladen,
   damit das pdf-lib-Bundle den App-Start nicht bremst.

   Bewusst so einfach wie möglich: PDF auswählen oder hineinziehen,
   ein Knopf, fertig. Keine Optionen. */

import { interleavePages } from "./pdfDuplexFixer.js";

export function renderPdfDuplex(container) {
  container.innerHTML = `
    <div class="pdx">
      <p class="pdx-intro">Für Scanner ohne Duplex: zuerst alle <b>Vorderseiten</b> scannen,
        dann den Stapel wenden und alle <b>Rückseiten</b> — die letzte zuerst.
        Dieses Werkzeug bringt die Seiten wieder in die richtige Reihenfolge.</p>

      <label class="pdx-drop" data-drop>
        <i data-lucide="file-up"></i>
        <span data-filelabel>PDF hierher ziehen oder auswählen …</span>
        <input type="file" accept=".pdf,application/pdf" data-file hidden>
      </label>

      <button class="pdx-btn primary pdx-run" data-run disabled>Seiten sortieren</button>

      <div class="pdx-progress" data-progresswrap hidden>
        <div class="pdx-progress-meta"><span data-status>…</span><b data-pct></b></div>
        <div class="pdx-bar-bg"><div class="pdx-bar-fill" data-fill></div></div>
      </div>

      <div class="pdx-err" data-err role="alert"></div>

      <a class="pdx-btn success pdx-download" data-download hidden>
        <i data-lucide="download"></i><span data-downloadlabel></span>
      </a>
    </div>`;

  const $ = (s) => container.querySelector(s);
  const dropZone = $("[data-drop]");
  const fileInput = $("[data-file]");
  const fileLabel = $("[data-filelabel]");
  const runBtn = $("[data-run]");
  const progressWrap = $("[data-progresswrap]");
  const statusEl = $("[data-status]");
  const pctEl = $("[data-pct]");
  const fillEl = $("[data-fill]");
  const errEl = $("[data-err]");
  const downloadLink = $("[data-download]");

  let file = null;    // aktuell gewählte PDF-Datei
  let busy = false;   // verhindert Doppelverarbeitung
  let blobUrl = null; // Download-URL des letzten Ergebnisses

  const fmtSize = (b) => b < 1048576 ? Math.round(b / 1024) + " KB" : (b / 1048576).toFixed(1) + " MB";

  const setBusy = (on) => {
    busy = on;
    fileInput.disabled = on;
    runBtn.disabled = on || !file;
  };

  const resetOutput = () => {
    errEl.textContent = "";
    downloadLink.hidden = true;
    progressWrap.hidden = true;
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
  };

  const showProgress = (label, done, total) => {
    progressWrap.hidden = false;
    statusEl.textContent = label;
    if (total) {
      const pct = Math.round((done / total) * 100);
      pctEl.textContent = pct + "%";
      fillEl.style.width = pct + "%";
    } else {
      pctEl.textContent = "";
      fillEl.style.width = "8%"; // "es tut sich was", noch ohne Zahl
    }
  };

  // Eine PDF-Datei übernehmen — egal ob per Auswahl oder Drag & Drop.
  const setFile = (f) => {
    resetOutput();
    if (!f) { file = null; fileLabel.textContent = "PDF hierher ziehen oder auswählen …"; runBtn.disabled = true; return; }
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
      file = null; fileInput.value = "";
      fileLabel.textContent = "PDF hierher ziehen oder auswählen …";
      runBtn.disabled = true;
      errEl.textContent = "Bitte eine PDF-Datei wählen — andere Dateitypen kann dieses Werkzeug nicht sortieren.";
      return;
    }
    file = f;
    fileLabel.textContent = f.name + " (" + fmtSize(f.size) + ")";
    runBtn.disabled = false;
  };

  fileInput.addEventListener("change", () => setFile(fileInput.files && fileInput.files[0]));

  // Drag & Drop direkt auf die Ablage-Fläche. stopPropagation, damit die
  // globale Datei-Ablage der App (JSON/ICS) nicht dazwischenfunkt.
  ["dragenter", "dragover"].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => {
      if (busy) return;
      e.preventDefault(); e.stopPropagation();
      dropZone.classList.add("dragover");
    }));
  ["dragleave", "dragend"].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      dropZone.classList.remove("dragover");
    }));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.remove("dragover");
    if (busy) return;
    setFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });

  async function run() {
    if (!file || busy) return;
    resetOutput();
    setBusy(true);
    showProgress("Lese PDF …", 0, 0);
    try {
      const buf = await file.arrayBuffer();
      const bytes = await interleavePages(buf, {
        onProgress: (done, total) => showProgress(`Sortiere Seite ${done} von ${total} …`, done, total),
      });

      const blob = new Blob([bytes], { type: "application/pdf" });
      blobUrl = URL.createObjectURL(blob);
      const outName = file.name.replace(/\.pdf$/i, "") + "_korrigiert.pdf";
      downloadLink.href = blobUrl;
      downloadLink.download = outName;
      $("[data-downloadlabel]").textContent = outName + " herunterladen";
      downloadLink.hidden = false;
      showProgress("Fertig — Seiten sortiert.", 1, 1);
    } catch (e) {
      progressWrap.hidden = true;
      errEl.textContent = e && e.message ? e.message : "Unerwarteter Fehler beim Verarbeiten des PDFs.";
    } finally {
      setBusy(false);
    }
  }

  runBtn.addEventListener("click", run);

  if (window.lucide) lucide.createIcons();

  // Aufräumen beim Schließen: Download-URL wieder freigeben.
  return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
}
