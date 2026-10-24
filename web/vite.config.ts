import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useProductionApi = mode === 'production-api';
  const targetApi = env.VITE_API_PROXY_TARGET ?? (useProductionApi ? 'https://erp.itbcursos.com' : 'http://127.0.0.1:8787');

  return {
    plugins: [
      tailwindcss(),
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'ERPITB',
          short_name: 'ERPITB',
          description: 'Plataforma de gestão integrada do Instituto Transforma Brasil.',
          theme_color: '#102A43',
          background_color: '#F4F7FA',
          display: 'standalone',
          start_url: '/',
          icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
        },
        workbox: {
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/],
        },
      }),
    ],
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
