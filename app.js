// ================================
// CONFIG
// ================================
const AIRLABS_API_KEY = "REPLACE_WITH_YOUR_REGENERATED_AIRLABS_KEY";
const WORKER_URL = "https://vfrmap.v52f4cg4yv.workers.dev";
const SEARCH_RADIUS_KM = 80;
const AUTO_REFRESH_MS = 300000; // 5 minutes

// ================================
// GLOBAL STATE
// ================================
let map;
let airportLayer;
let favoriteLayer;
let routeLayer = null;
let userMarker = null;

let userLat = 41.7;
let userLon = -86.9;
let allAirports = [];      // AirLabs airport objects currently displayed
let routeStart = null;     // { id, lat, lon }
let routeEnd = null;       // { id, lat, lon }

// ================================
// INIT MAP
// ================================
function initMap() {
  map = L.map("map").setView([userLat, userLon], 9);

  L.tileLayer(
    "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/WMTS/tile/1.0.0/VFR_Sectional/default/default028mm/{z}/{y}/{x}",
    { maxZoom: 12 }
  ).addTo(map);

  airportLayer = L.layerGroup().addTo(map);
  favoriteLayer = L.layerGroup().addTo(map);

  document.getElementById("refreshBtn").addEventListener("click", () => {
    loadData(userLat, userLon);
  });

  document.getElementById("nearestBtn").addEventListener("click", () => {
    findNearestAirport();
  });

  document.getElementById("clearRouteBtn").addEventListener("click", () => {
    clearRoute();
  });
}

// ================================
// COLORING
// ================================
function getColor(cat) {
  if (cat === "VFR") return "green";
  if (cat === "MVFR") return "blue";
  if (cat === "IFR") return "red";
  if (cat === "LIFR") return "purple";
  return "gray";
}

// ================================
// LOCAL STORAGE FAVORITES
// ================================
function getFavorites() {
  return JSON.parse(localStorage.getItem("favorites")) || [];
}

function saveFavorite(id, lat, lon) {
  let favs = getFavorites();
  if (!favs.find(f => f.id === id)) {
    favs.push({ id, lat, lon });
    localStorage.setItem("favorites", JSON.stringify(favs));
  }
  updateFavorites();
}

function removeFavorite(id) {
  let favs = getFavorites().filter(f => f.id !== id);
  localStorage.setItem("favorites", JSON.stringify(favs));
  updateFavorites();
}

function updateFavorites() {
  const favs = getFavorites();
  const favList = document.getElementById("favList");

  if (favs.length === 0) {
    favList.innerHTML = "No favorites yet.";
  } else {
    favList.innerHTML = favs.map(f => `
      <div class="fav-row">
        <span>${escapeHtml(f.id)}</span>
        <button onclick="zoomTo(${f.lat}, ${f.lon})">📍</button>
        <button onclick="setRouteStart('${escapeJs(f.id)}', ${f.lat}, ${f.lon})">A</button>
        <button onclick="setRouteEnd('${escapeJs(f.id)}', ${f.lat}, ${f.lon})">B</button>
        <button class="danger" onclick="removeFavorite('${escapeJs(f.id)}')">❌</button>
      </div>
    `).join("");
  }

  drawFavorites();
}

function drawFavorites() {
  favoriteLayer.clearLayers();
  getFavorites().forEach(f => {
    L.marker([f.lat, f.lon])
      .addTo(favoriteLayer)
      .bindPopup(`<b>⭐ ${escapeHtml(f.id)}</b>`);
  });
}

// ================================
// GEOGRAPHIC HELPERS
// ================================
function toRad(deg) {
  return deg * Math.PI / 180;
}

function toDeg(rad) {
  return rad * 180 / Math.PI;
}

// Haversine distance in nautical miles
function distanceNm(lat1, lon1, lat2, lon2) {
  const Rm = 6371000; // earth radius in meters
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLam = toRad(lon2 - lon1);

  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const meters = Rm * c;

  return meters / 1852; // nautical miles
}

// Initial bearing / heading in degrees 0-360
function initialHeading(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const lambda1 = toRad(lon1);
  const lambda2 = toRad(lon2);

  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// ================================
// ROUTE / SIMPLE FLIGHT PLANNER
// ================================
function setRouteStart(id, lat, lon) {
  routeStart = { id, lat, lon };
  updateRouteDisplay();
  drawRouteIfReady();
}

function setRouteEnd(id, lat, lon) {
  routeEnd = { id, lat, lon };
  updateRouteDisplay();
  drawRouteIfReady();
}

function clearRoute() {
  routeStart = null;
  routeEnd = null;
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  updateRouteDisplay();
}

function drawRouteIfReady() {
  if (!routeStart || !routeEnd) return;

  if (routeLayer) {
    map.removeLayer(routeLayer);
  }

  routeLayer = L.polyline(
    [
      [routeStart.lat, routeStart.lon],
      [routeEnd.lat, routeEnd.lon]
    ],
    {
      color: "yellow",
      weight: 3
    }
  ).addTo(map);

  map.fitBounds(routeLayer.getBounds(), { padding: [30, 30] });
}

function updateRouteDisplay() {
  document.getElementById("routeFrom").textContent = routeStart ? routeStart.id : "—";
  document.getElementById("routeTo").textContent = routeEnd ? routeEnd.id : "—";

  if (routeStart && routeEnd) {
    const nm = distanceNm(routeStart.lat, routeStart.lon, routeEnd.lat, routeEnd.lon);
    const hdg = initialHeading(routeStart.lat, routeStart.lon, routeEnd.lat, routeEnd.lon);

    document.getElementById("routeDistance").textContent = `${nm.toFixed(1)} NM`;
    document.getElementById("routeHeading").textContent = `${Math.round(hdg)}°`;
  } else {
    document.getElementById("routeDistance").textContent = "—";
    document.getElementById("routeHeading").textContent = "—";
  }
}

// ================================
// NEAREST AIRPORT
// ================================
function findNearestAirport() {
  if (!allAirports.length) return;

  let nearest = null;
  let nearestNm = Infinity;

  allAirports.forEach(a => {
    const nm = distanceNm(userLat, userLon, a.lat, a.lng);
    if (nm < nearestNm) {
      nearestNm = nm;
      nearest = a;
    }
  });

  if (!nearest) return;

  map.setView([nearest.lat, nearest.lng], 11);

  // Use route-from-user to nearest airport
  routeStart = { id: "ME", lat: userLat, lon: userLon };
  routeEnd = { id: nearest.icao_code, lat: nearest.lat, lon: nearest.lng };
  updateRouteDisplay();
  drawRouteIfReady();
}

// ================================
// DATA LOADING
// ================================
async function loadData(lat, lon) {
  try {
    // AirLabs Nearby returns matched airports sorted by distance.
    const res = await fetch(
      `https://airlabs.co/api/v9/nearby?lat=${lat}&lng=${lon}&distance=${SEARCH_RADIUS_KM}&api_key=${AIRLABS_API_KEY}`
    );
    const data = await res.json();

    const airports = (data.response?.airports || [])
      .filter(a => a.icao_code && a.lat != null && a.lng != null);

    allAirports = airports;

    const ids = airports.map(a => a.icao_code).join(",");

    const wxRes = await fetch(`${WORKER_URL}?ids=${encodeURIComponent(ids)}`);
    const wxData = await wxRes.json();

    airportLayer.clearLayers();

    airports.forEach(a => {
      const wx = (wxData.data || []).find(x => x.icao === a.icao_code);

      const cat = wx?.flight_category || "Unknown";
      const raw = wx?.raw_text || "";

      const nm = distanceNm(userLat, userLon, a.lat, a.lng);
      const hdg = initialHeading(userLat, userLon, a.lat, a.lng);

      L.circleMarker([a.lat, a.lng], {
        radius: 7,
        fillColor: getColor(cat),
        color: "white",
        weight: 1,
        fillOpacity: 0.9
      })
      .addTo(airportLayer)
      .bindPopup(`
        <b>${escapeHtml(a.icao_code)}</b><br>
        ${escapeHtml(cat)}<br>
        <div style="font-size:12px; margin-top:6px;">${escapeHtml(raw)}</div>
        <div style="margin-top:6px; font-size:12px;">
          Distance: ${nm.toFixed(1)} NM<br>
          Heading: ${Math.round(hdg)}°
        </div>

        <div class="popup-actions">
          <button onclick="saveFavorite('${escapeJs(a.icao_code)}', ${a.lat}, ${a.lng})">⭐ Save</button>
          <button onclick="setRouteStart('${escapeJs(a.icao_code)}', ${a.lat}, ${a.lng})">Route: From Here</button>
          <button onclick="setRouteEnd('${escapeJs(a.icao_code)}', ${a.lat}, ${a.lng})">Route: To Here</button>
          <button onclick="zoomTo(${a.lat}, ${a.lng})">📍 Zoom</button>
        </div>
      `);
    });

    // Update user marker each refresh
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([userLat, userLon]).addTo(map).bindPopup("You are here");

  } catch (err) {
    console.error("Load error:", err);
  }
}

// ================================
// ZOOM / UI HELPERS
// ================================
function zoomTo(lat, lon) {
  map.setView([lat, lon], 10);
}

// ================================
// STARTUP
// ================================
function startApp(lat, lon) {
  userLat = lat;
  userLon = lon;

  initMap();
  updateFavorites();
  loadData(userLat, userLon);

  setInterval(() => {
    loadData(userLat, userLon);
  }, AUTO_REFRESH_MS);
}

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    pos => {
      startApp(pos.coords.latitude, pos.coords.longitude);
    },
    () => {
      startApp(userLat, userLon);
    }
  );
} else {
  startApp(userLat, userLon);
}

// ================================
// SMALL SAFE ESCAPE HELPERS
// ================================
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeJs(str) {
  return String(str).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

// Make popup-button functions available globally
window.saveFavorite = saveFavorite;
window.removeFavorite = removeFavorite;
window.zoomTo = zoomTo;
window.setRouteStart = setRouteStart;
window.setRouteEnd = setRouteEnd;
window.clearRoute = clearRoute;
``
