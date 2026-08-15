import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useProductionApi = mode === 'production-api';
  const productionApi = env.VITE_API_PROXY_TARGET ?? 'https://freq.itbcursos.com';
  return {
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Frequência ITB',
        short_name: 'Frequência ITB',
        description: 'Controle de frequência offline-first do Instituto Transforma Brasil.',
        theme_color: '#102A43',
        background_color: '#F4F7FA',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [],
      },
    }),
  ],
  server: useProductionApi ? {
    proxy: {
      '/api': {
        target: productionApi,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  } : undefined,
  test: {
    environment: 'node',
    setupFiles: './src/test/setup.ts',
  },
};
});
