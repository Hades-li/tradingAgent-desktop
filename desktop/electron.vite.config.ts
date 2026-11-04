import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } },
    build: {
      // Bundle every third-party module into out/. All packages are
      // devDependencies, so electron-builder ships no node_modules at all;
      // leaving one external would make it missing at runtime.
      externalizeDeps: false,
      rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') }
    }
  },
  preload: {
    resolve: { alias: { '@shared': shared } },
    build: {
      externalizeDeps: false,
      rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: { '@shared': shared, '@renderer': resolve(__dirname, 'src/renderer') }
    },
    plugins: [react(), tailwindcss()],
    build: {
      // Renderer root is src/renderer, so outDir must be pinned back to
      // desktop/out or the bundle lands outside the project.
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') }
    }
  }
})
