// Pure parsers lifted out of index.ts so they can be tested without booting
// Electron. Everything here is text in, structure out — no I/O, no sbx, no
// globals. That matters because this is exactly where this codebase's bugs have
// been: a filename losing its first character, a version comparison deciding
// whether a feature appears.

export interface FileChange {
  path: string
  status: 'new' | 'modified' | 'deleted' | 'renamed'
}

/**
 * Parse `git status --porcelain=v1 --untracked-files=all` output.
 *
 * The input must be RAW — not trimmed. Porcelain v1 writes two status columns
 * then a space, and a worktree-only change leaves the first column blank
 * (`" M path"`). Trimming eats that leading space on the first line, and git
 * lists tracked changes before untracked ones, so the first line is exactly
 * where such an entry lands. That took a character off the filename and
 * produced paths like `EADME.md` that nothing could open.
 *
 * Assumes `-c core.quotePath=false`, or a non-ASCII name arrives C-quoted
 * (`"caf\303\251.md"`) and is equally unopenable.
 */
export function parsePorcelain(raw: string): FileChange[] {
  const changes: FileChange[] = []
  for (const rawLine of raw.split('\n')) {
    // Require the exact "XY path" shape rather than slicing blind, so a line
    // that isn't what we expect is skipped instead of silently mangled.
    const m = /^(..) (.+)$/.exec(rawLine.replace(/\r$/, ''))
    if (!m) continue
    const code = m[1]
    let path = m[2]
    if (path.includes(' -> ')) path = path.split(' -> ')[1] // renamed: show new name
    let status: FileChange['status'] = 'modified'
    if (code.includes('?') || code.includes('A')) status = 'new'
    else if (code.includes('D')) status = 'deleted'
    else if (code.includes('R')) status = 'renamed'
    changes.push({ path, status })
  }
  return changes
}

/** True when `a` is an older release than `b`. Non-numeric suffixes ignored. */
export function semverLt(a: string, b: string): boolean {
  const parts = (s: string) => (s.match(/(\d+)\.(\d+)\.(\d+)/)?.slice(1, 4) ?? []).map(Number)
  const [a1 = 0, a2 = 0, a3 = 0] = parts(a)
  const [b1 = 0, b2 = 0, b3 = 0] = parts(b)
  if (a1 !== b1) return a1 < b1
  if (a2 !== b2) return a2 < b2
  return a3 < b3
}
