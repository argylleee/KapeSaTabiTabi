import { state } from "./state.js";
import { map } from "./map.js";
import { collapseSheet } from "./sheet.js";
import { refreshMarkerColors } from "./cafes.js";

let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// The public OSRM demo (project-osrm.org) only serves a driving profile.
// Walking uses OpenStreetMap Germany's community-run demo router instead —
// also free, no key, but a separate (less heavily used) service, so it's
// worth knowing that's where "walk" mode routes come from if it ever errors.
const TRAVEL_MODES = {
  drive: {
    label: "Driving",
    icon: "directions_car",
    serviceUrl: "https://router.project-osrm.org/route/v1",
    profile: "driving",
  },
  walk: {
    label: "Walking",
    icon: "directions_walk",
    serviceUrl: "https://routing.openstreetmap.de/routed-foot/route/v1",
    profile: "foot",
  },
};

function isNarrowViewport() {
  return window.innerWidth < 900;
}

export function routeTo(lat, lon) {
  state.lastRoutedLat = lat;
  state.lastRoutedLon = lon;

  if (state.routingControl) map.removeControl(state.routingControl);

  const fromLat = state.currentLat ?? 14.5995;
  const fromLon = state.currentLon ?? 120.9842;
  const mode = TRAVEL_MODES[state.travelMode] || TRAVEL_MODES.drive;

  state.routingControl = L.Routing.control({
    waypoints: [L.latLng(fromLat, fromLon), L.latLng(lat, lon)],
    router: L.Routing.osrmv1({
      serviceUrl: mode.serviceUrl,
      profile: mode.profile,
    }),
    show: state.routingDirectionsVisible,
    createMarker: () => null, // we draw our own start/café pins; LRM's defaults duplicated them
    lineOptions: {
      styles: [{ color: "#E0A438", opacity: 0.9, weight: 5 }],
    },
  })
    .on("routingerror", (e) => {
      console.error("Routing error:", e);
      alert("Could not calculate route. Distance might be too far or no route available.");
    })
    .addTo(map);

  refreshMarkerColors();
  document.body.classList.toggle("routing-open", state.routingDirectionsVisible);
  updateCancelButtonVisibility();

  setTimeout(() => {
    const container = document.querySelector(".leaflet-routing-container");
    if (!container) return;

    if (state.routingDirectionsVisible) {
      container.classList.remove("leaflet-routing-container-hidden");
      ensureModeToggle(container);
      ensureCancelButton(container);
      ensureCloseButton(container);
      setupStickySummary(container);
    } else {
      container.classList.add("leaflet-routing-container-hidden");
      ensureFabIcon(container);
    }

    if (!container.dataset.clickHandlerAdded) {
      container.addEventListener(
        "click",
        (e) => {
          if (container.classList.contains("leaflet-routing-container-hidden")) {
            e.stopPropagation();
            toggleRoutingDirections();
          }
        },
        { capture: true }
      );
      container.dataset.clickHandlerAdded = "true";
    }

    attachDragListeners(container);
  }, 300);
}

function ensureCloseButton(container) {
  const right = ensureToolbarRight(container);
  if (right.querySelector(".leaflet-routing-close")) return;
  const closeBtn = document.createElement("button");
  closeBtn.className = "leaflet-routing-close";
  closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    toggleRoutingDirections();
  };
  right.appendChild(closeBtn); // always last -> rightmost
}

function ensureCancelButton(container) {
  const right = ensureToolbarRight(container);
  if (right.querySelector(".routing-cancel-btn")) return;
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "routing-cancel-btn";
  cancelBtn.setAttribute("aria-label", "Cancel route");
  cancelBtn.innerHTML = '<span class="material-symbols-outlined">block</span>';
  cancelBtn.onclick = (e) => {
    e.stopPropagation();
    unroute();
  };
  right.prepend(cancelBtn); // sits just left of the close button
}

function ensureFabIcon(container) {
  if (container.querySelector(".routing-fab-icon")) return;
  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined routing-fab-icon";
  icon.textContent = "directions";
  container.appendChild(icon);
}

// A real, normal-flow toolbar (not absolutely-positioned icons) prepended as
// the container's first child, so the header/instructions that follow it in
// the DOM are always pushed down and can never overlap it.
function ensureToolbar(container) {
  let toolbar = container.querySelector(".routing-toolbar");
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.className = "routing-toolbar";
    container.insertBefore(toolbar, container.firstChild);
  }
  return toolbar;
}

function ensureToolbarLeft(container) {
  const toolbar = ensureToolbar(container);
  let left = toolbar.querySelector(".routing-toolbar-left");
  if (!left) {
    left = document.createElement("div");
    left.className = "routing-toolbar-left";
    toolbar.prepend(left);
  }
  return left;
}

function ensureToolbarRight(container) {
  const toolbar = ensureToolbar(container);
  let right = toolbar.querySelector(".routing-toolbar-right");
  if (!right) {
    right = document.createElement("div");
    right.className = "routing-toolbar-right";
    toolbar.appendChild(right);
  }
  return right;
}

function ensureModeToggle(container) {
  const left = ensureToolbarLeft(container);
  let wrap = left.querySelector(".routing-mode-toggle");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "routing-mode-toggle";
    left.prepend(wrap); // always first -> left of the summary badge
  }
  wrap.innerHTML = Object.entries(TRAVEL_MODES)
    .map(
      ([key, mode]) =>
        `<button type="button" data-mode="${key}" class="${state.travelMode === key ? "active" : ""}" aria-label="${mode.label}"><span class="material-symbols-outlined">${mode.icon}</span></button>`
    )
    .join("");

  wrap.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const modeKey = btn.dataset.mode;
      if (state.travelMode === modeKey) return;
      state.travelMode = modeKey;
      if (state.lastRoutedLat != null && state.lastRoutedLon != null) {
        routeTo(state.lastRoutedLat, state.lastRoutedLon);
      }
    });
  });
}

// The route's distance/duration summary lives in the header, which scrolls
// out of view with the rest of the instruction list. Mirror it into a small
// badge next to the mode toggle whenever the real header isn't visible, so
// it stays trackable while scrolling — and let it disappear again once
// scrolled back to the top, where the real header is doing the same job.
function setupStickySummary(container) {
  const header = container.querySelector(".leaflet-routing-header");
  if (!header || typeof IntersectionObserver === "undefined") return;

  const left = ensureToolbarLeft(container);
  let badge = left.querySelector(".routing-summary-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "routing-summary-badge";
    left.appendChild(badge); // after the mode toggle
  }

  const summaryEl = header.lastElementChild && header.lastElementChild !== header.firstElementChild ? header.lastElementChild : header;
  badge.textContent = summaryEl.textContent.trim();
  badge.hidden = true;

  container._summaryObserver?.disconnect();
  const observer = new IntersectionObserver(([entry]) => {
    badge.hidden = entry.isIntersecting;
  }, { root: container, threshold: 0 });
  observer.observe(header);
  container._summaryObserver = observer;
}

export function unroute() {
  if (state.routingControl) {
    map.removeControl(state.routingControl);
    state.routingControl = null;
  }

  const prevLat = state.lastRoutedLat;
  const prevLon = state.lastRoutedLon;
  state.lastRoutedLat = null;
  state.lastRoutedLon = null;

  if (state.activeCafeCard) {
    state.activeCafeCard.classList.remove("active");
    state.activeCafeCard = null;
  }
  document.querySelectorAll(".cafe-card").forEach((c) => c.classList.remove("active"));

  if (prevLat != null && prevLon != null) updateRouteButtonState(prevLat, prevLon, false);
  refreshMarkerColors();
  document.body.classList.remove("routing-open");
}

export function toggleRoutingDirections() {
  state.routingDirectionsVisible = !state.routingDirectionsVisible;

  if (state.routingDirectionsVisible && isNarrowViewport()) collapseSheet();
  document.body.classList.toggle("routing-open", state.routingDirectionsVisible);

  if (!state.routingControl) return;

  const container = document.querySelector(".leaflet-routing-container");
  if (state.routingDirectionsVisible) {
    state.routingControl.show();
    if (container) {
      container.classList.remove("leaflet-routing-container-hidden");
      ensureModeToggle(container);
      ensureCancelButton(container);
      ensureCloseButton(container);
      setupStickySummary(container);
    }
  } else {
    state.routingControl.hide();
    if (container) {
      container.classList.add("leaflet-routing-container-hidden");
      container.querySelector(".leaflet-routing-close")?.remove();
      ensureFabIcon(container);
    }
  }
}

// Leaflet Routing Machine rebuilds its container on route updates, so keep
// (re)wiring the "tap while collapsed" affordance as it reappears.
setInterval(() => {
  const container = document.querySelector(".leaflet-routing-container");
  if (container && !container.dataset.clickSetup) {
    container.onclick = () => {
      if (container.classList.contains("leaflet-routing-container-hidden")) toggleRoutingDirections();
    };
    container.dataset.clickSetup = "true";
  }
}, 100);

function attachDragListeners(container) {
  if (container.dataset.dragHandlerAdded) return;
  container.addEventListener("pointerdown", (e) => startDrag(e, container));
  container.dataset.dragHandlerAdded = "true";
}

function startDrag(e, container) {
  if (!isNarrowViewport()) return; // only draggable as a FAB on mobile
  if (!container.classList.contains("leaflet-routing-container-hidden")) return;

  isDragging = true;
  const rect = container.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;
  container.style.transition = "none";
  container.style.zIndex = "99999";

  const onMove = (ev) => drag(ev, container);
  const onUp = () => {
    isDragging = false;
    container.style.transition = "all 300ms ease";
    container.style.zIndex = "99998";
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

function drag(e, container) {
  if (!isDragging) return;
  e.preventDefault();
  const maxX = window.innerWidth - 56;
  const maxY = window.innerHeight - 56;
  const newX = Math.max(0, Math.min(e.clientX - dragOffsetX, maxX));
  const newY = Math.max(0, Math.min(e.clientY - dragOffsetY, maxY));
  container.style.left = `${newX}px`;
  container.style.top = `${newY}px`;
  container.style.right = "auto";
  container.style.bottom = "auto";
}

function updateRouteButtonState(lat, lon, active) {
  document.querySelectorAll("button[data-route-lat]").forEach((btn) => {
    const btnLat = parseFloat(btn.dataset.routeLat);
    const btnLon = parseFloat(btn.dataset.routeLon);
    if (Math.abs(btnLat - lat) < 0.0001 && Math.abs(btnLon - lon) < 0.0001) {
      btn.classList.toggle("active", active);
    }
  });
}

// exposed for popup buttons built as HTML strings (see cafes.js)
window.routeTo = routeTo;
window.unroute = unroute;
window.routeToFromMarker = function (lat, lon) {
  document.querySelectorAll(".cafe-card").forEach((card) => {
    const cardLat = parseFloat(card.dataset.lat || 0);
    const cardLon = parseFloat(card.dataset.lon || 0);
    if (Math.abs(cardLat - lat) < 0.0001 && Math.abs(cardLon - lon) < 0.0001) {
      document.querySelectorAll(".cafe-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      state.activeCafeCard = card;
    }
  });
  updateRouteButtonState(lat, lon, true);
  routeTo(lat, lon);
};
