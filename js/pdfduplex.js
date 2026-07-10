/* ============ PDF DUPLEX-FIXER (UI) ============
   Oberfläche für js/pdfDuplexFixer.js (reine Logik). Wird — wie der
   Dienstplan — erst beim Öffnen des Werkzeugs dynamisch nachgeladen,
   damit das 500-KB-pdf-lib-Bundle den App-Start nicht bremst. */

import { interleavePages, OddPageCountError } from "./pdfDuplexFixer.js";

export function renderPdfDuplex(container) {
  container.innerHTML = `
    <div class="pdx">
      <p class="pdx-intro">Für Scanner ohne Duplex: zuerst alle <b>Vorderseiten</b> scannen,
        dann den Stapel wenden und alle <b>Rückseiten</b> — die letzte zuerst.
        Dieses Werkzeug sortiert die Seiten wieder in die richtige Reihenfolge.</p>

      <label class="pdx-drop">
        <i data-lucide="file-up"></i>
        <span data-filelabel>PDF auswählen …</span>
        <input type="file" accept=".pdf,application/pdf" data-file hidden>
      </label>

      <div class="pdx-card">
        <label class="pdx-check">
          <input type="checkbox" data-removeblank>
          <span>Digitale Leerseiten löschen
            <small>erkennt nur strukturell leere Seiten, keine weiß gescannten</small></span>
        </label>
        <label class="pdx-check">
          <input type="checkbox" data-addblank>
          <span>Leere Seite anfügen, falls die Seitenzahl ungerade ist
            <small>sonst wird bei ungerader Seitenzahl nachgefragt</small></span>
        </label>
      </div>

      <button class="pdx-btn primary pdx-run" data-run disabled>Seiten sortieren</button>

      <div class="pdx-progress" data-progresswrap hidden>
        <div class="pdx-progress-meta"><span data-status>…</span><b data-pct></b></div>
        <div class="pdx-bar-bg"><div class="pdx-bar-fill" data-fill></div></div>
      </div>

      <div class="pdx-err" data-err role="alert"></div>

      <div class="pdx-card pdx-ask" data-ask hidden>
        <p data-asktext></p>
        <div class="pdx-ask-btns">
          <button class="pdx-btn primary" data-askyes>Ja, Leerseite anfügen</button>
          <button class="pdx-btn" data-askno>Abbrechen</button>
        </div>
      </div>

      <a class="pdx-btn success pdx-download" data-download hidden>
        <i data-lucide="download"></i><span data-downloadlabel></span>
      </a>
    </div>`;

  const $ = (s) => container.querySelector(s);
  const fileInput = $("[data-file]");
  const fileLabel = $("[data-filelabel]");
  const removeBlankCb = $("[data-removeblank]");
  const addBlankCb = $("[data-addblank]");
  const runBtn = $("[data-run]");
  const progressWrap = $("[data-progresswrap]");
  const statusEl = $("[data-status]");
  const pctEl = $("[data-pct]");
  const fillEl = $("[data-fill]");
  const errEl = $("[data-err]");
  const askCard = $("[data-ask]");
  const askText = $("[data-asktext]");
  const downloadLink = $("[data-download]");

  let file = null;    // aktuell gewählte PDF-Datei
  let busy = false;   // verhindert Doppelverarbeitung
  let blobUrl = null; // Download-URL des letzten Ergebnisses

  const fmtSize = (b) => b < 1048576 ? Math.round(b / 1024) + " KB" : (b / 1048576).toFixed(1) + " MB";

  // Eingaben während der Verarbeitung sperren (keine Doppelverarbeitung).
  const setBusy = (on) => {
    busy = on;
    [fileInput, removeBlankCb, addBlankCb, runBtn].forEach((el) => { el.disabled = on; });
    if (!on) runBtn.disabled = !file;
  };

  const resetOutput = () => {
    errEl.textContent = "";
    askCard.hidden = true;
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

  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    resetOutput();
    if (!f) { file = null; fileLabel.textContent = "PDF auswählen …"; runBtn.disabled = true; return; }
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
      file = null; fileInput.value = "";
      fileLabel.textContent = "PDF auswählen …";
      runBtn.disabled = true;
      errEl.textContent = "Bitte eine PDF-Datei auswählen — andere Dateitypen kann dieses Werkzeug nicht sortieren.";
      return;
    }
    file = f;
    fileLabel.textContent = f.name + " (" + fmtSize(f.size) + ")";
    runBtn.disabled = false;
  });

  async function run(addBlankConfirmed) {
    if (!file || busy) return;
    resetOutput();
    setBusy(true);
    showProgress("Lese PDF …", 0, 0);
    try {
      const buf = await file.arrayBuffer();
      const bytes = await interleavePages(buf, {
        removeBlankPages: removeBlankCb.checked,
        addBlankPageIfOdd: addBlankConfirmed || addBlankCb.checked,
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
      if (e instanceof OddPageCountError) {
        // Nicht still eine Seite dazumogeln — erst nachfragen.
        askText.textContent = `Das PDF hat ${e.pageCount} Seiten (ungerade Anzahl). ` +
          "Vermutlich fehlt die leere Rückseite des letzten Blatts. Leere Seite anfügen und fortfahren?";
        askCard.hidden = false;
      } else {
        errEl.textContent = e && e.message ? e.message : "Unerwarteter Fehler beim Verarbeiten des PDFs.";
      }
    } finally {
      setBusy(false);
    }
  }

  runBtn.addEventListener("click", () => run(false));
  $("[data-askyes]").addEventListener("click", () => run(true));
  $("[data-askno]").addEventListener("click", () => { askCard.hidden = true; });

  if (window.lucide) lucide.createIcons();

  // Aufräumen beim Schließen: Download-URL wieder freigeben.
  return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
}
