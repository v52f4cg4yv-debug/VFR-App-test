const WORKER_URL = "https://vfrmap.v52f4cg4yv.workers.dev";const WORKER_URL = "httpsContent = text;
}

function color(cat) {
  if (cat === "VFR") return "green";
  if (cat === "MVFR") return "blue";
  if (cat === "IFR") return "red";
  if (cat === "LIFR") return "purple";
  return "gray";
}

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
    box.innerHTML = "None";
    return;
  }

  box.innerHTML = f.map(function(x) {
    return `
      <div>
        ${x.id}
        <button onclick="zoom(${x.lat},${x.lon})">📍</button>
        <button onclick="removeFavorite('${x.id}')">❌</button>
      </div>
    `;
  }).join("");

  drawFavMarkers();
}

function drawFavMarkers() {
  favoriteLayer.clearLayers();
  getFavs().forEach(function(x) {
    L.marker([x.lat, x.lon]).addTo(favoriteLayer)
      .bindPopup("⭐ " + x.id);
  });
}

function drawRoute(lat, lon) {
  if (routeLine) map.removeLayer(routeLine);

  routeLine = L.polyline([[userLat, userLon], [lat, lon]], {
    color: "yellow"
  }).addTo(map);
}

function clearRoute() {
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }

  document.getElementById("routeFrom").textContent = "—";
  document.getElementById("routeTo").textContent = "—";
  document.getElementById("routeDistance").textContent = "—";
  document.getElementById("routeHeading").textContent = "—";
}

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
    drawRoute(best.lat, best.lon);

    document.getElementById("routeFrom").textContent = "ME";
    document.getElementById("routeTo").textContent = best.icao;
    document.getElementById("routeDistance").textContent = d.toFixed(1) + " NM";
    document.getElementById("routeHeading").textContent =
      Math.round(heading(userLat, userLon, best.lat, best.lon)) + "°";
  }
}

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

      var marker = L.circleMarker([a.lat, a.lon], {
        radius: 6,
        fillColor: color(a.flight_category),
        color: "white",
        weight: 1,
        fillOpacity: 0.9
      });

      marker.bindPopup(`
        <b>${a.icao}</b><br>
        ${a.flight_category}<br>
        <small>${a.raw_text || ""}</small><br>
        ${nm} NM / ${hdg}°<br>
        <button onclick="saveFavorite('${a.icao}',${a.lat},${a.lon})">⭐</button>
        <button onclick="drawRoute(${a.lat},${a.lon})">✈️</button>
      `);

      cluster.addLayer(marker);
    });

    setStatus("Loaded " + airports.length + " airports");
  } catch (err) {
    console.error(err);
    setStatus("Error loading data");
  }
}

function init() {
  map = L.map("map").setView([userLat, userLon], 5);

  L.tileLayer(
    "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/WMTS/tile/1.0.0/VFR_Sectional/default/default028mm/{z}/{y}/{x}",
    { maxZoom: 12 }
  ).addTo(map);

  cluster = L.markerClusterGroup();
  map.addLayer(cluster);

  favoriteLayer = L.layerGroup().addTo(map);

  document.getElementById("refreshBtn").onclick = load;
  document.getElementById("nearestBtn").onclick = nearest;
  document.getElementById("clearRouteBtn").onclick = clearRoute;

  map.on("moveend", load);

  load();
  setInterval(load, AUTO_REFRESH_MS);
}

function zoom(lat, lon) {
  map.setView([lat, lon], 8);
}

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

window.saveFavorite = saveFavorite;
window.removeFavorite = removeFavorite;
window.zoom = zoom;
window.drawRoute = drawRoute;
const AUTO_REFRESH_MS = 300000; // 5 minutes

let map;
let cluster;
let favoriteLayer;
let routeLine = null;
let userLat = 39.8;
let userLon = -98.6;
let airports = [];

function setStatus(text) {
  var el = document.getElementById("status");
