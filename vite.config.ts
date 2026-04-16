import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    // ── CRITICAL FIX ──────────────────────────────────────────────────────
    // Vite kan bundle Supabase-pakker i FLERE chunks (vendor.js, index.js osv).
    // Når to chunks har hver sin kopi av TabBroadcastLockManager, bruker de
    // forskjellige Map-instanser. Chunk A acquirer låsen, chunk B prøver å
    // release den → "No Listener: tabs:outgoing.message.ready" → hvit skjerm.
    //
    // dedupe tvinger Vite til å bruke KUN ÉN kopi av hver Supabase-pakke.
    // ──────────────────────────────────────────────────────────────────────
    dedupe: [
      '@supabase/supabase-js',
      '@supabase/gotrue-js',
      '@supabase/realtime-js',
      '@supabase/storage-js',
      '@supabase/postgrest-js',
    ],
  },

  build: {
    rollupOptions: {
      output: {
        // Samle alle Supabase-pakker i én dedikert chunk.
        // Dette forhindrer at Supabase splittes på tvers av vendor.js og andre chunks.
        manualChunks(id) {
          if (id.includes('@supabase')) {
            return 'supabase'
          }
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom')
          ) {
            return 'react-vendor'
          }
        },
      },
    },
  },
})
