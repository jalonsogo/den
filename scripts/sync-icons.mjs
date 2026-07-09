#!/usr/bin/env node
// Normalize icon exports to stable, dock-correct filenames.
//
// Icon Composer / the design tool re-exports the app icon with churny,
// platform-tagged names (den-iOS-Default-1024@1x.png, then
// den-macOS-Default-1024@1x.png, ...). The app code and electron-builder config
// must NOT reference those names directly, or every re-export breaks the build.
//
// This script takes the latest light ("Default") and dark ("Dark") renders and
// writes two STABLE files that the rest of the codebase references:
//   resources/icon/dock.png       (light / default appearance)
//   resources/icon/dock-dark.png  (dark appearance)
//
// It also fixes icon SIZE: Icon Composer exports a full-bleed 1024×1024 tile
// (rounded rect touching every edge). macOS's app-icon template expects the
// artwork to fill only ~824px of a 1024px canvas with transparent padding, so a
// full-bleed render renders noticeably larger than other apps in the dock. We
// scale the tile to the standard grid and re-center it on a transparent canvas.
//
// Workflow after re-exporting from Icon Composer: `npm run sync:icons`.

import { readdirSync, copyFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const iconDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'icon')

const CANVAS = 1024 // macOS icon canvas
const TILE = 824 // Apple's grid: rounded-rect body within the canvas (~80%)

// Pick the newest export matching a pattern. The leading platform tag
// (iOS/macOS/...) is intentionally ignored so prefix changes don't matter.
function pick(files, label, re) {
  const matches = files.filter((f) => re.test(f))
  if (matches.length === 0) {
    throw new Error(`No ${label} icon export found in ${iconDir} (expected something matching ${re})`)
  }
  // Sort so the last-alphabetical wins; there is normally exactly one match.
  return matches.sort().at(-1)
}

function hasImageMagick() {
  try {
    execFileSync('magick', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// Shrink the full-bleed tile to the macOS grid and re-center on a transparent
// canvas so the dock renders it at the same visual size as other apps.
function padToGrid(src, dest) {
  execFileSync('magick', [
    join(iconDir, src),
    '-resize', `${TILE}x${TILE}`,
    '-background', 'none',
    '-gravity', 'center',
    '-extent', `${CANVAS}x${CANVAS}`,
    join(iconDir, dest)
  ])
}

const files = readdirSync(iconDir)
// "-Default-" and "-Dark-" (with surrounding dashes) exclude the ClearDark /
// TintedDark / ClearLight / TintedLight appearance variants.
const light = pick(files, 'light/Default', /-Default-\d+.*\.png$/i)
const dark = pick(files, 'dark/Dark', /-Dark-\d+.*\.png$/i)

if (hasImageMagick()) {
  padToGrid(light, 'dock.png')
  padToGrid(dark, 'dock-dark.png')
  console.log(`✓ dock.png       ← ${light}  (padded to ${TILE}px on ${CANVAS}px canvas)`)
  console.log(`✓ dock-dark.png  ← ${dark}  (padded to ${TILE}px on ${CANVAS}px canvas)`)
} else {
  copyFileSync(join(iconDir, light), join(iconDir, 'dock.png'))
  copyFileSync(join(iconDir, dark), join(iconDir, 'dock-dark.png'))
  console.warn('⚠ ImageMagick (`magick`) not found — copied full-bleed renders WITHOUT')
  console.warn('  padding. Install it (`brew install imagemagick`) and re-run so the dock')
  console.warn('  icon matches the size of other apps.')
  console.log(`✓ dock.png       ← ${light}`)
  console.log(`✓ dock-dark.png  ← ${dark}`)
}
