import { dom } from "./dom.js";
import { filterCafeCards } from "./cafes.js";

let dragging = false;
let dragStartY = 0;
let baseTranslate = 0;
let maxTranslate = 0;

export function initSheet() {
  dom.sheetGrabber.addEventListener("pointerdown", onPointerDown);
  dom.menu.addEventListener("click", () => toggleSheet());

  if (dom.cafeSearchInput) {
    dom.cafeSearchInput.addEventListener("input", (e) => filterCafeCards(e.target.value));
  }
}

function toggleSheet(force) {
  const shouldExpand = force !== undefined ? force : !dom.sheet.classList.contains("expanded");
  dom.sheet.classList.toggle("expanded", shouldExpand);
}

export function collapseSheet() {
  toggleSheet(false);
}

export function expandSheet() {
  toggleSheet(true);
}

function onPointerDown(e) {
  if (window.innerWidth >= 900) return; // desktop sheet is a fixed panel, no drag
  dragging = true;
  dragStartY = e.clientY;

  const sheet = dom.sheet;
  const h = sheet.offsetHeight;
  const peek = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--peek-height"));
  maxTranslate = h - peek;
  baseTranslate = sheet.classList.contains("expanded") ? 0 : maxTranslate;

  sheet.classList.add("dragging");
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
}

function onPointerMove(e) {
  if (!dragging) return;
  const delta = e.clientY - dragStartY;
  const next = Math.max(0, Math.min(baseTranslate + delta, maxTranslate));
  dom.sheet.style.transform = `translateY(${next}px)`;
}

function onPointerUp(e) {
  if (!dragging) return;
  dragging = false;

  const sheet = dom.sheet;
  sheet.classList.remove("dragging");
  sheet.style.transform = "";
  document.removeEventListener("pointermove", onPointerMove);
  document.removeEventListener("pointerup", onPointerUp);

  const delta = e.clientY - dragStartY;
  if (Math.abs(delta) < 6) {
    toggleSheet(); // treat as a tap on the grabber
    return;
  }
  const traveled = baseTranslate + delta;
  toggleSheet(traveled < maxTranslate / 2);
}
