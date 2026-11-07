import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      workbox: {
        // The push + notification-click handlers for the task reminders (public/push-sw.js).
        importScripts: ['push-sw.js'],
        // The note PDF export (src/lib/notePdf.ts) loads jsPDF and its add-ons only when used -
        // keep them out of the install download; they're cached the first time someone exports.
        globIgnores: ['**/jspdf*.js', '**/html2canvas*.js', '**/purify*.js', '**/index.es-*.js'],
        // Geist (index.html) comes from Google Fonts - cache it so an
        // installed app keeps its typography offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /^\/(fonts\/.*\.ttf|assets\/jspdf[^/]*\.js)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'pdf-export', expiration: { maxEntries: 6 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'MyConfía',
        short_name: 'MyConfía',
        description: 'Your notes and tasks, organised by initiative',
        theme_color: '#fdfbf7',
        background_color: '#fdfbf7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
