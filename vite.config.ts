import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      // push-sw.js adds the cooking-timer notifications to the generated service worker.
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'], importScripts: ['push-sw.js'] },
      manifest: {
        name: 'Bucătăria cu povești',
        short_name: 'Bucătăria',
        description: 'Rețetele familiei și povești audio pentru copii',
        lang: 'ro',
        theme_color: '#3e6a51',
        background_color: '#f2f3ee',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
})
