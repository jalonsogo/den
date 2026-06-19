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

// Relative luminance of a hex color (0–1), for picking a readable foreground.
function luminance(hex: string): number {
  const m = hex.replace('#', '').match(/.{2}/g)
  if (!m) return 0
  const [r, g, b] = m.map((h) => parseInt(h, 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Resolve the base color for an accent id (preset color, or a custom hex).
function baseColor(id: string, custom?: string): string | null {
  if (id === 'custom') return custom ?? null
  return ACCENTS.find((a) => a.id === id)?.color ?? null
}

// Apply the accent tokens from a base color. Graphite (no color) removes the
// override so the theme default is used. The full rampa-generated ramp is
// produced in the main process (Node) via window.minipit.generatePalette.
export function applyAccent(id: string, custom?: string): void {
  const root = document.documentElement
  const color = baseColor(id, custom)

  if (!color) {
    root.style.removeProperty('--primary')
    root.style.removeProperty('--prim-fg')
    root.style.removeProperty('--accent')
    return
  }

  root.style.setProperty('--primary', color)
  root.style.setProperty('--accent', color)
  root.style.setProperty('--prim-fg', luminance(color) > 0.6 ? '#111111' : '#ffffff')
}
