
"use strict";

/* =========================================================
   OPENMAP — INTERACTIVE OPENSTREETMAP CASE STUDY
   APIs:
   1. Leaflet.js
   2. OpenStreetMap map tiles
   3. Nominatim search and reverse geocoding
   4. Overpass API for nearby places
   5. Browser Geolocation API
   6. Google Maps directions
========================================================= */

const $ = (id) => document.getElementById(id);

const elements = {
  map: $("map"),
  searchForm: $("searchForm"),
  searchInput: $("searchInput"),
  locateBtn: $("locateBtn"),
  refreshBtn: $("refreshBtn"),
  recenterBtn: $("recenterBtn"),
  radiusSlider: $("radiusSlider"),
  radiusValue: $("radiusValue"),
  categoryList: $("categoryList"),
  placesList: $("placesList"),
  savedList: $("savedList"),
  savedCount: $("savedCount"),
  resultsCount: $("resultsCount"),
  resultsHeading: $("resultsHeading"),
  resultsDescription: $("resultsDescription"),
  mapStatus: $("mapStatus"),
  mapSubtitle: $("mapSubtitle"),
  mapLoading: $("mapLoading"),
  layerSelect: $("layerSelect"),
  toast: $("toast"),
  placeModal: $("placeModal"),
  closeModalBtn: $("closeModalBtn"),
  modalCategoryIcon: $("modalCategoryIcon"),
  modalCategory: $("modalCategory"),
  modalTitle: $("modalTitle"),
  modalAddress: $("modalAddress"),
  modalLat: $("modalLat"),
  modalLon: $("modalLon"),
  directionsBtn: $("directionsBtn"),
  savePlaceBtn: $("savePlaceBtn")
};

const DEFAULT_CENTER = [21.84, 82.79];
const DEFAULT_ZOOM = 5;

const NOMINATIM_SEARCH_URL =
  "https://nominatim.openstreetmap.org/search";

const NOMINATIM_REVERSE_URL =
  "https://nominatim.openstreetmap.org/reverse";


const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];


const STORAGE_KEY = "openmap_saved_places_v1";

const CATEGORY_INFO = {
  all: {
    label: "All places",
    icon: "✦"
  },
  cafe: {
    label: "Cafés",
    icon: "☕"
  },
  restaurant: {
    label: "Restaurants",
    icon: "♨"
  },
  shop: {
    label: "Shops",
    icon: "⌂"
  },
  park: {
    label: "Parks",
    icon: "♧"
  },
  pharmacy: {
    label: "Pharmacies",
    icon: "＋"
  },
  atm: {
    label: "ATMs",
    icon: "₹"
  },
  other: {
    label: "Other places",
    icon: "●"
  }
};

const TILE_LAYERS = {
  standard: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    maxZoom: 19
  },
  humanitarian: {
    url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    attribution: '&copy; OpenStreetMap contributors, Tiles style by HOT',
    maxZoom: 19
  },
  topographic: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; OpenStreetMap contributors, SRTM | Map style: OpenTopoMap',
    maxZoom: 17
  }
};

let map;
let tileLayer;
let locationMarker = null;
let userMarker = null;
let searchCircle = null;

let markerLayer = null;
let selectedPlace = null;
let currentLocation = null;
let currentAddress = "";
let activeCategory = "all";

let allPlaces = [];
let visiblePlaces = [];

let loadingRequestId = 0;
let toastTimer = null;
let lastSearchTerm = "";

/* =========================================================
   INITIALIZATION
========================================================= */

function init() {
  if (!window.L) {
    setStatus("The map library could not load. Check your internet connection.");
    return;
  }

  initializeMap();
  bindEvents();
  renderSavedPlaces();

  updateRadiusLabel();

  setStatus("Search for a place or use your location to begin.");
}

function initializeMap() {
  map = L.map("map", {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  tileLayer = L.tileLayer(TILE_LAYERS.standard.url, {
    attribution: TILE_LAYERS.standard.attribution,
    maxZoom: TILE_LAYERS.standard.maxZoom,
    subdomains: ["a", "b", "c"]
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);

  map.on("click", () => {
    // Map clicks do not automatically trigger geocoding.
    // The user can search or use the location button instead.
  });
}

/* =========================================================
   EVENT LISTENERS
========================================================= */

function bindEvents() {
  elements.searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const query = elements.searchInput.value.trim();

    if (!query) {
      showToast("Enter a place or address to search.");
      elements.searchInput.focus();
      return;
    }

    await searchLocation(query);
  });

  elements.locateBtn.addEventListener("click", getCurrentLocation);

  elements.refreshBtn.addEventListener("click", async () => {
    if (!currentLocation) {
      showToast("Search for a location or use your GPS first.");
      return;
    }

    await loadNearbyPlaces();
  });

  elements.recenterBtn.addEventListener("click", recenterMap);

  elements.radiusSlider.addEventListener("input", updateRadiusLabel);

  elements.radiusSlider.addEventListener("change", async () => {
    if (currentLocation) {
      await loadNearbyPlaces();
    }
  });

  elements.categoryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");

    if (!button) return;

    activeCategory = button.dataset.category;

    elements.categoryList
      .querySelectorAll(".category-button")
      .forEach((item) => {
        const isActive = item === button;

        item.classList.toggle("active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });

    renderPlaces();
  });

  elements.layerSelect.addEventListener("change", changeMapLayer);

  elements.closeModalBtn.addEventListener("click", closePlaceModal);

  elements.placeModal.addEventListener("click", (event) => {
    if (event.target === elements.placeModal) {
      closePlaceModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePlaceModal();
    }
  });

  elements.directionsBtn.addEventListener("click", () => {
    if (selectedPlace) {
      openPlaceDirections(selectedPlace);
    }
  });

  elements.savePlaceBtn.addEventListener("click", () => {
    if (selectedPlace) {
      toggleSavedPlace(selectedPlace);
      updateModalSaveButton();
    }
  });

  elements.placesList.addEventListener("click", handlePlaceListClick);

  elements.savedList.addEventListener("click", handleSavedListClick);
}

/* =========================================================
   STATUS AND NOTIFICATIONS
========================================================= */

function setStatus(message) {
  elements.mapStatus.textContent = message;
}

function setLoading(isLoading) {
  elements.mapLoading.hidden = !isLoading;
  elements.refreshBtn.disabled = isLoading;
  elements.locateBtn.disabled = isLoading;
}

function showToast(message) {
  clearTimeout(toastTimer);

  elements.toast.textContent = message;
  elements.toast.classList.add("visible");

  toastTimer = setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 3000);
}

function updateRadiusLabel() {
  const radius = Number(elements.radiusSlider.value);

  elements.radiusValue.textContent =
    radius >= 1000
      ? `${Number((radius / 1000).toFixed(1))} km`
      : `${radius} m`;
}

/* =========================================================
   NOMINATIM: SEARCH A LOCATION
   Search is only sent after the user submits the form.
========================================================= */

async function searchLocation(query) {
  const requestId = ++loadingRequestId;

  lastSearchTerm = query;
  setStatus(`Searching for "${query}"…`);
  setLoading(true);

  try {
    const url = new URL(NOMINATIM_SEARCH_URL);

    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "Accept-Language": "en"
      }
    });

    if (!response.ok) {
      throw new Error("Location search is temporarily unavailable.");
    }

    const results = await response.json();

    if (requestId !== loadingRequestId) return;

    if (!results.length) {
      setStatus("No matching location found. Try a different search.");
      showToast("No results found.");
      return;
    }

    const result = results[0];
    const lat = Number(result.lat);
    const lon = Number(result.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error("The location result did not contain valid coordinates.");
    }

    currentLocation = {
      lat,
      lon,
      source: "search"
    };

    currentAddress = result.display_name || query;

    map.setView([lat, lon], 15);
    setLocationMarker(lat, lon, currentAddress);

    updateMapSubtitle(currentAddress);
    setStatus(`Showing results around ${shortenAddress(currentAddress)}.`);

    await loadNearbyPlaces();
  } catch (error) {
    if (requestId === loadingRequestId) {
      console.error("Location search failed:", error);
      setStatus(error.message || "Could not search for this location.");
      showToast("Search failed. Please try again.");
    }
  } finally {
    if (requestId === loadingRequestId) {
      setLoading(false);
    }
  }
}

/* =========================================================
   BROWSER GEOLOCATION + NOMINATIM REVERSE GEOCODING
========================================================= */

function getCurrentLocation() {
  if (!navigator.geolocation) {
    setStatus("Your browser does not support geolocation.");
    showToast("Geolocation is not supported by this browser.");
    return;
  }

  const previousRequestId = ++loadingRequestId;

  setLoading(true);
  setStatus("Requesting your current location…");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      if (previousRequestId !== loadingRequestId) return;

      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      currentLocation = {
        lat,
        lon,
        source: "gps"
      };

      map.setView([lat, lon], 16);
      setUserMarker(lat, lon);

      // Show the GPS position immediately, even if reverse geocoding fails.
      setLocationMarker(lat, lon, "Your current location");

      currentAddress = "Your current location";
      updateMapSubtitle(currentAddress);
      setStatus("Location found. Looking up the area…");

      try {
        const addressData = await reverseGeocode(lat, lon);

        if (previousRequestId !== loadingRequestId) return;

        if (addressData) {
          currentAddress = addressData.name || addressData.fullAddress;
          setLocationMarker(lat, lon, currentAddress);
          updateMapSubtitle(currentAddress);
          setStatus(`Your location: ${shortenAddress(currentAddress)}.`);
        } else {
          setStatus("GPS location found. Area name is unavailable.");
        }
      } catch (error) {
        console.warn("Reverse geocoding failed:", error);
        setStatus("GPS location found, but the address could not be retrieved.");
      }

      if (previousRequestId !== loadingRequestId) return;

      await loadNearbyPlaces();
    },
    (error) => {
      if (previousRequestId !== loadingRequestId) return;

      let message = "Could not get your current location.";

      if (error.code === error.PERMISSION_DENIED) {
        message = "Location access was denied. Allow location permission or search manually.";
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        message = "Your current position is unavailable. Try again or search manually.";
      } else if (error.code === error.TIMEOUT) {
        message = "Location request timed out. Please try again.";
      }

      setStatus(message);
      showToast(message);
      setLoading(false);
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000
    }
  );
}

async function reverseGeocode(lat, lon) {
  const url = new URL(NOMINATIM_REVERSE_URL);

  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "16");

  const response = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "Accept-Language": "en"
    }
  });

  if (!response.ok) {
    throw new Error("Reverse geocoding request failed.");
  }

  const data = await response.json();
  const address = data.address || {};

  const area =
    address.suburb ||
    address.neighbourhood ||
    address.residential ||
    address.quarter ||
    address.village ||
    address.town ||
    address.city ||
    address.county ||
    "";

  const city =
    address.city ||
    address.town ||
    address.municipality ||
    address.state_district ||
    "";

  const state = address.state || "";
  const country = address.country || "";

  const name = [area, city !== area ? city : ""]
    .filter(Boolean)
    .join(", ");

  return {
    name: name || data.name || "",
    fullAddress: data.display_name || "",
    area,
    city,
    state,
    country,
    postcode: address.postcode || "",
    latitude: lat,
    longitude: lon
  };
}

/* =========================================================
   MAP MARKERS AND MAP NAVIGATION
========================================================= */

function setLocationMarker(lat, lon, label) {
  if (locationMarker) {
    map.removeLayer(locationMarker);
  }

  locationMarker = L.marker([lat, lon], {
    title: label || "Selected location",
    zIndexOffset: 1000
  }).addTo(map);

  locationMarker.bindPopup(
    `<strong>${escapeHTML(label || "Selected location")}</strong>`
  );

  if (searchCircle) {
    map.removeLayer(searchCircle);
  }

  searchCircle = L.circle([lat, lon], {
    radius: Number(elements.radiusSlider.value),
    color: "#237a57",
    weight: 1,
    opacity: 0.6,
    fillColor: "#5eb781",
    fillOpacity: 0.06,
    interactive: false
  }).addTo(map);
}

function setUserMarker(lat, lon) {
  if (userMarker) {
    map.removeLayer(userMarker);
  }

  const icon = L.divIcon({
    className: "",
    html: '<div class="user-marker"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });

  userMarker = L.marker([lat, lon], {
    icon,
    title: "Your GPS location",
    zIndexOffset: 1200
  }).addTo(map);

  userMarker.bindPopup("<strong>Your current location</strong>");
}

function recenterMap() {
  if (!currentLocation) {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    showToast("Search for a place or use your location first.");
    return;
  }

  map.setView(
    [currentLocation.lat, currentLocation.lon],
    Math.max(map.getZoom(), 14)
  );

  if (searchCircle) {
    searchCircle.setRadius(Number(elements.radiusSlider.value));
  }
}

function updateMapSubtitle(address) {
  elements.mapSubtitle.textContent =
    shortenAddress(address || "Selected location");
}

function changeMapLayer() {
  const selectedLayer = elements.layerSelect.value;
  const config = TILE_LAYERS[selectedLayer];

  if (!config) return;

  if (tileLayer) {
    map.removeLayer(tileLayer);
  }

  tileLayer = L.tileLayer(config.url, {
    attribution: config.attribution,
    maxZoom: config.maxZoom,
    subdomains: ["a", "b", "c"]
  }).addTo(map);

  tileLayer.on("tileerror", () => {
    setStatus("Some map tiles could not load. Try another map style.");
  });

  showToast(`${elements.layerSelect.options[elements.layerSelect.selectedIndex].text} map selected.`);
}

/* =========================================================
   OVERPASS API: FIND NEARBY PLACES
========================================================= */

async function loadNearbyPlaces() {
  if (!currentLocation) {
    setStatus("Search for a location or use your GPS first.");
    return;
  }

  const requestId = ++loadingRequestId;
  const { lat, lon } = currentLocation;
  const radius = Number(elements.radiusSlider.value);

  setLoading(true);
  setStatus("Searching for nearby places...");
  elements.resultsDescription.textContent =
    "Connecting to OpenStreetMap...";

  if (searchCircle) {
    searchCircle.setLatLng([lat, lon]);
    searchCircle.setRadius(radius);
  }

  // Search for common places using their OpenStreetMap tags.
  const query = `
    [out:json][timeout:25];
    (
      nwr(around:${radius},${lat},${lon})["amenity"~"^(cafe|restaurant|fast_food|food_court|ice_cream|pub|bar|pharmacy|atm|bank|hospital|clinic|doctors|library|school|university|fuel|post_office|marketplace)$"];
      nwr(around:${radius},${lat},${lon})["shop"];
      nwr(around:${radius},${lat},${lon})["leisure"~"^(park|garden|playground|sports_centre)$"];
      nwr(around:${radius},${lat},${lon})["tourism"~"^(attraction|museum|gallery|viewpoint|hotel|guest_house)$"];
    );
    out center tags;
  `;

  try {
    const data = await requestOverpass(query);

    // Ignore results from an older search.
    if (requestId !== loadingRequestId) return;

    const unique = new Map();

    for (const element of data.elements || []) {
      const point = getElementCoordinates(element);
      if (!point) continue;

      const tags = element.tags || {};
      const distance = calculateDistance(
        lat,
        lon,
        point.lat,
        point.lon
      );

      // Guard against unexpected results outside the selected radius.
      if (!Number.isFinite(distance) ||
          distance > radius / 1000 + 0.001) {
        continue;
      }

      const place = {
        id: `${element.type}-${element.id}`,
        osmType: element.type,
        osmId: element.id,
        lat: point.lat,
        lon: point.lon,
        name: getPlaceName(tags),
        tags,
        category: classifyPlace(tags),
        typeLabel: getPlaceTypeLabel(tags),
        address: getAddressFromTags(tags),
        distance
      };

      unique.set(place.id, place);
    }

    allPlaces = Array.from(unique.values())
      .sort((a, b) => a.distance - b.distance);

    renderPlaces();
    renderMapMarkers();

    const radiusText = radius >= 1000
      ? `${(radius / 1000).toFixed(1)} km`
      : `${radius} m`;

    if (allPlaces.length > 0) {
      setStatus(
        `Found ${allPlaces.length} places within ${radiusText}.`
      );

      elements.resultsDescription.textContent =
        `Showing mapped places within ${radiusText}. ` +
        "Distances are approximate straight-line distances.";
    } else {
      setStatus(
        `No mapped places found within ${radiusText}.`
      );

      elements.resultsDescription.textContent =
        "No places were returned for this area. Try increasing " +
        "the radius or searching a nearby landmark.";
    }
  } catch (error) {
    if (requestId !== loadingRequestId) return;

    console.error("Nearby places request failed:", error);

    elements.resultsDescription.textContent =
      "The map service could not return nearby places.";

    setStatus(
      "OpenStreetMap's nearby places service is unavailable. Please retry."
    );

    showToast(
      "Could not load nearby places. Try again in a moment."
    );
  } finally {
    if (requestId === loadingRequestId) {
      setLoading(false);
    }
  }
}


async function requestOverpass(query) {
  let lastError = null;

  for (const endpoint of OVERPASS_URLS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      30000
    );

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded;charset=UTF-8",
          "Accept": "application/json"
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(
          `Server ${endpoint} returned HTTP ${response.status}`
        );
      }

      const data = await response.json();

      if (!data || !Array.isArray(data.elements)) {
        throw new Error("Invalid response from the map service.");
      }

      return data;
    } catch (error) {
      lastError = error;

      console.warn(
        `Overpass request failed at ${endpoint}:`,
        error.message
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error(
    "All nearby-place servers failed."
  );
}

/* =========================================================
   PLACE DATA HELPERS
========================================================= */

function getElementCoordinates(element) {
  if (
    Number.isFinite(element.lat) &&
    Number.isFinite(element.lon)
  ) {
    return {
      lat: element.lat,
      lon: element.lon
    };
  }

  if (
    element.center &&
    Number.isFinite(element.center.lat) &&
    Number.isFinite(element.center.lon)
  ) {
    return {
      lat: element.center.lat,
      lon: element.center.lon
    };
  }

  return null;
}

function getPlaceName(tags) {
  return (
    tags.name ||
    tags["name:en"] ||
    tags.brand ||
    tags.operator ||
    tags.amenity ||
    tags.shop ||
    tags.leisure ||
    tags.tourism ||
    "Unnamed place"
  );
}

function classifyPlace(tags) {
  const amenity = (tags.amenity || "").toLowerCase();
  const shop = (tags.shop || "").toLowerCase();
  const leisure = (tags.leisure || "").toLowerCase();
  const tourism = (tags.tourism || "").toLowerCase();

  if (amenity === "cafe") return "cafe";

  if ([
    "restaurant",
    "fast_food",
    "food_court",
    "ice_cream",
    "pub",
    "bar"
  ].includes(amenity)) {
    return "restaurant";
  }

  if (amenity === "pharmacy" || shop === "chemist") {
    return "pharmacy";
  }

  if (amenity === "atm") {
    return "atm";
  }

  if (shop) {
    return "shop";
  }

  if ([
    "park",
    "garden",
    "playground",
    "sports_centre"
  ].includes(leisure)) {
    return "park";
  }

  if (tourism) {
    return "other";
  }

  return "other";
}


function getPlaceTypeLabel(tags) {
  const type =
    tags.amenity ||
    tags.shop ||
    tags.leisure ||
    tags.tourism ||
    "place";

  return String(type)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getAddressFromTags(tags) {
  const houseNumber = tags["addr:housenumber"] || "";
  const road = tags["addr:street"] || "";
  const neighbourhood = tags["addr:suburb"] || "";
  const city = tags["addr:city"] || "";
  const postcode = tags["addr:postcode"] || "";

  return [
    [houseNumber, road].filter(Boolean).join(" "),
    neighbourhood,
    city,
    postcode
  ].filter(Boolean).join(", ");
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees) => degrees * Math.PI / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );
}

function formatDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) return "";

  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m away`;
  }

  return `${distanceKm.toFixed(1)} km away`;
}

function shortenAddress(address) {
  if (!address) return "selected location";

  const parts = String(address)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.slice(0, 2).join(", ") || address;
}

/* =========================================================
   FILTER AND DISPLAY RESULTS
========================================================= */

function renderPlaces() {
  visiblePlaces = activeCategory === "all"
    ? [...allPlaces]
    : allPlaces.filter((place) => place.category === activeCategory);

  elements.resultsCount.textContent = String(visiblePlaces.length);
  elements.resultsHeading.textContent =
    activeCategory === "all"
      ? "Nearby places"
      : CATEGORY_INFO[activeCategory]?.label || "Nearby places";

  if (!visiblePlaces.length) {
    const message = allPlaces.length
      ? "No places in this category."
      : "No places to display yet.";

    const help = allPlaces.length
      ? "Choose another category to see more results."
      : "Search for a location or use your GPS.";

    elements.placesList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⌖</span>
        <p>${escapeHTML(message)}</p>
        <span>${escapeHTML(help)}</span>
      </div>
    `;
  } else {
    elements.placesList.innerHTML = visiblePlaces
      .slice(0, 100)
      .map(createPlaceCard)
      .join("");
  }

  renderMapMarkers();
}

function createPlaceCard(place) {
  const info = CATEGORY_INFO[place.category] || CATEGORY_INFO.other;
  const isSaved = isPlaceSaved(place.id);
  const isSelected = selectedPlace?.id === place.id;

  return `
    <article class="place-card ${isSelected ? "selected" : ""}">
      <span class="place-card-icon" aria-hidden="true">
        ${info.icon}
      </span>

      <button
        class="place-card-main"
        type="button"
        data-action="open"
        data-place-id="${escapeHTML(place.id)}"
        aria-label="View ${escapeHTML(place.name)}"
      >
        <span class="place-card-title">${escapeHTML(place.name)}</span>
        <span class="place-card-type">${escapeHTML(place.typeLabel)}</span>
        <span class="place-card-meta">${escapeHTML(formatDistance(place.distance))}</span>
      </button>

      <button
        class="mini-save ${isSaved ? "saved" : ""}"
        type="button"
        data-action="save"
        data-place-id="${escapeHTML(place.id)}"
        aria-label="${isSaved ? "Remove saved place" : "Save place"}"
        title="${isSaved ? "Remove saved place" : "Save place"}"
      >${isSaved ? "★" : "☆"}</button>
    </article>
  `;
}

function renderMapMarkers() {
  if (!map || !markerLayer) return;

  markerLayer.clearLayers();

  for (const place of visiblePlaces) {
    const info = CATEGORY_INFO[place.category] || CATEGORY_INFO.other;
    const isSelected = selectedPlace?.id === place.id;

    const icon = L.divIcon({
      className: "",
      html: `
        <div class="place-marker ${isSelected ? "selected-marker" : ""}">
          <span>${info.icon}</span>
        </div>
      `,
      iconSize: isSelected ? [38, 38] : [32, 32],
      iconAnchor: isSelected ? [19, 35] : [16, 30],
      popupAnchor: [0, -30]
    });

    const marker = L.marker([place.lat, place.lon], {
      icon,
      title: place.name
    });

    marker.bindPopup(`
      <div style="min-width:150px">
        <strong>${escapeHTML(place.name)}</strong>
        <div style="margin-top:5px;font-size:12px">
          ${escapeHTML(place.typeLabel)}
        </div>
        <div style="margin-top:5px;font-size:12px;color:#237a57">
          ${escapeHTML(formatDistance(place.distance))}
        </div>
        <button
          type="button"
          onclick="window.openMapPlace('${escapeJS(place.id)}')"
          style="margin-top:9px;padding:6px 9px;border:0;border-radius:6px;background:#237a57;color:#fff;cursor:pointer"
        >View details</button>
      </div>
    `);

    marker.on("click", () => {
      selectedPlace = place;
      renderPlaces();
    });

    markerLayer.addLayer(marker);
  }
}

function handlePlaceListClick(event) {
  const button = event.target.closest("[data-action][data-place-id]");

  if (!button) return;

  const placeId = button.dataset.placeId;
  const action = button.dataset.action;
  const place = allPlaces.find((item) => item.id === placeId);

  if (!place) return;

  if (action === "open") {
    openPlaceDetails(place);
  } else if (action === "save") {
    toggleSavedPlace(place);
    renderPlaces();
  }
}

/* =========================================================
   PLACE DETAILS MODAL
========================================================= */

function openPlaceDetails(place) {
  selectedPlace = place;

  const info = CATEGORY_INFO[place.category] || CATEGORY_INFO.other;

  elements.modalCategoryIcon.textContent = info.icon;
  elements.modalCategory.textContent = info.label.toUpperCase();
  elements.modalTitle.textContent = place.name;

  elements.modalAddress.textContent =
    place.address ||
    `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`;

  elements.modalLat.textContent = place.lat.toFixed(6);
  elements.modalLon.textContent = place.lon.toFixed(6);

  updateModalSaveButton();

  elements.placeModal.hidden = false;

  map.flyTo([place.lat, place.lon], Math.max(map.getZoom(), 16), {
    duration: 0.5
  });

  renderPlaces();
}

function closePlaceModal() {
  elements.placeModal.hidden = true;
}

function updateModalSaveButton() {
  if (!selectedPlace) return;

  const saved = isPlaceSaved(selectedPlace.id);

  elements.savePlaceBtn.textContent = saved
    ? "★ Saved — remove"
    : "☆ Save place";
}

/* Allows the map popup button to open details safely using a known place ID. */
window.openMapPlace = function (placeId) {
  const place = allPlaces.find((item) => item.id === placeId);

  if (place) {
    openPlaceDetails(place);
  }
};

/* =========================================================
   SAVED PLACES — LOCAL STORAGE
========================================================= */

function getSavedPlaces() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : [];

    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    console.warn("Could not read saved places:", error);
    return [];
  }
}

function storeSavedPlaces(places) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
    return true;
  } catch (error) {
    console.warn("Could not save places:", error);
    showToast("Your browser could not save this place.");
    return false;
  }
}

function isPlaceSaved(placeId) {
  return getSavedPlaces().some((place) => place.id === placeId);
}

function toggleSavedPlace(place) {
  const saved = getSavedPlaces();
  const alreadySaved = saved.some((item) => item.id === place.id);

  let updated;

  if (alreadySaved) {
    updated = saved.filter((item) => item.id !== place.id);
    showToast("Place removed from saved places.");
  } else {
    updated = [
      {
        id: place.id,
        name: place.name,
        lat: place.lat,
        lon: place.lon,
        category: place.category,
        typeLabel: place.typeLabel,
        address: place.address || ""
      },
      ...saved
    ];

    showToast("Place saved.");
  }

  if (storeSavedPlaces(updated)) {
    renderSavedPlaces();
  }
}

function renderSavedPlaces() {
  const saved = getSavedPlaces();

  elements.savedCount.textContent = String(saved.length);

  if (!saved.length) {
    elements.savedList.innerHTML =
      '<p class="small-muted">Places you save will appear here.</p>';
    return;
  }

  elements.savedList.innerHTML = saved
    .map((place) => `
      <div class="saved-place">
        <button
          class="saved-place-open"
          type="button"
          data-saved-action="open"
          data-place-id="${escapeHTML(place.id)}"
        >★ ${escapeHTML(place.name)}</button>

        <button
          class="saved-place-remove"
          type="button"
          data-saved-action="remove"
          data-place-id="${escapeHTML(place.id)}"
          aria-label="Remove ${escapeHTML(place.name)} from saved places"
          title="Remove saved place"
        >×</button>
      </div>
    `)
    .join("");
}

function handleSavedListClick(event) {
  const button = event.target.closest("[data-saved-action][data-place-id]");

  if (!button) return;

  const placeId = button.dataset.placeId;
  const action = button.dataset.savedAction;
  const saved = getSavedPlaces();
  const place = saved.find((item) => item.id === placeId);

  if (!place) return;

  if (action === "remove") {
    storeSavedPlaces(saved.filter((item) => item.id !== placeId));
    renderSavedPlaces();
    renderPlaces();
    updateModalSaveButton();
    showToast("Place removed from saved places.");
    return;
  }

  // If the place is still in the current results, use its full data.
  const fullPlace = allPlaces.find((item) => item.id === placeId);

  if (fullPlace) {
    openPlaceDetails(fullPlace);
    return;
  }

  // A saved place may belong to a previous search. Reconstruct the
  // minimum data needed to show its details and open directions.
  openPlaceDetails({
    ...place,
    distance: currentLocation
      ? calculateDistance(
          currentLocation.lat,
          currentLocation.lon,
          place.lat,
          place.lon
        )
      : NaN
  });
}

/* =========================================================
   GOOGLE MAPS DIRECTIONS
========================================================= */

function openPlaceDirections(place) {
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) {
    showToast("Directions are unavailable for this place.");
    return;
  }

  const url = new URL("https://www.google.com/maps/dir/");

  url.searchParams.set("api", "1");
  url.searchParams.set("destination", `${place.lat},${place.lon}`);
  url.searchParams.set("travelmode", "walking");

  if (currentLocation) {
    url.searchParams.set(
      "origin",
      `${currentLocation.lat},${currentLocation.lon}`
    );
  }

  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

/* =========================================================
   SAFE TEXT HELPERS
========================================================= */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return replacements[character];
  });
}

function escapeJS(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/</g, "\\x3C")
    .replace(/>/g, "\\x3E")
    .replace(/&/g, "\\x26");
}

/* =========================================================
   START APPLICATION
========================================================= */

init();
