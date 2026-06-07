const WORKER_URL = "https://vfrmap.v52f4cg4yv.workers.dev";

let map;
let cluster;

function setStatus(txt) {
  document.getElementById("status").innerText = txt;
}

// ✅ Init map
map = L.map("map").setView([39.8, -98.6], 5);

L.tileLayer(
  "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/ArcGIS/rest/services/VFR_Sectional/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 12 }
).addTo(map);

cluster = L.markerClusterGroup();
map.addLayer(cluster);

// ✅ Color logic
function color(cat) {
  if (cat === "VFR") return "green";
  if (cat === "MVFR") return "blue";
  if (cat === "IFR") return "red";
  if (cat === "LIFR") return "purple";
  return "gray";
}

// ✅ Load METAR for visible map
async function load() {
  setStatus("Loading METAR...");

  const b = map.getBounds();

  const bbox = [
    b.getWest(),
    b.getSouth(),
    b.getEast(),
    b.getNorth()
  ].join(",");

  try {
    const res = await fetch(
      `${WORKER_URL}/bbox?bbox=${encodeURIComponent(bbox)}`
    );

    const data = await res.json();
    const list = data.data || [];

    cluster.clearLayers();

    list.forEach(s => {
      const m = L.circleMarker([s.lat, s.lon], {
        radius: 5,
        fillColor: color(s.flight_category),
        color: "white",
        weight: 1,
        fillOpacity: 0.9
      });

      m.bindPopup(`
        <b>${s.icao}</b><br>
        ${s.flight_category}<br>
        <small>${s.raw_text}</small>
      `);

      cluster.addLayer(m);
    });

    setStatus("Loaded " + list.length + " airports");

  } catch (e) {
    console.error(e);
    setStatus("ERROR loading data");
  }
}

// ✅ refresh when moving map
map.on("moveend", load);

// ✅ start
load();
