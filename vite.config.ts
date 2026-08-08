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
      includeAssets: [
        'favicon.svg',
        'favicon-32.png',
        'apple-touch-icon.png',
      ],
      manifest: {
        name: 'Fitness Coach',
        short_name: 'Coach',
        description: 'Dein persönlicher Trainings- und Ernährungscoach',
        lang: 'de',
        // Muss zur Hintergrundfarbe der App passen (src/index.css). Vorher
        // stand hier ein anderer Blauton — beim Start blitzte deshalb eine
        // andere Farbe auf als die, die die App dann zeigt.
        theme_color: '#0b0f17',
        background_color: '#0b0f17',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            // Eigene Datei mit weitem Rand: Android schneidet maskable-Icons
            // in Kreise oder Squircles und garantiert nur die inneren 80 %.
            // Mit derselben Datei wie oben wären die äußeren Scheiben ab.
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
