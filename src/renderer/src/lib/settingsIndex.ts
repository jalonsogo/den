// Searchable index of Settings, so the command palette can find a setting by
// what it does rather than by which tab it happens to live on ("ssh", "proxy",
// "theme"). Each entry names the tab and, where it applies, the accordion
// section to open and scroll to.
//
// This is a hand-maintained list rather than something derived from the JSX: the
// rows are plain markup with no registry to read, and a wrong-but-searchable
// entry is worse than a missing one. If you add a Settings row worth finding,
// add it here — the `acc` id must match the AccordionSection's `id`.
export type SettingsTab = 'general' | 'secrets' | 'skills' | 'runtime'

export interface SettingsEntry {
  id: string
  label: string
  tab: SettingsTab
  // AccordionSection id to expand + scroll to. Omit for tabs that are a single
  // panel (Secrets, Skills) with nothing to expand.
  acc?: string
  // Extra search terms: the words someone would actually type, including the
  // underlying sbx/env name they may have seen in a log or doc.
  keywords?: string
}

export const SETTINGS_INDEX: SettingsEntry[] = [
  // ── General ──────────────────────────────────────────────────────────────
  { id: 'set:theme', label: 'Theme', tab: 'general', acc: 'settings-appearance', keywords: 'light dark system appearance colour color' },
  { id: 'set:density', label: 'Density', tab: 'general', acc: 'settings-appearance', keywords: 'compact comfortable zoom scale size' },
  { id: 'set:term-theme', label: 'Terminal theme', tab: 'general', acc: 'settings-appearance', keywords: 'xterm palette colours dracula solarized github' },
  { id: 'set:editor', label: 'Open sandbox in (editor)', tab: 'general', acc: 'settings-files', keywords: 'vscode vs code cursor windsurf vscodium ide remote ssh connect' },
  { id: 'set:file-open', label: 'File open behaviour', tab: 'general', acc: 'settings-files', keywords: 'files editor external internal preview' },
  { id: 'set:sidebar', label: 'Sidebar display', tab: 'general', acc: 'settings-sidebar', keywords: 'list layout show hide' },
  { id: 'set:sounds', label: 'Sounds', tab: 'general', acc: 'settings-notifications', keywords: 'notification alert chime finish ask audio mute' },
  { id: 'set:notifications', label: 'Notifications', tab: 'general', acc: 'settings-notifications', keywords: 'notify exit error alert' },
  { id: 'set:polling', label: 'Polling interval', tab: 'general', acc: 'settings-polling', keywords: 'refresh frequency focused background' },
  { id: 'set:app', label: 'App behaviour', tab: 'general', acc: 'settings-app', keywords: 'launch at login menu bar keep awake sleep' },

  // ── Secrets / Skills (single-panel tabs) ─────────────────────────────────
  { id: 'set:secrets', label: 'Secrets', tab: 'secrets', keywords: 'credentials tokens env 1password op:// inject' },
  { id: 'set:skills', label: 'Shared agent skills', tab: 'skills', keywords: 'skills import store share claude codex copilot cursor droid' },

  // ── Runtime ──────────────────────────────────────────────────────────────
  { id: 'set:sbx-path', label: 'sbx path & version', tab: 'runtime', acc: 'runtime-runtime', keywords: 'binary install update release homebrew brew version' },
  { id: 'set:docker-login', label: 'Docker sign-in', tab: 'runtime', acc: 'runtime-runtime', keywords: 'login logout account hub authentication signed in' },
  { id: 'set:ssh', label: 'SSH access', tab: 'runtime', acc: 'runtime-settings', keywords: 'ssh sbx setup remote vscode cursor connect config identityagent tunnel' },
  // Label leads with "Proxy" so a bare "proxy" query ranks it above the bypass
  // list below (scoring rewards an earlier match, and this is the one people mean).
  { id: 'set:proxy', label: 'Proxy — upstream egress', tab: 'runtime', acc: 'runtime-settings', keywords: 'socks5 http https pac system DOCKER_SANDBOXES_PROXY network egress upstream' },
  { id: 'set:no-proxy', label: 'Proxy bypass list', tab: 'runtime', acc: 'runtime-settings', keywords: 'no_proxy bypass exclude direct' },
  { id: 'set:virtiofs', label: 'Filesystem cache (virtiofs)', tab: 'runtime', acc: 'runtime-settings', keywords: 'virtiofs cache performance disk mount speed' },
  { id: 'set:daemon', label: 'Daemon', tab: 'runtime', acc: 'runtime-diagnostics', keywords: 'sandboxd restart status log level start stop' },
  { id: 'set:diagnose', label: 'Diagnose', tab: 'runtime', acc: 'runtime-diagnostics', keywords: 'sbx diagnose troubleshoot health check issue report' },
  { id: 'set:reset', label: 'Reset everything', tab: 'runtime', acc: 'runtime-diagnostics', keywords: 'sbx reset wipe clean destroy remove all' }
]

// localStorage key AccordionSection persists its open state under. Writing it
// before navigating means a collapsed section is already open on arrival,
// instead of the scroll landing on a closed header.
export const accordionKey = (id: string): string => `minipit:info-acc:v2:${id}`
