export const state = {
  currentLat: null,
  currentLon: null,
  locationMarker: null,
  cafeMarkers: [],
  routingControl: null,
  lastRoutedLat: null,
  lastRoutedLon: null,
  watchPositionId: null,
  activeCafeCard: null,
  isManualPin: false,
  routingDirectionsVisible: false,
  allPlaces: [],
  sortMode: "distance", // 'distance' | 'rating' | 'open'
  travelMode: "drive", // 'drive' | 'walk'
};

export const filterState = {
  wheelchair: false,
  openHours: false,
  outdoorSeating: false,
  toilet: false,
  card: false,
  topRated: false,
  saved: false,
};
