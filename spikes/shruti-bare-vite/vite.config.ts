import { defineConfig } from "vite";

// Standalone spike: not part of the pnpm workspace.
export default defineConfig({
  // onnxruntime-web ships its own wasm; keep it out of dep pre-bundling.
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  server: {
    headers: {
      // Enables SharedArrayBuffer so multi-threaded WASM can be tried.
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
