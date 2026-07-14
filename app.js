/* Easy Travel — istemci mantığı
   - /api/generate'e şehir gönderir, senaryoları alır
   - her senaryodaki yerleri en kısa rotaya göre sıralar (nearest neighbor + 2-opt)
   - Leaflet haritasında numaralı pinlerle gösterir
   - Google My Maps'e aktarılabilen KML indirir + Google Maps yön tarifi linki üretir
*/

const form = document.getElementById("search-form");
const goBtn = document.getElementById("go-btn");
const scenariosEl = document.getElementById("scenarios");
const toastEl = document.getElementById("toast");

let map;
let markerLayer;
let currentData = null;
let activeIndex = 0;

// ---------- Harita ----------
function initMap() {
  map = L.map("map", { zoomControl: true }).setView([41.9, 12.5], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap katkıcıları",
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

// ---------- Mesafe & rota optimizasyonu ----------
function haversine(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function routeLength(order, places) {
  let total = 0;
  for (let i = 0; i < order.length - 1; i++) {
    total += haversine(places[order[i]], places[order[i + 1]]);
  }
  return total;
}

// En yakın komşu ile başlangıç turu, ardından 2-opt ile iyileştirme.
function optimizeOrder(places) {
  const n = places.length;
  if (n <= 2) return places.map((_, i) => i);

  const visited = new Array(n).fill(false);
  let order = [0];
  visited[0] = true;
  for (let step = 1; step < n; step++) {
    const last = order[order.length - 1];
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      const d = haversine(places[last], places[j]);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    order.push(best);
    visited[best] = true;
  }

  // 2-opt
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 60) {
    improved = false;
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const a = places[order[i - 1]];
        const b = places[order[i]];
        const c = places[order[k]];
        const d = order[k + 1] !== undefined ? places[order[k + 1]] : null;
        const before = haversine(a, b) + (d ? haversine(c, d) : 0);
        const after = haversine(a, c) + (d ? haversine(b, d) : 0);
        if (after + 1e-9 < before) {
          const segment = order.slice(i, k + 1).reverse();
          order = order.slice(0, i).concat(segment, order.slice(k + 1));
          improved = true;
        }
      }
    }
  }
  return order;
}

// Her senaryoya optimize edilmiş, sıralı yer listesini ekle.
function withOptimizedPlaces(scenario) {
  const order = optimizeOrder(scenario.places);
  const ordered = order.map((idx, i) => ({
    ...scenario.places[idx],
    step: i + 1,
  }));
  const km = routeLength(order, scenario.places);
  return { ...scenario, orderedPlaces: ordered, totalKm: km };
}

// ---------- KML üretimi (Google My Maps içe aktarımı) ----------
function esc(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

function buildKml(city, scenario) {
  const marks = scenario.orderedPlaces
    .map(
      (p) => `    <Placemark>
      <name>${esc(p.step + ". " + p.name)}</name>
      <description>${esc(p.category + " • ~" + p.duration_min + " dk\n" + p.description)}</description>
      <Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>
    </Placemark>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(city + " — " + scenario.title)}</name>
    <description>${esc(scenario.summary)}</description>
${marks}
  </Document>
</kml>`;
}

function downloadKml(city, scenario) {
  const kml = buildKml(city, scenario);
  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (city + "-" + scenario.title).replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase();
  a.href = url;
  a.download = `${safe}.kml`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("KML indirildi. google.com/mymaps → Yeni harita → İçe aktar ile ekleyebilirsin.");
}

// ---------- Google Maps yön tarifi linki ----------
function gmapsDirUrl(scenario) {
  const pts = scenario.orderedPlaces.map((p) => `${p.lat},${p.lng}`).join("/");
  return `https://www.google.com/maps/dir/${pts}`;
}

// ---------- Render ----------
function renderScenarios(data) {
  scenariosEl.innerHTML = "";
  data.scenarios.forEach((scenario, i) => {
    const card = document.createElement("div");
    card.className = "scenario-card" + (i === activeIndex ? " active" : "");

    const head = document.createElement("div");
    head.className = "scenario-head";
    head.innerHTML = `
      <span class="theme">${esc(scenario.theme)}</span>
      <h3>${esc(scenario.title)}</h3>
      <span class="summary">${esc(scenario.summary)} · ~${scenario.totalKm.toFixed(1)} km</span>`;
    head.addEventListener("click", () => {
      activeIndex = i;
      renderScenarios(data);
      drawScenario(scenario);
    });
    card.appendChild(head);

    const list = document.createElement("ul");
    list.className = "place-list";
    scenario.orderedPlaces.forEach((p) => {
      const li = document.createElement("li");
      li.className = "place-item";
      li.innerHTML = `
        <div class="place-num">${p.step}</div>
        <div class="place-body">
          <div class="name">${esc(p.name)}</div>
          <div class="meta">${esc(p.category)} • ~${p.duration_min} dk — ${esc(p.description)}</div>
        </div>`;
      li.addEventListener("click", () => {
        activeIndex = i;
        renderScenarios(data);
        drawScenario(scenario);
        map.setView([p.lat, p.lng], 15);
      });
      list.appendChild(li);
    });
    card.appendChild(list);

    const actions = document.createElement("div");
    actions.className = "actions";

    const kmlBtn = document.createElement("button");
    kmlBtn.className = "btn-kml";
    kmlBtn.textContent = "⬇ KML indir (My Maps)";
    kmlBtn.addEventListener("click", () => downloadKml(data.city, scenario));

    const gm = document.createElement("a");
    gm.className = "btn-gmaps";
    gm.textContent = "🗺 Google Maps'te aç";
    gm.href = gmapsDirUrl(scenario);
    gm.target = "_blank";
    gm.rel = "noopener";

    actions.append(kmlBtn, gm);
    card.appendChild(actions);
    scenariosEl.appendChild(card);
  });
}

function drawScenario(scenario) {
  markerLayer.clearLayers();
  const latlngs = [];
  scenario.orderedPlaces.forEach((p) => {
    const icon = L.divIcon({
      className: "",
      html: `<div class="marker-pin"><span>${p.step}</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -30],
    });
    const m = L.marker([p.lat, p.lng], { icon }).addTo(markerLayer);
    m.bindPopup(`<b>${p.step}. ${esc(p.name)}</b><br>${esc(p.category)} • ~${p.duration_min} dk<br>${esc(p.description)}`);
    latlngs.push([p.lat, p.lng]);
  });
  if (latlngs.length > 1) {
    L.polyline(latlngs, { color: "#4dabf7", weight: 3, opacity: 0.6, dashArray: "6 8" }).addTo(markerLayer);
  }
  if (latlngs.length) {
    map.fitBounds(L.latLngBounds(latlngs).pad(0.2));
  }
}

// ---------- UI yardımcıları ----------
let toastTimer;
function showToast(msg, isError = false) {
  toastEl.textContent = msg;
  toastEl.classList.toggle("error", isError);
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 5000);
}

function setLoading(on) {
  goBtn.disabled = on;
  goBtn.innerHTML = on ? '<span class="spinner"></span>Oluşturuluyor…' : "Senaryoları oluştur";
}

// ---------- Ana akış ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const city = document.getElementById("city").value.trim();
  const days = document.getElementById("days").value.trim();
  if (!city) return;

  setLoading(true);
  scenariosEl.innerHTML = '<div class="empty-state"><p>Rotalar hazırlanıyor…</p><p class="muted">Yapay zeka mekanları seçip koordinatları buluyor.</p></div>';

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city, days: days || null }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "İstek başarısız oldu.");

    data.scenarios = data.scenarios.map(withOptimizedPlaces);
    currentData = data;
    activeIndex = 0;
    renderScenarios(data);
    if (data.scenarios[0]) drawScenario(data.scenarios[0]);
    showToast(`${esc(data.city)}${data.country ? ", " + esc(data.country) : ""} için ${data.scenarios.length} senaryo hazır.`);
  } catch (err) {
    console.error(err);
    scenariosEl.innerHTML = `<div class="empty-state"><p>Bir sorun oldu.</p><p class="muted">${esc(err.message)}</p></div>`;
    showToast(err.message, true);
  } finally {
    setLoading(false);
  }
});

initMap();
