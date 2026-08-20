// Parse a kit spec.yaml into the structure the UI renders and edits.
//
// Kits are a small, well-known subset of YAML (nested maps, block sequences,
// flow sequences, block scalars), so instead of a line-by-line scanner this
// walks indentation into a generic tree and then reads the documented keys off
// it — `network`, `commands`, `credentials`, `environment`, `agentContext`,
// `sandbox` (see docs.docker.com/ai/sandboxes/customize/kits).

export interface KitCommand {
  cmd: string          // shell string; argv commands are joined for display
  argv?: string[]      // set when the spec used the argv form
  user?: string
  background?: boolean
  description?: string
}

export interface KitInitFile {
  path: string
  content: string
  onlyIfMissing?: boolean
}

// The four-block credential pattern, collapsed into one record per service:
// network.serviceDomains + network.serviceAuth + credentials.sources +
// environment.proxyManaged.
export interface KitCredential {
  service: string
  domains: string[]
  headerName: string
  valueFormat: string
  envVars: string[]
}

export interface ParsedKit {
  kind: string
  name: string
  displayName: string
  description: string
  image: string
  entrypoint: string
  aiFilename: string
  allowedDomains: string[]
  deniedDomains: string[]
  installCmds: KitCommand[]
  startupCmds: KitCommand[]
  initFiles: KitInitFile[]
  envVars: string[]        // "KEY=value"
  proxyManaged: string[]
  credentials: KitCredential[]
  agentContext: string
  mcps: string[]           // ids inferred from `claude mcp add <id> …` commands
}

// ── Minimal YAML reader ───────────────────────────────────────────────────
export type Node = string | Node[] | { [k: string]: Node }

interface Line { indent: number; text: string; raw: string; blank: boolean }

function tokenize(src: string): Line[] {
  return src.split('\n').map((raw0) => {
    const raw = raw0.replace(/\r$/, '')
    const blank = raw.trim() === ''
    return {
      // A blank line never ends a block — treat it as infinitely indented so
      // block scalars keep their internal paragraph breaks.
      //
      // Tabs count as indentation too. YAML forbids them, but hand-written and
      // tool-generated kits use them anyway, and measuring spaces alone gave a
      // tab-indented child indent 0 — making it a sibling of its own parent. The
      // block then parsed as empty, so `sandbox.image`/`entrypoint` silently
      // vanished, and re-saving wrote the default image over the real one.
      indent: blank ? Number.MAX_SAFE_INTEGER : raw.length - raw.replace(/^[ \t]*/, '').length,
      text: raw.trim(),
      raw,
      blank
    }
  })
}

// Structural lines only: blanks, comments and the `---` document marker carry no
// structure. `#` is only a comment when it starts the line (a `#` inside a value
// is left to the scalar reader).
const isStructural = (l: Line) => !l.blank && !l.text.startsWith('#') && l.text !== '---'

function stripComment(v: string): string {
  let q: string | null = null
  for (let i = 0; i < v.length; i++) {
    const c = v[i]
    if (q) { if (c === q) q = null; continue }
    if (c === '"' || c === "'") { q = c; continue }
    if (c === '#' && (i === 0 || /\s/.test(v[i - 1]))) return v.slice(0, i)
  }
  return v
}

// Strip one pair of matching surrounding quotes and undo the escapes buildSpec
// emits (`\"` and `\\`), so values round-trip instead of accumulating slashes.
function unquote(v: string): string {
  const t = v.trim()
  if (/^"[\s\S]*"$/.test(t)) return t.slice(1, -1).replace(/\\(["\\])/g, '$1')
  if (/^'[\s\S]*'$/.test(t)) return t.slice(1, -1).replace(/''/g, "'")
  return t
}

// `[a, "b c"]` → ['a', 'b c']. Commas inside quotes stay put.
function flowList(v: string): string[] {
  const inner = v.trim().replace(/^\[/, '').replace(/\]$/, '')
  const out: string[] = []
  let cur = '', q: string | null = null
  for (const c of inner) {
    if (q) { cur += c; if (c === q) q = null; continue }
    if (c === '"' || c === "'") { q = c; cur += c; continue }
    if (c === ',') { out.push(cur); cur = ''; continue }
    cur += c
  }
  out.push(cur)
  return out.map(unquote).filter((s) => s !== '')
}

function scalar(v: string): string {
  const t = stripComment(v).trim()
  return unquote(t)
}

// Collect the body of a `|` / `>` block scalar: every line more indented than
// the key, dedented by the block's own indentation.
function blockScalar(lines: Line[], start: number, parentIndent: number, folded: boolean): [string, number] {
  let i = start
  const body: string[] = []
  let blockIndent = -1
  while (i < lines.length) {
    const l = lines[i]
    if (!l.blank && l.indent <= parentIndent) break
    if (!l.blank && blockIndent < 0) blockIndent = l.indent
    body.push(l.blank ? '' : l.raw.slice(blockIndent < 0 ? 0 : blockIndent))
    i++
  }
  while (body.length && body[body.length - 1] === '') body.pop()
  return [folded ? body.join(' ').trim() : body.join('\n'), i]
}

// Parse the block that starts at `start` and is indented at least `indent`.
function parseBlock(lines: Line[], start: number, indent: number): [Node, number] {
  let i = start
  while (i < lines.length && !isStructural(lines[i])) i++
  if (i >= lines.length || lines[i].indent < indent) return ['', i]

  if (lines[i].text.startsWith('- ') || lines[i].text === '-') {
    const seq: Node[] = []
    const seqIndent = lines[i].indent
    while (i < lines.length) {
      const l = lines[i]
      if (!isStructural(l)) { i++; continue }
      if (l.indent < seqIndent || !(l.text === '-' || l.text.startsWith('- '))) break
      const rest = l.text === '-' ? '' : l.text.slice(2).trim()
      // `- key: value` opens a map whose remaining keys sit at the item's
      // content column; re-present the inline part as a line at that column.
      if (/^[\w.-]+:(\s|$)/.test(rest)) {
        const contentIndent = l.indent + 2
        const synthetic: Line = { indent: contentIndent, text: rest, raw: ' '.repeat(contentIndent) + rest, blank: false }
        const patched = [...lines.slice(0, i), synthetic, ...lines.slice(i + 1)]
        const [node, next] = parseMap(patched, i, contentIndent)
        seq.push(node)
        i = next
      } else if (rest === '') {
        const [node, next] = parseBlock(lines, i + 1, l.indent + 1)
        seq.push(node)
        i = next
      } else {
        seq.push(scalar(rest))
        i++
      }
    }
    return [seq, i]
  }
  return parseMap(lines, i, lines[i].indent)
}

function parseMap(lines: Line[], start: number, indent: number): [Node, number] {
  const map: { [k: string]: Node } = {}
  let i = start
  while (i < lines.length) {
    const l = lines[i]
    if (!isStructural(l)) { i++; continue }
    if (l.indent < indent) break
    // A more-indented line here means malformed YAML (or a continuation we do
    // not model) — skip it rather than derailing the whole parse.
    if (l.indent > indent) { i++; continue }
    // A quoted key can hold a colon (`"claude.com:443": svc`), so match a
    // quoted key first and only then the plain form.
    const m = l.text.match(/^("[^"]*"|'[^']*'):(?:\s+(.*))?$/) ?? l.text.match(/^([^:\s][^:]*):(?:\s+(.*))?$/)
    if (!m) { i++; continue }
    const key = unquote(m[1].trim())
    const inline = (m[2] ?? '').trim()
    if (inline === '' ) {
      const [node, next] = parseBlock(lines, i + 1, indent + 1)
      map[key] = node
      i = next
    } else if (/^[|>][+-]?$/.test(inline)) {
      const [text, next] = blockScalar(lines, i + 1, indent, inline.startsWith('>'))
      map[key] = text
      i = next
    } else if (inline.startsWith('[')) {
      map[key] = flowList(inline)
      i++
    } else {
      map[key] = scalar(inline)
      i++
    }
  }
  return [map, i]
}

export const asMap = (n: Node | undefined): { [k: string]: Node } =>
  n && typeof n === 'object' && !Array.isArray(n) ? n : {}
export const asList = (n: Node | undefined): Node[] =>
  Array.isArray(n) ? n : n && typeof n === 'string' && n !== '' ? [n] : []
export const asStr = (n: Node | undefined): string => (typeof n === 'string' ? n : '')
export const strList = (n: Node | undefined): string[] => asList(n).map(asStr).filter(Boolean)

// ── Spec → ParsedKit ─────────────────────────────────────────────────────
function readCommands(n: Node | undefined): KitCommand[] {
  return asList(n).map((item) => {
    if (typeof item === 'string') return { cmd: item }
    const m = asMap(item)
    const c = m.command
    const argv = Array.isArray(c) ? c.map(asStr) : undefined
    return {
      // Startup commands are argv; `sh -c "<script>"` is the documented way to
      // run a shell line, so show the script rather than the wrapper.
      cmd: argv ? (argv[0] === 'sh' && argv[1] === '-c' ? argv[2] ?? '' : argv.join(' ')) : asStr(c),
      argv,
      user: asStr(m.user) || undefined,
      background: asStr(m.background) === 'true' || undefined,
      description: asStr(m.description) || undefined
    }
  }).filter((c) => c.cmd)
}

// sbx v0.38 introduced kit spec v2. den authors v2, but v1 kits keep loading
// through sbx's legacy path, so anything already on disk still has to parse —
// both shapes are read into the same ParsedKit and the UI never knows which it
// came from. Where a concept moved, v2 is preferred and v1 is the fallback:
//
//   v1                                          v2
//   network.allowedDomains / deniedDomains  ->  permissions.network.allow / deny
//   commands.install / startup / initFiles  ->  setup.install / startup / files
//   sandbox.entrypoint.run: [...]           ->  sandbox.entrypoint: [...]
//   sandbox.aiFilename + agentContext       ->  agentInstructions.filename / .content
//   network.serviceDomains + serviceAuth
//     + credentials.sources
//     + environment.proxyManaged            ->  credentials[].apiKey{.name,.proxyManaged,.inject[]}
// The reader itself, for documents that aren't kit specs — `.sbxenv.yaml` is
// read by the same one so a tab-indented environment file behaves like a
// tab-indented kit, rather than silently parsing as empty.
export function parseYaml(text: string): Node {
  const [tree] = parseBlock(tokenize(text), 0, 0)
  return tree
}

export function parseKitSpec(text: string): ParsedKit {
  const [tree] = parseBlock(tokenize(text), 0, 0)
  const root = asMap(tree)
  const v2 = asStr(root.schemaVersion) === '2'

  const sandbox = asMap(root.sandbox)
  const environment = asMap(root.environment)
  const agentInstructions = asMap(root.agentInstructions)
  // v2 nests the network rules under `permissions`; v1 had them at the root.
  const network = v2 ? asMap(asMap(root.permissions).network) : asMap(root.network)
  const setup = v2 ? asMap(root.setup) : asMap(root.commands)

  const installCmds = readCommands(setup.install)
  const startupCmds = readCommands(setup.startup)
  const envVars = Object.entries(asMap(environment.variables)).map(([k, v]) => `${k}=${asStr(v)}`)

  let credentials: KitCredential[]
  let proxyManaged: string[]
  if (v2) {
    // One record per service, already in the shape the editor works with.
    credentials = asList(root.credentials).map((c) => {
      const m = asMap(c)
      const apiKey = asMap(m.apiKey)
      const inject = asList(apiKey.inject).map(asMap)
      return {
        service: asStr(m.service),
        domains: inject.map((i) => asStr(i.domain)).filter(Boolean),
        // The header/format pair is per-injection in v2; the editor models one
        // per service, so take the first — which is what it round-trips back.
        headerName: asStr(inject[0]?.header),
        valueFormat: asStr(inject[0]?.format),
        envVars: [asStr(apiKey.name)].filter(Boolean)
      }
    }).filter((c) => c.service)
    proxyManaged = asList(root.credentials)
      .filter((c) => asStr(asMap(asMap(c).apiKey).proxyManaged) === 'true')
      .map((c) => asStr(asMap(asMap(c).apiKey).name)).filter(Boolean)
  } else {
    // v1's four-block pattern: serviceDomains maps host → service, so invert it.
    const domainsByService = new Map<string, string[]>()
    for (const [host, svc] of Object.entries(asMap(network.serviceDomains))) {
      const s = asStr(svc)
      if (!s) continue
      domainsByService.set(s, [...(domainsByService.get(s) ?? []), host])
    }
    const auth = asMap(network.serviceAuth)
    const sources = asMap(asMap(root.credentials).sources)
    credentials = [...new Set([
      ...domainsByService.keys(), ...Object.keys(auth), ...Object.keys(sources)
    ])].map((service) => ({
      service,
      domains: domainsByService.get(service) ?? [],
      headerName: asStr(asMap(auth[service]).headerName),
      valueFormat: asStr(asMap(auth[service]).valueFormat),
      envVars: strList(asMap(sources[service]).env)
    }))
    proxyManaged = strList(environment.proxyManaged)
  }

  const mcps: string[] = []
  for (const c of [...installCmds, ...startupCmds]) {
    const m = c.cmd.match(/claude\s+mcp\s+add\s+(\S+)/)
    if (m && !mcps.includes(m[1])) mcps.push(m[1])
  }

  const entry = asMap(sandbox.entrypoint)
  return {
    kind: asStr(root.kind),
    name: asStr(root.name),
    displayName: asStr(root.displayName),
    description: asStr(root.description).replace(/\n+/g, ' ').trim(),
    image: asStr(sandbox.image),
    // v2 flattened entrypoint to a bare list; v1 wrapped it in `run`.
    // v2 flattened entrypoint to a bare list, v1 wrapped it in `run`. Accept
    // either whatever the file declares: a spec that mixes them (or omits
    // schemaVersion) shouldn't silently lose its entrypoint.
    entrypoint: (Array.isArray(sandbox.entrypoint)
      ? sandbox.entrypoint.map(asStr)
      : Array.isArray(entry.run) ? entry.run.map(asStr) : strList(entry.run)
    ).join(' '),
    aiFilename: v2 ? asStr(agentInstructions.filename) : asStr(sandbox.aiFilename),
    allowedDomains: strList(v2 ? network.allow : network.allowedDomains),
    deniedDomains: strList(v2 ? network.deny : network.deniedDomains),
    installCmds,
    startupCmds,
    initFiles: asList(v2 ? setup.files : setup.initFiles).map((f) => {
      const m = asMap(f)
      return { path: asStr(m.path), content: asStr(m.content), onlyIfMissing: asStr(m.onlyIfMissing) === 'true' }
    }).filter((f) => f.path),
    envVars,
    proxyManaged,
    credentials,
    agentContext: (v2 ? asStr(agentInstructions.content) : asStr(root.agentContext)).trim(),
    mcps
  }
}
