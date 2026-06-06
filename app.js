const WORKER_URL = "https://vfrmap.v52f4cg4yv.workers.dev";const WORKER_URL = "https:// = 300000;

let map;
let cluster;
let userLat = 39.8;
let userLon = -98.6;
let airports = [];
let routeLine = null;

// ---------------- MAP ----------------
function init() {
  map = L.map("map").setView([userLat, userLon], 5);

  L.tileLayer(
    "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/WMTS/tile/1.0.0/VFR_Sectional/default/default028mm/{z}/{y}/{x}",
    { maxZoom: 12 }
  ).addTo(map);

  cluster = L.markerClusterGroup();
  map.addLayer(cluster);

  document.getElementById("refreshBtn").onclick = load;
  document.getElementById("nearestBtn").onclick = nearest;
  document.getElementById("clearRouteBtn").onclick = () => {
    if (routeLine) map.removeLayer(routeLine);
  };

  load();
  setInterval(load, AUTO_REFRESH_MS);
}

// ---------------- COLORS ----------------
function color(cat) {
  return cat === "VFR" ? "green" :
         cat === "MVFR" ? "blue" :
         cat === "IFR" ? "red" :
         cat === "LIFR" ? "purple" : "gray";
}

// ---------------- DATA ----------------
async function load() {
  document.getElementById("status").innerText = "Loading…";

  const res = await fetch(`${WORKER_URL}/usa`);
  const data = await res.json();

  airports = data.data || [];

  cluster.clearLayers();

  airports.forEach(a => {
    const m = L.circleMarker([a.lat, a.lon], {
      radius: 6,
      fillColor: color(a.flight_category),
      color: "white",
      weight: 1,
      fillOpacity: 0.9
    });

    m.bindPopup(`
      <b>${a.icao}</b><br>
      ${a.flight_category}<br>
      <small>${a.raw_text}</small><br>
      <button onclick="fav('${a.icao}',${a.lat},${a.lon})">⭐</button>
      <button onclick="route(${a.lat},${a.lon})">✈️</button>
    `);

    cluster.addLayer(m);
  });

  document.getElementById("status").innerText =
    `Loaded ${airports.length} airports`;
}

// ---------------- ROUTE ----------------
function route(lat, lon) {
  if (routeLine) map.removeLayer(routeLine);

  routeLine = L.polyline([[userLat, userLon],[lat, lon]], {
    color: "yellow"
  }).addTo(map);
}

// ---------------- NEAREST ----------------
function nearest() {
  let best = null;
  let d = 999;

  airports.forEach(a => {
    const dist = Math.sqrt(
      (a.lat - userLat)**2 + (a.lon - userLon)**2
    );
    if (dist < d) {
      d = dist;
      best = a;
    }
  });

  if (best) {
    map.setView([best.lat, best.lon], 8);
    route(best.lat, best.lon);
  }
}

// ---------------- FAVORITES ----------------
function fav(id, lat, lon) {
  let f = JSON.parse(localStorage.getItem("fav") || "[]");
  if (!f.find(x => x.id === id)) {
    f.push({id, lat, lon});
    localStorage.setItem("fav", JSON.stringify(f));
  }
  showFav();
}

function showFav() {
  const f = JSON.parse(localStorage.getItem("fav") || "[]");
  const box = document.getElementById("favList");

  if (!f.length) {
    box.innerHTML = "None";
    return;
  }

  box.innerHTML = f.map(x => `
    <div>
      ${x.id}
      <button onclick="zoom(${x.lat},${x.lon})">📍</button>
    </div>
  `).join("");
}

function zoom(lat, lon) {
  map.setView([lat, lon], 8);
}

// ---------------- START ----------------
navigator.geolocation.getCurrentPosition(
  pos => {
    userLat = pos.coords.latitude;
    userLon = pos.coords.longitude;
    init();
    showFav();
  },
  () => {
    init();
    showFav();
  }
);

