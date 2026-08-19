// Desktop-only: the Leaflet/OSM attribution control is hidden by default
// (see responsive.css, scoped to min-width: 900px) and revealed by this
// small "i" toggle instead. The button itself is also hidden on mobile via
// CSS, so this is a no-op there even though it always runs.
export function initAttributionToggle() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "attribution-toggle";
  btn.setAttribute("aria-label", "Show map data attribution");
  btn.innerHTML = '<span class="material-symbols-outlined">info</span>';
  btn.addEventListener("click", () => {
    document.body.classList.toggle("show-attribution");
  });
  document.body.appendChild(btn);
}
