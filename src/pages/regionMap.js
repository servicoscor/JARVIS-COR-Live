let activeMap = null;
let activeRegionId = null;
let markerLayer = null;

export function renderRegionDetailMap(region, vm) {
  const containerId = regionMapContainerId(region);
  const container = document.getElementById(containerId);
  if (!container) return;

  if (activeMap && activeRegionId !== region.id) {
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
  }

  drawRegionMarkers(region, vm);
}

export function destroyRegionDetailMap() {
  if (activeMap) {
    activeMap.remove();
  }
  activeMap = null;
  activeRegionId = null;
  markerLayer = null;
}

export function regionMapContainerId(region) {
  return `region-map-${region.id}`;
}

function drawRegionMarkers(region, vm) {
  if (!activeMap || !markerLayer) return;
  markerLayer.clearLayers();

  const bounds = [[region.lat, region.lng]];

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

  const offlineSirens = (vm.corData.sirens || []).filter((siren) => siren.regionId === region.id && !siren.online);
  offlineSirens.forEach((siren) => {
    const marker = L.marker([siren.lat, siren.lng], {
      icon: divIcon('siren', 'critical', 'OFF'),
      zIndexOffset: 950,
    });
    marker.bindPopup(`
      <div style="min-width:200px">
        <div class="ap">SIRENE COR</div>
        <div class="popup-title">${siren.name || 'Sirene sem nome'}</div>
        <div class="popup-sub">Status: Offline / desativada</div>
        <div class="popup-sub">Tipo: ${siren.type || '-'} | Cod.: ${siren.status || '-'}</div>
      </div>
    `);
    markerLayer.addLayer(marker);
    bounds.push([siren.lat, siren.lng]);
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
  });

  if (bounds.length > 1) {
    activeMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  } else {
    activeMap.setView([region.lat, region.lng], 12);
  }
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
