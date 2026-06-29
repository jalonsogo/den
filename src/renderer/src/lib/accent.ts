export interface Accent {
  id: string
  label: string
  color: string | null // null = use the theme's default (graphite)
}

export const ACCENTS: Accent[] = [
  { id: 'graphite', label: 'Graphite', color: null },
  { id: 'blue',     label: 'Blue',     color: '#3b82f6' },
  { id: 'green',    label: 'Green',    color: '#22c55e' },
  { id: 'violet',   label: 'Violet',   color: '#8b5cf6' },
  { id: 'orange',   label: 'Orange',   color: '#f97316' },
  { id: 'rose',     label: 'Rose',     color: '#f43f5e' }
]

export interface SavedAccent {
  id: string   // stable id, e.g. "custom-3b82f6"
  hex: string
}

const SAVED_KEY = 'minipit:customAccents'
const RAMP_KEY = 'minipit:rampCache'

// ── Persistence helpers (read directly from localStorage so applyAccent can run
// synchronously at first paint, before the React store has mounted). ──────────

export function savedAccents(): SavedAccent[] {
  try {
    const arr = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function writeSavedAccents(list: SavedAccent[]): void {
  localStorage.setItem(SAVED_KEY, JSON.stringify(list))
}

function rampCache(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(RAMP_KEY) ?? '{}') ?? {}
  } catch {
    return {}
  }
}

function cacheRamp(hex: string, ramp: string[]): void {
  const cache = rampCache()
  cache[hex.toLowerCase()] = ramp
  localStorage.setItem(RAMP_KEY, JSON.stringify(cache))
}

// Generate (or reuse) the rampa palette for a hex, caching it so subsequent
// loads can apply it synchronously. rampa itself runs in the main process.
export async function ensureRamp(hex: string): Promise<string[]> {
  const key = hex.toLowerCase()
  const cached = rampCache()[key]
  if (cached?.length) return cached
  const ramp = (await window.minipit?.generatePalette(hex)) ?? []
  if (ramp.length) cacheRamp(hex, ramp)
  return ramp
}

// Hue (0–360) of a hex color, used to tint the GUI surfaces.
function hexToHue(hex: string): number {
  const m = hex.replace('#', '').match(/.{2}/g)
  if (!m) return 0
  const [r, g, b] = m.map((h) => parseInt(h, 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  return Math.round(h < 0 ? h + 360 : h)
}

// Surface/text/sidebar tokens we tint with the accent hue to theme the whole
// GUI (not just the primary button). Cleared back to stylesheet defaults for
// presets and graphite.
const GUI_VARS = [
  '--bg', '--bg-muted', '--bg-subtle', '--border', '--border-hi',
  '--t1', '--t2', '--t3', '--t4',
  '--sb', '--sb-border', '--sb-fg', '--sb-muted', '--sb-hover', '--sb-active', '--sb-active-fg'
]

function clearGuiTint(root: HTMLElement): void {
  GUI_VARS.forEach((v) => root.style.removeProperty(v))
}

// Subtle accent-tinted neutral scale. Low saturation keeps text readable while
// giving every surface a cohesive hint of the chosen color.
function tintMap(h: number, mode: 'light' | 'dark'): Record<string, string> {
  return mode === 'dark'
    ? {
        '--bg':           `hsl(${h} 28% 7%)`,
        '--bg-muted':     `hsl(${h} 26% 10.5%)`,
        '--bg-subtle':    `hsl(${h} 24% 14%)`,
        '--border':       `hsl(${h} 20% 23%)`,
        '--border-hi':    `hsl(${h} 18% 32%)`,
        '--t1':           `hsl(${h} 25% 93%)`,
        '--t2':           `hsl(${h} 14% 64%)`,
        '--t3':           `hsl(${h} 12% 49%)`,
        '--t4':           `hsl(${h} 15% 36%)`,
        '--sb':           `hsl(${h} 26% 10%)`,
        '--sb-border':    `hsl(${h} 20% 23%)`,
        '--sb-fg':        `hsl(${h} 25% 92%)`,
        '--sb-muted':     `hsl(${h} 14% 62%)`,
        '--sb-hover':     `hsl(${h} 22% 16%)`,
        '--sb-active':    `hsl(${h} 22% 18%)`,
        '--sb-active-fg': `hsl(${h} 25% 95%)`
      }
    : {
        '--bg':           `hsl(${h} 40% 99%)`,
        '--bg-muted':     `hsl(${h} 38% 97.5%)`,
        '--bg-subtle':    `hsl(${h} 35% 95.5%)`,
        '--border':       `hsl(${h} 30% 89%)`,
        '--border-hi':    `hsl(${h} 28% 82%)`,
        '--t1':           `hsl(${h} 22% 11%)`,
        '--t2':           `hsl(${h} 14% 35%)`,
        '--t3':           `hsl(${h} 12% 60%)`,
        '--t4':           `hsl(${h} 24% 82%)`,
        '--sb':           `hsl(${h} 36% 96.5%)`,
        '--sb-border':    `hsl(${h} 30% 89%)`,
        '--sb-fg':        `hsl(${h} 22% 14%)`,
        '--sb-muted':     `hsl(${h} 12% 48%)`,
        '--sb-hover':     `hsl(${h} 35% 92%)`,
        '--sb-active':    `hsl(${h} 38% 90%)`,
        '--sb-active-fg': `hsl(${h} 25% 10%)`
      }
}

function applyGuiTint(root: HTMLElement, hex: string): void {
  const mode = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  const map = tintMap(hexToHue(hex), mode)
  for (const [k, v] of Object.entries(map)) root.style.setProperty(k, v)
}

// Relative luminance of a hex color (0–1), for picking a readable foreground.
function luminance(hex: string): number {
  const m = hex.replace('#', '').match(/.{2}/g)
  if (!m) return 0
  const [r, g, b] = m.map((h) => parseInt(h, 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// The ramp step used to drive --primary: a strong mid-tone of the generated
// ramp rather than the raw picked hex, so highlights stay harmonized.
function primaryStep(ramp: string[]): string {
  return ramp[Math.round((ramp.length - 1) * 0.5)] ?? ramp[0]
}

// Resolve the base color for an accent id (preset color, saved swatch, or a
// live custom hex). null means "use the theme default" (graphite).
function baseColor(id: string, custom?: string): string | null {
  if (id === 'custom') return custom ?? null
  const preset = ACCENTS.find((a) => a.id === id)
  if (preset) return preset.color
  return savedAccents().find((s) => s.id === id)?.hex ?? null
}

// Apply the accent tokens from a base color. Graphite (no color) removes the
// override so the theme default is used. For custom/saved colors we apply the
// rampa-generated ramp (cached) and expose its steps as --p1..--pN.
export function applyAccent(id: string, custom?: string): void {
  const root = document.documentElement
  const color = baseColor(id, custom)

  // Clear any previously-exposed ramp steps + GUI tint.
  for (let i = 1; i <= 12; i++) root.style.removeProperty(`--p${i}`)
  clearGuiTint(root)

  if (!color) {
    root.style.removeProperty('--primary')
    root.style.removeProperty('--prim-fg')
    root.style.removeProperty('--accent')
    return
  }

  const isPreset = ACCENTS.some((a) => a.id === id && a.color)
  const ramp = isPreset ? [] : rampCache()[color.toLowerCase()]
  const primary = ramp?.length ? primaryStep(ramp) : color

  root.style.setProperty('--primary', primary)
  root.style.setProperty('--accent', primary)
  root.style.setProperty('--prim-fg', luminance(primary) > 0.6 ? '#111111' : '#ffffff')

  if (ramp?.length) ramp.forEach((c, i) => root.style.setProperty(`--p${i + 1}`, c))

  // Custom & saved colors theme the whole GUI; presets only tint the accent.
  if (!isPreset) applyGuiTint(root, color)
}
