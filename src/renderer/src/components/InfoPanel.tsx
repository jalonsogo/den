import { useEffect, useState } from 'react'
import { Layers, Lock } from 'lucide-react'
import { formatUptime } from '../lib/utils'
import { MountsPanel } from './MountsPanel'
import { AgentIcon } from './AgentIcon'
import { AccordionSection } from './AccordionSection'
import { useStore } from '../store'
import { AGENTS, type Sandbox } from '../types'

interface InjectedSecret { name: string; source?: string }

// Read an `sbx inspect --json` object. The v0.35 schema carries `secrets` as
// [{ name, source }] and an `auth_mode` string; we stay tolerant of shape drift
// (string entries, alternate key names). This is NOT where account info
// (organization/email/login tier) lives — confirmed against a live sandbox
// that `sbx inspect` only knows the generic `auth_mode` and a network-side
// proxy address, not what Claude Code itself knows about the logged-in
// account. That comes from `window.den.claudeAccount` instead (reads
// ~/.claude.json inside the sandbox — see main/index.ts's `den:claude-account`).
function extractInspect(json: unknown): { secrets: InjectedSecret[]; authMode?: string } {
  if (!json || typeof json !== 'object') return { secrets: [] }
  const obj = json as Record<string, unknown>
  const rawSecrets = obj.secrets ?? obj.injected_secrets ?? obj.injectedSecrets
  const secrets: InjectedSecret[] = Array.isArray(rawSecrets)
    ? rawSecrets.map((s) => {
        if (typeof s === 'string') return { name: s }
        if (s && typeof s === 'object') {
          const o = s as Record<string, unknown>
          return { name: String(o.name ?? o.service ?? o.id ?? ''), source: o.source ? String(o.source) : undefined }
        }
        return { name: '' }
      }).filter((s) => s.name)
    : []
  const authMode = typeof obj.auth_mode === 'string' ? obj.auth_mode : undefined
  return { secrets, authMode }
}

// No close button in the header: the dock is closed from the toolbar's
// right-dock toggle or by clicking its rail icon again, and a third control for
// the same thing just crowds the panel (Files never had one either).
export function InfoPanel({ sandbox }: { sandbox: Sandbox }) {
  const [kits, setKits] = useState<string[]>([])
  // `sbx inspect --json` detail — injected secrets, auth mode + account info.
  const [inspect, setInspect] = useState<{ secrets: InjectedSecret[]; authMode?: string } | null>(null)
  // Claude Code's own account info (org/email/login tier) + configured proxy —
  // only Claude Code (not other agents) has this to read.
  const [account, setAccount] = useState<{ loginMethod?: string; organization?: string; email?: string; proxy?: string } | null>(null)
  // Latest Claude Code statusline reading — model name + token/cost stats.
  const status = useStore((s) => s.agentStatus[sandbox.name])
  const isClaude = sandbox.agent === 'claude' || sandbox.agent === 'claude-bedrock'

  useEffect(() => {
    window.den?.appliedKits(sandbox.name).then((k) => setKits(k ?? [])).catch(() => setKits([]))
    window.den?.sbxInspect(sandbox.name)
      .then((r) => setInspect(r?.ok ? extractInspect(r.json) : null))
      .catch(() => setInspect(null))
    if (!isClaude) { setAccount(null); return }
    window.den?.claudeAccount(sandbox.name)
      .then((r) => setAccount(r?.ok ? r : null))
      .catch(() => setAccount(null))
  }, [sandbox.name, isClaude])

  // Login method falls back to the generic `auth_mode` sbx inspect reports
  // (e.g. "oauth · anthropic") when Claude's own account info isn't available
  // yet (agent still starting) or couldn't be read.
  const loginMethod = account?.loginMethod ?? inspect?.authMode
  const hasAccount = !!(loginMethod || account?.organization || account?.email || account?.proxy)

  return (
    <div className="info-dock">
      <div className="info-dock-hd">
        <span className="info-dock-title">Sandbox info</span>
      </div>
      <div className="info-panel">
      <div className="info-stats">
        <div className="info-stat">
          <span className="is-k">Status</span>
          <span className="is-v" style={{ textTransform: 'capitalize' }}>
            {sandbox.status}
            {sandbox.status === 'running' && sandbox.uptimeSeconds
              ? <span className="is-sub">· {formatUptime(sandbox.uptimeSeconds)}</span> : null}
          </span>
        </div>
        <div className="info-stat">
          <span className="is-k">Agent</span>
          <span className="is-v is-agent">
            <AgentIcon agent={sandbox.agent} size={14} />
            {/* The icon already says which agent this is — once the model name is
                known (Claude Code only), show that instead of repeating the label. */}
            {status?.model ?? AGENTS.find((a) => a.id === sandbox.agent)?.label ?? sandbox.agent}
          </span>
        </div>
        <div className="info-stat">
          <span className="is-k">Memory</span>
          <span className="is-v">{sandbox.memory ?? '—'} <span className="is-sub">· max 32g</span></span>
        </div>
        <div className="info-stat">
          <span className="is-k">Branch</span>
          <span className="is-v">{sandbox.branch ?? '—'} <span className="is-sub">· {sandbox.branch ? 'worktree' : 'no isolation'}</span></span>
        </div>
      </div>

      <AccordionSection id="workspaces" title="Workspaces" defaultOpen>
        <div className="info-row info-row-stack">
          <span className="ir-label">Primary (read-write)</span>
          <span
            className="ir-val"
            title="Double-click to reveal in Finder"
            onDoubleClick={() => window.den?.openInFinder(sandbox.workspace)}
          >{sandbox.workspace}</span>
        </div>
        {sandbox.additionalWorkspaces?.map((ws, i) => (
          <div className="info-row info-row-stack" key={i}>
            <span className="ir-label">{ws.readonly ? 'Read-only' : 'Read-write'}</span>
            <span className="ir-val">{ws.path}</span>
          </div>
        ))}
        <MountsPanel sandbox={sandbox} />
      </AccordionSection>

      {hasAccount && (
        <AccordionSection id="account" title="Account" defaultOpen>
          {/* Plain label-above-value pairs (like the Status/Agent/Memory/Branch
              grid up top), not the bordered .info-row boxes. A single column,
              not a 2-up grid — the field count varies (1-4) and a 2-up grid
              leaves a ragged, oddly-gapped row whenever it doesn't divide evenly. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {loginMethod && (
              <div className="info-stat"><span className="is-k">Login method</span><span className="is-v">{loginMethod}</span></div>
            )}
            {account?.organization && (
              <div className="info-stat"><span className="is-k">Organization</span><span className="is-v">{account.organization}</span></div>
            )}
            {account?.email && (
              <div className="info-stat"><span className="is-k">Email</span><span className="is-v" title={account.email}>{account.email}</span></div>
            )}
            {account?.proxy && (
              <div className="info-stat">
                <span className="is-k">Proxy</span>
                <span className="is-v" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{account.proxy}</span>
              </div>
            )}
          </div>
        </AccordionSection>
      )}

      {kits.length > 0 && (
        <AccordionSection id="kits" title="Kits" badge={kits.length} defaultOpen>
          <div className="info-kits">
            {kits.map((k) => <span className="info-kit" key={k}><Layers size={12} />{k}</span>)}
          </div>
        </AccordionSection>
      )}

      {inspect && (inspect.secrets.length > 0 || inspect.authMode) && (
        <AccordionSection id="secrets" title="Injected secrets" badge={inspect.secrets.length || undefined} defaultOpen>
          {inspect.authMode && (
            <div className="ss-sub" style={{ marginBottom: 6 }}>Auth mode: <strong>{inspect.authMode}</strong></div>
          )}
          {inspect.secrets.length > 0 && (
            <div className="info-kits">
              {inspect.secrets.map((s) => (
                <span className="info-kit" key={s.name}>
                  <Lock size={12} />{s.name}{s.source ? <span style={{ opacity: 0.6 }}> · {s.source}</span> : null}
                </span>
              ))}
            </div>
          )}
          <div className="ss-sub" style={{ marginTop: 6 }}>
            Credentials this sandbox receives via the proxy (from <code>sbx inspect</code>). Values are never exposed.
          </div>
        </AccordionSection>
      )}
      </div>
    </div>
  )
}
