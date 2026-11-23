import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false, // Run integration files sequentially to prevent Argon2id CPU contention
  },
});
