import type { ITheme } from '@xterm/xterm'

export interface TermTheme {
  id: string
  label: string
  theme: ITheme
}

export const TERM_THEMES: TermTheme[] = [
  {
    id: 'minipit',
    label: 'minipit (default)',
    theme: {
      background: '#0a0a0a', foreground: '#d4d4d4', cursor: '#d4d4d4',
      black: '#1e1e1e', red: '#f44747', green: '#6a9955', yellow: '#d7ba7d',
      blue: '#569cd6', magenta: '#c586c0', cyan: '#4ec9b0', white: '#d4d4d4',
      brightBlack: '#808080', brightRed: '#f44747', brightGreen: '#6a9955', brightYellow: '#d7ba7d',
      brightBlue: '#569cd6', brightMagenta: '#c586c0', brightCyan: '#4ec9b0', brightWhite: '#ffffff'
    }
  },
  {
    id: 'github-dark',
    label: 'GitHub Dark',
    theme: {
      background: '#0D1117', foreground: '#E6EDF3', cursor: '#E6EDF3',
      black: '#484F58', red: '#FF7B72', green: '#3FB950', yellow: '#D29922',
      blue: '#58A6FF', magenta: '#BC8CFF', cyan: '#39C5CF', white: '#B1BAC4',
      brightBlack: '#6E7681', brightRed: '#FFA198', brightGreen: '#56D364', brightYellow: '#E3B341',
      brightBlue: '#79C0FF', brightMagenta: '#D2A8FF', brightCyan: '#56D4DD', brightWhite: '#F0F6FC'
    }
  },
  {
    id: 'dracula',
    label: 'Dracula',
    theme: {
      background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2',
      black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
      blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
      brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5',
      brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff'
    }
  },
  {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    theme: {
      background: '#002b36', foreground: '#839496', cursor: '#93a1a1',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
      blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83',
      brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3'
    }
  },
  {
    id: 'light',
    label: 'Light',
    theme: {
      background: '#fafafa', foreground: '#383a42', cursor: '#526eff',
      black: '#383a42', red: '#e45649', green: '#50a14f', yellow: '#c18401',
      blue: '#4078f2', magenta: '#a626a4', cyan: '#0184bc', white: '#fafafa',
      brightBlack: '#a0a1a7', brightRed: '#e45649', brightGreen: '#50a14f', brightYellow: '#c18401',
      brightBlue: '#4078f2', brightMagenta: '#a626a4', brightCyan: '#0184bc', brightWhite: '#ffffff'
    }
  }
]

export function termTheme(id: string): TermTheme {
  return TERM_THEMES.find((t) => t.id === id) ?? TERM_THEMES[0]
}
