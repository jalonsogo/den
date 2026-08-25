// Carry settings across the minipit → den rename.
//
// Every persisted renderer preference was keyed `minipit:*` — theme, accent,
// density, sidebar state, per-sandbox icons/colours/groups/order, default kits,
// sounds, the MCP authorization record. Renaming the keys without moving the
// values would silently reset all of it on the upgrade: not a crash, just every
// customisation gone, which is worse because nobody would connect it to a
// version bump.
//
// This runs BEFORE anything reads storage — it's the first import in main.tsx,
// ahead of App/store, both of which read at module scope.
const MARK = 'den:storage-migrated:v1'
const OLD = 'minipit:'
const NEW = 'den:'

export function migrateStorage(): void {
  try {
    if (localStorage.getItem(MARK)) return
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(OLD)) continue
      const target = NEW + key.slice(OLD.length)
      // Never clobber: a key already written under the new name is newer than
      // anything left behind under the old one.
      if (localStorage.getItem(target) !== null) continue
      const value = localStorage.getItem(key)
      if (value !== null) localStorage.setItem(target, value)
    }
    // One key holds an id that was itself renamed, so the value needs the same
    // treatment as the key: the adaptive terminal theme used to be `minipit`.
    // Left alone it resolves to nothing and the terminal loses its theme.
    if (localStorage.getItem(NEW + 'termTheme') === 'minipit') {
      localStorage.setItem(NEW + 'termTheme', 'den')
    }
    localStorage.setItem(MARK, '1')
  } catch {
    // Storage disabled or full. Losing the migration costs preferences, not
    // correctness — every reader has a default — so this must never throw and
    // take the whole renderer down with it.
  }
}

// The old keys are deliberately left in place rather than deleted: they cost a
// few KB, and keeping them means a user who opens an older build still finds
// their settings instead of a factory-reset app.
migrateStorage()
