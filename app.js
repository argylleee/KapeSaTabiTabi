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
let routingDirectionsVisible = false;

// ui elements
const cafeList = document.getElementById("cafeList");
const menu = document.getElementById("menu");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const locateBtn = document.getElementById("locateBtn");
const loadingScreen = document.getElementById("loadingScreen");
const cafeSearchInput = document.getElementById("cafeSearchInput");
const cafeSearchSection = document.querySelector(".cafe-search");

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

let allCafes = [];

function isMobileScreen() {
  return window.innerWidth <= 410;
}

let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

setInterval(() => {
  const container = document.querySelector('.leaflet-routing-container');
  if (container && !container.dataset.clickSetup) {
    container.onclick = (e) => {
      if (container.classList.contains('leaflet-routing-container-hidden')) {
        toggleRoutingDirections();
      }
    };
    container.dataset.clickSetup = 'true';
  }
}, 100);

function attachDragListeners() {
  const routingContainer = document.querySelector('.leaflet-routing-container');
  if (routingContainer && !routingContainer.dataset.dragHandlerAdded) {
    routingContainer.addEventListener('pointerdown', startDrag, { capture: false });
    routingContainer.dataset.dragHandlerAdded = 'true';
  }
}

function startDrag(e) {
  const routingContainer = document.querySelector('.leaflet-routing-container');
  if (!isMobileScreen()) return;
  if (!routingContainer.classList.contains('leaflet-routing-container-hidden')) return;
  
  isDragging = true;
  const rect = routingContainer.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;
  
  routingContainer.style.transition = 'none';
  routingContainer.style.zIndex = '99999';
  
  document.addEventListener('pointermove', drag);
  document.addEventListener('pointerup', stopDrag);
}

function drag(e) {
  if (!isDragging) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  const routingContainer = document.querySelector('.leaflet-routing-container');
  let clientX, clientY;
  
  if (e.touches) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  
  const newX = clientX - dragOffsetX;
  const newY = clientY - dragOffsetY;
  
  const maxX = window.innerWidth - 56;
  const maxY = window.innerHeight - 56;
  
  const constrainedX = Math.max(0, Math.min(newX, maxX));
  const constrainedY = Math.max(0, Math.min(newY, maxY));
  
  routingContainer.style.left = constrainedX + 'px';
  routingContainer.style.top = constrainedY + 'px';
  routingContainer.style.right = 'auto';
  routingContainer.style.bottom = 'auto';
}

function stopDrag() {
  isDragging = false;
  const routingContainer = document.querySelector('.leaflet-routing-container');
  routingContainer.style.transition = 'all 300ms ease';
  routingContainer.style.zIndex = '99998';
  
  document.removeEventListener('pointermove', drag);
  document.removeEventListener('pointerup', stopDrag);
}

function filterCafes(searchTerm) {
  const term = searchTerm.toLowerCase();
  const cafeCards = document.querySelectorAll(".cafe-card");
  
  cafeCards.forEach(card => {
    const cafeName = card.querySelector("h4").textContent.toLowerCase();
    if (cafeName.includes(term)) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }
  });
}

if (cafeSearchInput) {
  cafeSearchInput.addEventListener("input", (e) => {
    filterCafes(e.target.value);
  });
}

// initial location fetch
navigator.geolocation.getCurrentPosition(
  (pos) => {
    setLocation(pos.coords.latitude, pos.coords.longitude, true);
    startRealTimeTracking();
  },
  (error) => {
    setLocation(14.5995, 120.9842, true); // if location access denied, fallback to Manila
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
  
  if (!isActive && routingDirectionsVisible && isMobileScreen()) {
    toggleRoutingDirections();
  }
  
  if (!isActive) {
    cafeList.classList.add("opening");
    cafeList.classList.add("active");
    cafeList.classList.remove("closing");
    cafeSearchSection.classList.add("opening");
    cafeSearchSection.classList.add("active");
    cafeSearchSection.classList.remove("closing");
   
    setTimeout(() => {
      cafeList.classList.remove("opening");
      cafeSearchSection.classList.remove("opening");
    }, 300);
  } else {
    cafeList.classList.add("closing");
    cafeList.classList.remove("opening");
    cafeSearchSection.classList.add("closing");
    cafeSearchSection.classList.remove("opening");
    setTimeout(() => {
      cafeList.classList.remove("active");
      cafeList.classList.remove("closing");
      cafeSearchSection.classList.remove("active");
      cafeSearchSection.classList.remove("closing");
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
    cafeSearchSection.classList.add("active");
    if (cafeSearchInput) cafeSearchInput.value = "";
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
    router: L.Routing.osrmv1({
      serviceUrl: 'https://router.project-osrm.org/route/v1'
    }),
    show: routingDirectionsVisible,
    lineOptions: {
      styles: [{ color: 'var(--primary-color)', opacity: 0.8, weight: 5 }]
    }
  }).on('routingerror', function(e) {
    console.error('Routing error:', e);
    alert('Could not calculate route. Distance might be too far or no route available.');
  }).addTo(map);

  setTimeout(() => {
    const routingContainer = document.querySelector('.leaflet-routing-container');
    if (routingContainer) {
      if (!routingDirectionsVisible) {
        routingContainer.classList.add('leaflet-routing-container-hidden');
      } else {
        routingContainer.classList.remove('leaflet-routing-container-hidden');
        if (!routingContainer.querySelector('.leaflet-routing-close')) {
          const closeBtn = document.createElement('button');
          closeBtn.className = 'leaflet-routing-close';
          closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
          closeBtn.onclick = (e) => {
            e.stopPropagation();
            toggleRoutingDirections();
          };
          routingContainer.appendChild(closeBtn);
        }
      }
      
      if (!routingContainer.dataset.clickHandlerAdded) {
        routingContainer.addEventListener('click', (e) => {
          if (routingContainer.classList.contains('leaflet-routing-container-hidden')) {
            e.stopPropagation();
            toggleRoutingDirections();
          }
        }, { capture: true });
        
        routingContainer.dataset.clickHandlerAdded = 'true';
      }

      attachDragListeners();
    }
  }, 300);
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
  Wheelchair.onclick = function() {
    filterState.wheelchair = !filterState.wheelchair;
    this.classList.toggle("active");
    this.blur();
    loadCafes();
  };
}
if (OpenHours) {
  OpenHours.onclick = function() {
    filterState.openHours = !filterState.openHours;
    this.classList.toggle("active");
    this.blur();
    loadCafes();
  };
}
if (OutdoorSeating) {
  OutdoorSeating.onclick = function() {
    filterState.outdoorSeating = !filterState.outdoorSeating;
    this.classList.toggle("active");
    this.blur();
    loadCafes();
  };
}
if (Smoking) {
  Smoking.onclick = function() {
    filterState.smoking = !filterState.smoking;
    this.classList.toggle("active");
    this.blur();
    loadCafes();
  };
}
if (Toilet) {
  Toilet.onclick = function() {
    filterState.toilet = !filterState.toilet;
    this.classList.toggle("active");
    this.blur();
    loadCafes();
  };
}
if (Card) {
  Card.onclick = function() {
    filterState.card = !filterState.card;
    this.classList.toggle("active");
    this.blur();
    loadCafes();
  };
}

// filter scroll buttons
const filterScrollLeft = document.getElementById("filterScrollLeft");
const filterScrollRight = document.getElementById("filterScrollRight");
const filtersContainer = document.getElementById("filters");

function updateFilterScrollButtonVisibility() {
  if (!filtersContainer) return;
  
  const scrollLeft = filtersContainer.scrollLeft;
  const scrollWidth = filtersContainer.scrollWidth;
  const clientWidth = filtersContainer.clientWidth;
  
  if (filterScrollLeft) {
    if (scrollLeft === 0) {
      filterScrollLeft.classList.add("hidden");
    } else {
      filterScrollLeft.classList.remove("hidden");
    }
  }
  
  if (filterScrollRight) {
    if (scrollLeft + clientWidth >= scrollWidth - 1) {
      filterScrollRight.classList.add("hidden");
    } else {
      filterScrollRight.classList.remove("hidden");
    }
  }
}

if (filterScrollLeft && filtersContainer) {
  filterScrollLeft.addEventListener("click", () => {
    filtersContainer.scrollBy({
      left: -200,
      behavior: "smooth"
    });
    setTimeout(updateFilterScrollButtonVisibility, 300);
  });
}

if (filterScrollRight && filtersContainer) {
  filterScrollRight.addEventListener("click", () => {
    filtersContainer.scrollBy({
      left: 200,
      behavior: "smooth"
    });
    setTimeout(updateFilterScrollButtonVisibility, 300);
  });
}

if (filtersContainer) {
  filtersContainer.addEventListener("scroll", updateFilterScrollButtonVisibility);

  setTimeout(updateFilterScrollButtonVisibility, 100);
}

function toggleRoutingDirections() {
  routingDirectionsVisible = !routingDirectionsVisible;
  
  if (routingDirectionsVisible && cafeList.classList.contains("active") && isMobileScreen()) {
    cafeList.classList.add("closing");
    cafeList.classList.remove("opening");
    cafeSearchSection.classList.add("closing");
    cafeSearchSection.classList.remove("opening");
    setTimeout(() => {
      cafeList.classList.remove("active");
      cafeList.classList.remove("closing");
      cafeSearchSection.classList.remove("active");
      cafeSearchSection.classList.remove("closing");
    }, 300);
  }
  
  if (routingControl) {
    const container = document.querySelector('.leaflet-routing-container');
    
    if (routingDirectionsVisible) {
      routingControl.show();
      if (container) {
        container.classList.remove('leaflet-routing-container-hidden');
        if (!container.querySelector('.leaflet-routing-close')) {
          const closeBtn = document.createElement('button');
          closeBtn.className = 'leaflet-routing-close';
          closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
          closeBtn.onclick = (e) => {
            e.stopPropagation();
            toggleRoutingDirections();
          };
          container.appendChild(closeBtn);
        }
      }
    } else {
      routingControl.hide();
      if (container) {
        container.classList.add('leaflet-routing-container-hidden');
        const closeBtn = container.querySelector('.leaflet-routing-close');
        if (closeBtn) closeBtn.remove();
      }
    }
  }
}