#!/usr/bin/env node
// Generate stable application icons with ImageMagick 7 (`magick`).
//
// Default / clean-checkout workflow:
//   npm run sync:icons
//     Regenerates resources/icon/linux/*.png from tracked dock.png. dock.png is
//     the complete canonical rendered tile on a 1024px macOS canvas: its known
//     100px outer padding is removed, then the 824px tile is Lanczos-downsampled.
//
// Verification workflow (does not modify tracked files):
//   npm run sync:icons -- --check
//     Regenerates into a temporary directory and byte-compares every PNG.
//
// External Icon Composer export workflow:
//   npm run sync:icons -- --mac
//     Finds external *-Default-* and *-Dark-* 1024px exports in this directory,
//     rewrites tracked dock.png/dock-dark.png with macOS grid padding, then also
//     regenerates Linux icons from the new dock.png.
//
// ImageMagick 7 is mandatory; missing/wrong-major tooling is a hard error. The
// release container uses Ubuntu 26.04's ImageMagick package and --check, making
// the committed PNG byte comparison reproducible in that pinned environment.

import { chmodSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const iconDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'icon')
const linuxDir = join(iconDir, 'linux')
const CANVAS = 1024
const TILE = 824
const OFFSET = (CANVAS - TILE) / 2
const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
const args = new Set(process.argv.slice(2))
const macMode = args.delete('--mac')
const checkMode = args.delete('--check')
if (args.size) throw new Error(`Unknown argument(s): ${[...args].join(', ')}`)
if (macMode && checkMode) throw new Error('--mac and --check cannot be combined')

function imageMagickVersion() {
  let output
  try {
    output = execFileSync('magick', ['-version'], { encoding: 'utf8' })
  } catch {
    throw new Error('ImageMagick 7 is required (`magick` was not found); no icons were changed')
  }
  const match = output.match(/^Version: ImageMagick (\d+)\.([^\s]+)/m)
  if (!match || match[1] !== '7') {
    throw new Error(`ImageMagick 7 is required; got: ${output.split('\n')[0] || 'unknown version'}`)
  }
  console.log(`ImageMagick ${match[1]}.${match[2]}`)
}

function pick(files, label, re) {
  const matches = files.filter((file) => re.test(file)).sort()
  if (matches.length === 0) throw new Error(`No ${label} export in ${iconDir} matching ${re}`)
  return matches.at(-1)
}

function padToGrid(src, dest) {
  execFileSync('magick', [src, '-resize', `${TILE}x${TILE}!`, '-background', 'none',
    '-gravity', 'center', '-extent', `${CANVAS}x${CANVAS}`, dest])
  chmodSync(dest, 0o644)
}

function generateLinux(destDir) {
  mkdirSync(destDir, { recursive: true })
  for (const size of LINUX_SIZES) {
    const dest = join(destDir, `${size}x${size}.png`)
    execFileSync('magick', [join(iconDir, 'dock.png'),
      '-crop', `${TILE}x${TILE}+${OFFSET}+${OFFSET}`, '+repage',
      '-filter', 'Lanczos', '-resize', `${size}x${size}!`,
      '-strip', '-define', 'png:exclude-chunk=date,time', dest])
    chmodSync(dest, 0o644)
  }
}

imageMagickVersion()

if (macMode) {
  const files = readdirSync(iconDir)
  const light = pick(files, 'light/Default', /-Default-\d+.*\.png$/i)
  const dark = pick(files, 'dark/Dark', /-Dark-\d+.*\.png$/i)
  padToGrid(join(iconDir, light), join(iconDir, 'dock.png'))
  padToGrid(join(iconDir, dark), join(iconDir, 'dock-dark.png'))
  console.log(`✓ dock.png ← ${light}; dock-dark.png ← ${dark}`)
}

if (checkMode) {
  const generated = mkdtempSync(join(tmpdir(), 'den-linux-icons-'))
  try {
    generateLinux(generated)
    const mismatches = LINUX_SIZES.filter((size) => {
      const name = `${size}x${size}.png`
      try { return !readFileSync(join(generated, name)).equals(readFileSync(join(linuxDir, name))) }
      catch { return true }
    })
    if (mismatches.length) throw new Error(`Linux icons are stale/non-reproducible at: ${mismatches.join(', ')}px`)
    console.log(`✓ committed Linux PNGs byte-match canonical generation (${LINUX_SIZES.join(', ')}px)`)
  } finally {
    rmSync(generated, { recursive: true, force: true })
  }
} else {
  generateLinux(linuxDir)
  console.log(`✓ linux/*.png ← tracked dock.png (${LINUX_SIZES.join(', ')}px; mode 0644)`)
}
