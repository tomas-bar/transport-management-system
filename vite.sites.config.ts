import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';
import { sites } from './scripts/vite/sites-vite-plugin';
export default mergeConfig(base, defineConfig({ plugins: [sites({ mockAuth: false })], build: { outDir: 'dist/client', emptyOutDir: true } }));
