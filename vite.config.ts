import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '课堂归档',
        short_name: '课堂归档',
        description: '按课程表自动归档课堂照片',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      // OpenCV WASM chunk 15MB，不进预缓存，首次用到时走运行时缓存
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globIgnores: ['**/opencv-*.js'],
        runtimeCaching: [
          {
            urlPattern: /opencv-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'opencv-wasm',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
    }),
  ],
});
