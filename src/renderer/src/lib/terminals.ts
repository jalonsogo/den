// Terminal apps den can open an SSH session in.
//
// `default` doesn't name an app: den writes a small executable .command script
// and hands it to `open`, so macOS routes it to whatever the user has set as the
// handler for shell scripts — genuinely "their terminal" rather than den's guess.
// The named entries force a specific app instead.
export interface TerminalApp {
  id: string
  label: string
}

export const TERMINALS: TerminalApp[] = [
  { id: 'default', label: 'System default' },
  { id: 'Terminal', label: 'Terminal' },
  { id: 'iTerm', label: 'iTerm2' },
  { id: 'Ghostty', label: 'Ghostty' },
  { id: 'WezTerm', label: 'WezTerm' },
  { id: 'kitty', label: 'kitty' },
  { id: 'Alacritty', label: 'Alacritty' },
  { id: 'Warp', label: 'Warp' }
]

export const DEFAULT_TERMINAL = 'default'

export function terminalApp(id: string): TerminalApp {
  return TERMINALS.find((t) => t.id === id) ?? TERMINALS[0]
}
