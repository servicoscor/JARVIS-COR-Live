import './styles.css';
import { regionsSeed } from './data/regions.js';
import { dataFeeds as feedsSeed } from './data/feeds.js';
import { clamp, pct, rand, safeNum, timeString } from './lib/format.js';
import { applyOperationalOccurrences, deriveOperationalOccurrences } from './lib/occurrences.js';
import { computeSeverity, riskScore, severityColors } from './lib/risk.js';
import { fetchOpenMeteo } from './lib/weather.js';
import { applyRainAndSirens, fetchCorApis } from './lib/providers/corApis.js';
import { applyTransformadores, fetchTransformadores } from './lib/providers/transformadores.js';
import { fetchWazeTraffic } from './lib/providers/waze.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderMapPage, destroyMapPage } from './pages/map.js';
import { destroyRegionDetailMap } from './pages/regionMap.js';
import { alertsEnabled, playAlertTone, setAlertsEnabled, unlockAudio } from './lib/alerts.js';

const app = document.querySelector('#app');

const standalone = new URLSearchParams(location.search).get('standalone') === '1';

const state = {
  route: location.hash === '#map' ? 'map' : 'dashboard',
  openRegionId: parseRegionHash(),
  standalone,
  now: new Date(),
  regions: structuredClone(regionsSeed),
  feeds: structuredClone(feedsSeed),
  liveWeather: false,
  corLive: false,
  corData: {
    cityStage: null,
    heat: null,
    rainStations: [],
    sirens: [],
    forecastNow: null,
    forecastExtended: [],
  },
  wazeLive: false,
  wazeData: {
    trustedAlerts: [],
    alerts: [],
    jams: [],
  },
  transformersLive: false,
  transformerData: {
    source: null,
    transformers: [],
  },
  activeOccurrences: [],
  activeEvent: null,
  eventLog: [],
  riskHistory: null,
  seenCriticalIds: new Set(),
  newAlerts: [],
};

const timers = [];

function setState(patch) {
  Object.assign(state, typeof patch === 'function' ? patch(state) : patch);
  render();
}

function scoreRegions() {
  return state.regions.map((region) => {
    const severity = computeSeverity(region);
    const score = riskScore(region);
    return { ...region, severity, score, colors: severityColors(severity) };
  });
}

function viewModel() {
  const regions = scoreRegions();
  const cityRisk = safeNum(Math.round(regions.reduce((sum, region) => sum + safeNum(region.score), 0) / regions.length));
  const maxSeverity = Math.max(...regions.map((region) => region.severity));
  const totalOcc = state.activeOccurrences.length;
  const rainAvg = regions.reduce((sum, region) => sum + safeNum(region.rain), 0) / regions.length;
  const avgTemp = regions.reduce((sum, region) => sum + safeNum(region.temp), 0) / regions.length;
  const transformersDown = regions.reduce((sum, region) => sum + safeNum(region.transformersDown), 0);
  const ranked = [...regions].sort((a, b) => b.score - a.score);
  const cityStageInfo = resolveCityStage(state.corData.cityStage, maxSeverity);

  return {
    route: state.route,
    openRegionId: state.openRegionId,
    standalone: state.standalone,
    now: state.now,
    time: timeString(state.now),
    regions,
    ranked,
    feeds: state.feeds,
    liveWeather: state.liveWeather,
    corLive: state.corLive,
    corData: state.corData,
    wazeLive: state.wazeLive,
    wazeData: state.wazeData,
    transformersLive: state.transformersLive,
    transformerData: state.transformerData,
    activeEvent: state.activeEvent,
    activeOccurrences: state.activeOccurrences,
    eventLog: state.eventLog,
    riskHistory: state.riskHistory,
    alertsEnabled: alertsEnabled(),
    newAlerts: state.newAlerts,
    cityRisk,
    cityRing: `conic-gradient(${cityStageInfo.colors.border} ${cityRisk}%, rgba(255,255,255,.08) 0)`,
    cityStatus: cityStageInfo.label,
    cityStatusStyle: `background:${cityStageInfo.colors.bg};border-color:${cityStageInfo.colors.border}55;color:${cityStageInfo.colors.text}`,
    totalOcc,
    alertCount: regions.filter((region) => region.severity > 0).length,
    avgTemp: `${avgTemp.toFixed(1)}C`,
    rainAvg: pct(rainAvg),
    transformersDown,
    sirensOnline: regions.reduce((sum, region) => sum + (region.sirensOnline || 0), 0),
    sirensTotal: regions.reduce((sum, region) => sum + (region.sirensTotal || 0), 0),
    rainStationsTotal: regions.reduce((sum, region) => sum + (region.rainStations || 0), 0),
    kpis: [
      { label: 'ESTAGIO CIDADE', value: cityStageInfo.label },
      { label: 'NIVEL DE CALOR', value: state.corData.heat ? `Calor ${state.corData.heat.level}` : '-' },
      { label: 'PLUVIOMETROS', value: regions.reduce((sum, region) => sum + (region.rainStations || 0), 0) || '-' },
      { label: 'SIRENES ONLINE', value: `${regions.reduce((sum, region) => sum + (region.sirensOnline || 0), 0)}/${regions.reduce((sum, region) => sum + (region.sirensTotal || 0), 0) || '-'}` },
      { label: 'RISCO DA CIDADE', value: cityRisk },
    ],
    ticker: buildTicker(regions, state.activeOccurrences),
  };
}

function resolveCityStage(cityStage, maxSeverity) {
  const id = Number(cityStage?.id);
  if (Number.isFinite(id) && id > 0) {
    const severity = id >= 3 ? 2 : id === 2 ? 1 : 0;
    return {
      label: cityStage.label?.replace('Estágio', 'Estagio') || `Estagio ${id}`,
      colors: severityColors(severity),
    };
  }
  const label = maxSeverity === 2 ? 'Estagio 3 - Critico' : maxSeverity === 1 ? 'Estagio 2 - Atencao' : 'Estagio 1 - Normal';
  return { label, colors: severityColors(maxSeverity) };
}

function buildTicker(regions, occurrences) {
  if (occurrences.length) {
    return occurrences.slice(0, 6).map((occurrence) => `${occurrence.regionName}: ${occurrence.title} (${occurrence.source})`).join('     |     ');
  }
  const alertRegions = regions.filter((region) => region.score > 40);
  if (!alertRegions.length) return 'Nenhuma ocorrencia operacional ativa nas fontes conectadas. Transito segue sem fonte real integrada.';
  return alertRegions.map((region) => `${region.name}: risco ${region.score}, chuva em ${pct(region.rain)} - acompanhar`).join('     |     ');
}

function render() {
  const vm = viewModel();
  if (vm.route === 'map') {
    destroyRegionDetailMap();
    renderMapPage(app, vm, navigate);
  } else {
    destroyMapPage();
    renderDashboard(app, vm, navigate, openRegion, closeRegion, toggleAlerts, dismissAlert);
  }
}

function renderIfDashboardIdle() {
  if (state.route === 'dashboard' && !state.openRegionId) render();
}

function renderUnlessRegionPanelOpen() {
  if (state.standalone) {
    render();
    return;
  }
  if (state.route === 'dashboard' && state.openRegionId) return;
  render();
}

function updateClock() {
  state.now = new Date();
  const clock = document.querySelector('[data-local-clock]');
  if (clock) clock.textContent = timeString(state.now);
}

function navigate(route) {
  location.hash = route === 'map' ? '#map' : '#dashboard';
}

function parseRegionHash() {
  const match = location.hash.match(/^#region-(.+)$/);
  return match ? match[1] : null;
}

function openRegion(regionId) {
  location.hash = `#region-${regionId}`;
  setState({ route: 'dashboard', openRegionId: regionId });
}

function closeRegion() {
  location.hash = '#dashboard';
  setState({ route: 'dashboard', openRegionId: null });
}

function tick() {
  state.regions = state.regions.map((region) => ({
    ...region,
    temp: region.liveWeather ? region.temp : clamp(region.temp + rand(-0.35, 0.35), region.tempMin, region.tempMax),
    rain: region.liveRain || region.liveWeather ? region.rain : clamp(region.rain + rand(-3.5, 3.5), 0, 100),
  }));
  recomputeOperationalState();
  renderIfDashboardIdle();
}

function triggerOperationalEvent() {
  if (!state.activeOccurrences.length) {
    state.activeEvent = null;
    renderIfDashboardIdle();
    return;
  }

  triggerOperationalEvent.index = ((triggerOperationalEvent.index || 0) + 1) % state.activeOccurrences.length;
  const event = {
    ...state.activeOccurrences[triggerOperationalEvent.index],
    startedAt: Date.now(),
  };
  state.activeEvent = event;
  state.eventLog = [event, ...state.eventLog.filter((item) => item.id !== event.id)].slice(0, 8);
  renderIfDashboardIdle();
  window.clearTimeout(triggerOperationalEvent.clearTimer);
  triggerOperationalEvent.clearTimer = window.setTimeout(() => {
    state.activeEvent = null;
    renderIfDashboardIdle();
  }, 6200);
}

async function refreshWeather() {
  try {
    const updated = await fetchOpenMeteo(state.regions);
    state.regions = state.regions.map((region) => {
      const match = updated.find((item) => item.id === region.id);
      return match ? { ...region, temp: match.temp, rain: match.rain, liveWeather: match.liveWeather } : region;
    });
    state.liveWeather = true;
    updateFeed('openMeteo', true, 'ok');
  } catch {
    state.liveWeather = false;
    updateFeed('openMeteo', false, 'erro');
  }
  renderUnlessRegionPanelOpen();
}

async function refreshCorApis() {
  try {
    const data = await fetchCorApis(state.regions);
    state.corLive = data.ok;
    state.corData = {
      cityStage: data.cityStage,
      heat: data.heat,
      rainStations: data.rainStations,
      sirens: data.sirens,
      forecastNow: data.forecastNow,
      forecastExtended: data.forecastExtended,
    };
    state.regions = applyRainAndSirens(state.regions, state.corData);
    recomputeOperationalState();
    Object.entries(data.feeds).forEach(([key, feed]) => updateFeed(key, feed.ok, feed.ok ? `${feed.latency}ms` : 'erro'));
  } catch {
    state.corLive = false;
    ['estagio', 'calor', 'pluviometricos', 'sirenes', 'previsaoAgora', 'previsaoEstendida'].forEach((key) => updateFeed(key, false, 'erro'));
  }
  renderUnlessRegionPanelOpen();
}

function recomputeOperationalState() {
  const occurrences = deriveOperationalOccurrences(state.regions, state.corData, state.wazeData);
  detectNewCriticalOccurrences(occurrences);
  state.activeOccurrences = occurrences;
  state.regions = applyOperationalOccurrences(state.regions, occurrences, state.wazeData);
}

function detectNewCriticalOccurrences(occurrences) {
  const critical = occurrences.filter((occurrence) => occurrence.severity === 2);
  const newOnes = critical.filter((occurrence) => !state.seenCriticalIds.has(occurrence.id));

  if (newOnes.length) {
    if (alertsEnabled()) playAlertTone();
    state.newAlerts = [...newOnes, ...state.newAlerts].slice(0, 5);
    newOnes.forEach((occurrence) => {
      window.setTimeout(() => {
        state.newAlerts = state.newAlerts.filter((item) => item.id !== occurrence.id);
        renderUnlessRegionPanelOpen();
      }, 12000);
    });
  }

  state.seenCriticalIds = new Set(critical.map((occurrence) => occurrence.id));
}

function toggleAlerts() {
  const next = !alertsEnabled();
  setAlertsEnabled(next);
  if (next) unlockAudio();
  render();
}

function dismissAlert(id) {
  state.newAlerts = state.newAlerts.filter((item) => item.id !== id);
  render();
}

async function refreshWazeTraffic() {
  try {
    const data = await fetchWazeTraffic(state.regions);
    state.wazeLive = true;
    state.wazeData = data;
    updateFeed('traffic', true, `${data.latency}ms`);
    recomputeOperationalState();
  } catch {
    state.wazeLive = false;
    updateFeed('traffic', false, 'erro');
  }
  renderUnlessRegionPanelOpen();
}

async function refreshTransformadores() {
  try {
    const data = await fetchTransformadores(state.regions);
    state.transformersLive = true;
    state.transformerData = data;
    state.regions = applyTransformadores(state.regions, data);
    updateFeed('transformadores', true, data.source?.file || `${data.latency}ms`);
    recomputeOperationalState();
  } catch {
    state.transformersLive = false;
    updateFeed('transformadores', false, 'erro');
  }
  renderUnlessRegionPanelOpen();
}

function updateFeed(key, ok, latency) {
  state.feeds = state.feeds.map((feed) => (feed.key === key ? { ...feed, ok, latency } : feed));
}

async function postRiskSnapshot() {
  try {
    const regions = scoreRegions();
    const payload = {
      ts: Date.now(),
      regions: Object.fromEntries(regions.map((region) => [region.id, {
        score: region.score,
        severity: region.severity,
        occurrences: region.occurrences,
        rain: Math.round(safeNum(region.rain)),
        trafficIdx: region.trafficIdx,
        transformersDown: region.transformersDown,
        sirensTriggered: region.sirensTriggered || 0,
      }])),
    };
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Falha ao registrar snapshot nao deve interromper a operacao do painel.
  }
}

async function fetchRiskHistory() {
  try {
    const res = await fetch('/api/history?days=7');
    if (!res.ok) throw new Error('Falha ao buscar historico de risco');
    state.riskHistory = await res.json();
  } catch {
    // Mantem o historico anterior (ou null) se a busca falhar.
  }
  renderUnlessRegionPanelOpen();
}

window.addEventListener('hashchange', () => {
  setState({
    route: location.hash === '#map' ? 'map' : 'dashboard',
    openRegionId: parseRegionHash(),
  });
});

timers.push(window.setInterval(updateClock, 1000));
timers.push(window.setInterval(tick, 2200));
timers.push(window.setInterval(triggerOperationalEvent, 7500));
timers.push(window.setInterval(refreshWeather, 5 * 60 * 1000));
timers.push(window.setInterval(refreshCorApis, 2 * 60 * 1000));
timers.push(window.setInterval(refreshWazeTraffic, 60 * 1000));
timers.push(window.setInterval(refreshTransformadores, 5 * 60 * 1000));
timers.push(window.setInterval(postRiskSnapshot, 10 * 60 * 1000));
timers.push(window.setInterval(fetchRiskHistory, 10 * 60 * 1000));

recomputeOperationalState();
render();
window.setTimeout(triggerOperationalEvent, 1400);
refreshWeather();
refreshCorApis();
refreshWazeTraffic();
refreshTransformadores();
fetchRiskHistory();
window.setTimeout(postRiskSnapshot, 30 * 1000);
