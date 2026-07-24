// Best-effort parse of a kit spec.yaml into a structure for a visual summary.
export interface ParsedKit {
  kind: string
  name: string
  displayName: string
  description: string
  image: string
  entrypoint: string
  allowedDomains: string[]
  deniedDomains: string[]
  installCmds: string[]
  envVars: string[]
  agentContext: string
  mcps: string[] // ids inferred from `claude mcp add <id> …` commands
}

// Strip a single pair of matching surrounding quotes (YAML scalars are often
// quoted; without this the quotes render literally in the UI).
function unquote(v: string): string {
  const t = v.trim()
  return /^"(.*)"$/.test(t) || /^'(.*)'$/.test(t) ? t.slice(1, -1) : t
}

export function parseKitSpec(text: string): ParsedKit {
  const out: ParsedKit = {
    kind: '', name: '', displayName: '', description: '', image: '', entrypoint: '',
    allowedDomains: [], deniedDomains: [], installCmds: [], envVars: [], agentContext: '', mcps: []
  }
  let mode: '' | 'allowed' | 'denied' | 'install' | 'env' | 'context' | 'desc' = ''
  const ctx: string[] = []
  const descLines: string[] = []

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const trimmed = line.trim()

    if (/^\S/.test(line)) { // top-level key
      // Allow keys with digits/underscores/camelCase (e.g. schemaVersion), not
      // just pure-letter keys.
      const m = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
      mode = ''
      if (m) {
        const [, k, v] = m
        if (k === 'kind') out.kind = unquote(v)
        else if (k === 'name') out.name = unquote(v)
        else if (k === 'displayName') out.displayName = unquote(v)
        else if (k === 'description') {
          // A block scalar (`>` / `|`, with optional chomping) has its text on the
          // following indented lines; capture those. An inline value we take as-is.
          if (/^[|>][+-]?$/.test(v.trim())) mode = 'desc'
          else out.description = unquote(v)
        }
        else if (k === 'agentContext') mode = 'context'
      }
      continue
    }
    if (mode === 'desc') { descLines.push(trimmed); continue }
    if (mode === 'context') { ctx.push(line.replace(/^\s{2}/, '')); continue }
    if (/^\s{2}allowedDomains:/.test(line)) { mode = 'allowed'; continue }
    if (/^\s{2}deniedDomains:/.test(line)) { mode = 'denied'; continue }
    if (/^\s{2}(install|startup):/.test(line)) { mode = 'install'; continue }
    if (/^\s{2}variables:/.test(line)) { mode = 'env'; continue }
    if (/^\s{2}image:/.test(line)) { out.image = trimmed.replace(/^image:\s*/, '').replace(/^"|"$/g, ''); continue }
    if (/^\s{4}run:/.test(line)) { out.entrypoint = trimmed.replace(/^run:\s*/, '').replace(/^\[|\]$/g, '').replace(/"/g, ''); continue }

    if (mode === 'allowed' || mode === 'denied') {
      const mm = trimmed.match(/^-\s*(.+)$/)
      if (mm) (mode === 'allowed' ? out.allowedDomains : out.deniedDomains).push(mm[1].trim())
    } else if (mode === 'install') {
      // Handles both shapes:
      //   - command: "echo hi"                 (install: scalar command)
      //   - command:                           (startup: command is an argv list,
      //       - "sh"                            wrapped as `sh -c "<script>"` — so
      //       - "-c"                            the real command is the last item)
      //       - "claude mcp add …"
      const inline = trimmed.match(/^-\s*command:\s*"?(.+?)"?\s*$/)
      const listItem = trimmed.match(/^-\s*"?(.+?)"?\s*$/)
      let cmd = inline ? inline[1]
        : (!/^-\s*command:\s*$/.test(trimmed) && !/^user:/.test(trimmed) && listItem ? listItem[1] : null)
      // Drop the `sh`/`-c` argv wrapper so the Summary shows the real command.
      if (cmd === 'sh' || cmd === '-c') cmd = null
      if (cmd) {
        out.installCmds.push(cmd)
        const mcp = cmd.match(/claude\s+mcp\s+add\s+(\S+)/)
        if (mcp) out.mcps.push(mcp[1])
      }
    } else if (mode === 'env') {
      const mm = trimmed.match(/^([A-Za-z_]\w*):\s*"?(.*?)"?\s*$/)
      if (mm) out.envVars.push(`${mm[1]}=${mm[2]}`)
    }
  }
  out.agentContext = ctx.join('\n').trim()
  // Folded/literal block descriptions join into a single line for card display.
  if (descLines.length) out.description = descLines.join(' ').trim()
  return out
}
