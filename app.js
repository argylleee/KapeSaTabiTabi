// default map
const map = L.map("map").setView([14.5995, 120.9842], 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

// initial states
let currentLat = null;
let currentLon = null;
let locationMarker = null;
let cafeMarkers = [];
let routingControl = null;
let lastRoutedLat = null;
let lastRoutedLon = null;
let watchPositionId = null;
let activeCafeCard = null;
let isManualPin = false;

// ui elements
const cafeList = document.getElementById("cafeList");
const menu = document.getElementById("menu");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const locateBtn = document.getElementById("locateBtn");
const loadingScreen = document.getElementById("loadingScreen");

// filter elements
const Wheelchair = document.getElementById("Wheelchair");
const OpenHours = document.getElementById("OpenHours");
const OutdoorSeating = document.getElementById("OutdoorSeating");
const Smoking = document.getElementById("Smoking");
const Toilet = document.getElementById("Toilet");
const Card = document.getElementById("Card");

// filter state
const filterState = {
  wheelchair: false,
  openHours: false,
  outdoorSeating: false,
  smoking: false,
  toilet: false,
  card: false
};

// initial location fetch
navigator.geolocation.getCurrentPosition(
  (pos) => {
    setLocation(pos.coords.latitude, pos.coords.longitude, true);
    startRealTimeTracking();
  },
  (error) => {
    setLocation(14.5995, 120.9842, true); //if location access denied, fallback to Manila
  }
);

// real-time tracking
function startRealTimeTracking() {
  watchPositionId = navigator.geolocation.watchPosition(
    (pos) => {
      if (!isManualPin) {
        currentLat = pos.coords.latitude;
        currentLon = pos.coords.longitude;
        
        if (lastRoutedLat && lastRoutedLon) {
          routeTo(lastRoutedLat, lastRoutedLon);
        }
      }
    },
    (error) => {

    },
    {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 5000
    }
  );
}

// sidebar toggle
menu.addEventListener("click", () => {
  const isActive = cafeList.classList.contains("active");
  
  if (!isActive) {
    cafeList.classList.add("opening");
    cafeList.classList.add("active");
    cafeList.classList.remove("closing");
   
    setTimeout(() => cafeList.classList.remove("opening"), 300);
  } else {
    cafeList.classList.add("closing");
    cafeList.classList.remove("opening");
    setTimeout(() => {
      cafeList.classList.remove("active");
      cafeList.classList.remove("closing");
    }, 300);
  }
});

// set current location (when location access granted)
function setLocation(lat, lon, zoom = false, isManual = false) {
  currentLat = lat;
  currentLon = lon;

  if (isManual) {
    isManualPin = true;
  }

  // Preserve routing to cafe if active
  const wasRoutedToCafe = lastRoutedLat && lastRoutedLon;
  const cachedCafeLat = lastRoutedLat;
  const cachedCafeLon = lastRoutedLon;

  if (locationMarker) map.removeLayer(locationMarker);

  locationMarker = L.marker([lat, lon], { draggable: false })
    .addTo(map)
    .bindPopup("Current Location", { 
      closeButton: false,
      maxWidth: 150,
      minWidth: 50,
    })
    .openPopup();

  if (zoom) map.setView([lat, lon], 20);

  loadCafes();
  
  if (wasRoutedToCafe) {
    setTimeout(() => {
      routeTo(cachedCafeLat, cachedCafeLon);
    }, 500);
  }
}

// pin location on map click (manual)
map.on("click", (pin) => {
  document.getElementById("map").classList.add("pinning");
  
  isManualPin = true;
  
  const wasRoutedToCafe = lastRoutedLat && lastRoutedLon;
  const cachedCafeLat = lastRoutedLat;
  const cachedCafeLon = lastRoutedLon;
  
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }
  
  setLocation(pin.latlng.lat, pin.latlng.lng, true);
  
  if (wasRoutedToCafe) {
    setTimeout(() => {
      routeTo(cachedCafeLat, cachedCafeLon);
    }, 500);
  } else {
    lastRoutedLat = null;
    lastRoutedLon = null;
  }
  
  setTimeout(() => {
    document.getElementById("map").classList.remove("pinning");
  }, 300);
});

map.on("dragstart", () => {
  document.getElementById("map").classList.add("dragging");
});

map.on("dragend", () => {
  document.getElementById("map").classList.remove("dragging");
});

// search location
async function performSearch() {
  const query = searchInput.value.trim();
  if (!query) return alert("Please enter a location.");

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: {
      "Accept": "application/json"
    }
  });

  const data = await res.json();
  if (!data.length) return alert("Location not found.");

  setLocation(parseFloat(data[0].lat), parseFloat(data[0].lon), true, true);
}

searchBtn.addEventListener("click", performSearch);

searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    performSearch();
  }
});

// use my location button
locateBtn.addEventListener("click", () => {
  isManualPin = false;
  navigator.geolocation.getCurrentPosition(
    (pos) => setLocation(pos.coords.latitude, pos.coords.longitude, true),
    () => alert("Location access denied."),
    { enableHighAccuracy: true, timeout: 5000 }
  );
});

// load cafes
async function loadCafes() {
  if (!currentLat || !currentLon) return;

  clearCafes();

  if (cafeList) {
    cafeList.innerHTML = '<p style="padding: 12px; text-align: center; color: var(--primary-color);">Loading cafes...</p>';
  }

  const cacheKey = `cafes_${currentLat.toFixed(3)}_${currentLon.toFixed(3)}`;
  const cached = localStorage.getItem(cacheKey);

  if (cached) {
    displayCafes(JSON.parse(cached));
    return;
  }

  const query = `
    [out:json];
    (
      node["amenity"="cafe"](around:3000,${currentLat},${currentLon});
      way["amenity"="cafe"](around:3000,${currentLat},${currentLon});
    );
    out center tags;
  `;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query,
  });

  const data = await res.json();
  localStorage.setItem(cacheKey, JSON.stringify(data.elements));
  displayCafes(data.elements);
}

// display cafes
function displayCafes(cafes) {
  let cafeCount = 0;
  
  if (cafeList) {
    cafeList.innerHTML = "";
  }
  
  cafes.forEach(cafe => {
    const lat = cafe.lat || cafe.center?.lat;
    const lon = cafe.lon || cafe.center?.lon;
    if (!lat || !lon) return;

    const tags = cafe.tags || {};

    if (filterState.wheelchair && tags.wheelchair !== "yes") return;
    if (filterState.openHours && !tags.opening_hours) return;
    if (filterState.outdoorSeating && tags.outdoor_seating !== "yes") return;
    if (filterState.smoking && tags.smoking !== "yes") return;
    if (filterState.toilet && tags.toilets !== "yes") return;
    if (filterState.card && tags.payment_cards !== "yes") return;

    const name = tags.name || "Unnamed Cafe";

    const marker = L.marker([lat, lon]).addTo(map);
    marker._icon.classList.add("cafe-marker");
    cafeMarkers.push(marker);

    marker.bindPopup(`
      <div style="text-align: center; color: var(--primary-color);">
        <b>${name}</b><br>
        <small>${tags.opening_hours || "Business hours not available."}</small><br>
        <button class="route-btn" onclick="routeToFromMarker(${lat}, ${lon})" data-route-lat="${lat}" data-route-lon="${lon}" style="background-color: var(--accent-color);">Get Route</button>
        <button class="route-btn" onclick="unroute()" style="background-color: var(--accent-color);">Unroute</button>
      </div>
    `, { closeButton: false });

    if (cafeList) {
      const card = document.createElement("div")
      card.className = "cafe-card";
      card.dataset.lat = lat;
      card.dataset.lon = lon;
     
      const formatValue = (value) => {
        if (!value || value === "unknown") return "N/A";
        if (value === "yes") return "Yes";
        if (value === "no") return "No";
        if (value === "limited") return "Limited";
        return value;
      };
      
      card.innerHTML = `
        <h4>${name}</h4>
        <p><strong>Business Hours:</strong> ${tags.opening_hours || "N/A"}</p>
        <p><strong>Accepts Cards:</strong> ${formatValue(tags.payment_cards)}</p>
        <p><strong>Wheelchair:</strong> ${formatValue(tags.wheelchair)}</p>
        <p><strong>Outdoor Seating:</strong> ${formatValue(tags.outdoor_seating)}</p>
        <p><strong>Smoking Area:</strong> ${formatValue(tags.smoking)}</p>
        <p><strong>Toilet:</strong> ${formatValue(tags.toilets)}</p>
      `;
      
      card.onclick = () => {
        if (activeCafeCard === card) {
          unroute();
        } else {
          document.querySelectorAll(".cafe-card").forEach(c => c.classList.remove("active"));
          card.classList.add("active");
          activeCafeCard = card;
          routeTo(lat, lon);
        }
      };
      
      if (lastRoutedLat === lat && lastRoutedLon === lon) {
        card.classList.add("active");
        activeCafeCard = card;
      }
      
      cafeList.appendChild(card);
      cafeCount++;
    }
  });
  
  if (cafeCount === 0 && cafeList) {
    const hasFilters = Object.values(filterState).some(val => val === true);
    const emptyMessage = hasFilters 
      ? "No cafes match your filters. Try adjusting them."
      : "No cafes found in this area.";
    
    cafeList.innerHTML = `<p style="padding: 12px; text-align: center; color: var(--primary-color);">${emptyMessage}</p>`;
  }
  
  if (cafeList && !cafeList.classList.contains("active")) {
    cafeList.classList.add("opening");
    cafeList.classList.add("active");
    cafeList.classList.remove("closing");
    setTimeout(() => cafeList.classList.remove("opening"), 300);
  }
  
  hideLoadingScreen();
}

function hideLoadingScreen() {
  if (loadingScreen) {
    loadingScreen.classList.add("hidden");
  }
}

// routing
window.routeToFromMarker = function(lat, lon) {
  const cafeCards = document.querySelectorAll(".cafe-card");
  cafeCards.forEach(card => {
    const cardText = card.innerHTML;
    const cardLat = parseFloat(card.dataset.lat || 0);
    const cardLon = parseFloat(card.dataset.lon || 0);
    
    if (Math.abs(cardLat - lat) < 0.0001 && Math.abs(cardLon - lon) < 0.0001) {
      document.querySelectorAll(".cafe-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      activeCafeCard = card;
    }
  });
  
  updateRouteButtonColors(lat, lon);
  routeTo(lat, lon);
};

window.routeTo = function(lat, lon) {
  lastRoutedLat = lat;
  lastRoutedLon = lon;
  
  if (routingControl) map.removeControl(routingControl);

  const routeFromLat = currentLat || 14.5995;
  const routeFromLon = currentLon || 120.9842;
  
  routingControl = L.Routing.control({
    waypoints: [
      L.latLng(routeFromLat, routeFromLon),
      L.latLng(lat, lon),
    ],
    show: false,
  }).addTo(map);
};

window.unroute = function() {
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }
  
  const prevLat = lastRoutedLat;
  const prevLon = lastRoutedLon;
  lastRoutedLat = null;
  lastRoutedLon = null;
  
  if (activeCafeCard) {
    activeCafeCard.classList.remove("active");
    activeCafeCard = null;
  }
  
  document.querySelectorAll(".cafe-card").forEach(c => c.classList.remove("active"));
  
  if (prevLat !== null && prevLon !== null) {
    resetRouteButtonColor(prevLat, prevLon);
  }
};

// helpers
function updateRouteButtonColors(lat, lon) {
  const buttons = document.querySelectorAll("button[data-route-lat]");
  buttons.forEach(btn => {
    const btnLat = parseFloat(btn.dataset.routeLat);
    const btnLon = parseFloat(btn.dataset.routeLon);
    if (Math.abs(btnLat - lat) < 0.0001 && Math.abs(btnLon - lon) < 0.0001) {
      btn.style.backgroundColor = "var(--primary-color)";
    } else {
      btn.style.backgroundColor = "var(--accent-color)";
    }
  });
}

function resetRouteButtonColor(lat, lon) {
  const buttons = document.querySelectorAll("button[data-route-lat]");
  buttons.forEach(btn => {
    const btnLat = parseFloat(btn.dataset.routeLat);
    const btnLon = parseFloat(btn.dataset.routeLon);
    if (Math.abs(btnLat - lat) < 0.0001 && Math.abs(btnLon - lon) < 0.0001) {
      btn.style.backgroundColor = "var(--accent-color)";
    }
  });
}

function clearCafes() {
  cafeMarkers.forEach(m => map.removeLayer(m));
  cafeMarkers = [];
}

// filter refresh
if (Wheelchair) {
  Wheelchair.onclick = () => {
    filterState.wheelchair = !filterState.wheelchair;
    Wheelchair.classList.toggle("active");
    loadCafes();
  };
}
if (OpenHours) {
  OpenHours.onclick = () => {
    filterState.openHours = !filterState.openHours;
    OpenHours.classList.toggle("active");
    loadCafes();
  };
}
if (OutdoorSeating) {
  OutdoorSeating.onclick = () => {
    filterState.outdoorSeating = !filterState.outdoorSeating;
    OutdoorSeating.classList.toggle("active");
    loadCafes();
  };
}
if (Smoking) {
  Smoking.onclick = () => {
    filterState.smoking = !filterState.smoking;
    Smoking.classList.toggle("active");
    loadCafes();
  };
}
if (Toilet) {
  Toilet.onclick = () => {
    filterState.toilet = !filterState.toilet;
    Toilet.classList.toggle("active");
    loadCafes();
  };
}
if (Card) {
  Card.onclick = () => {
    filterState.card = !filterState.card;
    Card.classList.toggle("active");
    loadCafes();
  };
}
