import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { VitePWA } from 'vite-plugin-pwa';
import { packageManifestDefine } from '../../tools/packageManifest';

// Served under /bill/ on the shared origin (design: Hosting).
export default defineConfig({
  base: '/bill/',
  define: packageManifestDefine(),
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Bill Awaaz',
        short_name: 'Bill Awaaz',
        description: 'Speak a bill, review it, confirm it. Works offline.',
        lang: 'en',
        id: '/bill/',
        scope: '/bill/',
        start_url: '/bill/',
        display: 'standalone',
        theme_color: '#0f766e',
        background_color: '#f0fdfa',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell, routes, fonts and icons only. The onnxruntime wasm (~29 MB)
        // and Speech_Model files are excluded; they are cached at runtime by the
        // speech provider's own model cache (Req 3.x), not by the PWA precache.
        globPatterns: ['**/*.{js,css,html,woff,woff2,png,svg,ico,webmanifest}'],
        globIgnores: [
          '**/*.wasm',
          '**/*.onnx',
          '**/*.bin',
          '**/*.gguf',
          '**/*.safetensors',
          '**/models/**',
          '**/ort-*',
          '**/ort.*',
        ],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/bill/index.html',
        navigateFallbackAllowlist: [/^\/bill\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // Background Sync handler (tag awaaz-sync), loaded relative to /bill/sw.js.
        importScripts: ['sw-sync.js'],
      },
    }),
  ],
  server: { port: 5174 },
  preview: { port: 4174 },
  build: { target: 'es2022' },
});
