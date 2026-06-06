const WORKER_URL = "https://vfrmap.v52f4cg4yv.workers.dev";
const AUTO_REFRESH_MS = 300000; // 5 min

let map;
let metarCluster;
let favoriteLayer;
let routeLayer = null;
let userMarker = null;
let userLat = 39.8283;
let userLon = -98.5795;

let allStations = [];
let routeStart = null;
let routeEnd = null;

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

function initMap() {
  map = L.map("map").setView([userLat, userLon], 5);

  L.tileLayer(
    "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/WMTS/tile/1.0.0/VFR_Sectional/default/default028mm/{z}/{y}/{x}",
    { maxZoom: 12 }
  ).addTo(map);

  metarCluster = L.markerClusterGroup({
    chunkedLoading: true,
    removeOutsideVisibleBounds: true,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true
  });
  map.addLayer(metarCluster);

  favoriteLayer = L.layerGroup().addTo(map);

  document.getElementById("refreshBtn").addEventListener("click", () => {
    loadNationwideMetar();
  });

  document.getElementById("nearestBtn").addEventListener("click", () => {
    findNearestAirport();
  });

  document.getElementById("clearRouteBtn").addEventListener("click", () => {
    clearRoute();
  });
}

function getColor(cat) {
  if (cat === "VFR") return "green";
  if (cat === "MVFR") return "blue";
  if (cat === "IFR") return "red";
  if (cat === "LIFR") return "purple";
  return "gray";
}

function makeDotIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div class="wx-dot" style="background:${color};"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

function toRad(deg) {
  return deg * Math.PI / 180;
}

function toDeg(rad) {
  return rad * 180 / Math.PI;
}

function distanceNm(lat1, lon1, lat2, lon2) {
  const Rm = 6371000;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLam = toRad(lon2 - lon1);

  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (Rm * c) / 1852;
}

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

// Favorites
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
        <button onclick="removeFavorite('${escapeJs(f.id)}')">❌</button>
      </div>
    `).join("");
  }

  drawFavorites();
}

function drawFavorites() {
  favoriteLayer.clearLayers();
  getFavorites().forEach(f => {
    L.marker([f.lat, f.lon]).addTo(favoriteLayer)
      .bindPopup(`<b>⭐ ${escapeHtml(f.id)}</b>`);
  });
}

// Route planner
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

// Nearest airport
function findNearestAirport() {
  if (!allStations.length) return;

  let nearest = null;
  let nearestNm = Infinity;

  allStations.forEach(s => {
    const nm = distanceNm(userLat, userLon, s.lat, s.lon);
    if (nm < nearestNm) {
      nearestNm = nm;
      nearest = s;
    }
  });

  if (!nearest) return;

  map.setView([nearest.lat, nearest.lon], 8);

  routeStart = { id: "ME", lat: userLat, lon: userLon };
  routeEnd = { id: nearest.icao, lat: nearest.lat, lon: nearest.lon };
  updateRouteDisplay();
  drawRouteIfReady();
}

function addStationMarker(station) {
  const color = getColor(station.flight_category);
  const icon = makeDotIcon(color);

  const nm = distanceNm(userLat, userLon, station.lat, station.lon);
  const hdg = initialHeading(userLat, userLon, station.lat, station.lon);

  const marker = L.marker([station.lat, station.lon], { icon }).bindPopup(`
    <b>${escapeHtml(station.icao)}</b><br>
    ${escapeHtml(station.flight_category)}<br>
    <div style="font-size:12px; margin-top:6px;">${escapeHtml(station.raw_text || "")}</div>
    <div style="margin-top:6px; font-size:12px;">
      Distance: ${nm.toFixed(1)} NM<br>
      Heading: ${Math.round(hdg)}°
    </div>
    <div class="popup-actions">
      <button onclick="saveFavorite('${escapeJs(station.icao)}', ${station.lat}, ${station.lon})">⭐ Save</button>
      <button onclick="setRouteStart('${escapeJs(station.icao)}', ${station.lat}, ${station.lon})">From Here</button>
      <button onclick="setRouteEnd('${escapeJs(station.icao)}', ${station.lat}, ${station.lon})">To Here</button>
      <button onclick="zoomTo(${station.lat}, ${station.lon})">📍 Zoom</button>
    </div>
  `);

  metarCluster.addLayer(marker);
}

async function loadNationwideMetar() {
  try {
    setStatus("Loading nationwide METAR…");

    const res = await fetch(`${WORKER_URL}/usa`);
    const data = await res.json();

    allStations = data.data || [];

    metarCluster.clearLayers();
    allStations.forEach(addStationMarker);

    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([userLat, userLon]).addTo(map).bindPopup("You are here");

    setStatus(`Loaded ${allStations.length} stations`);
  } catch (err) {
    console.error("Nationwide load error:", err);
    setStatus("Failed to load nationwide METAR");
  }
}

function zoomTo(lat, lon) {
  map.setView([lat, lon], 9);
}

function startApp(lat, lon) {
  userLat = lat;
  userLon = lon;

  initMap();
  updateFavorites();
  loadNationwideMetar();

  setInterval(() => {
    loadNationwideMetar();
  }, AUTO_REFRESH_MS);
}

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    pos => startApp(pos.coords.latitude, pos.coords.longitude),
    () => startApp(userLat, userLon)
  );
} else {
  startApp(userLat, userLon);
}

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

window.saveFavorite = saveFavorite;
window.removeFavorite = removeFavorite;
window.zoomTo = zoomTo;
window.setRouteStart = setRouteStart;
window.setRouteEnd = setRouteEnd;
window.clearRoute = clearRoute;
