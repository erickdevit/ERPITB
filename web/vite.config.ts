import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useProductionApi = mode === 'production-api';
  const targetApi = env.VITE_API_PROXY_TARGET ?? env.VITE_API_URL ?? 'http://127.0.0.1:8787';

  return {
    plugins: [
      tailwindcss(),
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'ops-logo.svg'],
        manifest: {
          name: 'opschool',
          short_name: 'opschool',
          description: 'Plataforma Integrada de Gestão Escolar',
          theme_color: '#102A43',
          background_color: '#F4F7FA',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/, /^\/v1/, /^\/auth/, /^\/sync/, /^\/health/, /^\/portal/, /^\/public/],
          clientsClaim: true,
          skipWaiting: true,
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    build: {
      chunkSizeWarningLimit: 950,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/exceljs')) return 'vendor-excel';
            if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) return 'vendor-pdf';
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'vendor-charts';
          },
        },
      },
    },
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: targetApi,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    test: {
      environment: 'node',
      setupFiles: './src/test/setup.ts',
    },
  };
});
