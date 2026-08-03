// Сборка PWA-визитки — отдельный продукт на своём домене.
//
// Конфиг намеренно свой, а не общий с основным приложением: у визитки другой
// манифест, другой Service Worker и другой набор кэшируемых файлов. Общий
// остаётся только исходный код (../src) и серверные функции (../api).
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Общий код лежит выше корня — разрешаем Vite его читать.
  server: {
    host: true,
    port: 4174,
    // В деве публикация и чтение визитки ходят в боевые функции Vercel:
    // локально serverless-функций нет, а без них нечего проверять.
    proxy: {
      '/api': {
        target: 'https://eventory-mvp.vercel.app',
        changeOrigin: true,
        secure: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      filename: 'sw.js',
      includeAssets: ['icon.png', 'icon-192.png', 'maskable-icon.png'],
      workbox: {
        // woff2 в precache: фирменная антиква должна быть и офлайн.
        // TTF (99КБ) намеренно не кэшируем — это запасной вариант для
        // старых браузеров, грузится только если woff2 не поддержан.
        globPatterns: [
          '**/*.{js,css,html,svg,webmanifest,woff2}',
          'business-card-templates/onboarding/*.webp'
        ],
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        // /api/ — живые серверные функции: публикация и чтение визитки
        // никогда не должны отдаваться из кэша.
        navigateFallbackDenylist: [/^\/api\//],
        // Компактные onboarding-фоны доступны сразу и офлайн. Выбранный
        // полноразмерный шаблон сохраняется при первом использовании.
        runtimeCaching: [
          {
            urlPattern: /\/business-card-templates\/.*\.webp$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'eventory-card-templates-v1',
              expiration: {
                maxEntries: 32,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ],
        // Новая версия ждёт явного нажатия «Обновить». После сообщения
        // SKIP_WAITING она активируется и берёт вкладку под контроль.
        skipWaiting: false,
        clientsClaim: true
      },
      manifest: {
        name: 'Визитка',
        short_name: 'Визитка',
        description: 'Бесплатная электронная визитка: контакты, услуги, QR-код и ссылка.',
        lang: 'ru',
        categories: ['business', 'productivity'],
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0B0F14',
        theme_color: '#0B0F14',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/maskable-icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          {
            name: 'QR-код визитки',
            short_name: 'QR',
            description: 'Показать QR-код',
            url: '/#/share'
          }
        ]
      }
    })
  ]
});
