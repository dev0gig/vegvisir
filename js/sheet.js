/* ============ ÖFFNEN / SCHLIESSEN DER ORDNER-SHEETS ============ */
/* Ein Ordner öffnet sich als Bottom-Sheet, das von unten hereinfährt und sich
   per Wischgeste (Touch) oder am Griff (Maus) wieder wegziehen lässt. */

const backdrop = document.getElementById("backdrop");

let activeSheet = null;

/* Damit andere Module (z.B. die Werkzeug-Fenster) wissen, ob gerade ein
   Ordner-Sheet offen ist — sie teilen sich den abgedunkelten Hintergrund. */
export function getActiveSheet() { return activeSheet; }

export function openSheet(sheet) {
  if (!sheet) return;
  if (activeSheet && activeSheet !== sheet) { activeSheet.classList.remove("open"); activeSheet.style.transform = ""; }
  activeSheet = sheet;
  backdrop.classList.add("open");
  requestAnimationFrame(() => {
    sheet.classList.add("open");
    sheet.style.transform = "translate(-50%, 0)";
  });
  document.body.style.overflow = "hidden";
}

export function closeSheet() {
  if (!activeSheet) return;
  activeSheet.classList.remove("open");
  activeSheet.style.transform = "";
  backdrop.classList.remove("open");
  activeSheet = null;
  document.body.style.overflow = "";
}

/* ---- Drag-to-dismiss ---- */
// Das Sheet laesst sich auf zwei Wegen nach unten wegziehen:
//  • Desktop: per Maus am Griff (pointer-Events).
//  • Touch: mit einer Wischgeste irgendwo auf der GESAMTEN Sheet-Flaeche.
//    Damit Wischen und Scrollen sich nicht in die Quere kommen, startet die
//    Schliess-Geste nur, wenn die Liste bereits ganz oben steht und man nach
//    unten zieht – sonst scrollt der Inhalt ganz normal.
export function attachDrag(sheet) {
  const handle = sheet.querySelector("[data-handle]");
  const scroll = sheet.querySelector(".sheet-scroll");
  let startY = 0, dy = 0, dragging = false;

  const finish = () => {
    dragging = false;
    sheet.classList.remove("dragging");
    if (dy > 110) closeSheet();
    else sheet.style.transform = "translate(-50%, 0)";
  };

  /* Desktop: Maus am Griff */
  handle.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return; // Touch laeuft ueber die Geste unten
    dragging = true; startY = e.clientY; dy = 0;
    sheet.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = `translate(-50%, ${dy}px)`;
  });
  handle.addEventListener("pointerup", () => { if (dragging) finish(); });
  handle.addEventListener("pointercancel", () => { if (dragging) finish(); });

  /* Touch: Wischen auf der ganzen Flaeche */
  let touchActive = false;
  sheet.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    startY = e.touches[0].clientY; dy = 0;
    touchActive = true; dragging = false;
  }, { passive: true });
  sheet.addEventListener("touchmove", (e) => {
    if (!touchActive) return;
    const delta = e.touches[0].clientY - startY;
    const atTop = !scroll || scroll.scrollTop <= 0;
    if (!dragging) {
      // Geste erst starten, wenn man von ganz oben nach unten zieht
      if (delta > 6 && atTop) {
        dragging = true;
        sheet.classList.add("dragging");
      } else {
        return; // sonst normal scrollen lassen
      }
    }
    dy = Math.max(0, delta);
    e.preventDefault();
    sheet.style.transform = `translate(-50%, ${dy}px)`;
  }, { passive: false });
  const endTouch = () => {
    if (!touchActive) return;
    touchActive = false;
    if (dragging) finish();
  };
  sheet.addEventListener("touchend", endTouch);
  sheet.addEventListener("touchcancel", endTouch);
}
