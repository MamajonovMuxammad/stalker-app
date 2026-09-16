/* ==========================================================
   STALKER — Leaflet Map Controller v2
   OpenStreetMap tiles, custom dark markers, popup panels
   ========================================================== */

let map = null;
let markersLayer = null;

// Default center: Tashkent
const DEFAULT_LAT = 41.3111;
const DEFAULT_LNG = 69.2406;
const DEFAULT_ZOOM = 12;

/* ── Custom SVG Marker ───────────────────────────────────── */
function createMarkerIcon(type, isActive = false) {
  const colors = {
    bunker:      { fill: '#2563EB', stroke: '#60A5FA' },
    abandoned:   { fill: '#F59E0B', stroke: '#FCD34D' },
    underground: { fill: '#8B5CF6', stroke: '#C4B5FD' },
    default:     { fill: '#10B981', stroke: '#6EE7B7' },
  };
  const c = colors[type] || colors.default;
  const size = isActive ? 40 : 32;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.3}" viewBox="0 0 32 42">
      <filter id="shadow">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.5"/>
      </filter>
      <path d="M16 2C9.37 2 4 7.37 4 14c0 8.5 12 26 12 26S28 22.5 28 14C28 7.37 22.63 2 16 2z"
        fill="${c.fill}" stroke="${c.stroke}" stroke-width="${isActive ? 2.5 : 1.5}"
        filter="url(#shadow)"/>
      <circle cx="16" cy="14" r="5" fill="rgba(255,255,255,0.9)"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize:   [size, size * 1.3],
    iconAnchor: [size / 2, size * 1.3],
    popupAnchor: [0, -(size * 1.3)],
  });
}

/* ── Init Map ────────────────────────────────────────────── */
function initMap() {
  const mapEl = document.getElementById('map');
  if (!mapEl || map) return;

  map = L.map('map', {
    center: [DEFAULT_LAT, DEFAULT_LNG],
    zoom: DEFAULT_ZOOM,
    zoomControl: false,
    attributionControl: true,
  });

  // OSM tile layer
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // Custom zoom control position
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  // Click to deselect
  map.on('click', () => {
    document.querySelectorAll('.sidebar-location-item').forEach(el => el.classList.remove('active'));
  });
}

/* ── Render Markers ──────────────────────────────────────── */
function renderMapMarkers(locations) {
  if (!markersLayer) return;
  markersLayer.clearLayers();

  locations.forEach(loc => {
    // API returns coords:[lat,lng]; support both formats
    const lat = loc.lat ?? (loc.coords && loc.coords[0]);
    const lng = loc.lng ?? (loc.coords && loc.coords[1]);
    if (!lat || !lng) return;
    // Patch for marker and popup use below
    loc._lat = lat;
    loc._lng = lng;

    const marker = L.marker([lat, lng], {
      icon: createMarkerIcon(loc.type),
      title: loc.name,
    });

    marker.on('click', () => {
      // Highlight sidebar item
      document.querySelectorAll('.sidebar-location-item').forEach(el => el.classList.remove('active'));
      const item = document.querySelector(`.sidebar-location-item[data-id="${loc.id}"]`);
      if (item) {
        item.classList.add('active');
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // Show popup
      const diffColors = { 1: '#10B981', 2: '#10B981', 3: '#F59E0B', 4: '#EF4444', 5: '#EF4444' };
      const dColor = diffColors[loc.difficulty] || '#5A5A5A';
      const typeLabel = (typeof TYPE_LABELS !== 'undefined' ? TYPE_LABELS[loc.type] : null) || loc.type;
      const photo = (loc.photos && loc.photos.length > 0) ? loc.photos[0] : null;

      const popupHtml = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif; min-width:220px; max-width:280px;">
          ${photo ? `<img src="${photo}" alt="${loc.name}" style="width:100%;height:140px;object-fit:cover;border-radius:8px 8px 0 0;margin:-8px -8px 10px -8px;display:block;width:calc(100%+16px);" onerror="this.style.display='none'">` : ''}
          <div style="padding: ${photo ? '0' : '4px'} 0 0;">
            <div style="font-weight:700;font-size:14px;color:#F1F1F1;margin-bottom:4px;">${loc.name}</div>
            <div style="font-size:12px;color:#A0A0A0;margin-bottom:8px;">${loc.region} · ${typeLabel}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:11px;font-weight:700;color:${dColor};">${loc.difficulty}★ сложность</span>
              <a href="/location.html?id=${loc.id}"
                style="font-size:11px;color:#60A5FA;font-weight:600;text-decoration:none;
                  border:1px solid rgba(37,99,235,0.4);border-radius:5px;padding:3px 8px;">
                Подробнее →
              </a>
            </div>
          </div>
        </div>`;

      marker.bindPopup(popupHtml, {
        maxWidth: 300,
        className: 'stalker-popup',
      }).openPopup();
    });

    markersLayer.addLayer(marker);
  });
}

/* ── Focus on specific location ──────────────────────────── */
function focusLocation(locId) {
  if (!map) return;
  const loc = (typeof allLocations !== 'undefined' ? allLocations : []).find(l => String(l.id) === String(locId));
  const locLat = loc && (loc.lat ?? (loc.coords && loc.coords[0]));
  const locLng = loc && (loc.lng ?? (loc.coords && loc.coords[1]));
  if (!loc || !locLat) return;

  map.flyTo([locLat, locLng], 16, { duration: 0.8 });

  // Trigger marker click after fly
  setTimeout(() => {
    markersLayer.eachLayer(m => {
      const ll = m.getLatLng();
      if (Math.abs(ll.lat - locLat) < 0.0001 && Math.abs(ll.lng - locLng) < 0.0001) {
        m.fire('click');
      }
    });
  }, 900);
}
