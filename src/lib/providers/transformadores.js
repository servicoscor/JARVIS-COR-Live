const MAX_REGION_DISTANCE_KM = 35;

export async function fetchTransformadores(regions) {
  const started = performance.now();
  const response = await fetch('/api/transformadores', { cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || 'Falha ao buscar transformadores');
  }

  const transformers = (payload.transformers || [])
    .map((item) => normalizeTransformer(item, regions))
    .filter((item) => item.regionId);

  return {
    ok: true,
    source: payload.source,
    cached: payload.cached,
    latency: Math.round(performance.now() - started),
    transformers,
  };
}

export function applyTransformadores(regions, data) {
  const byRegion = new Map();
  (data.transformers || []).forEach((item) => {
    if (!byRegion.has(item.regionId)) byRegion.set(item.regionId, []);
    byRegion.get(item.regionId).push(item);
  });

  return regions.map((region) => {
    const transformerPoints = byRegion.get(region.id) || [];
    const offline = transformerPoints.filter((item) => item.status !== 'online');
    return {
      ...region,
      transformerPoints,
      transformersDown: offline.length,
      transformersSource: data.source || null,
      liveTransformers: true,
    };
  });
}

function normalizeTransformer(item, regions) {
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const nearest = nearestRegion(lat, lng, regions);
  if (!nearest || nearest.distanceKm > MAX_REGION_DISTANCE_KM) return null;
  return {
    id: String(item.id || `${lat},${lng}`),
    name: String(item.name || 'Transformador'),
    description: String(item.description || ''),
    status: item.status === 'online' ? 'online' : 'offline',
    lat,
    lng,
    regionId: nearest.region.id,
    regionName: nearest.region.name,
    distanceKm: nearest.distanceKm,
  };
}

function nearestRegion(lat, lng, regions) {
  return regions.reduce((best, region) => {
    const distanceKm = haversineKm(lat, lng, region.lat, region.lng);
    if (!best || distanceKm < best.distanceKm) return { region, distanceKm };
    return best;
  }, null);
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const earthKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(value) {
  return value * Math.PI / 180;
}
