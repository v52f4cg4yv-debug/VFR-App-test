const WORKER_URL = "https://vfrmap.v52f4cg4yv.workers.dev";

let map;
let markers = [];
let userLat = 39.8;
let userLon = -98.6;

function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

function color(cat) {
  return cat === "VFR" ? "green" :
         cat === "MVFR" ? "blue" :
         cat === "IFR" ? "red" :
         cat === "LIFR" ? "purple" : "gray";
}

function clearMarkers() {
  for (let i = 0; i < markers.length; i++) {
    map.removeLayer(markers[i]);
  }
  markers = [];
}

function currentBBox() {
  const b = map.getBounds();
  return {
    west: b.getWest(),
    south: b.getSouth(),
    east: b.getEast(),
    north: b.getNorth()
  };
}

function inBounds(lat, lon, bbox) {
  return lat >= bbox.south && lat <= bbox.north && lon >= bbox.west && lon <= bbox.east;
}

async function loadVisibleMetar() {
  try {
    setStatus("Loading visible METAR…");

    const bbox = currentBBox();
    const res = await fetch(WORKER_URL + "/usa");
    const data = await res.json();
    const all = data.data || [];

    const visible = all.filter(s => {
      if (s.lat == null || s.lon == null) return false;
      return inBounds(s.lat, s.lon, bbox);
    });

    clearMarkers();

    for (let i = 0; i < visible.length; i++) {
      const s = visible[i];

      const m = L.circleMarker([s.lat, s.lon], {
        radius: 6,
        fillColor: color(s.flight_category),
        color: "white",
        weight: 1,
        fillOpacity: 0.9
      });

      m.bindPopup(
        "<b>" + escapeHtml(s.icao || "UNK") + "</b><br>" +
        escapeHtml(s.flight_category || "Unknown") + "<br>" +
        "<small>" + escapeHtml(s.raw_text || "") + "</small>"
      );

      m.addTo(map);
      markers.push(m);
    }

    setStatus("Loaded " + visible.length + " visible airports");
  } catch (e) {
    console.error(e);
    setStatus("Error loading data");
  }
}

function init() {
  map = L.map("map").setView([userLat, userLon], 5);

  // Sectional background
  L.tileLayer(
    "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/WMTS/tile/1.0.0/VFR_Sectional/default/default028mm/{z}/{y}/{x}",
    { maxZoom: 12 }
  ).addTo(map);

  L.marker([userLat, userLon]).addTo(map).bindPopup("You are here");

  map.on("moveend", loadVisibleMetar);

  loadVisibleMetar();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

navigator.geolocation.getCurrentPosition(
  function(pos) {
    userLat = pos.coords.latitude;
    userLon = pos.coords.longitude;
    init();
  },
  function() {
    init();
  }
);
