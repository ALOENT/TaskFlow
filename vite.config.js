// ============================================
//  TaskFlow — Vite Configuration
//  Vanilla JS app (no framework)
// ============================================
import { defineConfig } from 'vite';

export default defineConfig({
  // Root is the project directory (where index.html lives)
  root: '.',

  // Public directory for static assets (sw.js, icons, etc.)
  publicDir: 'public',

  // Dev server config
  server: {
    port: 5173,
    open: true
  },

  // Build output goes to dist/ — Capacitor + Firebase Hosting read from here
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Ensure assets are relative for Capacitor webview compatibility
    assetsDir: 'assets'
  }
});
