// Desktop apps that can run their agent inside a sandbox by attaching to its
// `<name>.sbx` SSH host — the other half of Docker's documented integrations
// (docs.docker.com/ai/sandboxes/integrations). The VS Code family lives in
// [remoteEditors.ts]; these two are separate because they can't be driven the
// same way.
//
// Neither app exposes a CLI flag or URI for adding an SSH connection, the way
// `code --remote ssh-remote+<host>` does, so den can't finish the job: it checks
// the ssh config, copies the hostname, opens the app, and shows the remaining
// steps (main owns that dialog — see REMOTE_APPS there). This list exists only so
// the menu can render the entries; the behaviour is all main-side.
export interface RemoteApp {
  id: string
  label: string
}

export const REMOTE_APPS: RemoteApp[] = [
  { id: 'claude-desktop', label: 'Claude Desktop' },
  { id: 'chatgpt', label: 'ChatGPT' }
]
