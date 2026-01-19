/* eslint-disable no-console */
/**
 * Minimal local server that runs the compiled Vercel handlers from dist/.
 *
 * This avoids `vercel dev` recursion issues while still exercising the real API code
 * against a real LibSQL database.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

function loadDotEnvIfPresent(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

function createVercelResponse(nodeRes) {
  return {
    setHeader: (k, v) => nodeRes.setHeader(k, v),
    status: (code) => {
      nodeRes.statusCode = code;
      return {
        json: (obj) => sendJson(nodeRes, code, obj),
        end: (body) => nodeRes.end(body)
      };
    },
    json: (obj) => sendJson(nodeRes, nodeRes.statusCode || 200, obj),
    end: (body) => nodeRes.end(body)
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  const ctype = String(req.headers['content-type'] || '');
  if (ctype.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  return raw;
}

function matchRoute(method, pathname) {
  const routes = [
    ['POST', /^\/api\/wallet\/register$/, 'api/wallet/register.js'],
    ['GET', /^\/api\/wallet\/([^/]+)$/, 'api/wallet/[userHash].js', ['userHash']],
    ['GET', /^\/api\/wallet\/([^/]+)\/balance$/, 'api/wallet/[userHash]/balance.js', ['userHash']],

    ['POST', /^\/api\/transaction\/create$/, 'api/transaction/create.js'],
    ['POST', /^\/api\/transaction\/transfer$/, 'api/transaction/transfer.js'],
    ['GET', /^\/api\/transaction\/history\/([^/]+)$/, 'api/transaction/history/[userHash].js', ['userHash']],
    ['GET', /^\/api\/transaction\/([^/]+)$/, 'api/transaction/[txId].js', ['txId']],

    ['POST', /^\/api\/wordlist\/token$/, 'api/wordlist/token.js'],
    ['GET', /^\/api\/wordlist$/, 'api/wordlist/index.js'],

    ['POST', /^\/api\/redeem$/, 'api/redeem.js']
  ];

  for (const [m, re, mod, paramNames] of routes) {
    if (m !== method) continue;
    const match = pathname.match(re);
    if (!match) continue;
    const params = {};
    if (paramNames) {
      paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
    }
    return { modulePath: mod, params };
  }

  return null;
}

async function main() {
  const backendDir = path.resolve(__dirname, '..');
  const distDir = path.join(backendDir, 'dist');

  loadDotEnvIfPresent(path.join(backendDir, '.env'));

  const port = Number(process.env.PORT || 3001);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const method = req.method || 'GET';

      // Catch-all admin route: /api/admin/*
      if (url.pathname === '/api/admin' || url.pathname.startsWith('/api/admin/')) {
        const rest = url.pathname === '/api/admin' ? '' : url.pathname.slice('/api/admin/'.length);
        const slug = rest ? rest.split('/').filter(Boolean) : [];
        const handlerModule = require(path.join(distDir, 'api/admin/[...slug].js'));
        const handler = handlerModule.default || handlerModule;
        const body = await readBody(req);

        const query = {};
        for (const [k, v] of url.searchParams.entries()) query[k] = v;
        query.slug = slug;

        const vercelReq = {
          method,
          headers: req.headers,
          query,
          body,
          socket: { remoteAddress: req.socket.remoteAddress }
        };
        const vercelRes = createVercelResponse(res);
        await handler(vercelReq, vercelRes);
        return;
      }

      const route = matchRoute(method, url.pathname);

      if (!route) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      const handlerModule = require(path.join(distDir, route.modulePath));
      const handler = handlerModule.default || handlerModule;
      const body = await readBody(req);

      const query = {};
      for (const [k, v] of url.searchParams.entries()) query[k] = v;
      Object.assign(query, route.params);

      const vercelReq = {
        method,
        headers: req.headers,
        query,
        body,
        socket: { remoteAddress: req.socket.remoteAddress }
      };
      const vercelRes = createVercelResponse(res);

      await handler(vercelReq, vercelRes);
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { success: false, error: '服务器错误' });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[local-api] listening on http://127.0.0.1:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
