import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Include all modules that need polyfill
      include: ['crypto', 'stream', 'util', 'buffer', 'process'],
      // Whether to polyfill `global`
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      // Use full polyfill
      protocolImports: true,
    }),
    // Ensure WASM files are handled correctly
    {
      name: 'wasm-loader',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm')
          }
          next()
        })
      },
    },
  ],
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
      include: [/keccak/, /node_modules/],
    },
  },
  define: {
    'global': 'globalThis',
  },
  resolve: {
    alias: {
      'process': 'process/browser',
      'buffer': 'buffer',
      'keccak': '/src/polyfills/keccak.ts',
      'fetch-retry': '/src/polyfills/fetch-retry.ts',
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
      // Support Node.js built-in modules
      target: 'esnext',
    },
    // Exclude problematic packages, let Vite handle them directly
    exclude: [
      '@zama-fhe/relayer-sdk',
      'keccak',
      'fetch-retry',
    ],
    // Fix RainbowKit's vanilla-extract CSS issue
    include: [
      '@vanilla-extract/css',
    ],
  },
  // Ensure WASM files are handled correctly
  assetsInclude: ['**/*.wasm'],
  server: {
    headers: {
      // These headers are required for SharedArrayBuffer and WASM
      // Note: If using Coinbase Wallet, these settings may need adjustment
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      // Allow loading WASM modules
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
    // Ensure WASM files are handled correctly
    fs: {
      // Allow access to WASM files in node_modules
      allow: ['..'],
    },
  },
  worker: {
    format: 'es',
  },
})
