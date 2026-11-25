import { VitePWA } from 'vite-plugin-pwa';
import { SPEECH_RUNTIME_CACHE } from '../../tools/speechRuntimeCache';

// PWA configuration for the Order_App (scope /order/).
// The PWA_Shell (app shell, routes, fonts, icons) is precached. Speech_Model files and the
// onnxruntime wasm are deliberately excluded: they are cached separately, on demand.
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
      theme_color: '#0f0b14',
      background_color: '#0f0b14',
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
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      // The speech runtime (~14 MB WASM + its JS glue) is not precached: it is fetched the first
      // time voice loads, which is right after the user-started model download, and then kept
      // so voice works offline. Model files themselves live in awaaz-speech-model-v1.
      runtimeCaching: [SPEECH_RUNTIME_CACHE],
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      // Background Sync handler (tag awaaz-sync), loaded relative to /order/sw.js.
      importScripts: ['sw-sync.js'],
    },
  });
