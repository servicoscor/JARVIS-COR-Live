import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import http from 'node:http';
import https from 'node:https';

const dataDir = resolve('data');
const historyFile = join(dataDir, 'risk-history.jsonl');
const MAX_HISTORY_LINES = 25000;
const HISTORY_TZ_OFFSET_MS = -3 * 60 * 60 * 1000; // America/Sao_Paulo, sem horario de verao

loadEnvFile(resolve('.env'));
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
if (!existsSync(historyFile)) writeFileSync(historyFile, '');

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 4173);
const distDir = resolve('dist');
const imageDir = resolve('imagen');
const TRANSFORMERS_CACHE_MS = Number(process.env.TRANSFORMERS_CACHE_MS || 5 * 60 * 1000);
const SFTP_CONFIG = {
  host: process.env.SFTP_HOST || 'sftp-corj.light.com.br',
  port: Number(process.env.SFTP_PORT || 22),
  username: process.env.SFTP_USERNAME || '',
  password: process.env.SFTP_PASSWORD || '',
};
const SFTP_REMOTE_DIR = process.env.SFTP_REMOTE_DIR || '/Light/';
let transformersCache = { updatedAt: 0, data: null };

const apiRoutes = new Map([
  ['/api/sirenes', 'http://websirene.rio.rj.gov.br/xml/sirenes.xml'],
  ['/api/estagio-cidade', 'https://appcor.cor-rio.work/estagio_cidade'],
  ['/api/calor', 'https://appcor.cor-rio.work/calor_api'],
  ['/api/pluviometricos', 'https://websempre.rio.rj.gov.br/json/dados_pluviometricos'],
  ['/api/previsao-estendida', 'https://www.sistema-alerta-rio.com.br/upload/xml/PrevisaoEstendida.xml'],
  ['/api/previsao-agora', 'https://www.sistema-alerta-rio.com.br/upload/xml/PrevisaoNew.xml'],
  ['/api/waze-tvt', 'https://www.waze.com/row-partnerhub-api/feeds-tvt/?id=18577882871'],
]);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/api/history' && req.method === 'POST') {
    handleHistoryPost(req, res);
    return;
  }

  if (requestUrl.pathname === '/api/history' && req.method === 'GET') {
    handleHistoryGet(requestUrl, res);
    return;
  }

  if (requestUrl.pathname === '/api/transformadores' && req.method === 'GET') {
    handleTransformadoresGet(res);
    return;
  }

  const apiTarget = apiRoutes.get(requestUrl.pathname);

  if (apiTarget) {
    proxyRequest(req, res, apiTarget);
    return;
  }

  serveStatic(requestUrl.pathname, res);
}).listen(port, host, () => {
  console.log(`JARVIS COR rodando em http://${host}:${port}`);
});

function handleHistoryPost(req, res) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 200_000) req.destroy();
  });
  req.on('end', () => {
    try {
      const payload = JSON.parse(body);
      if (!payload || typeof payload !== 'object' || !payload.regions || typeof payload.ts !== 'number') {
        throw new Error('payload invalido');
      }
      appendHistoryLine({ ts: payload.ts, regions: payload.regions });
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
  });
  req.on('error', () => {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: 'Falha ao ler requisicao' }));
  });
}

function handleHistoryGet(requestUrl, res) {
  try {
    const days = Math.max(1, Math.min(30, Number(requestUrl.searchParams.get('days') || 7)));
    const summary = summarizeHistory(days);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(summary));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: error.message }));
  }
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  readFileSync(filePath, 'utf8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) return;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
}

async function handleTransformadoresGet(res) {
  try {
    const now = Date.now();
    if (transformersCache.data && now - transformersCache.updatedAt < TRANSFORMERS_CACHE_MS) {
      writeJson(res, 200, { ...transformersCache.data, cached: true });
      return;
    }
    const data = await fetchTransformersFromSftp();
    transformersCache = { updatedAt: now, data };
    writeJson(res, 200, { ...data, cached: false });
  } catch (error) {
    writeJson(res, 503, { ok: false, error: error.message });
  }
}

async function fetchTransformersFromSftp() {
  if (!SFTP_CONFIG.username || !SFTP_CONFIG.password) {
    throw new Error('Credenciais SFTP nao configuradas: defina SFTP_USERNAME e SFTP_PASSWORD');
  }

  const { default: SftpClient } = await import('ssh2-sftp-client');
  const sftp = new SftpClient();
  try {
    await sftp.connect({
      host: SFTP_CONFIG.host,
      port: SFTP_CONFIG.port,
      username: SFTP_CONFIG.username,
      password: SFTP_CONFIG.password,
      readyTimeout: Number(process.env.SFTP_READY_TIMEOUT || 15000),
    });
    const files = (await sftp.list(SFTP_REMOTE_DIR))
      .filter((file) => file.type !== 'd' && /\.kml$/i.test(file.name))
      .sort((a, b) => (Number(b.modifyTime || 0) - Number(a.modifyTime || 0)) || b.name.localeCompare(a.name));
    if (!files.length) throw new Error(`Nenhum arquivo .kml encontrado em ${SFTP_REMOTE_DIR}`);

    const file = files[0];
    const remotePath = `${SFTP_REMOTE_DIR.replace(/\/?$/, '/')}${file.name}`;
    const payload = await sftp.get(remotePath);
    const kml = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload);
    const transformers = parseTransformersKml(kml);

    return {
      ok: true,
      source: {
        type: 'sftp',
        host: SFTP_CONFIG.host,
        remoteDir: SFTP_REMOTE_DIR,
        file: file.name,
        modifiedAt: file.modifyTime ? new Date(file.modifyTime).toISOString() : null,
      },
      count: transformers.length,
      transformers,
    };
  } finally {
    try {
      await sftp.end();
    } catch {
      // Conexao ja encerrada.
    }
  }
}

function parseTransformersKml(kml) {
  const placemarks = [...String(kml).matchAll(/<Placemark\b[\s\S]*?<\/Placemark>/gi)].map((match) => match[0]);
  return placemarks.map((block, index) => {
    const coordinateText = firstTag(block, 'coordinates');
    const [lng, lat] = String(coordinateText || '').trim().split(/\s+/)[0]?.split(',').map(Number) || [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const description = cleanXmlText(firstTag(block, 'description'));
    const fields = extractKmlFields(block, description);
    const name = cleanXmlText(firstTag(block, 'name')) || `Transformador ${index + 1}`;
    const text = `${name} ${description} ${cleanXmlText(block)}`;
    const location = bestField(fields, ['endereco', 'logradouro', 'rua', 'local', 'localidade', 'referencia', 'ponto', 'bairro'])
      || description
      || name;
    return {
      id: stableId(`${name}|${lat.toFixed(6)}|${lng.toFixed(6)}`),
      name,
      description,
      fields,
      location,
      bairro: bestField(fields, ['bairro', 'comunidade', 'localidade']),
      endereco: bestField(fields, ['endereco', 'logradouro', 'rua']),
      referencia: bestField(fields, ['referencia', 'ponto', 'local']),
      circuito: bestField(fields, ['circuito', 'alimentador', 'linha']),
      codigo: bestField(fields, ['codigo', 'cod', 'id', 'numero', 'transformador']),
      lat,
      lng,
      status: inferTransformerStatus(text),
    };
  }).filter(Boolean);
}

function extractKmlFields(block, description) {
  const fields = {};
  [...String(block).matchAll(/<Data\b[^>]*name=["']([^"']+)["'][^>]*>[\s\S]*?<value\b[^>]*>([\s\S]*?)<\/value>[\s\S]*?<\/Data>/gi)]
    .forEach((match) => addField(fields, match[1], match[2]));
  [...String(block).matchAll(/<SimpleData\b[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/SimpleData>/gi)]
    .forEach((match) => addField(fields, match[1], match[2]));

  const descriptionText = cleanXmlText(description);
  descriptionText.split(/\s*(?:\||;|\n)\s*/).forEach((part) => {
    const match = part.match(/^([^:=]{2,40})\s*[:=]\s*(.+)$/);
    if (match) addField(fields, match[1], match[2]);
  });
  return fields;
}

function addField(fields, rawKey, rawValue) {
  const key = normalizeFieldKey(cleanXmlText(rawKey));
  const value = cleanXmlText(rawValue);
  if (!key || !value || fields[key]) return;
  fields[key] = value;
}

function normalizeFieldKey(key) {
  return String(key || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function bestField(fields, keys) {
  return keys.map((key) => fields[key]).find(Boolean) || '';
}

function firstTag(text, tag) {
  const match = String(text).match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1] : '';
}

function cleanXmlText(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function inferTransformerStatus(text) {
  const normalized = String(text || '').toLowerCase();
  if (/(normal|online|operando|energizado|ligado)/.test(normalized)) return 'online';
  if (/(fora|offline|desligad|interrompid|sem energia|defeito|inoperante|aberto|falha)/.test(normalized)) return 'offline';
  return 'offline';
}

function stableId(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return `tr-${Math.abs(hash).toString(36)}`;
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(payload));
}

function appendHistoryLine(entry) {
  appendFileSync(historyFile, `${JSON.stringify(entry)}\n`);
  trimHistoryIfNeeded();
}

let linesSinceTrimCheck = 0;
function trimHistoryIfNeeded() {
  linesSinceTrimCheck += 1;
  if (linesSinceTrimCheck < 500) return;
  linesSinceTrimCheck = 0;
  const lines = readFileSync(historyFile, 'utf8').split('\n').filter(Boolean);
  if (lines.length > MAX_HISTORY_LINES) {
    writeFileSync(historyFile, `${lines.slice(-MAX_HISTORY_LINES).join('\n')}\n`);
  }
}

function saoPauloDateKey(ts) {
  const shifted = new Date(ts + HISTORY_TZ_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

function summarizeHistory(days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const lines = readFileSync(historyFile, 'utf8').split('\n').filter(Boolean);
  const byRegionDay = new Map();

  lines.forEach((line) => {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      return;
    }
    if (!entry || typeof entry.ts !== 'number' || entry.ts < cutoff) return;
    const dateKey = saoPauloDateKey(entry.ts);
    Object.entries(entry.regions || {}).forEach(([regionId, data]) => {
      const score = Number(data?.score);
      if (!Number.isFinite(score)) return;
      const mapKey = `${regionId}|${dateKey}`;
      const bucket = byRegionDay.get(mapKey) || { regionId, date: dateKey, sum: 0, count: 0, max: 0 };
      bucket.sum += score;
      bucket.count += 1;
      bucket.max = Math.max(bucket.max, score);
      byRegionDay.set(mapKey, bucket);
    });
  });

  const dateKeys = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    dateKeys.push(saoPauloDateKey(Date.now() - i * 24 * 60 * 60 * 1000));
  }

  const regions = {};
  byRegionDay.forEach((bucket) => {
    const list = regions[bucket.regionId] || (regions[bucket.regionId] = {});
    list[bucket.date] = { maxScore: bucket.max, avgScore: Math.round(bucket.sum / bucket.count) };
  });

  const result = {};
  Object.keys(regions).forEach((regionId) => {
    result[regionId] = dateKeys.map((date) => ({ date, ...(regions[regionId][date] || null) }));
  });

  return { days: dateKeys, regions: result };
}

function proxyRequest(req, res, target) {
  const targetUrl = new URL(target);
  const client = targetUrl.protocol === 'http:' ? http : https;
  const upstream = client.request({
    method: 'GET',
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port || undefined,
    path: `${targetUrl.pathname}${targetUrl.search}`,
    headers: {
      Accept: '*/*',
      'User-Agent': 'JARVIS-COR-Live/0.1',
    },
    timeout: 15000,
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, {
      'Content-Type': upstreamRes.headers['content-type'] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    upstreamRes.pipe(res);
  });

  upstream.on('timeout', () => upstream.destroy(new Error('Timeout na API externa')));
  upstream.on('error', (error) => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: error.message }));
  });
  upstream.end();
}

function serveStatic(pathname, res) {
  const requestedPath = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const assetPath = staticImagePath(requestedPath);
  const filePath = normalize(join(distDir, requestedPath));
  const distPath = filePath.startsWith(distDir) && existsSync(filePath) && statSync(filePath).isFile()
    ? filePath
    : null;
  const safePath = assetPath || distPath || join(distDir, 'index.html');

  if (!existsSync(safePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Build nao encontrado. Rode: npm run build');
    return;
  }

  res.writeHead(200, {
    'Content-Type': contentTypes[extname(safePath)] || 'application/octet-stream',
    'Cache-Control': safePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(safePath).pipe(res);
}

function staticImagePath(requestedPath) {
  if (!requestedPath.startsWith('/imagen/')) return null;

  const relativePath = requestedPath.slice('/imagen/'.length);
  const filePath = normalize(join(imageDir, relativePath));
  return filePath.startsWith(imageDir) && existsSync(filePath) && statSync(filePath).isFile()
    ? filePath
    : null;
}
