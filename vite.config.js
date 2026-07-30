import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.BUILD_TARGET === 'mobile' ? './' : '/',
  build: {
    // cytoscape alone is ~550 kB minified and can't be split further, so the
    // default 500 kB warning can never be satisfied while it's a dependency.
    // Raised just above it so the warning stays meaningful for app code.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split the heavy vendors out of the app chunk. Cytoscape and its
        // plugins are the bulk of the bundle and change far less often than
        // app code, so separating them lets browsers reuse the cached copy
        // across deploys instead of re-downloading ~1 MB every time.
        // Function form, not the object map: Vite 8 bundles with rolldown,
        // which only accepts a function ("manualChunks is not a function").
        // This form works under both rollup and rolldown.
        manualChunks(id) {
          const path = id.replace(/\\/g, '/')
          if (!path.includes('/node_modules/')) return
          if (/\/node_modules\/(cytoscape|react-cytoscapejs)/.test(path)) return 'cytoscape'
          if (/\/node_modules\/@supabase\//.test(path)) return 'supabase'
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(path)) return 'react'
        },
      },
    },
  },
})
