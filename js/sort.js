import { dom } from "./dom.js";
import { state } from "./state.js";
import { renderCafes } from "./cafes.js";

const MODES = [
  { key: "distance", label: "Distance" },
  { key: "rating", label: "Rating" },
  { key: "open", label: "Open now" },
];

export function initSort() {
  if (!dom.sortBtn) return;
  dom.sortBtn.addEventListener("click", () => {
    const idx = MODES.findIndex((m) => m.key === state.sortMode);
    const next = MODES[(idx + 1) % MODES.length];
    state.sortMode = next.key;
    if (dom.sortLabel) dom.sortLabel.textContent = next.label;
    renderCafes();
  });
}
