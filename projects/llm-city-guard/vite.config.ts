import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const skipModels = process.env.VITE_SKIP_MODELS === '1';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? './',
  publicDir: skipModels ? false : 'public',
  plugins: skipModels ? [{
    name: 'copy-avatar-for-native-webview',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'avatar/character.vrm', source: readFileSync(resolve(__dirname, 'public/avatar/character.vrm')) });
      this.emitFile({ type: 'asset', fileName: 'avatar/LICENSE.md', source: readFileSync(resolve(__dirname, 'public/avatar/LICENSE.md')) });
    },
  }] : [],
  server: {
    host: '0.0.0.0',
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: { format: 'es' },
  build: { rollupOptions: { input: { game: resolve(__dirname, 'index.html') } } },
});
