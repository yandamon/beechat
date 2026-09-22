import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // 把 workspace 内的共享包打进产物，线上只需要 dist/ 和 node_modules
  noExternal: ['@beechat/shared'],
});
