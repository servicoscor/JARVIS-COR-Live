import { clamp, safeNum } from './format.js';

export async function fetchOpenMeteo(regions) {
  const lats = regions.map((region) => region.lat).join(',');
  const lngs = regions.map((region) => region.lng).join(',');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m,precipitation&timezone=America%2FSao_Paulo`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo falhou: ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : [data];
  return regions.map((region, index) => {
    const current = list[index]?.current;
    if (!current) return region;
    return {
      ...region,
      temp: safeNum(current.temperature_2m, region.temp),
      rain: clamp(safeNum(current.precipitation, 0) * 20, 0, 100),
      liveWeather: true,
    };
  });
}
