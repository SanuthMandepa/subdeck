import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
  plugins: [react()],
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
