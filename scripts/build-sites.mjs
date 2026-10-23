import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
rmSync('dist', { recursive: true, force: true });
for (const args of [['node_modules/typescript/bin/tsc', '-b'], ['node_modules/vite/bin/vite.js', 'build', '--mode', 'sites', '--config', 'vite.sites.config.ts']]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
mkdirSync('dist/server', { recursive: true });
await build({ entryPoints: ['edge/worker.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: 'dist/server/index.js', minify: true });
writeFileSync('dist/server/wrangler.json', JSON.stringify({ name: 'krypta', main: './index.js', compatibility_date: '2026-10-23', compatibility_flags: ['nodejs_compat'], assets: { directory: '../client', binding: 'ASSETS', run_worker_first: true } }, null, 2));
