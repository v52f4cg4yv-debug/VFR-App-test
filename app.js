// ✅ YOUR KEYS
const AIRLABS_API_KEY = "661ae3f2-835e-469d-ad8b-c1d88bbef712";
const WORKER_URL = "https://vfrmap.v52f4cg4yv.workers.dev";

// ---------------- MAP ----------------
const map = L.map("map").setView([41.7, -86.9], 9);

L.tileLayer(
  "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/WMTS/tile/1.0.0/VFR_Sectional/default/default028mm/{z}/{y}/{x}",
  { maxZoom: 12 }
).addTo(map);

const airportLayer = L.layerGroup().addTo(map);
let favoriteLayer = L.layerGroup().addTo(map);

// ---------------- COLORS ----------------
function getColor(cat) {
  if (cat === "VFR") return "green";
  if (cat === "MVFR") return "blue";
  if (cat === "IFR") return "red";
  if (cat === "LIFR") return "purple";
  return "gray";
}

// ---------------- FAVORITES ----------------
function getFavorites() {
  return JSON.parse(localStorage.getItem("favorites")) || [];
}

function saveFavorite(id, lat, lon) {
  let favs = getFavorites();

  if (!favs.find(f => f.id === id)) {
    favs.push({ id, lat, lon });
    localStorage.setItem("favorites", JSON.stringify(favs));
  }

  renderFavorites();
  drawFavorites();
}

function removeFavorite(id) {
  let favs = getFavorites().filter(f => f.id !== id);
  localStorage.setItem("favorites", JSON.stringify(favs));

  renderFavorites();
  drawFavorites();
}

function zoomTo(lat, lon) {
  map.setView([lat, lon], 10);
}

// ---------------- FAVORITES UI ----------------
function renderFavorites() {
  const favs = getFavorites();

  document.getElementById("favList").innerHTML =
    favs.map(f => `
      <div>
        ${f.id}
        <button onclick="zoomTo(${f.lat}, ${f.lon})">📍</button>
        <button onclick="removeFavorite('${f.id}')">❌</button>
      </div>
    `).join("");
}

function drawFavorites() {
  favoriteLayer.clearLayers();

  getFavorites().forEach(f => {
    L.marker([f.lat, f.lon])
      .addTo(favoriteLayer)
      .bindPopup(`⭐ ${f.id}`);
  });
}

// ---------------- DATA ----------------
async function loadData(lat, lon) {
  try {
    const res = await fetch(
      `https://airlabs.co/api/v9/nearby?lat=${lat}&lng=${lon}&distance=80&api_key=${AIRLABS_API_KEY}`
    );

    const data = await res.json();
    const airports = (data.response?.airports || []).slice(0, 10);

    const ids = airports.map(a => a.icao_code).join(",");

    const wxRes = await fetch(`${WORKER_URL}?ids=${encodeURIComponent(ids)}`);
    const wxData = await wxRes.json();

    airportLayer.clearLayers();

    airports.forEach(a => {
      const wx = wxData.data.find(x => x.icao === a.icao_code);

      const cat = wx?.flight_category || "Unknown";
      const raw = wx?.raw_text || "";

      L.circleMarker([a.lat, a.lng], {
        radius: 7,
        fillColor: getColor(cat),
        color: "white",
        weight: 1,
        fillOpacity: 0.9
      })
      .addTo(airportLayer)
      .bindPopup(`
        <b>${a.icao_code}</b><br>
        ${cat}<br>
        <div style="font-size:12px">${raw}</div>

        <button onclick="saveFavorite('${a.icao_code}', ${a.lat}, ${a.lng})">
          ⭐ Save
        </button>
      `);
    });

  } catch (err) {
    console.error(err);
  }
}

// ---------------- LOCATION ----------------
navigator.geolocation.getCurrentPosition(
  pos => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    map.setView([lat, lon], 9);

    loadData(lat, lon);
    renderFavorites();
    drawFavorites();
  },
  () => {
    loadData(41.7, -86.9);
    renderFavorites();
    drawFavorites();
  }
);
