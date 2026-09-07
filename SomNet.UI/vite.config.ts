/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    globals: false,
  },
  server: {
    port: 56761,
    // Used only when running `npm run dev` standalone (optional hot-reload workflow).
    proxy: {
      '/api': {
        target: 'http://localhost:5031',
        changeOrigin: true,
      },
    },
  },
});
