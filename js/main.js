import { dom } from "./dom.js";
import { initMap, wireLocateButton, startInitialLocation } from "./map.js";
import { initFilters } from "./filters.js";
import { initSort } from "./sort.js";
import { initSheet } from "./sheet.js";
import { initSearch } from "./search.js";
import "./routing.js"; // attaches window.routeTo/unroute/routeToFromMarker for popup buttons

initMap();
wireLocateButton(dom);
initFilters();
initSort();
initSheet();
initSearch();
startInitialLocation();
