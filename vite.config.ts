import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
      manifest: {
        name: 'Kitchen Tales',
        short_name: 'Kitchen Tales',
        description: 'Rețetele familiei și povești audio pentru copii',
        lang: 'ro',
        theme_color: '#3e6a51',
        background_color: '#f2f3ee',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
