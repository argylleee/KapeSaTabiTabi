import { dom } from "./dom.js";
import { filterState } from "./state.js";
import { renderCafes } from "./cafes.js";

const FILTER_BUTTON_IDS = ["Wheelchair", "OpenHours", "OutdoorSeating", "Toilet", "Card", "TopRated", "Saved"];

export function initFilters() {
  FILTER_BUTTON_IDS.forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const key = btn.dataset.filter;
    btn.addEventListener("click", () => {
      filterState[key] = !filterState[key];
      btn.classList.toggle("active", filterState[key]);
      btn.blur();
      renderCafes();
    });
  });

  initFilterScroll();
}

function initFilterScroll() {
  const { filterScrollLeft: left, filterScrollRight: right } = dom;
  const container = document.getElementById("filters");
  if (!container) return;

  function update() {
    if (left) left.classList.toggle("hidden", container.scrollLeft <= 0);
    if (right) right.classList.toggle("hidden", container.scrollLeft + container.clientWidth >= container.scrollWidth - 1);
  }

  left?.addEventListener("click", () => {
    container.scrollBy({ left: -200, behavior: "smooth" });
    setTimeout(update, 300);
  });
  right?.addEventListener("click", () => {
    container.scrollBy({ left: 200, behavior: "smooth" });
    setTimeout(update, 300);
  });

  container.addEventListener("scroll", update);
  setTimeout(update, 100);
}
