import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    proxy: {
      '/api/gitlab': {
        target: 'https://gitlab.com',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost');
          const username = url.searchParams.get('username');
          return `/users/${username}/calendar.json`;
        }
      }
    }
  }
})