import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/web', { recursive: true });
await build({ entryPoints: ['apps/web/main.tsx'], outdir: 'dist/web', entryNames: 'app', bundle: true, minify: true,
  platform: 'browser', target: ['es2022'], jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
await copyFile('apps/web/index.html', 'dist/web/index.html');
