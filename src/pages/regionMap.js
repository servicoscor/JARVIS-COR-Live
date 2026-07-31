const TOUR_OVERVIEW_MS = 10000;
const TOUR_STOP_MS = 6000;
const TOUR_ZOOM = 15;
const TOUR_FLY_DURATION = 1.1;

let activeMap = null;
let activeRegionId = null;
let activeContainer = null;
let markerLayer = null;
let tourTimers = [];
let tourBounds = null;

export function renderRegionDetailMap(region, vm) {
  const containerId = regionMapContainerId(region);
  const container = document.getElementById(containerId);
  if (!container) return;

  if (activeMap && (activeRegionId !== region.id || activeContainer !== container)) {
    destroyRegionDetailMap();
  }

  if (!activeMap) {
    activeMap = L.map(container, { zoomControl: true, attributionControl: false }).setView([region.lat, region.lng], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(activeMap);
    markerLayer = L.layerGroup().addTo(activeMap);
    activeRegionId = region.id;
    activeContainer = container;
    activeMap.on('dragstart', clearTour);
  }

  drawRegionMarkers(region, vm);
}

export function destroyRegionDetailMap() {
  clearTour();
  if (activeMap) {
    activeMap.remove();
  }
  activeMap = null;
  activeRegionId = null;
  activeContainer = null;
  markerLayer = null;
  tourBounds = null;
}

export function regionMapContainerId(region) {
  return `region-map-${region.id}`;
}

function drawRegionMarkers(region, vm) {
  if (!activeMap || !markerLayer) return;
  clearTour();
  markerLayer.clearLayers();

  const bounds = [[region.lat, region.lng]];
  const tourStops = [];

  const centerMarker = L.marker([region.lat, region.lng], {
    icon: divIcon('', 'normal', region.ap),
    zIndexOffset: 800,
  });
  centerMarker.bindPopup(`
    <div style="min-width:200px">
      <div class="ap">AREA OPERACIONAL</div>
      <div class="popup-title">${region.name}</div>
      <div class="popup-sub">${region.communities.slice(0, 3).join(' | ')}</div>
    </div>
  `);
  markerLayer.addLayer(centerMarker);

  const triggeredSirens = (vm.corData.sirens || []).filter((siren) => siren.regionId === region.id && siren.triggered);
  triggeredSirens.forEach((siren) => {
    const marker = L.marker([siren.lat, siren.lng], {
      icon: divIcon('siren', 'critical', 'AC'),
      zIndexOffset: 960,
    });
    marker.bindPopup(`
      <div style="min-width:200px">
        <div class="ap">SIRENE COR</div>
        <div class="popup-title">${siren.name || 'Sirene sem nome'}</div>
        <div class="popup-sub">Status: Acionada - alarme sonoro ativo</div>
        <div class="popup-sub">Conectividade: ${siren.online ? 'Online' : 'Offline'} | Tipo: ${siren.type || '-'}</div>
      </div>
    `);
    markerLayer.addLayer(marker);
    bounds.push([siren.lat, siren.lng]);
    tourStops.push({ lat: siren.lat, lng: siren.lng, marker });
  });

  const wazeAlerts = (vm.wazeData.trustedAlerts || []).filter((alert) => alert.regionId === region.id);
  wazeAlerts.forEach((alert) => {
    const isAccident = alert.type === 'ACCIDENT';
    const marker = L.marker([alert.lat, alert.lng], {
      icon: divIcon(isAccident ? 'accident' : 'waze', isAccident ? 'critical' : 'attention', isAccident ? 'ACC' : 'TRF'),
      zIndexOffset: 980,
    });
    marker.bindPopup(`
      <div style="min-width:220px">
        <div class="ap">WAZE 8+</div>
        <div class="popup-title">${isAccident ? 'Acidente' : 'Transito / via'}</div>
        <div class="popup-sub">${alert.street || 'Via sem nome'} - ${alert.city || 'Rio de Janeiro'}</div>
        <div class="popup-sub">Votos: ${alert.trust} | Tipo: ${alert.type}</div>
      </div>
    `);
    markerLayer.addLayer(marker);
    bounds.push([alert.lat, alert.lng]);
    tourStops.push({ lat: alert.lat, lng: alert.lng, marker });
  });

  if (region.transformersDown > 0) {
    const level = region.transformersDown >= 3 ? 'critical' : 'attention';
    const lat = region.lat + 0.006;
    const lng = region.lng + 0.006;
    const marker = L.marker([lat, lng], {
      icon: divIcon('power', level, `${region.transformersDown}`),
      zIndexOffset: 960,
    });
    marker.bindPopup(`
      <div style="min-width:210px">
        <div class="ap">TRANSFORMADORES</div>
        <div class="popup-title">${region.name}</div>
        <div class="stats">
          <div><div class="stat-label">FORA</div><div class="stat-value">${region.transformersDown}</div></div>
          <div><div class="stat-label">TOTAL</div><div class="stat-value">${region.transformersTotal}</div></div>
        </div>
        <div class="popup-sub" style="margin-top:8px">Sem coordenada individual da rede eletrica. Ponto exibido no centro operacional da regiao.</div>
      </div>
    `);
    markerLayer.addLayer(marker);
    bounds.push([lat, lng]);
    tourStops.push({ lat, lng, marker });
  }

  const occurrences = (vm.activeOccurrences || []).filter((occurrence) => occurrence.regionId === region.id);
  occurrences.forEach((occurrence, index) => {
    const wazeMatch = wazeAlerts.find((alert) => (
      occurrence.type === 'WAZ-ACC' ? alert.type === 'ACCIDENT' : alert.type !== 'ACCIDENT'
    ));
    const offset = occurrenceOffset(index);
    const lat = wazeMatch?.lat ?? region.lat + offset.lat;
    const lng = wazeMatch?.lng ?? region.lng + offset.lng;
    const critical = occurrence.severity === 2;
    const color = critical ? '#e6534f' : '#dda23c';
    const circle = L.circle([lat, lng], {
      radius: wazeMatch ? 700 : critical ? 1600 : 1100,
      color,
      weight: critical ? 3 : 2,
      opacity: critical ? 0.92 : 0.78,
      fillColor: color,
      fillOpacity: critical ? 0.26 : 0.18,
    });
    circle.bindTooltip(occurrence.title, { sticky: true });
    circle.bindPopup(`
      <div style="min-width:230px">
        <div class="ap">OCORRENCIA OPERACIONAL</div>
        <div class="popup-title">${occurrence.title}</div>
        <div class="popup-sub">${occurrence.regionName} - ${occurrence.source}</div>
        <div class="popup-event">
          ${(occurrence.lines || []).map((line, lineIndex) => `<div class="popup-line"><span>${String(lineIndex + 1).padStart(2, '0')}</span>${line}</div>`).join('')}
        </div>
        ${wazeMatch ? `<div class="popup-sub" style="margin-top:10px">Ponto real Waze: ${wazeMatch.street || 'via sem nome'} (${wazeMatch.trust} votos)</div>` : '<div class="popup-sub" style="margin-top:10px">Area operacional estimada pela regiao</div>'}
      </div>
    `);
    markerLayer.addLayer(circle);
    bounds.push([lat, lng]);
    tourStops.push({ lat, lng, marker: circle });
  });

  if (bounds.length > 1) {
    tourBounds = bounds;
    activeMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  } else {
    tourBounds = null;
    activeMap.setView([region.lat, region.lng], 12);
  }

  scheduleTour(tourStops);
}

function scheduleTour(stops) {
  clearTour();
  if (!activeMap || !stops.length) return;

  const goToStop = (index) => {
    if (!activeMap) return;
    const stop = stops[index];
    activeMap.flyTo([stop.lat, stop.lng], TOUR_ZOOM, { duration: TOUR_FLY_DURATION });

    tourTimers.push(window.setTimeout(() => {
      if (activeMap) stop.marker.openPopup();
    }, TOUR_FLY_DURATION * 1000 + 150));

    tourTimers.push(window.setTimeout(() => {
      if (!activeMap) return;
      stop.marker.closePopup();
      if (index + 1 < stops.length) {
        goToStop(index + 1);
      } else {
        backToOverview();
      }
    }, TOUR_STOP_MS));
  };

  const backToOverview = () => {
    if (!activeMap) return;
    if (tourBounds) {
      activeMap.flyToBounds(tourBounds, { padding: [30, 30], maxZoom: 14, duration: TOUR_FLY_DURATION });
    }
    tourTimers.push(window.setTimeout(() => goToStop(0), TOUR_OVERVIEW_MS));
  };

  tourTimers.push(window.setTimeout(() => goToStop(0), TOUR_OVERVIEW_MS));
}

function clearTour() {
  tourTimers.forEach((id) => window.clearTimeout(id));
  tourTimers = [];
}

function occurrenceOffset(index) {
  const offsets = [
    { lat: 0.000, lng: 0.000 },
    { lat: 0.007, lng: 0.006 },
    { lat: -0.007, lng: 0.007 },
    { lat: 0.006, lng: -0.008 },
    { lat: -0.006, lng: -0.007 },
  ];
  return offsets[index % offsets.length];
}

function divIcon(kind, level, label) {
  return L.divIcon({
    className: '',
    html: `<div class="map-marker ${kind} ${level}"><span>${label}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -14],
  });
}
