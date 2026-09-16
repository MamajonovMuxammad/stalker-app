/* ==========================================================
   STALKER — Leaflet Map Controller v2.2
   OpenStreetMap tiles, custom SVG markers with icons & colors,
   pixel-perfect popup cards
   ========================================================== */

let map = null;
let markersLayer = null;

// Default center: Tashkent
const DEFAULT_LAT = 41.3111;
const DEFAULT_LNG = 69.2406;
const DEFAULT_ZOOM = 12;

/* ── SVG Glyphs for Marker Center ────────────────────────── */
const MARKER_GLYPHS = {
  bunker: `
    <path d="M16 8L8 11v6c0 5 3.4 9.8 8 11 4.6-1.2 8-6 8-11v-6l-8-3z" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13 16h6M16 13v6" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/>
  `,
  radiation: `
    <circle cx="16" cy="16" r="2.5" fill="#FFFFFF"/>
    <path d="M16 12a4 4 0 0 1 3.46 2l3.47-2A8 8 0 0 0 16 8v4z" fill="#FFFFFF"/>
    <path d="M12.54 18a4 4 0 0 1 0-4l-3.47-2a8 8 0 0 0 0 8l3.47-2z" fill="#FFFFFF"/>
    <path d="M19.46 18a4 4 0 0 1-3.46 2v4a8 8 0 0 0 6.93-4l-3.47-2z" fill="#FFFFFF"/>
  `,
  industrial: `
    <path d="M8 24h16V12l-4 3V12l-4 3V8l-8 4v12z" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="19" r="1.5" fill="#FFFFFF"/>
  `,
  building: `
    <rect x="9" y="8" width="14" height="16" rx="1.5" fill="none" stroke="#FFFFFF" stroke-width="2"/>
    <line x1="12" y1="12" x2="14" y2="12" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
    <line x1="18" y1="12" x2="20" y2="12" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
    <line x1="12" y1="16" x2="14" y2="16" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
    <line x1="18" y1="16" x2="20" y2="16" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
  `,
  underground: `
    <rect x="9" y="9" width="14" height="13" rx="3" fill="none" stroke="#FFFFFF" stroke-width="2"/>
    <circle cx="12" cy="18" r="1.2" fill="#FFFFFF"/>
    <circle cx="20" cy="18" r="1.2" fill="#FFFFFF"/>
    <line x1="12" y1="13" x2="20" y2="13" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/>
  `,
  military: `
    <circle cx="16" cy="16" r="7" fill="none" stroke="#FFFFFF" stroke-width="2"/>
    <circle cx="16" cy="16" r="2.5" fill="#FFFFFF"/>
    <line x1="16" y1="6" x2="16" y2="9" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
    <line x1="16" y1="23" x2="16" y2="26" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
    <line x1="6" y1="16" x2="9" y2="16" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
    <line x1="23" y1="16" x2="26" y2="16" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
  `
};

/* ── Custom SVG Marker Pin ───────────────────────────────── */
function createMarkerIcon(loc, isActive = false) {
  const iconType = loc.icon || loc.type || 'bunker';
  const glyph = MARKER_GLYPHS[iconType] || MARKER_GLYPHS.bunker;

  const defaultColors = {
    bunker:      '#2563EB',
    radiation:   '#EF4444',
    industrial:  '#F59E0B',
    abandoned:   '#F59E0B',
    building:    '#F59E0B',
    underground: '#8B5CF6',
    military:    '#06B6D4',
  };

  const fillColor = loc.color || defaultColors[iconType] || defaultColors[loc.type] || '#2563EB';
  const size = isActive ? 44 : 36;
  const height = size * 1.35;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 32 44">
      <defs>
        <filter id="marker-shadow-${size}" x="-20%" y="-10%" width="140%" height="130%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.6"/>
        </filter>
      </defs>
      <!-- Pin background -->
      <path d="M16 2C8.82 2 3 7.82 3 15c0 9.8 13 26 13 26s13-16.2 13-26C29 7.82 23.18 2 16 2z"
        fill="${fillColor}" stroke="#FFFFFF" stroke-width="${isActive ? 2.5 : 1.5}"
        filter="url(#marker-shadow-${size})"/>
      
      <!-- Inner Dark Disc -->
      <circle cx="16" cy="16" r="10" fill="rgba(10, 10, 10, 0.45)"/>
      
      <!-- Center Glyph -->
      ${glyph}
    </svg>`;

  return L.divIcon({
    html: svg,
    className: 'stalker-marker-pin',
    iconSize:   [size, height],
    iconAnchor: [size / 2, height],
    popupAnchor: [0, -height + 4],
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

  // Zoom control on bottom right
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  // Click on map deselects sidebar
  map.on('click', () => {
    document.querySelectorAll('.sidebar-location-item').forEach(el => el.classList.remove('active'));
  });
}

/* ── Render Markers ──────────────────────────────────────── */
function renderMapMarkers(locations) {
  if (!markersLayer) return;
  markersLayer.clearLayers();

  locations.forEach(loc => {
    const lat = loc.lat ?? (loc.coords && loc.coords[0]);
    const lng = loc.lng ?? (loc.coords && loc.coords[1]);
    if (!lat || !lng) return;
    loc._lat = lat;
    loc._lng = lng;

    const marker = L.marker([lat, lng], {
      icon: createMarkerIcon(loc),
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

      // Diff colors
      const diffColors = { 1: '#10B981', 2: '#10B981', 3: '#F59E0B', 4: '#EF4444', 5: '#EF4444' };
      const dColor = diffColors[loc.difficulty] || '#5A5A5A';
      const typeLabel = (typeof TYPE_LABELS !== 'undefined' ? TYPE_LABELS[loc.type] : null) || loc.type;
      const photo = (loc.photos && loc.photos.length > 0) ? loc.photos[0] : null;

      // Clean, seamless popup card without any image offset
      const popupHtml = `
        <div class="map-popup-card">
          ${photo ? `
            <div class="map-popup-img-wrap">
              <img src="${photo}" alt="${loc.name}" class="map-popup-img" onerror="this.parentElement.style.display='none'">
            </div>
          ` : ''}
          <div class="map-popup-body">
            <h3 class="map-popup-title">${loc.name}</h3>
            <div class="map-popup-meta">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>${loc.region}</span>
              <span>·</span>
              <span>${typeLabel}</span>
            </div>
            <div class="map-popup-footer">
              <span class="badge" style="color:${dColor}; border-color:${dColor}; background:rgba(0,0,0,0.5); font-size:11px;">
                ${loc.difficulty}★ сложность
              </span>
              <a href="/location.html?id=${loc.id}" class="btn btn-primary btn-sm" style="padding: 4px 10px; font-size:12px;">
                Подробнее →
              </a>
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        maxWidth: 290,
        minWidth: 260,
        className: 'stalker-clean-popup',
        closeButton: true,
        autoPanPadding: [20, 20],
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

  setTimeout(() => {
    markersLayer.eachLayer(m => {
      const ll = m.getLatLng();
      if (Math.abs(ll.lat - locLat) < 0.0001 && Math.abs(ll.lng - locLng) < 0.0001) {
        m.fire('click');
      }
    });
  }, 900);
}
