const TRUST_MIN = 7;
const SIGNIFICANT_JAM_LEVEL_MIN = 4;
const SIGNIFICANT_DELAY_SECONDS = 300;
const TRAFFIC_TYPES = new Set(['ACCIDENT', 'JAM', 'ROAD_CLOSED', 'HAZARD']);
const TRAFFIC_SUBTYPES = ['JAM', 'TRAFFIC', 'LANE_CLOSED', 'CAR_STOPPED', 'ROAD_CLOSED', 'ON_ROAD'];

export async function fetchWazeTraffic(regions) {
  const started = performance.now();
  const res = await fetch('/api/waze-tvt', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Waze HTTP ${res.status}`);
  const data = await res.json();
  const rawAlerts = collectLeadAlerts(data.routes || []);
  const alerts = normalizeAlerts(rawAlerts, regions);
  const trustedAlerts = alerts.filter((alert) => isTrustedTrafficAlert(alert));
  const jams = normalizeJams([...(data.routes || []), ...(data.irregularities || [])], regions);

  return {
    ok: true,
    latency: Math.round(performance.now() - started),
    updateTime: data.updateTime || null,
    usersOnJams: data.usersOnJams || [],
    alerts,
    trustedAlerts,
    jams,
  };
}

export function trafficStatsByRegion(wazeData) {
  const map = new Map();
  (wazeData?.trustedAlerts || []).forEach((alert) => {
    const item = map.get(alert.regionId) || { trustedAlerts: 0, accidents: 0, jams: 0, maxTrust: 0, maxJamLevel: 0 };
    item.trustedAlerts += 1;
    if (alert.type === 'ACCIDENT') item.accidents += 1;
    else item.jams += 1;
    item.maxTrust = Math.max(item.maxTrust, alert.trust);
    map.set(alert.regionId, item);
  });
  (wazeData?.jams || []).forEach((jam) => {
    const item = map.get(jam.regionId) || { trustedAlerts: 0, accidents: 0, jams: 0, maxTrust: 0, maxJamLevel: 0 };
    item.jams += 1;
    item.maxJamLevel = Math.max(item.maxJamLevel, jam.jamLevel);
    map.set(jam.regionId, item);
  });
  return map;
}

function collectLeadAlerts(routes) {
  const alerts = [];
  routes.forEach((route) => {
    if (route.leadAlert) alerts.push(route.leadAlert);
    (route.subRoutes || []).forEach((subRoute) => {
      if (subRoute.leadAlert) alerts.push(subRoute.leadAlert);
    });
  });
  return alerts;
}

function normalizeAlerts(alerts, regions) {
  const seen = new Set();
  return alerts.map((alert) => {
    const [lat, lng] = parsePosition(alert.position);
    return {
      id: alert.id,
      type: alert.type || '',
      subType: alert.subType || '',
      street: fixEncoding(alert.street || ''),
      city: fixEncoding(alert.city || ''),
      lat,
      lng,
      regionId: nearestRegionId(lat, lng, regions),
      trust: Number(alert.numThumbsUp || 0),
      comments: Number(alert.numComments || 0),
      notThere: Number(alert.numNotThereReports || 0),
    };
  }).filter((alert) => {
    if (!alert.id || seen.has(alert.id)) return false;
    seen.add(alert.id);
    return Number.isFinite(alert.lat) && Number.isFinite(alert.lng);
  });
}

function normalizeJams(routes, regions) {
  return routes.map((route) => {
    const point = route.line?.[0] || centerOfBbox(route.bbox);
    const lat = Number(point?.y);
    const lng = Number(point?.x);
    return {
      id: route.id || `${route.name}-${lat}-${lng}`,
      name: fixEncoding(route.name || route.fromName || route.toName || 'Via monitorada'),
      lat,
      lng,
      regionId: nearestRegionId(lat, lng, regions),
      jamLevel: Number(route.jamLevel || 0),
      time: Number(route.time || 0),
      historicTime: Number(route.historicTime || 0),
      length: Number(route.length || 0),
      delay: Math.max(0, Number(route.time || 0) - Number(route.historicTime || 0)),
    };
  }).filter((jam) => (
    Number.isFinite(jam.lat)
    && Number.isFinite(jam.lng)
    && isSignificantJam(jam)
  ));
}

function isSignificantJam(jam) {
  if (jam.jamLevel >= SIGNIFICANT_JAM_LEVEL_MIN) return true;
  if (jam.delay >= SIGNIFICANT_DELAY_SECONDS && jam.jamLevel >= 3) return true;
  return false;
}

function isTrustedTrafficAlert(alert) {
  if (alert.type === 'ACCIDENT') return true;
  if (alert.trust <= TRUST_MIN) return false;
  if (!TRAFFIC_TYPES.has(alert.type)) return false;
  return TRAFFIC_SUBTYPES.some((token) => alert.subType.includes(token));
}

function parsePosition(position) {
  const [lat, lng] = String(position || '').split(/\s+/).map(Number);
  return [lat, lng];
}

function centerOfBbox(bbox) {
  if (!bbox) return null;
  return {
    x: (Number(bbox.minX) + Number(bbox.maxX)) / 2,
    y: (Number(bbox.minY) + Number(bbox.maxY)) / 2,
  };
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
    .replaceAll('Ã‡', 'C');
}
