import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// GitHub Pages project sites (username.github.io/<repo>/) need every asset
// URL prefixed with "/<repo>/". Set VITE_BASE_PATH at build time (the
// deploy workflow does this automatically) — leave it unset for local dev,
// a custom domain, or a <user>.github.io root page.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
})
