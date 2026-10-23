import { defineConfig, mergeConfig } from 'vite';
import { existsSync } from 'node:fs';
import base from './vite.config';
import { sites } from './scripts/vite/sites-vite-plugin';

// Hosting identity is supplied by Sites, not checked into a clean source checkout.
const hosting = existsSync(new URL('./.openai/hosting.json', import.meta.url));
export default mergeConfig(base, defineConfig({
  plugins: hosting ? [sites({ mockAuth: false })] : [],
  build: { outDir: 'dist/client', emptyOutDir: true },
}));
