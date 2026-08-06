import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// One value stamped into main, preload and renderer at build time. The renderer
// hot-reloads while the main process only reloads on a full restart, so the two
// can silently drift: new UI calling into old handlers. Comparing the stamps
// makes that state visible instead of leaving it to look like a broken feature.
const BUILD_ID = JSON.stringify(String(Date.now()))

export default defineConfig({
  main: {
    define: { __BUILD_ID__: BUILD_ID },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    define: { __BUILD_ID__: BUILD_ID },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    define: { __BUILD_ID__: BUILD_ID },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
