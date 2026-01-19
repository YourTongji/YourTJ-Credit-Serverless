/* eslint-disable no-console */
/**
 * Minimal dev server for `vercel dev` to avoid recursive invocation.
 * It is NOT used in production deployments.
 */

const http = require('http');

const port = Number(process.env.PORT || 3000);

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('YourTJ Credit backend dev server');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[dev-server] listening on http://127.0.0.1:${port}`);
});

