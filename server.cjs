const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const allowed = new Set(['/index.html', '/style.css', '/app.js']);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };
const port = Number(process.env.PORT || 4173);
http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (pathname === '/') pathname = '/index.html';
  if (!allowed.has(pathname)) { res.writeHead(404).end('Not found'); return; }
  fs.readFile(path.join(root, pathname.slice(1)), (error, content) => {
    if (error) { res.writeHead(500).end('Unable to load file'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(pathname)] });
    res.end(content);
  });
}).listen(port, '127.0.0.1', () => console.log(`Tideway: http://localhost:${port}`));
