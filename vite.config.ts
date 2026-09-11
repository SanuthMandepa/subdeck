import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * Keep onnxruntime-web's 22 MB wasm out of the bundle.
 *
 * ORT's loader glue ends with `new URL("ort-wasm-….wasm", import.meta.url)` as
 * a *fallback*, taken only when `locateFile` is unset. We always set
 * `wasmPaths` (see engine/asr.ts), which sets `locateFile`, so that branch is
 * dead code — but Vite still sees the `import.meta.url` pattern and emits the
 * whole 22 MB file as an asset nobody ever requests.
 *
 * Rewriting the base off `import.meta.url` stops the emission. The expression
 * stays syntactically valid, it is simply never evaluated.
 */
function dropBundledOrtWasm(): Plugin {
  const PATTERN = /new URL\((["'`])(ort-wasm-[^"'`]*\.wasm)\1\s*,\s*import\.meta\.url\s*\)/g;
  return {
    name: 'subdeck:drop-bundled-ort-wasm',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('onnxruntime-web') || !PATTERN.test(code)) return null;
      PATTERN.lastIndex = 0;
      return {
        code: code.replace(PATTERN, (_m, q: string, file: string) => `new URL(${q}${file}${q}, ${q}https://unused.invalid/${q})`),
        map: null,
      };
    },
  };
}

/*
 * Cross-origin isolation is load-bearing, not cosmetic.
 *
 * COOP/COEP switch on `crossOriginIsolated`, which is what lets
 * onnxruntime-web use SharedArrayBuffer and run Whisper multi-threaded. On a
 * machine without WebGPU that is the difference between "slow" and "unusably
 * slow", so the dev and preview servers have to reproduce what the production
 * host sends (see vercel.json) — otherwise CPU transcription silently
 * degrades in development and nobody notices until it ships.
 *
 * COEP is `credentialless` rather than `require-corp` so the Google Fonts
 * stylesheet and the Hugging Face model CDN still load without CORP headers.
 */
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  plugins: [react(), dropBundledOrtWasm()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  build: {
    target: 'es2022',
    // The Whisper runtime is ~1 MB of glue that only matters once someone
    // presses Auto-transcribe, so it is dynamically imported and split out.
    chunkSizeWarningLimit: 1200,
  },
  optimizeDeps: {
    // transformers.js resolves its own wasm/worker assets at runtime; letting
    // esbuild pre-bundle it rewrites those paths and breaks the ORT backend.
    exclude: ['@huggingface/transformers'],
  },
  worker: { format: 'es' },
});
