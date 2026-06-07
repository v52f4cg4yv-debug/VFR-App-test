const WORKER_URL = "https://vfrmap.v52f4cg4yv.workers.dev";
const AUTO_REFRESH_MS = 300000; // 5 minutes

let map;
let cluster;
let favoriteLayer;
let routeLine = null;
let userLat = 39.8;
let userLon = -98.6;
let airports = [];

// ---------------- STATUS ----------------
function setStatus(text) {
  var el = document.getElementById("status");
  if (el) el.textContent = text;
}

// ---------------- COLORS / ICONS ----------------
function color(cat) {
  return cat === "VFR" ? "green" :
         cat === "MVFR" ? "blue" :
         cat === "IFR" ? "red" :
         cat === "LIFR" ? "purple" : "gray";
}

function makeIcon(cat) {
  return L.divIcon({
    className: "",
    html: `<div class="wx-dot" style="background:${color(cat)};"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

// ---------------- GEO HELPERS ----------------
function toRad(d) {
  return d * Math.PI / 180;
}

function toDeg(r) {
  return r * 180 / Math.PI;
}

function distanceNM(a, b, c, d) {
  var R = 6371000;

  var p1 = toRad(a);
  var p2 = toRad(c);
  var dp = toRad(c - a);
  var dl = toRad(d - b);

  var x = Math.sin(dp / 2) * Math.sin(dp / 2) +
          Math.cos(p1) * Math.cos(p2) *
          Math.sin(dl / 2) * Math.sin(dl / 2);

  var y = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));

  return (R * y) / 1852;
}

function heading(a, b, c, d) {
  var p1 = toRad(a);
  var p2 = toRad(c);
  var l1 = toRad(b);
  var l2 = toRad(d);

  var y = Math.sin(l2 - l1) * Math.cos(p2);
  var x = Math.cos(p1) * Math.sin(p2) -
          Math.sin(p1) * Math.cos(p2) * Math.cos(l2 - l1);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// ---------------- FAVORITES ----------------
function getFavs() {
  return JSON.parse(localStorage.getItem("fav") || "[]");
}

function saveFavorite(id, lat, lon) {
  var f = getFavs();
  if (!f.find(function(x) { return x.id === id; })) {
    f.push({ id: id, lat: lat, lon: lon });
    localStorage.setItem("fav", JSON.stringify(f));
  }
  showFav();
}

function removeFavorite(id) {
  var f = getFavs().filter(function(x) { return x.id !== id; });
  localStorage.setItem("fav", JSON.stringify(f));
  showFav();
}

function showFav() {
  var f = getFavs();
  var box = document.getElementById("favList");

  if (!box) return;

  if (!f.length) {
    box.innerHTML = "No favorites yet.";
    drawFavMarkers();
    return;
  }

  box.innerHTML = f.map(function(x) {
    return `
      <div class="fav-row">
        <span>${escapeHtml(x.id)}</span>
        <button onclick="zoom(${x.lat},${x.lon})">📍</button>
        <button onclick="removeFavorite('${escapeJs(x.id)}')">❌</button>
      </div>
    `;
  }).join("");

  drawFavMarkers();
}

function drawFavMarkers() {
  favoriteLayer.clearLayers();
  getFavs().forEach(function(x) {
    L.marker([x.lat, x.lon]).addTo(favoriteLayer)
      .bindPopup("⭐ " + escapeHtml(x.id));
  });
}

// ---------------- ROUTE ----------------
function drawRoute(lat, lon, id) {
  if (routeLine) map.removeLayer(routeLine);

  routeLine = L.polyline([[userLat, userLon], [lat, lon]], {
    color: "yellow",
    weight: 3
  }).addTo(map);

  var fromEl = document.getElementById("routeFrom");
  var toEl = document.getElementById("routeTo");
  var distEl = document.getElementById("routeDistance");
  var hdgEl = document.getElementById("routeHeading");

  if (fromEl) fromEl.textContent = "ME";
  if (toEl) toEl.textContent = id || "Airport";
  if (distEl) distEl.textContent =
    distanceNM(userLat, userLon, lat, lon).toFixed(1) + " NM";
  if (hdgEl) hdgEl.textContent =
    Math.round(heading(userLat, userLon, lat, lon)) + "°";
}

function clearRoute() {
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }

  var fromEl = document.getElementById("routeFrom");
  var toEl = document.getElementById("routeTo");
  var distEl = document.getElementById("routeDistance");
  var hdgEl = document.getElementById("routeHeading");

  if (fromEl) fromEl.textContent = "—";
  if (toEl) toEl.textContent = "—";
  if (distEl) distEl.textContent = "—";
  if (hdgEl) hdgEl.textContent = "—";
}

// ---------------- NEAREST ----------------
function nearest() {
  var best = null;
  var d = 999999;

  airports.forEach(function(a) {
    var dist = distanceNM(userLat, userLon, a.lat, a.lon);
    if (dist < d) {
      d = dist;
      best = a;
    }
  });

  if (best) {
    map.setView([best.lat, best.lon], 8);
    drawRoute(best.lat, best.lon, best.icao);
  }
}

// ---------------- BBOX LOADING ----------------
function currentBBox() {
  var b = map.getBounds();
  return [
    b.getWest(),
    b.getSouth(),
    b.getEast(),
    b.getNorth()
  ].join(",");
}

async function load() {
  try {
    setStatus("Loading visible METAR…");

    var bbox = currentBBox();
    var res = await fetch(WORKER_URL + "/bbox?bbox=" + encodeURIComponent(bbox));
    var data = await res.json();

    airports = data.data || [];
    cluster.clearLayers();

    airports.forEach(function(a) {
      var nm = distanceNM(userLat, userLon, a.lat, a.lon).toFixed(1);
      var hdg = Math.round(heading(userLat, userLon, a.lat, a.lon));

      var marker = L.marker([a.lat, a.lon], {
        icon: makeIcon(a.flight_category)
      });

      marker.bindPopup(`
        <b>${escapeHtml(a.icao)}</b><br>
        ${escapeHtml(a.flight_category)}<br>
        <small>${escapeHtml(a.raw_text || "")}</small><br>
        ${nm} NM / ${hdg}°<br>
        <div class="popup-actions">
          <button onclick="saveFavorite('${escapeJs(a.icao)}',${a.lat},${a.lon})">⭐ Save</button>
          <button onclick="drawRoute(${a.lat},${a.lon},'${escapeJs(a.icao)}')">✈️ Route</button>
          <button onclick="zoom(${a.lat},${a.lon})">📍 Zoom</button>
        </div>
      `);

      cluster.addLayer(marker);
    });

    setStatus("Loaded " + airports.length + " airports");
  } catch (err) {
    console.error(err);
    setStatus("Error loading data");
  }
}

// ---------------- MAP ----------------
function init() {
  map = L.map("map").setView([userLat, userLon], 5);

  // SECTIONAL BACKGROUND
  L.tileLayer(
    "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/WMTS/tile/1.0.0/VFR_Sectional/default/default028mm/{z}/{y}/{x}",
    { maxZoom: 12 }
  ).addTo(map);

  cluster = L.markerClusterGroup();
  map.addLayer(cluster);

  favoriteLayer = L.layerGroup().addTo(map);

  var refreshBtn = document.getElementById("refreshBtn");
  var nearestBtn = document.getElementById("nearestBtn");
  var clearBtn = document.getElementById("clearRouteBtn");

  if (refreshBtn) refreshBtn.onclick = load;
  if (nearestBtn) nearestBtn.onclick = nearest;
  if (clearBtn) clearBtn.onclick = clearRoute;

  map.on("moveend", load);

  L.marker([userLat, userLon]).addTo(map).bindPopup("You are here");

  load();
  setInterval(load, AUTO_REFRESH_MS);
}

function zoom(lat, lon) {
  map.setView([lat, lon], 8);
}

// ---------------- SAFE ESCAPING ----------------
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

// ---------------- START ----------------
navigator.geolocation.getCurrentPosition(
  function(pos) {
    userLat = pos.coords.latitude;
    userLon = pos.coords.longitude;
    init();
    showFav();
  },
  function() {
    init();
    showFav();
  }
);

// Expose popup button functions
window.saveFavorite = saveFavorite;
window.removeFavorite = removeFavorite;
window.zoom = zoom;
window.drawRoute = drawRoute;
window.nearest = nearest;
window.clearRoute = clearRoute;
