import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    // yaml is bundled rather than left in node_modules, so the packaged app
    // does not depend on electron-builder collecting pnpm's dependency tree.
    plugins: [externalizeDepsPlugin({ exclude: ['yaml'] })],
    resolve: { alias: { '@shared': shared } },
    build: { rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: { rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') } }
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
