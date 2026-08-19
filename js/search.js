import { dom } from "./dom.js";
import { setLocation } from "./map.js";

export function initSearch() {
  dom.searchBtn.addEventListener("click", performSearch);
  // Mobile virtual keyboards don't reliably fire a `keypress`/`keydown`
  // Enter event; the "Go"/"Search" action key is really a form submission.
  // Without a <form>, an un-submittable Enter falls back to the browser's
  // own default of shifting focus to the next input on the page — which is
  // exactly what looked like "Enter acts like Tab" moving focus to the
  // café-list search box.
  dom.searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    dom.searchInput.blur();
    performSearch();
  });
}

async function performSearch() {
  const query = dom.searchInput.value.trim();
  if (!query) {
    alert("Please enter a location.");
    return;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
    const data = await res.json();
    if (!data.length) {
      alert("Location not found.");
      return;
    }
    setLocation(parseFloat(data[0].lat), parseFloat(data[0].lon), true, true);
  } catch (err) {
    console.error("Search failed:", err);
    alert("Search failed. Check your connection.");
  }
}
