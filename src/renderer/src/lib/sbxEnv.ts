import { parseYaml, asMap, asList, asStr, type Node } from './kitSpec'

// A summary of a `.sbxenv.yaml` for the Environments page.
//
// The schema is read defensively on purpose. Sandbox environments shipped
// experimental in sbx v0.39, which means the field names are the part most
// likely to move — and den only ever *reads* these files, so a key it doesn't
// recognise costs nothing to carry. Known keys get a labelled row; everything
// else is still listed, rather than silently dropped, so a file that uses a
// spelling den hasn't caught up with doesn't look empty.

export interface EnvSummary {
  agent: string
  workspace: string
  name: string
  kits: string[]
  envVars: Array<{ key: string; value: string; fromHost: boolean }>
  secrets: string[]
  ports: string[]
  limits: Array<{ key: string; value: string }>
  registries: string[]
  /** Top-level keys den has no labelled row for — shown verbatim. */
  extras: Array<{ key: string; value: string }>
  /** True when nothing at all parsed: an empty file, or not YAML. */
  empty: boolean
}

/** `${VAR}` / `$VAR` — an environment file can defer to the host for a value. */
const HOST_REF = /\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*/

// Each concept is looked up under several plausible spellings: the release notes
// name the concepts, not the keys. First match wins.
const pick = (m: { [k: string]: Node }, ...keys: string[]): Node | undefined => {
  for (const k of keys) if (m[k] !== undefined) return m[k]
  return undefined
}

/** A scalar, a flow list, or a map rendered as `k=v` — whatever the key holds. */
function pairs(n: Node | undefined): Array<{ key: string; value: string }> {
  if (!n) return []
  if (typeof n === 'string') return n ? [{ key: n, value: '' }] : []
  if (Array.isArray(n)) {
    return n.flatMap((item) => {
      if (typeof item === 'string') {
        const eq = item.indexOf('=')
        return eq > 0
          ? [{ key: item.slice(0, eq), value: item.slice(eq + 1) }]
          : [{ key: item, value: '' }]
      }
      return Object.entries(asMap(item)).map(([k, v]) => ({ key: k, value: asStr(v) }))
    })
  }
  return Object.entries(n).map(([k, v]) => ({ key: k, value: asStr(v) }))
}

const names = (n: Node | undefined): string[] =>
  pairs(n).map((p) => p.key).filter(Boolean)

const KNOWN = new Set([
  'agent', 'workspace', 'name', 'sandbox', 'kits', 'kit', 'env', 'environment',
  'variables', 'secrets', 'secret', 'ports', 'port', 'limits', 'resources',
  'registries', 'registry', 'registryCredentials', 'version', 'schemaVersion'
])

export function parseSbxEnv(text: string): EnvSummary {
  const root = asMap(parseYaml(text))
  // Some shapes nest everything under `sandbox:`; read both levels so either works.
  const sb = asMap(root.sandbox)
  const at = (...keys: string[]): Node | undefined => pick(root, ...keys) ?? pick(sb, ...keys)

  const envNode = at('env', 'environment')
  // `environment: { variables: {...} }` (as kit specs do) or a flat map/list.
  const envInner = asMap(envNode).variables !== undefined ? asMap(envNode).variables : envNode

  const summary: EnvSummary = {
    agent: asStr(at('agent')),
    workspace: asStr(at('workspace')),
    name: asStr(at('name')),
    kits: names(at('kits', 'kit')),
    envVars: pairs(envInner).map((p) => ({ ...p, fromHost: HOST_REF.test(p.value) })),
    secrets: names(at('secrets', 'secret')),
    ports: pairs(at('ports', 'port')).map((p) => (p.value ? `${p.key}:${p.value}` : p.key)),
    limits: pairs(at('limits', 'resources')),
    registries: names(at('registries', 'registry', 'registryCredentials')),
    extras: Object.entries(root)
      .filter(([k]) => !KNOWN.has(k))
      .map(([k, v]) => ({
        key: k,
        value: typeof v === 'string' ? v : Array.isArray(v) ? v.map(asStr).join(', ') : ''
      })),
    empty: false
  }
  summary.empty = Object.keys(root).length === 0
  return summary
}

/** Count of everything the file declares — drives the row's one-line summary. */
export function envItemCount(s: EnvSummary): number {
  return s.kits.length + s.envVars.length + s.secrets.length +
         s.ports.length + s.limits.length + s.registries.length
}

/** Host variables this file defers to, so the page can say what must be set. */
export function hostRefs(s: EnvSummary): string[] {
  const out = new Set<string>()
  for (const v of s.envVars) {
    for (const m of v.value.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g)) {
      out.add(m[1] ?? m[2])
    }
  }
  return [...out]
}

// asList is re-exported for the page's own defensive reads.
export { asList }
