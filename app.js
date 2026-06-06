const WORKER_URL = "https://vfrmap.v52f4cg4yv.workers.dev";
const AUTO_REFRESH_MS = 300000; // 5 minutes

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

// ---------------- STATUS ----------------
function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

// ---------------- MAP ----------------
function initMap() {
  map = L.map("map").setView([userLat, userLon], 5);

  L.tileLayer(
    "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/WMTS/tile/1.0.0/VFR_Sectional/default/default028mm/{z}/{y}/{x}",
    { maxZoom: 12 }
  ).addTo(map);

  metarCluster = L.markerClusterGroup({
    chunkedLoading: true,
    removeOutsideVisibleBounds: true,
    showCoverageOnHover: false
  });

  map.addLayer(metarCluster);
  favoriteLayer = L.layerGroup().addTo(map);

  document.getElementById("refreshBtn").onclick = loadData;
  document.getElementById("nearestBtn").onclick = findNearest;
  document.getElementById("clearRouteBtn").onclick = clearRoute;
}

// ---------------- COLORS ----------------
function getColor(cat) {
  if (cat === "VFR") return "green";
  if (cat === "MVFR") return "blue";
  if (cat === "IFR") return "red";
  if (cat === "LIFR") return "purple";
  return "gray";
}

function makeIcon(color) {
  return L.divIcon({
    html: `<div style="
      width:12px;
      height:12px;
      border-radius:50%;
      background:${color};
      border:2px solid white;
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

// ---------------- GEO ----------------
function toRad(d) {
  return d * Math.PI / 180;
}

function toDeg(r) {
  return r * 180 / Math.PI;
}

function distanceNM(a, b, c, d) {
  const R = 6371000;

  const φ1 = toRad(a);
  const φ2 = toRad(c);
  const dφ = toRad(c - a);
  const dλ = toRad(d - b);

  const x = Math.sin(dφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;

  const y = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));

  return (R * y) / 1852;
}

function heading(a, b, c, d) {
  const φ1 = toRad(a);
  const φ2 = toRad(c);
  const λ1 = toRad(b);
  const λ2 = toRad(d);

  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// ---------------- FAVORITES ----------------
function getFavs() {
  return JSON.parse(localStorage.getItem("favorites") || "[]");
}

function saveFavorite(id, lat, lon) {
  let f = getFavs();
  if (!f.find(x => x.id === id)) {
    f.push({ id, lat, lon });
    localStorage.setItem("favorites", JSON.stringify(f));
  }
  renderFavs();
}

function removeFavorite(id) {
  let f = getFavs().filter(x => x.id !== id);
  localStorage.setItem("favorites", JSON.stringify(f));
  renderFavs();
}

function renderFavs() {
  const box = document.getElementById("favList");
  const f = getFavs();

  if (!f.length) {
    box.innerHTML = "No favorites yet.";
    return;
  }

  box.innerHTML = f.map(x => `
    <div>
      ${x.id}
      <button onclick="zoom(${x.lat},${x.lon})">📍</button>
      <button onclick="removeFavorite('${x.id}')">❌</button>
    </div>
  `).join("");
}

// ---------------- ROUTE ----------------
function drawRoute(a, b, c, d) {
  if (routeLayer) map.removeLayer(routeLayer);

  routeLayer = L.polyline([[a, b], [c, d]], {
    color: "yellow"
  }).addTo(map);
}

function clearRoute() {
  if (routeLayer) map.removeLayer(routeLayer);
}

// ---------------- NEAREST ----------------
function findNearest() {
  let best = null;
  let dist = Infinity;

  allStations.forEach(s => {
    const d = distanceNM(userLat, userLon, s.lat, s.lon);
    if (d < dist) {
      dist = d;
      best = s;
    }
  });

  if (best) {
    map.setView([best.lat, best.lon], 9);
    drawRoute(userLat, userLon, best.lat, best.lon);
  }
}

// ---------------- DATA ----------------
async function loadData() {
  try {
    setStatus("Loading...");

    const res = await fetch(`${WORKER_URL}/usa`);
    const data = await res.json();

    allStations = data.data || [];

    metarCluster.clearLayers();

    allStations.forEach(s => {
      const color = getColor(s.flight_category);
      const icon = makeIcon(color);

      const nm = distanceNM(userLat, userLon, s.lat, s.lon).toFixed(1);
      const hdg = Math.round(heading(userLat, userLon, s.lat, s.lon));

      const m = L.marker([s.lat, s.lon], { icon })
        .bindPopup(`
          <b>${s.icao}</b><br>
          ${s.flight_category}<br>
          <small>${s.raw_text || ""}</small><br>
          ${nm} NM / ${hdg}°<br>
          <button onclick="saveFavorite('${s.icao}',${s.lat},${s.lon})">⭐</button>
          <button onclick="drawRoute(${userLat},${userLon},${s.lat},${s.lon})">✈️</button>
        `);

      metarCluster.addLayer(m);
    });

    if (userMarker) map.removeLayer(userMarker);

    userMarker = L.marker([userLat, userLon])
      .addTo(map)
      .bindPopup("You");

    setStatus(`Loaded ${allStations.length} airports`);

  } catch (err) {
    console.error(err);
    setStatus("Error loading data");
  }
}

// ---------------- START ----------------
navigator.geolocation.getCurrentPosition(
  pos => {
    userLat = pos.coords.latitude;
    userLon = pos.coords.longitude;
    initMap();
    renderFavs();
    loadData();
    setInterval(loadData, AUTO_REFRESH_MS);
  },
  () => {
    initMap();
    renderFavs();
    loadData();
    setInterval(loadData, AUTO_REFRESH_MS);
  }
);

function zoom(lat, lon) {
  map.setView([lat, lon], 9);
}
