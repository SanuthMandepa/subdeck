// Tiny zero-dependency static server for Subdeck.
//
// Why bother instead of double-clicking index.html?
//   * file:// pages get an opaque origin, which blocks some of the WASM/worker
//     plumbing that transformers.js uses.
//   * The COOP/COEP headers below turn on cross-origin isolation, which lets
//     onnxruntime-web use SharedArrayBuffer and run Whisper multi-threaded.
//     On a machine without WebGPU that is the difference between "slow" and
//     "unusably slow".
//   * COEP is `credentialless` rather than `require-corp` so the Google Fonts
//     stylesheet and the CDN module import still load normally.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname);
const PORT = Number(process.argv.find(a => /^\d+$/.test(a)) || process.env.PORT || 8080);
const ISOLATE = !process.argv.includes('--no-isolate');

const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon',
  '.woff2':'font/woff2', '.wasm':'application/wasm', '.txt':'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const head = {
    'Cache-Control': 'no-store',
    ...(ISOLATE ? {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    } : {}),
  };
  try {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = join(ROOT, normalize(rel).replace(/^([/\\])+/, ''));
    if (!file.startsWith(ROOT)) { res.writeHead(403, head).end('forbidden'); return; }

    const info = await stat(file);
    if (info.isDirectory()) { res.writeHead(404, head).end('not found'); return; }

    const body = await readFile(file);
    res.writeHead(200, { ...head, 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { ...head, 'Content-Type': 'text/plain' }).end('not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`\n  SUBDECK  ${url}`);
  console.log(`  cross-origin isolation: ${ISOLATE ? 'on (faster CPU transcription)' : 'off'}`);
  console.log(`  serving ${ROOT}`);
  console.log(`  ctrl+c to stop\n`);
  if (!process.argv.includes('--no-open')) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"`
      : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    import('node:child_process').then(cp => cp.exec(cmd, () => {}));
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is busy. Try:  node serve.mjs 8081\n`);
    process.exit(1);
  }
  throw err;
});
