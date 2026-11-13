import { VitePWA } from 'vite-plugin-pwa';

// PWA configuration for the Order_App (scope /order/).
// The PWA_Shell (app shell, routes, fonts, icons) is precached. Speech_Model files and the
// ~29MB onnxruntime wasm are deliberately excluded: they are cached separately, on demand.
const SCOPE = '/order/';

export const MODEL_EXCLUDE_GLOBS = [
  '**/*.wasm',
  '**/*.onnx',
  '**/*.ort',
  '**/*.bin',
  '**/*.safetensors',
  '**/*.gguf',
  '**/*onnxruntime*',
  '**/*ort-wasm*',
  '**/models/**',
];

export const orderPwa = () =>
  VitePWA({
    registerType: 'autoUpdate',
    base: SCOPE,
    scope: SCOPE,
    includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
    manifest: {
      name: 'Order Awaaz',
      short_name: 'Order Awaaz',
      description: 'Speak or type a shopping request and confirm it as an order.',
      id: SCOPE,
      start_url: SCOPE,
      scope: SCOPE,
      display: 'standalone',
      orientation: 'portrait',
      theme_color: '#e8710a',
      background_color: '#ffffff',
      icons: [
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        {
          src: 'pwa-maskable-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
        { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,ttf,webmanifest}'],
      globIgnores: MODEL_EXCLUDE_GLOBS,
      navigateFallback: `${SCOPE}index.html`,
      navigateFallbackAllowlist: [new RegExp(`^${SCOPE}`)],
      // Anything model-like is never matched by runtime caching either.
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      // Background Sync handler (tag awaaz-sync), loaded relative to /order/sw.js.
      importScripts: ['sw-sync.js'],
    },
  });
