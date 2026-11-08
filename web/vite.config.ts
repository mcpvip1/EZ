import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base so the built app loads when hosted under a subpath
  // (e.g. a Space / GitHub Pages sub-directory). With the default
  // absolute base, /assets/*, /manifest.webmanifest and /icon.svg 404
  // under a subpath and the page stays blank.
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    // Shared core lives one level up (../shared/src) and the seed one
    // level up (../seed); allow Vite to serve files from the parent dir.
    fs: { allow: ['..'] },
  },
})
