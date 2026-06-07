const WORKER_URL = "https://vfrmap.v52f4cg4yv.workers.dev";

let map = L.map("map").setView([39.8, -98.6], 5);
let markers = [];

function setStatus(t) {
  document.getElementById("status").innerText = t;
}

// ✅ Sectional map
L.tileLayer(
  "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/ArcGIS/rest/services/VFR_Sectional/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 12 }
).addTo(map);

// ✅ Color logic
function color(cat) {
  if (cat === "VFR") return "green";
  if (cat === "MVFR") return "blue";
  if (cat === "IFR") return "red";
  if (cat === "LIFR") return "purple";
  return "gray";
}

function clearMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
}

async function load() {
  setStatus("Loading...");

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

    clearMarkers();

    list.forEach(s => {
      const m = L.circleMarker([s.lat, s.lon], {
        radius: 6,
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

      m.addTo(map);
      markers.push(m);
    });

    setStatus("Loaded " + list.length + " airports");

  } catch (e) {
    console.error(e);
    setStatus("ERROR");
  }
}

// ✅ Reload when map moves
map.on("moveend", load);

// ✅ Start
load();
