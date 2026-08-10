/**
 * vite.config.js — Vite Build Configuration
 *
 * PURPOSE:
 * Vite needs to know how to handle React's JSX syntax (the HTML-like
 * code you write inside JavaScript). The @vitejs/plugin-react plugin
 * adds this support.
 *
 * We also set the 'base' to './' so that when Electron loads the built
 * files from disk (using file:// protocol), all asset paths are relative
 * rather than absolute.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
  },
});
