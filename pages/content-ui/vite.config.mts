import { resolve } from 'node:path';
import { makeEntryPointPlugin } from '@extension/hmr';
import { withPageConfig } from '@extension/vite-config';
import { IS_DEV } from '@extension/env';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

const rootDir = resolve(import.meta.dirname);
const srcDir = resolve(rootDir, 'src');

export default withPageConfig({
  resolve: {
    alias: {
      '@src': srcDir,
    },
  },
  plugins: [IS_DEV && makeEntryPointPlugin(), wasm(), topLevelAwait()],
  publicDir: resolve(rootDir, 'public'),
  build: {
    lib: {
      name: 'contentUI',
      fileName: 'index',
      formats: ['es'],
      entry: resolve(srcDir, 'index.tsx'),
    },
    outDir: resolve(rootDir, '..', '..', 'dist', 'content-ui'),
  },
});
