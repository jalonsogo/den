// Turn a failed main-process call into something the user can act on.
//
// Three distinct failures used to be hard to tell apart, and the two that need a
// restart are exactly the two that look like a bug in the feature:
//
//   • the preload bundle predates the API — `window.minipit.foo` is undefined, so
//     calling it throws "…foo is not a function". Preload is only evaluated when
//     the window is created, so reloading the renderer does NOT pick up a new one;
//     only relaunching the app does. (This is the one you hit after an update or a
//     dev rebuild that didn't restart Electron.)
//   • the main process predates the IPC channel — Electron rejects with "no handler
//     registered for '…'". Also a restart.
//   • anything else — a real error from the operation, so pass it through.
//
// `what` names the action, for the case where there's no message at all.
export function bridgeError(err: unknown, what: string): string {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).trim()
  const stale =
    /is not a function/i.test(msg)          // preload too old
    || /no handler registered/i.test(msg)   // main too old
  if (stale) return `${what} isn’t available in the running app yet — quit and reopen den to load the update.`
  return msg || `${what} failed — no response from the runtime bridge.`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}
