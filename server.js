import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import http from 'node:http';
import https from 'node:https';

const dataDir = resolve('data');
const historyFile = join(dataDir, 'risk-history.jsonl');
const MAX_HISTORY_LINES = 25000;
const HISTORY_TZ_OFFSET_MS = -3 * 60 * 60 * 1000; // America/Sao_Paulo, sem horario de verao

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
if (!existsSync(historyFile)) writeFileSync(historyFile, '');

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 4173);
const distDir = resolve('dist');
const imageDir = resolve('imagen');

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
