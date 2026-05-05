import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  // 将根目录的 assets/ 作为静态资源目录，前端可以通过 /assets/... 访问
  publicDir: path.resolve(__dirname, '../assets'),
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
