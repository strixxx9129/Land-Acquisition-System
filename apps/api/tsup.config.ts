import { defineConfig } from 'tsup';

// Bundles the API and the workspace `@lams/shared` package into dist/ so Render
// runs plain JavaScript. npm dependencies stay external and load from node_modules.
export default defineConfig({
  entry: { index: 'src/index.ts', seed: 'src/seed/cli.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  clean: true,
  noExternal: ['@lams/shared'],
  external: ['mongodb-memory-server'],
});
