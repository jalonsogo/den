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

// A registered MCP server as den shows it. Fields are best-effort: which of
// url/command/transport/auth a given sbx build reports isn't pinned.
export interface McpServerEntry {
  name: string
  url: string
  command: string
  transport: string
  auth: string
}

/**
 * Fallback for `sbx mcp ls` without --json: a column-aligned table. Take the
 * first field as the name and classify the rest by shape rather than by column
 * position, which has moved before in other sbx tables.
 *
 * The hard part is what is NOT a row. With an empty registry sbx prints prose
 * and aligned help where the table would be, and both split into columns just
 * like a real entry — that has produced a phantom server twice, once named `No`
 * (from "No MCP servers registered") and once named `add one` (from the help
 * beneath it), each rendered with live Authorize / Remove buttons and each
 * passable to `--static-mcp`. A name is an identifier, so anything else is
 * dropped: the worst case has to be showing less, never inventing a server.
 */
export function parseMcpTable(out: string): McpServerEntry[] {
  const rows: McpServerEntry[] = []
  for (const line of out.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const cols = t.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean)
    if (cols.length < 1) continue
    // Skip the header row, whatever it's called.
    if (/^(name|server)\b/i.test(cols[0])) continue
    // Skip prose: with nothing registered sbx prints a sentence ("No MCP
    // servers registered"), and add/auth emit INFO/ERROR lines.
    if (/^(no|none|error|info|warn|warning|usage|failed)\b/i.test(cols[0])) continue
    // And skip anything whose name isn't a bare identifier, however many
    // columns follow it. The line under that sentence is aligned help ("add
    // one   sbx mcp add <name> --url <url>") which splits into columns exactly
    // like a real row, so it walked through a check that only looked at
    // single-column lines and became a server called "add one".
    if (/\s/.test(cols[0])) continue
    const rest = cols.slice(1)
    // Belt and braces for help text whose first word happens to be a lone
    // identifier ("Run  sbx mcp add <name>  to add one."): the columns of such
    // a line carry placeholders, backticks or a full stop, none of which appear
    // in a registered server's url or command. Not observed on a build — it's
    // the same failure one wording away, and the cost of being wrong here is
    // hiding a row rather than inventing one.
    if (rest.some((c) => /[<>`]/.test(c) || /\.$/.test(c))) continue
    rows.push({
      name: cols[0],
      url: rest.find((c) => /^https?:\/\//i.test(c)) ?? '',
      command: rest.find((c) => !/^https?:\/\//i.test(c) && /\s|\//.test(c)) ?? '',
      transport: rest.find((c) => /^(http|sse|stdio|local|remote)$/i.test(c)) ?? '',
      // Widened past the obvious words: a column can just as well read "yes",
      // "valid" or "active", and missing it shows an authorized server as blank.
      auth: rest.find((c) => /^(yes|no|ok|valid|active|none|never)$/i.test(c) || /auth|token|expired|pending/i.test(c)) ?? ''
    })
  }
  return rows
}
