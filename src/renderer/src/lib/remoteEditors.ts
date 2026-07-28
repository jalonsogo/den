// Editors den can open a sandbox in over its `<name>.sbx` SSH host.
//
// All of these are VS Code derivatives, which is not an accident: they share the
// `--remote ssh-remote+<host> <path>` CLI contract that makes a remote-SSH open
// possible from outside the app. An editor without that flag (or an equivalent
// URI handler) can't be driven this way, so it doesn't belong on the list.
export interface RemoteEditor {
  id: string        // the CLI binary den spawns
  label: string
  // URI scheme for the fallback when the CLI isn't on PATH. VS Code forks each
  // register their own, and the `code` CLI in particular only exists after the
  // user runs "Shell Command: Install 'code' command".
  scheme: string
}

export const REMOTE_EDITORS: RemoteEditor[] = [
  { id: 'code', label: 'VS Code', scheme: 'vscode' },
  { id: 'cursor', label: 'Cursor', scheme: 'cursor' },
  { id: 'windsurf', label: 'Windsurf', scheme: 'windsurf' },
  { id: 'codium', label: 'VSCodium', scheme: 'vscodium' }
]

export const DEFAULT_REMOTE_EDITOR = 'code'

export function remoteEditor(id: string): RemoteEditor {
  return REMOTE_EDITORS.find((e) => e.id === id) ?? REMOTE_EDITORS[0]
}
