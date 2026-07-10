// Color themes. Each accent color owns a full, coordinated palette (Orange =
// Calm, Blue = Tech, …). Picking a theme applies its surfaces AND its accent —
// there is no separate accent-vs-surface split. Palettes are intentionally soft
// and pastel: low-saturation surfaces that stay comfortable to read for hours.
//
// Ids match the historical accent ids ('blue', 'graphite', …) so the persisted
// 'minipit:accent' preference keeps working across the change.

export interface Theme {
  id: string
  label: string
  // Accent used for --primary/--accent and the selector's preview dot.
  accent: string
  // Full surface palettes per light/dark mode.
  light: Record<string, string>
  dark: Record<string, string>
}

// The surface/text/sidebar tokens a theme overrides — kept in sync with the
// stylesheet's :root block (minus the accent + semantic status colors).
export const THEME_VARS = [
  '--bg', '--bg-muted', '--bg-subtle', '--border', '--border-hi',
  '--t1', '--t2', '--t3', '--t4',
  '--sb', '--sb-border', '--sb-fg', '--sb-muted', '--sb-hover', '--sb-active', '--sb-active-fg',
  '--spinner-track'
] as const

export const THEMES: Theme[] = [
  {
    id: 'graphite',
    label: 'Graphite',
    accent: '#52525B',
    light: {
      '--bg':           '#FFFFFF',
      '--bg-muted':     '#F7F7F8',
      '--bg-subtle':    '#FFFFFF',
      '--border':       '#E7E7EA',
      '--border-hi':    '#D6D6DB',
      '--t1':           '#1C1C1F',
      '--t2':           '#57575E',
      '--t3':           '#8E8E96',
      '--t4':           '#C9C9CF',
      '--sb':           '#F6F6F7',
      '--sb-border':    '#E7E7EA',
      '--sb-fg':        '#1C1C1F',
      '--sb-muted':     '#66666D',
      '--sb-hover':     '#EFEFF1',
      '--sb-active':    '#E7E7EA',
      '--sb-active-fg': '#111114',
      '--spinner-track': 'rgba(28,28,31,0.13)'
    },
    dark: {
      '--bg':           '#1B1B1E',
      '--bg-muted':     '#232327',
      '--bg-subtle':    '#2B2B30',
      '--border':       '#35353B',
      '--border-hi':    '#47474E',
      '--t1':           '#E9E9EC',
      '--t2':           '#A3A3AA',
      '--t3':           '#75757D',
      '--t4':           '#4A4A51',
      '--sb':           '#232327',
      '--sb-border':    '#35353B',
      '--sb-fg':        '#E9E9EC',
      '--sb-muted':     '#9C9CA3',
      '--sb-hover':     '#2B2B30',
      '--sb-active':    '#33333A',
      '--sb-active-fg': '#F3F3F6',
      '--spinner-track': 'rgba(255,255,255,0.16)'
    }
  },
  {
    // Cool, precise blue-leaning palette.
    id: 'blue',
    label: 'Tech',
    accent: '#5B8DEF',
    light: {
      '--bg':           '#FFFFFF',
      '--bg-muted':     '#F1F5FB',
      '--bg-subtle':    '#FFFFFF',
      '--border':       '#E1E8F1',
      '--border-hi':    '#CDD9E8',
      '--t1':           '#172033',
      '--t2':           '#4C5A70',
      '--t3':           '#8593A7',
      '--t4':           '#C2CDDC',
      '--sb':           '#EFF3FA',
      '--sb-border':    '#E1E8F1',
      '--sb-fg':        '#172033',
      '--sb-muted':     '#566579',
      '--sb-hover':     '#E7EEF7',
      '--sb-active':    '#DEE8F4',
      '--sb-active-fg': '#0F1B2D',
      '--spinner-track': 'rgba(15,27,45,0.13)'
    },
    dark: {
      '--bg':           '#12161F',
      '--bg-muted':     '#191F2B',
      '--bg-subtle':    '#212938',
      '--border':       '#2E3850',
      '--border-hi':    '#3F4B66',
      '--t1':           '#E4ECF7',
      '--t2':           '#99A9C2',
      '--t3':           '#6B7B94',
      '--t4':           '#46536C',
      '--sb':           '#191F2B',
      '--sb-border':    '#2E3850',
      '--sb-fg':        '#E4ECF7',
      '--sb-muted':     '#93A3BD',
      '--sb-hover':     '#212938',
      '--sb-active':    '#283248',
      '--sb-active-fg': '#F0F5FC',
      '--spinner-track': 'rgba(228,236,247,0.16)'
    }
  },
  {
    // Soft, muted sage green.
    id: 'green',
    label: 'Sage',
    accent: '#6FA96C',
    light: {
      '--bg':           '#FFFFFF',
      '--bg-muted':     '#F0F6EE',
      '--bg-subtle':    '#FFFFFF',
      '--border':       '#E1EADD',
      '--border-hi':    '#CCDBC6',
      '--t1':           '#1E2A1E',
      '--t2':           '#4E5D4A',
      '--t3':           '#869080',
      '--t4':           '#C6D0C0',
      '--sb':           '#EEF4EB',
      '--sb-border':    '#E1EADD',
      '--sb-fg':        '#1E2A1E',
      '--sb-muted':     '#56634F',
      '--sb-hover':     '#E7F0E3',
      '--sb-active':    '#DEEAD8',
      '--sb-active-fg': '#16210F',
      '--spinner-track': 'rgba(30,42,30,0.13)'
    },
    dark: {
      '--bg':           '#141A14',
      '--bg-muted':     '#1B231A',
      '--bg-subtle':    '#232D22',
      '--border':       '#313D2F',
      '--border-hi':    '#435141',
      '--t1':           '#E7EFE4',
      '--t2':           '#9FB09A',
      '--t3':           '#6E7E6A',
      '--t4':           '#465343',
      '--sb':           '#1B231A',
      '--sb-border':    '#313D2F',
      '--sb-fg':        '#E7EFE4',
      '--sb-muted':     '#98A992',
      '--sb-hover':     '#232D22',
      '--sb-active':    '#2B3729',
      '--sb-active-fg': '#F1F7EE',
      '--spinner-track': 'rgba(231,239,228,0.16)'
    }
  },
  {
    // Airy lavender.
    id: 'violet',
    label: 'Lavender',
    accent: '#9B8CEF',
    light: {
      '--bg':           '#FFFFFF',
      '--bg-muted':     '#F5F1FB',
      '--bg-subtle':    '#FFFFFF',
      '--border':       '#E8E1F3',
      '--border-hi':    '#D7CCEC',
      '--t1':           '#241E33',
      '--t2':           '#574E6B',
      '--t3':           '#8E85A5',
      '--t4':           '#CBC2DC',
      '--sb':           '#F3EFFA',
      '--sb-border':    '#E8E1F3',
      '--sb-fg':        '#241E33',
      '--sb-muted':     '#5F566F',
      '--sb-hover':     '#EDE7F6',
      '--sb-active':    '#E5DCF3',
      '--sb-active-fg': '#1C1630',
      '--spinner-track': 'rgba(36,30,51,0.13)'
    },
    dark: {
      '--bg':           '#17141F',
      '--bg-muted':     '#1F1B2B',
      '--bg-subtle':    '#282338',
      '--border':       '#362F4E',
      '--border-hi':    '#493F64',
      '--t1':           '#EBE7F7',
      '--t2':           '#A99FC2',
      '--t3':           '#7A6F94',
      '--t4':           '#52466C',
      '--sb':           '#1F1B2B',
      '--sb-border':    '#362F4E',
      '--sb-fg':        '#EBE7F7',
      '--sb-muted':     '#A297BD',
      '--sb-hover':     '#282338',
      '--sb-active':    '#302946',
      '--sb-active-fg': '#F4F0FC',
      '--spinner-track': 'rgba(235,231,247,0.16)'
    }
  },
  {
    // Warm cream paper and bark-brown ink — lifted from the den landing page.
    id: 'orange',
    label: 'Calm',
    accent: '#D98E63',
    light: {
      '--bg':           '#FFFFFF',
      '--bg-muted':     '#F9F7F2',
      '--bg-subtle':    '#FFFFFF',
      '--border':       '#E9E4D8',
      '--border-hi':    '#DBD5C6',
      '--t1':           '#292420',
      '--t2':           '#6E675B',
      '--t3':           '#9C9587',
      '--t4':           '#CCC6B8',
      '--sb':           '#F3F0E8',
      '--sb-border':    '#E9E4D8',
      '--sb-fg':        '#292420',
      '--sb-muted':     '#6E675B',
      '--sb-hover':     '#ECE8DD',
      '--sb-active':    '#E5E0D2',
      '--sb-active-fg': '#201C16',
      '--spinner-track': 'rgba(41,36,32,0.13)'
    },
    dark: {
      '--bg':           '#22190F',
      '--bg-muted':     '#2B2114',
      '--bg-subtle':    '#362A1A',
      '--border':       '#453824',
      '--border-hi':    '#59492F',
      '--t1':           '#F1E8D5',
      '--t2':           '#C3B392',
      '--t3':           '#8F7F62',
      '--t4':           '#5F5037',
      '--sb':           '#2B2114',
      '--sb-border':    '#453824',
      '--sb-fg':        '#F1E8D5',
      '--sb-muted':     '#B4A488',
      '--sb-hover':     '#362A1A',
      '--sb-active':    '#423320',
      '--sb-active-fg': '#FCF4E3',
      '--spinner-track': 'rgba(241,232,213,0.16)'
    }
  },
  {
    // Soft blossom pink.
    id: 'rose',
    label: 'Blossom',
    accent: '#E0879D',
    light: {
      '--bg':           '#FFFFFF',
      '--bg-muted':     '#FBF1F3',
      '--bg-subtle':    '#FFFFFF',
      '--border':       '#F1E1E5',
      '--border-hi':    '#E8CCD3',
      '--t1':           '#331E24',
      '--t2':           '#6B4E56',
      '--t3':           '#A5858F',
      '--t4':           '#DCC2C9',
      '--sb':           '#FAEFF1',
      '--sb-border':    '#F1E1E5',
      '--sb-fg':        '#331E24',
      '--sb-muted':     '#6F565D',
      '--sb-hover':     '#F6E7EA',
      '--sb-active':    '#F3DCE1',
      '--sb-active-fg': '#301620',
      '--spinner-track': 'rgba(51,30,36,0.13)'
    },
    dark: {
      '--bg':           '#1E141A',
      '--bg-muted':     '#271A22',
      '--bg-subtle':    '#31222B',
      '--border':       '#402E3A',
      '--border-hi':    '#543E4C',
      '--t1':           '#F7E7EE',
      '--t2':           '#C29FAD',
      '--t3':           '#946F7E',
      '--t4':           '#6C4657',
      '--sb':           '#271A22',
      '--sb-border':    '#402E3A',
      '--sb-fg':        '#F7E7EE',
      '--sb-muted':     '#BD97A5',
      '--sb-hover':     '#31222B',
      '--sb-active':    '#3D2A35',
      '--sb-active-fg': '#FCF0F4',
      '--spinner-track': 'rgba(247,231,238,0.16)'
    }
  }
]

export const DEFAULT_THEME = 'graphite'

export function theme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

// Relative luminance of a hex color (0–1), for picking a readable foreground.
function luminance(hex: string): number {
  const m = hex.replace('#', '').match(/.{2}/g)
  if (!m) return 0
  const [r, g, b] = m.map((h) => parseInt(h, 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Apply a theme's full palette (surfaces + accent) for the given light/dark
// mode. Clears the surface vars first so switching themes never leaves stale
// overrides behind.
export function applyTheme(id: string, mode: 'light' | 'dark'): void {
  const root = document.documentElement
  for (const v of THEME_VARS) root.style.removeProperty(v)

  const t = theme(id)
  const map = mode === 'dark' ? t.dark : t.light
  for (const [k, v] of Object.entries(map)) root.style.setProperty(k, v)

  root.style.setProperty('--primary', t.accent)
  root.style.setProperty('--accent', t.accent)
  root.style.setProperty('--prim-fg', luminance(t.accent) > 0.6 ? '#111111' : '#ffffff')
}
