import { state } from "./state.js";
import { loadCafes } from "./cafes.js";
import { routeTo } from "./routing.js";
import { haversineMeters } from "./utils.js";

const MANILA = { lat: 14.5995, lon: 120.9842 };
const REROUTE_THRESHOLD_METERS = 25;

export let map;

export function initMap() {
  map = L.map("map", { zoomControl: true }).setView([MANILA.lat, MANILA.lon], 14);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  map.on("click", onMapClick);
  map.on("dragstart", () => document.getElementById("map").classList.add("dragging"));
  map.on("dragend", () => document.getElementById("map").classList.remove("dragging"));
}

function onMapClick(e) {
  document.getElementById("map").classList.add("pinning");
  state.isManualPin = true;

  const wasRoutedToCafe = state.lastRoutedLat && state.lastRoutedLon;
  const cachedLat = state.lastRoutedLat;
  const cachedLon = state.lastRoutedLon;

  if (state.routingControl) {
    map.removeControl(state.routingControl);
    state.routingControl = null;
  }

  setLocation(e.latlng.lat, e.latlng.lng, true);

  if (wasRoutedToCafe) {
    setTimeout(() => routeTo(cachedLat, cachedLon), 500);
  } else {
    state.lastRoutedLat = null;
    state.lastRoutedLon = null;
  }

  setTimeout(() => document.getElementById("map").classList.remove("pinning"), 300);
}

export function setLocation(lat, lon, zoom = false, isManual = false) {
  state.currentLat = lat;
  state.currentLon = lon;
  if (isManual) state.isManualPin = true;

  const wasRoutedToCafe = state.lastRoutedLat && state.lastRoutedLon;
  const cachedLat = state.lastRoutedLat;
  const cachedLon = state.lastRoutedLon;

  if (state.locationMarker) map.removeLayer(state.locationMarker);
  state.locationMarker = L.marker([lat, lon], { draggable: false })
    .addTo(map)
    .bindPopup("Current Location", { closeButton: false, maxWidth: 150, minWidth: 50 })
    .openPopup();

  if (zoom) map.setView([lat, lon], 20);

  loadCafes();

  if (wasRoutedToCafe) {
    setTimeout(() => routeTo(cachedLat, cachedLon), 500);
  }
}

export function startInitialLocation() {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setLocation(pos.coords.latitude, pos.coords.longitude, true);
      startRealTimeTracking();
    },
    () => {
      setLocation(MANILA.lat, MANILA.lon, true);
    }
  );
}

// Basic real-time movement support: while a route is active, each geolocation
// tick re-requests the OSRM route from the new position. This keeps the route
// and ETA current as you walk, but it is not full turn-by-turn progress
// tracking (no heading, no "next turn in Xm", no off-route detection).
//
// GPS fixes jitter by a few meters even while standing still, so re-routing
// on every single tick made the route line and directions panel visibly
// flicker. Only re-route once you've actually moved a meaningful distance.
let lastReroutedLat = null;
let lastReroutedLon = null;

function startRealTimeTracking() {
  state.watchPositionId = navigator.geolocation.watchPosition(
    (pos) => {
      if (state.isManualPin) return;
      const { latitude, longitude } = pos.coords;
      state.currentLat = latitude;
      state.currentLon = longitude;

      if (!state.lastRoutedLat || !state.lastRoutedLon) return;

      if (lastReroutedLat != null) {
        const moved = haversineMeters(lastReroutedLat, lastReroutedLon, latitude, longitude);
        if (moved != null && moved < REROUTE_THRESHOLD_METERS) return;
      }

      lastReroutedLat = latitude;
      lastReroutedLon = longitude;
      routeTo(state.lastRoutedLat, state.lastRoutedLon);
    },
    () => {},
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 5000 }
  );
}

export function wireLocateButton(dom) {
  dom.locateBtn.addEventListener("click", () => {
    state.isManualPin = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation(pos.coords.latitude, pos.coords.longitude, true),
      () => alert("Location access denied."),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  });
}
