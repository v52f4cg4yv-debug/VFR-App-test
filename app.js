const WORKER_URL = "https://vfrmap.v52f4cg4yv.workers.dev";

let map;
let markers = [];
let userLat = 39.8;
let userLon = -98.6;

function setStatus(text) {
  var el = document.getElementById("status");
  if (el) el.textContent = text;
}

function color(cat) {
  return cat === "VFR" ? "green" :
         cat === "MVFR" ? "blue" :
         cat === "IFR" ? "red" :
         cat === "LIFR" ? "purple" : "gray";
}

function clearMarkers() {
  for (var i = 0; i < markers.length; i++) {
    map.removeLayer(markers[i]);
  }
  markers = [];
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

async function loadVisibleMetar() {
  try {
    setStatus("Loading visible METAR…");

    var bbox = currentBBox();
    var url = WORKER_URL + "/bbox?bbox=" + encodeURIComponent(bbox);

    var res = await fetch(url);
    var data = await res.json();
    var list = data.data || [];

    clearMarkers();

    for (var i = 0; i < list.length; i++) {
      var s = list[i];

      var m = L.circleMarker([s.lat, s.lon], {
        radius: 6,
        fillColor: color(s.flight_category),
        color: "white",
        weight: 1,
        fillOpacity: 0.9
      });

      m.bindPopup(
        "<b>" + s.icao + "</b><br>" +
        s.flight_category + "<br>" +
        "<small>" + (s.raw_text || "") + "</small>"
      );

      m.addTo(map);
      markers.push(m);
    }

    setStatus("Loaded " + list.length + " airports");
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
