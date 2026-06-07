const WORKER_URL = "https://vfrmap.v52f4cg4yv.workers.dev";

let map;
let cluster;

function setStatus(text) {
  document.getElementById("status").innerText = text;
}

// -------- INIT MAP --------
function init() {
  map = L.map("map").setView([39.8, -98.6], 5);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom: 10 }
  ).addTo(map);

  cluster = L.markerClusterGroup();
  map.addLayer(cluster);

  map.on("moveend", load);

  load();
}

// -------- COLOR --------
function color(cat) {
  return cat === "VFR" ? "green" :
         cat === "MVFR" ? "blue" :
         cat === "IFR" ? "red" :
         cat === "LIFR" ? "purple" : "gray";
}

// -------- LOAD DATA --------
async function load() {
  setStatus("Loading METAR...");

  const bounds = map.getBounds();

  const bbox = [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth()
  ].join(",");

  try {
    const res = await fetch(
      `${WORKER_URL}/bbox?bbox=${encodeURIComponent(bbox)}`
    );

    const data = await res.json();

    const stations = data.data || [];

    cluster.clearLayers();

    stations.forEach(s => {
      const marker = L.circleMarker([s.lat, s.lon], {
        radius: 6,
        color: "white",
        weight: 1,
        fillColor: color(s.flight_category),
        fillOpacity: 0.9
      });

      marker.bindPopup(`
        <b>${s.icao}</b><br>
        ${s.flight_category}<br>
        <small>${s.raw_text}</small>
      `);

      cluster.addLayer(marker);
    });

    setStatus(`Loaded ${stations.length} airports`);
  } catch (err) {
    console.error(err);
    setStatus("Error loading data");
  }
}

init();
