export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, safeNum(value, min)));
}

export function safeNum(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

export function timeString(date = new Date()) {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function pct(value) {
  return `${Math.round(value)}%`;
}
