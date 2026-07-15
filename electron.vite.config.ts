import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // electron-store 11 is ESM-only. Leaving it external makes this CommonJS
    // main bundle emit require('electron-store'), which returns a module
    // namespace in Electron and is not constructable. Bundle it so Rollup
    // preserves the package's default-export semantics.
    plugins: [externalizeDepsPlugin({ exclude: ['electron-store'] })]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
