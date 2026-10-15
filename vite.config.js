import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 3000,
    open: false,
    host: true,
    allowedHosts: ['.trycloudflare.com', 'gordon-serving-chain-least.trycloudflare.com']
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts: ['.trycloudflare.com', 'gordon-serving-chain-least.trycloudflare.com']
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});
