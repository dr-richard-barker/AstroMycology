import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

// On GitHub Pages the site is served under /<repo>/, so the production build
// needs that base path; dev runs at root.
const REPO_BASE = '/AstroMycology/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? REPO_BASE : '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
}));
