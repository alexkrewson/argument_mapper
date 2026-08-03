import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// Stamped into the bundle so a crash report names the exact build it came
// from. Same reasoning as the versioned Drive uploads: during closed testing
// the useful question is "which build did this tester have?", and a release
// name is the only thing that answers it after the fact. Falls back to
// "unknown" rather than failing the build — Cloudflare Pages does a shallow
// clone, and a missing release is a smaller problem than a missing deploy.
function buildRelease() {
  if (process.env.VITE_APP_RELEASE) return process.env.VITE_APP_RELEASE
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim()
    return sha ? sha + (dirty ? '-dirty' : '') : 'unknown'
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  plugins: [react()],
  base: process.env.BUILD_TARGET === 'mobile' ? './' : '/',
  define: {
    __APP_RELEASE__: JSON.stringify(buildRelease()),
  },
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
