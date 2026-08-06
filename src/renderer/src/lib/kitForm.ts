// The visual kit editor's form model, and the two conversions between it and a
// kit spec.yaml: buildSpec (form → YAML, what den writes and packs) and
// specToForm (YAML → form, so an existing kit can be edited).
//
// Kept out of the modal so both directions can be exercised without React.
import { MCP_CATALOG, mcpHost } from './mcpCatalog'
import { parseKitSpec, type KitInitFile } from './kitSpec'

// One block per kit-spec capability, in the order they render.
export type Cap = 'mcp' | 'setup' | 'files' | 'env' | 'cred' | 'network' | 'memory'

// A command plus the two spec fields that decide how it runs: `user: "1000"`
// (the agent, uid 1000) vs root, and `background: true` for daemons.
// `description` has no editor field — it's carried through so hand-written kits
// keep theirs.
export interface CmdRow { cmd: string; asAgent: boolean; background?: boolean; description?: string }

// A static file bundled under <kit>/files/<target>/<dest>. `src` is set for files
// picked in this session (still to be copied); `packed` marks files already in
// the kit folder from an earlier save.
export interface FileRow { src?: string; target: 'home' | 'workspace'; dest: string; packed?: boolean }

export interface EnvRow { key: string; value: string }

// The four-block credential pattern as one editable record — see buildSpec.
export interface CredRow {
  service: string
  domains: string[]
  headerName: string
  valueFormat: string
  envVars: string[]
}

export interface KitForm {
  kind: 'mixin' | 'sandbox'
  name: string
  displayName: string
  description: string
  image: string
  entrypoint: string
  aiFilename: string        // sandbox.aiFilename — the profile file the kit owns
  mcps: string[]            // catalog ids (Remote MCP primitive)
  customMcps: { name: string; url: string }[]
  installCmds: CmdRow[]
  startupCmds: CmdRow[]
  allowedDomains: string[]
  deniedDomains: string[]   // never authored here; preserved from an edited spec
  envVars: EnvRow[]
  creds: CredRow[]
  agentContext: string
  files: FileRow[]
  // commands.initFiles — files written at startup with runtime values. Authored
  // in the spec, not in the editor; carried so saving doesn't drop them.
  initFiles: KitInitFile[]
}

export const EMPTY_KIT: KitForm = {
  kind: 'mixin', name: '', displayName: '', description: '',
  image: '', entrypoint: '', aiFilename: '',
  mcps: [], customMcps: [], installCmds: [], startupCmds: [],
  allowedDomains: [], deniedDomains: [], envVars: [], creds: [],
  agentContext: '', files: [], initFiles: []
}

// `claude mcp add` must run at STARTUP (after the sandbox seeds the agent's
// settings) and as the agent user, with --scope user so it persists — as an
// install command it gets overwritten by setup. `claude` is not on the default
// PATH for the startup shell (see sbx's own durable-startup script), so prepend
// the same PATH it uses. Idempotent via `|| true`.
const PATHFIX = 'export PATH="$HOME/.local/bin:$HOME/.claude/local:$PATH"; '
export const isMcpCmd = (c: string): boolean => /claude\s+mcp\s+add\s/.test(c)

export function mcpStartupCmds(f: KitForm): string[] {
  const servers = f.mcps.map((id) => MCP_CATALOG.find((m) => m.id === id)).filter(Boolean) as typeof MCP_CATALOG
  return [
    ...servers.map((m) => `${PATHFIX}claude mcp add ${m.id} --transport ${m.transport} ${m.url} --scope user || true`),
    ...f.customMcps.filter((c) => c.url.trim()).map((c) =>
      `${PATHFIX}claude mcp add ${(c.name.trim() || 'custom').replace(/\s+/g, '-')} --transport http ${c.url.trim()} --scope user || true`)
  ]
}

// Every domain the kit needs to reach: what the user declared, plus the hosts
// implied by the selected MCPs and by each credential's service domains.
export function kitDomains(f: KitForm): { allowed: string[]; derived: Set<string> } {
  const servers = f.mcps.map((id) => MCP_CATALOG.find((m) => m.id === id)).filter(Boolean) as typeof MCP_CATALOG
  const derived = new Set<string>([
    ...servers.map((m) => mcpHost(m.url)),
    // Hosts the OAuth handshake needs when they differ from the endpoint's —
    // without them the flow dies at the token exchange (see McpServer.authHosts).
    ...servers.flatMap((m) => m.authHosts ?? []),
    ...f.customMcps.filter((c) => c.url.trim()).map((c) => mcpHost(c.url.trim())),
    ...f.creds.flatMap((c) => c.domains.map((d) => d.trim()).filter(Boolean))
  ].filter(Boolean))
  const allowed = [...new Set([...f.allowedDomains.map((s) => s.trim()).filter(Boolean), ...derived])]
  return { allowed, derived }
}

export function buildSpec(f: KitForm): string {
  // YAML double-quoted scalars: backslash first, then the quote itself.
  const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  const lines: string[] = ['schemaVersion: "1"', `kind: ${f.kind}`, `name: ${f.name || 'my-kit'}`]
  if (f.displayName.trim()) lines.push(`displayName: ${f.displayName.trim()}`)
  if (f.description.trim()) lines.push(`description: ${f.description.trim()}`)

  if (f.kind === 'sandbox') {
    const run = (f.entrypoint.trim() || 'bash').split(/\s+/).filter(Boolean).map(q).join(', ')
    lines.push('sandbox:')
    lines.push(`  image: ${q(f.image.trim() || 'docker/sandbox-templates:claude-code-docker')}`)
    // The profile file the kit's agentContext is rendered into (CLAUDE.md,
    // AGENTS.md…). Only sandbox kits own one; mixins append to the agent's.
    if (f.aiFilename.trim()) lines.push(`  aiFilename: ${f.aiFilename.trim()}`)
    lines.push('  entrypoint:', `    run: [${run}]`)
  }

  const creds = f.creds
    .map((c) => ({
      ...c,
      service: c.service.trim(),
      domains: c.domains.map((d) => d.trim()).filter(Boolean),
      envVars: c.envVars.map((e) => e.trim()).filter(Boolean)
    }))
    .filter((c) => c.service)
  const { allowed } = kitDomains(f)
  const denied = f.deniedDomains.map((s) => s.trim()).filter(Boolean)
  const serviceDomains = creds.flatMap((c) => c.domains.map((d) => [d, c.service] as const))
  const withAuth = creds.filter((c) => c.headerName.trim())

  if (allowed.length || denied.length || serviceDomains.length || withAuth.length) {
    lines.push('network:')
    if (serviceDomains.length) {
      // Host → service. Only the hosts that need injection: an over-broad map
      // rewrites headers on unrelated downloads and breaks them.
      lines.push('  serviceDomains:')
      serviceDomains.forEach(([host, svc]) => lines.push(`    ${q(host)}: ${svc}`))
    }
    if (withAuth.length) {
      lines.push('  serviceAuth:')
      withAuth.forEach((c) => {
        lines.push(`    ${c.service}:`)
        lines.push(`      headerName: ${c.headerName.trim()}`)
        lines.push(`      valueFormat: ${q(c.valueFormat.trim() || '%s')}`)
      })
    }
    if (allowed.length) { lines.push('  allowedDomains:'); allowed.forEach((d) => lines.push(`    - ${q(d)}`)) }
    if (denied.length) { lines.push('  deniedDomains:'); denied.forEach((d) => lines.push(`    - ${q(d)}`)) }
  }

  // Where the real secret comes from on the host.
  const credEnvs = creds.filter((c) => c.envVars.length)
  if (credEnvs.length) {
    lines.push('credentials:', '  sources:')
    credEnvs.forEach((c) => {
      lines.push(`    ${c.service}:`, '      env:')
      c.envVars.forEach((e) => lines.push(`        - ${e}`))
    })
  }

  const envs = f.envVars
    .map((e) => ({ key: e.key.trim(), value: e.value }))
    .filter((e) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(e.key))
  // The container sees a sentinel for these; the proxy swaps in the real value.
  const proxyManaged = [...new Set(credEnvs.flatMap((c) => c.envVars))]
  if (envs.length || proxyManaged.length) {
    lines.push('environment:')
    if (envs.length) {
      lines.push('  variables:')
      envs.forEach((e) => lines.push(`    ${e.key}: ${q(e.value.trim())}`))
    }
    if (proxyManaged.length) {
      lines.push('  proxyManaged:')
      proxyManaged.forEach((e) => lines.push(`    - ${e}`))
    }
  }

  const installCmds = f.installCmds.filter((c) => c.cmd.trim())
  // User startup commands first, then the MCP registrations this kit implies.
  const startupCmds: CmdRow[] = [
    ...f.startupCmds.filter((c) => c.cmd.trim()),
    ...mcpStartupCmds(f).map((cmd) => ({ cmd, asAgent: true }))
  ]
  if (installCmds.length || startupCmds.length || f.initFiles.length) {
    lines.push('commands:')
    if (installCmds.length) {
      // install takes a shell string — sbx runs it through `sh -c`.
      lines.push('  install:')
      installCmds.forEach((c) => {
        lines.push(`    - command: ${q(c.cmd.trim())}`)
        if (c.asAgent) lines.push('      user: "1000"')
        if (c.description?.trim()) lines.push(`      description: ${c.description.trim()}`)
      })
    }
    if (startupCmds.length) {
      // startup takes an ARGV array (sbx runs `exec <argv...>`), NOT a shell
      // line — a bare string is exec'd as a binary name and fails with 127.
      // Wrap each in `sh -c "<script>"`, mirroring sbx's own dispatcher.
      lines.push('  startup:')
      startupCmds.forEach((c) => {
        lines.push('    - command:')
        lines.push('        - "sh"')
        lines.push('        - "-c"')
        lines.push(`        - ${q(c.cmd.trim())}`)
        if (c.asAgent) lines.push('      user: "1000"')
        if (c.background) lines.push('      background: true')
        if (c.description?.trim()) lines.push(`      description: ${c.description.trim()}`)
      })
    }
    if (f.initFiles.length) {
      lines.push('  initFiles:')
      f.initFiles.forEach((x) => {
        lines.push(`    - path: ${x.path}`)
        lines.push(`      content: ${q(x.content)}`)
        if (x.onlyIfMissing) lines.push('      onlyIfMissing: true')
      })
    }
  }

  if (f.agentContext.trim()) {
    lines.push('agentContext: |')
    f.agentContext.trim().split('\n').forEach((l) => lines.push(`  ${l}`))
  }
  return lines.join('\n') + '\n'
}

// Inverse of buildSpec — parse an existing spec.yaml back into the visual form so
// a kit can be edited. Kits composed with this editor round-trip byte-for-byte.
// Fields with no editor control (a command's `description`, `commands.initFiles`)
// ride along in the form so saving doesn't strip them out of a hand-written kit.
export function specToForm(raw: string): { form: KitForm; caps: Cap[] } {
  const p = parseKitSpec(raw)
  // Recover MCP registrations (id/name, url) from `claude mcp add`.
  const mcps: string[] = []
  const customMcps: { name: string; url: string }[] = []
  for (const m of raw.matchAll(/claude\s+mcp\s+add\s+(\S+)\s+--transport\s+(\S+)\s+(\S+)/g)) {
    const name = m[1], url = m[3]
    if (MCP_CATALOG.some((c) => c.id === name)) { if (!mcps.includes(name)) mcps.push(name) }
    else if (!customMcps.some((c) => c.url === url)) customMcps.push({ name, url })
  }
  const toRow = (c: { cmd: string; user?: string; background?: boolean; description?: string }): CmdRow =>
    ({ cmd: c.cmd, asAgent: c.user === '1000', background: c.background, description: c.description })
  // Real commands exclude the auto-generated MCP registrations.
  const installCmds = p.installCmds.filter((c) => !isMcpCmd(c.cmd)).map(toRow)
  const startupCmds = p.startupCmds.filter((c) => !isMcpCmd(c.cmd)).map(toRow)

  const creds: CredRow[] = p.credentials.map((c) => ({
    service: c.service, domains: c.domains, headerName: c.headerName, valueFormat: c.valueFormat, envVars: c.envVars
  }))

  const form: KitForm = {
    kind: p.kind === 'mixin' ? 'mixin' : 'sandbox',
    name: p.name, displayName: p.displayName, description: p.description,
    image: p.image, entrypoint: p.entrypoint, aiFilename: p.aiFilename,
    mcps, customMcps, installCmds, startupCmds,
    allowedDomains: [], deniedDomains: p.deniedDomains,
    envVars: p.envVars.map((e) => { const i = e.indexOf('='); return { key: e.slice(0, i), value: e.slice(i + 1) } }),
    creds, agentContext: p.agentContext, files: [], initFiles: p.initFiles
  }
  // Hand-typed allow rules are the ones buildSpec wouldn't have derived from the
  // MCPs and credentials — otherwise they'd double up as manual entries.
  const { derived } = kitDomains(form)
  form.allowedDomains = p.allowedDomains.filter((d) => !derived.has(d))

  const caps: Cap[] = []
  if (mcps.length || customMcps.length) caps.push('mcp')
  if (installCmds.length || startupCmds.length) caps.push('setup')
  if (form.envVars.length) caps.push('env')
  if (creds.length) caps.push('cred')
  if (form.allowedDomains.length || p.deniedDomains.length) caps.push('network')
  if (form.agentContext.trim() || form.aiFilename.trim()) caps.push('memory')
  return { form, caps }
}
