import { bairroName, regionIdForFeature } from '../data/bairros.js';
import { normalizeKey, pct } from '../lib/format.js';

let map;
let bairroLayer;
let radarLayer;
let rainStationLayer;
let sirenLayer;
let wazeLayer;
let transformerLayer;
let occurrenceLayer;
let currentVm;

export function renderMapPage(root, vm, navigate) {
  currentVm = vm;
  if (map && document.querySelector('#map')) {
    const ticker = document.querySelector('.ticker');
    if (ticker) ticker.textContent = vm.ticker;
    updateOperationalLayers(vm);
    return;
  }

  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <div class="logo">
            <img class="logo-image" src="/imagen/logo_prefeitura_rio_cor_transparente.png" alt="" onerror="this.parentElement.classList.add('logo-missing')" />
            <span class="logo-fallback">Prefeitura<br>do Rio</span>
          </div>
          <div>
            <div class="title">JARVIS COR</div>
            <div class="subtitle">Mapa Operacional - Regioes do Rio de Janeiro</div>
          </div>
        </div>
        <div class="pill" style="color:#4fe8d3;background:rgba(23,201,181,.1);border-color:rgba(23,201,181,.3)"><span class="dot"></span>AO VIVO</div>
        ${vm.liveWeather ? '<div class="pill" style="color:#5fb8ff;background:rgba(74,157,255,.1);border-color:rgba(74,157,255,.3)">Open-Meteo</div>' : ''}
        ${vm.corLive ? '<div class="pill" style="color:#4fe8d3;background:rgba(23,201,181,.1);border-color:rgba(23,201,181,.3)">COR APIs</div>' : ''}
        <label class="pill"><input id="radarToggle" type="checkbox" disabled /> Radar de chuva</label>
        <label class="pill"><input id="rainStationsToggle" type="checkbox" checked disabled /> Pluviometros</label>
        <label class="pill"><input id="sirensToggle" type="checkbox" checked disabled /> Sirenes acionadas</label>
        <label class="pill"><input id="transformersToggle" type="checkbox" checked disabled /> Transformadores</label>
        <label class="pill"><input id="wazeToggle" type="checkbox" checked disabled /> Waze 8+</label>
        <label class="pill"><input id="occurrencesToggle" type="checkbox" checked disabled /> Ocorrencias</label>
        <div class="spacer"></div>
        <button class="pill" data-route="dashboard" type="button">Voltar ao painel</button>
      </header>
      <main class="map-page">
        <div id="map"></div>
        <div class="map-area-legend">
          <span><i class="critical"></i>Area critica</span>
          <span><i class="attention"></i>Area em atencao</span>
          <span><i class="normal"></i>Bairros monitorados</span>
        </div>
      </main>
      <div class="ticker">${vm.ticker}</div>
    </div>
  `;

  root.querySelector('[data-route="dashboard"]').addEventListener('click', () => navigate('dashboard'));
  initMap(vm);
}

export function destroyMapPage() {
  if (map) {
    map.remove();
    map = null;
    bairroLayer = null;
    radarLayer = null;
    rainStationLayer = null;
    sirenLayer = null;
    wazeLayer = null;
    transformerLayer = null;
    occurrenceLayer = null;
  }
}

function initMap(vm) {
  currentVm = vm;
  destroyMapPage();
  map = L.map('map', { zoomControl: true, attributionControl: true }).setView([-22.925, -43.32], 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map);

  loadBairros(vm);
  initOperationalLayers(vm);
  initRainRadar();
}

function initOperationalLayers(vm) {
  rainStationLayer = L.layerGroup().addTo(map);
  sirenLayer = L.layerGroup().addTo(map);
  wazeLayer = L.layerGroup().addTo(map);
  transformerLayer = L.layerGroup().addTo(map);
  occurrenceLayer = L.layerGroup().addTo(map);

  bindLayerToggle('rainStationsToggle', rainStationLayer, () => (vm.corData.rainStations || []).length > 0);
  bindLayerToggle('sirensToggle', sirenLayer, () => triggeredSirens(vm).length > 0);
  bindLayerToggle('transformersToggle', transformerLayer, () => downTransformers(vm).length > 0);
  bindLayerToggle('wazeToggle', wazeLayer, () => (vm.wazeData.trustedAlerts || []).length > 0);
  bindLayerToggle('occurrencesToggle', occurrenceLayer, () => operationalOccurrences(vm).length > 0);
  updateOperationalLayers(vm);
}

function bindLayerToggle(id, layer, hasData) {
  const toggle = document.querySelector(`#${id}`);
  if (!toggle) return;
  toggle.disabled = !hasData();
  toggle.addEventListener('change', () => {
    if (toggle.checked) layer.addTo(map);
    else map.removeLayer(layer);
    updateBairroAreas(currentVm);
  });
}

function updateOperationalLayers(vm) {
  currentVm = vm;
  if (!map || !rainStationLayer || !sirenLayer || !wazeLayer || !transformerLayer || !occurrenceLayer) return;

  const rainToggle = document.querySelector('#rainStationsToggle');
  const sirenToggle = document.querySelector('#sirensToggle');
  const wazeToggle = document.querySelector('#wazeToggle');
  const transformerToggle = document.querySelector('#transformersToggle');
  const occurrenceToggle = document.querySelector('#occurrencesToggle');
  if (rainToggle) rainToggle.disabled = !(vm.corData.rainStations || []).length;
  if (sirenToggle) sirenToggle.disabled = !triggeredSirens(vm).length;
  if (wazeToggle) wazeToggle.disabled = !(vm.wazeData.trustedAlerts || []).length;
  if (transformerToggle) transformerToggle.disabled = !downTransformers(vm).length;
  if (occurrenceToggle) occurrenceToggle.disabled = !operationalOccurrences(vm).length;

  rainStationLayer.clearLayers();
  sirenLayer.clearLayers();
  wazeLayer.clearLayers();
  transformerLayer.clearLayers();
  occurrenceLayer.clearLayers();
  (vm.corData.rainStations || []).forEach((station) => rainStationLayer.addLayer(rainStationMarker(station)));
  triggeredSirens(vm).forEach((siren) => sirenLayer.addLayer(sirenMarker(siren)));
  (vm.wazeData.trustedAlerts || []).forEach((alert) => wazeLayer.addLayer(wazeMarker(alert)));
  downTransformers(vm).forEach((region) => transformerLayer.addLayer(transformerMarker(region)));
  operationalOccurrences(vm).forEach((occurrence) => {
    occurrenceLayer.addLayer(occurrenceArea(occurrence));
    if (occurrence.wazeAlert) occurrenceLayer.addLayer(occurrenceMarker(occurrence));
  });
  updateBairroAreas(vm);
}

function triggeredSirens(vm) {
  return (vm.corData.sirens || []).filter((siren) => siren.triggered);
}

function downTransformers(vm) {
  return (vm.regions || []).filter((region) => region.transformersDown > 0);
}

function operationalOccurrences(vm) {
  const regionsById = new Map((vm.regions || []).map((region) => [region.id, region]));
  const wazeByRegion = new Map();
  (vm.wazeData.trustedAlerts || []).forEach((alert) => {
    if (!wazeByRegion.has(alert.regionId)) wazeByRegion.set(alert.regionId, []);
    wazeByRegion.get(alert.regionId).push(alert);
  });

  const countByRegion = new Map();
  return (vm.activeOccurrences || []).map((occurrence) => {
    const region = regionsById.get(occurrence.regionId);
    if (!region) return null;

    const wazeMatch = wazeByRegion.get(occurrence.regionId)?.find((alert) => (
      occurrence.type === 'WAZ-ACC' ? alert.type === 'ACCIDENT' : alert.type !== 'ACCIDENT'
    ));
    const index = countByRegion.get(occurrence.regionId) || 0;
    countByRegion.set(occurrence.regionId, index + 1);

    const offset = occurrenceOffset(index);
    return {
      ...occurrence,
      lat: wazeMatch?.lat ?? region.lat + offset.lat,
      lng: wazeMatch?.lng ?? region.lng + offset.lng,
      region,
      wazeAlert: wazeMatch,
    };
  }).filter(Boolean);
}

function occurrenceOffset(index) {
  const offsets = [
    { lat: 0.000, lng: 0.000 },
    { lat: 0.012, lng: 0.010 },
    { lat: -0.012, lng: 0.012 },
    { lat: 0.010, lng: -0.014 },
    { lat: -0.010, lng: -0.012 },
  ];
  return offsets[index % offsets.length];
}

async function loadBairros(vm) {
  const res = await fetch('https://gist.githubusercontent.com/esperanc/db213370dd176f8524ae6ba32433f90a/raw/6dff5654e9ff6395f09f18ea2692f40ed2060cb9/Limite_Bairro.geojson');
  const geo = await res.json();
  const excluded = new Set(['PAQUETA'].map(normalizeKey));

  bairroLayer = L.geoJSON(geo, {
    style: (feature) => bairroAreaStyle(feature, vm),
    onEachFeature: (feature, layer) => {
      const name = bairroName(feature.properties);
      if (excluded.has(normalizeKey(name))) return;
      const region = regionForFeature(feature, vm);
      layer.bindTooltip(region ? `${name} - ${region.name}` : name, { sticky: true });
      layer.on('mouseover', () => layer.setStyle({ weight: 2.4, fillOpacity: Math.max((bairroAreaStyle(feature, currentVm).fillOpacity || 0) + 0.12, 0.22), opacity: 0.95 }));
      layer.on('mouseout', () => layer.setStyle(bairroAreaStyle(feature, currentVm)));
      layer.on('click', () => {
        const liveRegion = regionForFeature(feature, currentVm);
        if (liveRegion) layer.bindPopup(popupHtml(liveRegion, name, currentVm.activeEvent, currentVm)).openPopup();
      });
    },
  }).addTo(map);
}

function updateBairroAreas(vm) {
  if (!bairroLayer) return;
  bairroLayer.eachLayer((layer) => {
    if (layer.feature) layer.setStyle(bairroAreaStyle(layer.feature, vm));
  });
}

function regionForFeature(feature, vm) {
  const id = regionIdForFeature(feature.properties);
  return (vm?.regions || []).find((region) => region.id === id) || null;
}

function bairroAreaStyle(feature, vm) {
  const region = regionForFeature(feature, vm);
  if (!region) return { color: '#3a4a5f', weight: 0.7, fillColor: '#3a4a5f', fillOpacity: 0.04, opacity: 0.28 };

  const occurrences = occurrenceAreasVisible()
    ? (vm?.activeOccurrences || []).filter((occurrence) => occurrence.regionId === region.id)
    : [];
  const critical = occurrences.some((occurrence) => occurrence.severity === 2);
  const active = occurrences.length > 0;
  const color = critical ? '#e6534f' : active ? '#dda23c' : region.colors.border;
  return {
    color,
    weight: active ? 1.8 : 0.9,
    fillColor: color,
    fillOpacity: critical ? 0.46 : active ? 0.34 : 0.12,
    opacity: active ? 0.88 : 0.42,
  };
}

function occurrenceAreasVisible() {
  const toggle = document.querySelector('#occurrencesToggle');
  return !toggle || toggle.checked;
}

function rainStationMarker(station) {
  const h01 = Number.isFinite(station.h01) ? station.h01 : 0;
  const h24 = Number.isFinite(station.h24) ? station.h24 : 0;
  const level = h01 >= 10 || h24 >= 50 ? 'critical' : h01 >= 3 || h24 >= 20 ? 'attention' : 'normal';
  const marker = L.marker([station.lat, station.lng], {
    icon: divIcon('rain', level, `${h01.toFixed(0)}`),
    zIndexOffset: 900,
  });
  marker.bindPopup(`
    <div style="min-width:220px">
      <div class="ap">PLUVIOMETRO</div>
      <div class="popup-title">${station.name || 'Estacao sem nome'}</div>
      <div class="popup-sub">Regiao operacional: ${station.regionId || '-'}</div>
      <div class="stats">
        <div><div class="stat-label">5 MIN</div><div class="stat-value">${num(station.m05)} mm</div></div>
        <div><div class="stat-label">15 MIN</div><div class="stat-value">${num(station.m15)} mm</div></div>
        <div><div class="stat-label">1 H</div><div class="stat-value">${num(station.h01)} mm</div></div>
      </div>
      <div class="stats">
        <div><div class="stat-label">3 H</div><div class="stat-value">${num(station.h03)} mm</div></div>
        <div><div class="stat-label">24 H</div><div class="stat-value">${num(station.h24)} mm</div></div>
        <div><div class="stat-label">MES</div><div class="stat-value">${num(station.month)} mm</div></div>
      </div>
      <div class="popup-sub" style="margin-top:10px">Leitura: ${station.readAt || '-'}</div>
    </div>
  `);
  return marker;
}

function sirenMarker(siren) {
  const marker = L.marker([siren.lat, siren.lng], {
    icon: divIcon('siren', 'critical', 'AC'),
    zIndexOffset: 960,
  });
  marker.bindPopup(`
    <div style="min-width:210px">
      <div class="ap">SIRENE COR</div>
      <div class="popup-title">${siren.name || 'Sirene sem nome'}</div>
      <div class="popup-sub">Regiao operacional: ${siren.regionId || '-'}</div>
      <div class="stats">
        <div><div class="stat-label">STATUS</div><div class="stat-value">Acionada</div></div>
        <div><div class="stat-label">TIPO</div><div class="stat-value">${siren.type || '-'}</div></div>
        <div><div class="stat-label">CONECT.</div><div class="stat-value">${siren.online ? 'Online' : 'Offline'}</div></div>
      </div>
    </div>
  `);
  return marker;
}

function transformerMarker(region) {
  const level = region.transformersDown >= 3 ? 'critical' : 'attention';
  const marker = L.marker([region.lat, region.lng], {
    icon: divIcon('power', level, `${region.transformersDown}`),
    zIndexOffset: 960,
  });
  marker.bindPopup(`
    <div style="min-width:220px">
      <div class="ap">TRANSFORMADORES</div>
      <div class="popup-title">${region.name}</div>
      <div class="popup-sub">Agregado operacional por regiao</div>
      <div class="stats">
        <div><div class="stat-label">FORA</div><div class="stat-value">${region.transformersDown}</div></div>
        <div><div class="stat-label">TOTAL</div><div class="stat-value">${region.transformersTotal}</div></div>
        <div><div class="stat-label">ATIVOS</div><div class="stat-value">${region.transformersTotal - region.transformersDown}</div></div>
      </div>
      <div class="popup-sub" style="margin-top:10px">Sem coordenada individual da rede eletrica. Ponto exibido no centro operacional da regiao.</div>
    </div>
  `);
  return marker;
}

function wazeMarker(alert) {
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
      <div class="stats">
        <div><div class="stat-label">TIPO</div><div class="stat-value">${alert.type}</div></div>
        <div><div class="stat-label">VOTOS</div><div class="stat-value">${alert.trust}</div></div>
        <div><div class="stat-label">REGIAO</div><div class="stat-value">${alert.regionId || '-'}</div></div>
      </div>
      <div class="popup-sub" style="margin-top:10px">${alert.subType || '-'}</div>
    </div>
  `);
  return marker;
}

function occurrenceMarker(occurrence) {
  const level = occurrence.severity === 2 ? 'critical' : 'attention';
  const marker = L.marker([occurrence.lat, occurrence.lng], {
    icon: divIcon(`occurrence ${occurrenceKind(occurrence.type)}`, level, occurrenceLabel(occurrence.type)),
    zIndexOffset: 1040 + occurrence.severity,
  });
  marker.bindPopup(occurrencePopupHtml(occurrence, 'Ponto real Waze'));
  return marker;
}

function occurrenceArea(occurrence) {
  const critical = occurrence.severity === 2;
  const color = critical ? '#e6534f' : '#dda23c';
  const radius = occurrence.wazeAlert ? 900 : critical ? 3400 : 2400;
  const area = L.circle([occurrence.lat, occurrence.lng], {
    radius,
    color,
    weight: critical ? 3 : 2,
    opacity: critical ? 0.92 : 0.78,
    fillColor: color,
    fillOpacity: critical ? 0.26 : 0.18,
    interactive: true,
  });
  area.bindTooltip(`${occurrence.regionName}: ${occurrence.title}`, { sticky: true });
  area.bindPopup(occurrencePopupHtml(
    occurrence,
    occurrence.wazeAlert ? 'Area calculada ao redor do ponto real Waze' : 'Area operacional estimada pela regiao',
  ));
  return area;
}

function occurrencePopupHtml(occurrence, locationLine) {
  return `
    <div style="min-width:250px">
      <div class="ap">OCORRENCIA OPERACIONAL</div>
      <div class="popup-title">${occurrence.title}</div>
      <div class="popup-sub">${occurrence.regionName} - ${occurrence.source}</div>
      <div class="stats">
        <div><div class="stat-label">RISCO</div><div class="stat-value">${occurrence.severity === 2 ? 'Critico' : 'Atencao'}</div></div>
        <div><div class="stat-label">TIPO</div><div class="stat-value">${occurrence.type}</div></div>
        <div><div class="stat-label">AP</div><div class="stat-value">${occurrence.ap}</div></div>
      </div>
      <div class="popup-event">
        ${(occurrence.lines || []).map((line, index) => `<div class="popup-line"><span>${String(index + 1).padStart(2, '0')}</span>${line}</div>`).join('')}
      </div>
      <div class="popup-sub" style="margin-top:10px">${locationLine}${occurrence.wazeAlert ? `: ${occurrence.wazeAlert.street || 'via sem nome'} (${occurrence.wazeAlert.trust} votos)` : ''}</div>
    </div>
  `;
}

function occurrenceKind(type) {
  if (type === 'WAZ-ACC') return 'accident';
  if (type.startsWith('WAZ')) return 'traffic';
  if (type.startsWith('PLU')) return 'rain';
  if (type.startsWith('SIR')) return 'siren';
  if (type.startsWith('ENE')) return 'power';
  if (type.startsWith('CAL')) return 'heat';
  return 'general';
}

function occurrenceLabel(type) {
  if (type === 'WAZ-ACC') return 'ACC';
  if (type.startsWith('WAZ')) return 'TRF';
  if (type.startsWith('PLU')) return 'PLU';
  if (type.startsWith('SIR')) return 'SIR';
  if (type.startsWith('ENE')) return 'ENE';
  if (type.startsWith('CAL')) return 'CAL';
  return 'OCR';
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

function num(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '-';
}

async function initRainRadar() {
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const data = await res.json();
    const frame = data.radar?.past?.slice(-1)[0];
    const toggle = document.querySelector('#radarToggle');
    if (!frame || !toggle) return;
    radarLayer = L.tileLayer(`https://tilecache.rainviewer.com${frame.path}/512/{z}/{x}/{y}/2/1_1.png`, {
      opacity: 0.55,
      zIndex: 500,
      maxNativeZoom: 7,
      tileSize: 512,
    });
    toggle.disabled = false;
    toggle.addEventListener('change', () => {
      if (toggle.checked) radarLayer.addTo(map);
      else map.removeLayer(radarLayer);
    });
  } catch {
    const toggle = document.querySelector('#radarToggle');
    if (toggle) toggle.disabled = true;
  }
}

function popupHtml(region, bairro, activeEvent, vm = currentVm) {
  const trafficLabels = ['Livre', 'Moderado', 'Intenso'];
  const event = activeEvent?.regionId === region.id ? activeEvent : null;
  const occurrences = (vm?.activeOccurrences || []).filter((occurrence) => occurrence.regionId === region.id);
  return `
    <div style="min-width:250px">
      <div class="ap">AREA OPERACIONAL - ${region.ap}</div>
      <div class="popup-title">${bairro || region.name}</div>
      <div class="popup-sub">${region.name} - ${region.communities.slice(0, 2).join(' | ')}</div>
      <div class="stats">
        <div><div class="stat-label">TEMP</div><div class="stat-value">${region.temp.toFixed(1)}C</div></div>
        <div><div class="stat-label">CHUVA</div><div class="stat-value">${pct(region.rain)}</div></div>
        <div><div class="stat-label">TRANS.</div><div class="stat-value">${trafficLabels[region.trafficIdx]}</div></div>
      </div>
      <div class="stats">
        <div><div class="stat-label">TRANSF.</div><div class="stat-value">${region.transformersTotal - region.transformersDown}/${region.transformersTotal}</div></div>
        <div><div class="stat-label">OCORR.</div><div class="stat-value">${region.occurrences}</div></div>
        <div><div class="stat-label">RISCO</div><div class="stat-value" style="color:${region.colors.text}">${region.score}</div></div>
      </div>
      <div class="stats">
        <div><div class="stat-label">MM 1H</div><div class="stat-value">${Number.isFinite(region.rainMmH01) ? region.rainMmH01.toFixed(1) : '-'}</div></div>
        <div><div class="stat-label">MM 24H</div><div class="stat-value">${Number.isFinite(region.rainMmH24) ? region.rainMmH24.toFixed(1) : '-'}</div></div>
        <div><div class="stat-label">SIRENES</div><div class="stat-value">${region.sirensTotal ? `${region.sirensOnline}/${region.sirensTotal}` : '-'}</div></div>
      </div>
      <div class="pill" style="margin-top:10px;background:${region.colors.bg};border-color:${region.colors.border}55;color:${region.colors.text}">${region.colors.label}</div>
      ${occurrences.length ? `
        <div class="popup-event">
          <div style="font-weight:800;color:${region.colors.text}">Ocorrencias na area</div>
          ${occurrences.slice(0, 4).map((occurrence, index) => `<div class="popup-line"><span>${String(index + 1).padStart(2, '0')}</span><strong>${occurrence.source}</strong> ${occurrence.title}</div>`).join('')}
        </div>
      ` : ''}
      ${event ? `
        <div class="popup-event">
          <div style="font-weight:800;color:${region.colors.text}">${event.title}</div>
          ${event.lines.map((line, index) => `<div class="popup-line"><span>${String(index + 1).padStart(2, '0')}</span>${line}</div>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}
