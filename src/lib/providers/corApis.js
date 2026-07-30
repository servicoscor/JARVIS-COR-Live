import { clamp, safeNum } from '../format.js';

const endpoints = {
  sirenes: '/api/sirenes',
  estagio: '/api/estagio-cidade',
  calor: '/api/calor',
  pluviometricos: '/api/pluviometricos',
  previsaoEstendida: '/api/previsao-estendida',
  previsaoAgora: '/api/previsao-agora',
};

export async function fetchCorApis(regions) {
  const started = performance.now();
  const results = await Promise.allSettled([
    timedJson('estagio', endpoints.estagio),
    timedJson('calor', endpoints.calor),
    timedJson('pluviometricos', endpoints.pluviometricos),
    timedXml('sirenes', endpoints.sirenes),
    timedXml('previsaoAgora', endpoints.previsaoAgora),
    timedXml('previsaoEstendida', endpoints.previsaoEstendida),
  ]);

  const [estagio, calor, pluvio, sirenes, previsaoAgora, previsaoEstendida] = results.map((result) => (
    result.status === 'fulfilled' ? result.value : { ok: false, error: result.reason?.message || 'erro' }
  ));

  return {
    ok: results.some((result) => result.status === 'fulfilled'),
    latency: Math.round(performance.now() - started),
    feeds: {
      estagio,
      calor,
      pluviometricos: pluvio,
      sirenes,
      previsaoAgora,
      previsaoEstendida,
    },
    cityStage: estagio.ok ? normalizeStage(estagio.data) : null,
    heat: calor.ok ? normalizeHeat(calor.data) : null,
    rainStations: pluvio.ok ? normalizeRainStations(pluvio.data, regions) : [],
    sirens: sirenes.ok ? normalizeSirens(sirenes.xml, regions) : [],
    forecastNow: previsaoAgora.ok ? normalizeForecastNow(previsaoAgora.xml) : null,
    forecastExtended: previsaoEstendida.ok ? normalizeForecastExtended(previsaoEstendida.xml) : [],
  };
}

export function applyRainAndSirens(regions, corData) {
  const rainByRegion = groupByRegion(corData.rainStations || []);
  const sirensByRegion = groupByRegion(corData.sirens || []);

  return regions.map((region) => {
    const rainStations = rainByRegion.get(region.id) || [];
    const sirens = sirensByRegion.get(region.id) || [];
    const avgH01 = average(rainStations.map((station) => station.h01));
    const avgH03 = average(rainStations.map((station) => station.h03));
    const maxH24 = Math.max(0, ...rainStations.map((station) => station.h24));
    const rainScore = rainStations.length
      ? clamp(Math.round(Math.max(avgH01 * 18, avgH03 * 8, maxH24 * 1.5)), 0, 100)
      : safeNum(region.rain, 0);

    return {
      ...region,
      rain: rainScore,
      rainMmH01: avgH01,
      rainMmH03: avgH03,
      rainMmH24: maxH24,
      rainStations: rainStations.length,
      sirensTotal: sirens.length,
      sirensOnline: sirens.filter((sirene) => sirene.online).length,
      liveRain: rainStations.length > 0,
    };
  });
}

async function timedJson(name, url) {
  const started = performance.now();
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return { ok: true, latency: Math.round(performance.now() - started), data: await res.json() };
}

async function timedXml(name, url) {
  const started = performance.now();
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const text = await res.text();
  return {
    ok: true,
    latency: Math.round(performance.now() - started),
    xml: new DOMParser().parseFromString(text, 'application/xml'),
  };
}

function normalizeStage(data) {
  return {
    id: Number(data.id || data.estagio?.replace(/\D/g, '') || 0),
    label: data.estagio || `Estagio ${data.id || '-'}`,
    color: data.cor || '#17c9b5',
    message: data.mensagem || data.mensagem2 || '',
    startedAt: data.inicio || null,
  };
}

function normalizeHeat(data) {
  return {
    level: Number(data.heat_level || data.nivel || data.level || 0),
    value: String(data.heat_value || data.valor || data.level || ''),
    updatedAt: data.updated_at || null,
  };
}

function normalizeRainStations(data, regions) {
  return (data.features || []).map((feature) => {
    const [lng, lat] = feature.geometry?.coordinates || [];
    const station = feature.properties?.station || {};
    const rain = feature.properties?.data || {};
    return {
      id: station.id,
      name: station.name,
      lat,
      lng,
      regionId: nearestRegionId(lat, lng, regions),
      readAt: feature.properties?.read_at || null,
      m05: parsePtNumber(rain.m05),
      m15: parsePtNumber(rain.m15),
      h01: parsePtNumber(rain.h01),
      h03: parsePtNumber(rain.h03),
      h24: parsePtNumber(rain.h24),
      h96: parsePtNumber(rain.h96),
      month: parsePtNumber(rain.mes),
    };
  }).filter((station) => Number.isFinite(station.lat) && Number.isFinite(station.lng));
}

function normalizeSirens(xml, regions) {
  return [...xml.querySelectorAll('estacao')].map((node) => {
    const loc = node.querySelector('localizacao');
    const status = node.querySelector('status');
    const lat = Number(loc?.getAttribute('latitude'));
    const lng = Number(loc?.getAttribute('longitude'));
    return {
      id: node.getAttribute('id'),
      name: fixEncoding(node.getAttribute('nome')),
      type: node.getAttribute('type'),
      lat,
      lng,
      regionId: nearestRegionId(lat, lng, regions),
      online: String(status?.getAttribute('online')).toLowerCase() === 'true',
      status: status?.getAttribute('status') || '',
    };
  }).filter((sirene) => Number.isFinite(sirene.lat) && Number.isFinite(sirene.lng));
}

function normalizeForecastNow(xml) {
  const previsoes = [...xml.querySelectorAll('previsao')].map((node) => attrs(node, ['datePeriodo', 'periodo', 'ceu', 'precipitacao', 'temperatura', 'dirVento', 'velVento']));
  const sinotico = xml.querySelector('quadroSinotico')?.getAttribute('sinotico') || '';
  const temps = [...xml.querySelectorAll('Temperatura Zona')].map((node) => attrs(node, ['zona', 'maxima', 'minima']));
  const mares = [...xml.querySelectorAll('TabuasMares tabua')].map((node) => attrs(node, ['date', 'altura', 'elevacao']));
  return {
    createdAt: xml.querySelector('previsoes')?.getAttribute('Createdate') || null,
    sinotico: fixEncoding(sinotico),
    periods: previsoes.map(fixAttrs),
    temperatures: temps.map(fixAttrs),
    tides: mares.map(fixAttrs),
  };
}

function normalizeForecastExtended(xml) {
  return [...xml.querySelectorAll('previsaoEstendida')].map((node) => fixAttrs(attrs(node, ['data', 'ceu', 'precipitacao', 'temperatura', 'dirVento', 'velVento', 'maxTemp', 'minTemp'])));
}

function attrs(node, names) {
  return Object.fromEntries(names.map((name) => [name, node.getAttribute(name) || '']));
}

function fixAttrs(obj) {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, fixEncoding(value)]));
}

function parsePtNumber(value) {
  const num = Number(String(value ?? '0').replace(',', '.'));
  return Number.isFinite(num) ? num : 0;
}

function nearestRegionId(lat, lng, regions) {
  let best = regions[0];
  let bestDistance = Infinity;
  for (const region of regions) {
    const distance = Math.hypot(Number(lat) - region.lat, Number(lng) - region.lng);
    if (distance < bestDistance) {
      best = region;
      bestDistance = distance;
    }
  }
  return best?.id;
}

function groupByRegion(items) {
  const map = new Map();
  items.forEach((item) => {
    if (!item.regionId) return;
    const list = map.get(item.regionId) || [];
    list.push(item);
    map.set(item.regionId, list);
  });
  return map;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function fixEncoding(value) {
  return String(value || '')
    .replaceAll('Ã¡', 'a')
    .replaceAll('Ã¢', 'a')
    .replaceAll('Ã£', 'a')
    .replaceAll('Ã©', 'e')
    .replaceAll('Ãª', 'e')
    .replaceAll('Ã­', 'i')
    .replaceAll('Ã³', 'o')
    .replaceAll('Ã´', 'o')
    .replaceAll('Ãµ', 'o')
    .replaceAll('Ãº', 'u')
    .replaceAll('Ã§', 'c')
    .replaceAll('Ã', 'A')
    .replaceAll('Ã‰', 'E')
    .replaceAll('Ã', 'I')
    .replaceAll('Ã“', 'O')
    .replaceAll('Ãš', 'U')
    .replaceAll('Â°C', 'C');
}
