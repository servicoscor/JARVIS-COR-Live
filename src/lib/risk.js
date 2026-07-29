import { clamp } from './format.js';

export function severityColors(severity) {
  if (severity === 2) return { border: '#e6534f', bg: 'rgba(230,83,79,0.12)', text: '#ff9591', label: 'CRITICO' };
  if (severity === 1) return { border: '#dda23c', bg: 'rgba(221,162,60,0.12)', text: '#f0c069', label: 'ATENCAO' };
  return { border: '#17c9b5', bg: 'rgba(23,201,181,0.12)', text: '#5fe8d6', label: 'NORMAL' };
}

export function computeSeverity(region) {
  let score = 0;
  if (region.rain > 60) score += 2;
  else if (region.rain > 30) score += 1;
  if (region.occurrences > 8) score += 2;
  else if (region.occurrences > 4) score += 1;
  if (region.trafficIdx === 2) score += 1;
  if (region.powerIdx === 2) score += 2;
  else if (region.powerIdx === 1) score += 1;
  if (region.vandalism > 3) score += 1;
  if (region.transformersDown >= 3) score += 2;
  else if (region.transformersDown >= 1) score += 1;
  if (score >= 3) return 2;
  if (score >= 1) return 1;
  return 0;
}

export function riskScore(region) {
  const rainPart = region.rain * 0.5;
  const occPart = Math.min(region.occurrences, 20) * 3;
  const trafficPart = region.trafficIdx * 12;
  const powerPart = region.powerIdx * 14;
  const vandalPart = Math.min(region.vandalism, 10) * 2;
  const transformerPart = Math.min(region.transformersDown, 6) * 9;
  return clamp(Math.round(rainPart * 0.24 + occPart * 0.28 + trafficPart * 0.15 + powerPart * 0.12 + vandalPart * 0.07 + transformerPart * 0.14), 2, 98);
}
