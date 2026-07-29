import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import http from 'node:http';
import https from 'node:https';

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
  const apiTarget = apiRoutes.get(requestUrl.pathname);

  if (apiTarget) {
    proxyRequest(req, res, apiTarget);
    return;
  }

  serveStatic(requestUrl.pathname, res);
}).listen(port, host, () => {
  console.log(`JARVIS COR rodando em http://${host}:${port}`);
});

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
