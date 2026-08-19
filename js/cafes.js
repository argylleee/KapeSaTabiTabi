import { state, filterState } from "./state.js";
import { map } from "./map.js";
import { routeTo, unroute } from "./routing.js";
import { isFavorite, toggleFavorite } from "./favorites.js";
import { haversineMeters, formatDistance } from "./utils.js";
import { dom } from "./dom.js";

// Café data comes from /api/cafes (see api/cafes.js), a Vercel serverless
// function that holds the Google Places API key server-side. A key embedded
// here would be readable by anyone who views the page source or the Network
// tab, and HTTP-referrer restrictions don't stop that — this repo is public,
// so a client-side key would be a live leak the moment it's committed.
export async function loadCafes() {
  if (!state.currentLat || !state.currentLon) return;

  clearCafes();
  if (dom.cafeList) {
    dom.cafeList.innerHTML = '<p class="empty-message">Loading cafés…</p>';
  }

  const cacheKey = `cafes_places_${state.currentLat.toFixed(3)}_${state.currentLon.toFixed(3)}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      state.allPlaces = JSON.parse(cached);
      renderCafes();
      hideLoadingScreen();
      return;
    } catch (err) {
      console.error("Corrupt cafe cache entry, refetching:", err);
      localStorage.removeItem(cacheKey);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`/api/cafes?lat=${state.currentLat}&lon=${state.currentLon}&radius=3000`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`/api/cafes responded ${res.status}`);
    const data = await res.json();
    state.allPlaces = data.places || [];
    localStorage.setItem(cacheKey, JSON.stringify(state.allPlaces));
    renderCafes();
  } catch (err) {
    console.error("Cafe fetch failed:", err);
    if (dom.cafeList) {
      dom.cafeList.innerHTML = '<p class="empty-message">Could not load cafés. Check your connection.</p>';
    }
  } finally {
    clearTimeout(timeoutId);
    hideLoadingScreen();
  }
}

export function renderCafes() {
  clearCafes();
  if (dom.cafeList) dom.cafeList.innerHTML = "";

  const withDistance = state.allPlaces
    .filter((place) => place.location?.latitude && place.location?.longitude)
    .filter(passesFilters)
    .map((place) => ({
      place,
      distance: haversineMeters(state.currentLat, state.currentLon, place.location.latitude, place.location.longitude),
    }));

  withDistance.sort(compareBySortMode);

  if (dom.sheetTitle) {
    dom.sheetTitle.textContent = withDistance.length
      ? `${withDistance.length} café${withDistance.length === 1 ? "" : "s"} nearby`
      : "Cafés nearby";
  }

  if (withDistance.length === 0) {
    const hasFilters = Object.values(filterState).some(Boolean);
    if (dom.cafeList) {
      dom.cafeList.innerHTML = `<p class="empty-message">${
        hasFilters ? "No cafés match your filters. Try adjusting them." : "No cafés found in this area."
      }</p>`;
    }
    return;
  }

  withDistance.forEach(({ place, distance }) => renderOne(place, distance));
}

function passesFilters(place) {
  // Note: Google Places has no "smoking area" field, so that old filter was
  // dropped entirely rather than kept as a permanent no-op.
  if (filterState.wheelchair && place.accessibilityOptions?.wheelchairAccessibleEntrance !== true) return false;
  if (filterState.openHours && place.currentOpeningHours?.openNow !== true) return false;
  if (filterState.outdoorSeating && place.outdoorSeating !== true) return false;
  if (filterState.toilet && place.restroom !== true) return false;
  if (
    filterState.card &&
    place.paymentOptions?.acceptsCreditCards !== true &&
    place.paymentOptions?.acceptsDebitCards !== true
  )
    return false;
  if (filterState.topRated && !(place.rating >= 4.5)) return false;
  if (filterState.saved && !isFavorite(place.id)) return false;
  return true;
}

function compareBySortMode(a, b) {
  if (state.sortMode === "rating") return (b.place.rating || 0) - (a.place.rating || 0);
  if (state.sortMode === "open") {
    const aOpen = a.place.currentOpeningHours?.openNow ? 1 : 0;
    const bOpen = b.place.currentOpeningHours?.openNow ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    return (a.distance ?? Infinity) - (b.distance ?? Infinity);
  }
  return (a.distance ?? Infinity) - (b.distance ?? Infinity);
}

function placePhotoUrl(place, maxHeightPx = 240) {
  const photo = place.photos && place.photos[0];
  if (!photo) return null;
  // /api/photo (see api/photo.js) proxies the image server-side, so the API
  // key never appears in an <img src> or the Network tab either.
  return `/api/photo?name=${encodeURIComponent(photo.name)}&maxHeightPx=${maxHeightPx}`;
}

function renderOne(place, distance) {
  const lat = place.location.latitude;
  const lon = place.location.longitude;
  const name = place.displayName?.text || "Unnamed Cafe";
  const isOpen = place.currentOpeningHours?.openNow;
  const hoursLine = place.currentOpeningHours ? (isOpen ? "Open now" : "Closed now") : "Hours not available";
  const photoUrl = placePhotoUrl(place);

  const marker = L.marker([lat, lon]).addTo(map);
  marker._icon?.classList.add("cafe-marker");
  state.cafeMarkers.push(marker);

  const isRouted = state.lastRoutedLat === lat && state.lastRoutedLon === lon;

  marker.bindPopup(
    `
    <div>
      ${photoUrl ? `<img class="popup-photo" src="${photoUrl}" alt="${name}" />` : ""}
      <div class="popup-name">${name}</div>
      ${
        place.rating
          ? `<div class="popup-rating"><span class="material-symbols-outlined">star</span>${place.rating.toFixed(1)} (${place.userRatingCount || 0})</div>`
          : ""
      }
      <div class="popup-hours">${hoursLine}</div>
      <div style="margin-top:8px;">
        <button class="route-btn${isRouted ? " active" : ""}" onclick="window.routeToFromMarker(${lat}, ${lon})" data-route-lat="${lat}" data-route-lon="${lon}">Get route</button>
        <button class="route-btn unroute" onclick="window.unroute()">Unroute</button>
      </div>
    </div>
  `,
    { closeButton: false }
  );

  if (!dom.cafeList) return;

  const card = document.createElement("div");
  card.className = "cafe-card" + (isRouted ? " active" : "");
  card.dataset.lat = lat;
  card.dataset.lon = lon;
  card.dataset.name = name.toLowerCase();

  const tags = [`<span class="tag ${isOpen ? "open" : "closed"}">${isOpen ? "Open" : "Closed"}</span>`];
  if (place.accessibilityOptions?.wheelchairAccessibleEntrance) tags.push('<span class="tag">Wheelchair</span>');
  if (place.outdoorSeating) tags.push('<span class="tag">Outdoor</span>');
  if (place.restroom) tags.push('<span class="tag">Restroom</span>');
  if (place.paymentOptions?.acceptsCreditCards || place.paymentOptions?.acceptsDebitCards)
    tags.push('<span class="tag">Cards</span>');

  const saved = isFavorite(place.id);

  card.innerHTML = `
    <div class="cafe-photo${photoUrl ? "" : " no-photo"}" style="${photoUrl ? `background-image:url('${photoUrl}')` : ""}">
      <button type="button" class="favorite-btn${saved ? " saved" : ""}" aria-label="Save café">
        <span class="material-symbols-outlined">favorite</span>
      </button>
    </div>
    <div class="cafe-body">
      <h4>${name}</h4>
      <div class="cafe-meta">
        ${place.rating ? `<span class="rating"><span class="material-symbols-outlined">star</span>${place.rating.toFixed(1)}<span class="rating-count">(${place.userRatingCount || 0})</span></span>` : ""}
        <span>${formatDistance(distance)}</span>
      </div>
      <div class="cafe-tags">${tags.join("")}</div>
    </div>
  `;

  card.querySelector(".favorite-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    const nowSaved = toggleFavorite(place.id);
    btn.classList.toggle("saved", nowSaved);
    if (filterState.saved && !nowSaved) renderCafes();
  });

  card.addEventListener("click", () => {
    if (state.activeCafeCard === card) {
      unroute();
    } else {
      document.querySelectorAll(".cafe-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      state.activeCafeCard = card;
      routeTo(lat, lon);
    }
  });

  if (isRouted) state.activeCafeCard = card;

  dom.cafeList.appendChild(card);
}

export function filterCafeCards(term) {
  const t = term.trim().toLowerCase();
  document.querySelectorAll(".cafe-card").forEach((card) => {
    card.style.display = card.dataset.name.includes(t) ? "" : "none";
  });
}

export function clearCafes() {
  state.cafeMarkers.forEach((m) => map.removeLayer(m));
  state.cafeMarkers = [];
}

function hideLoadingScreen() {
  dom.loadingScreen?.classList.add("hidden");
}
