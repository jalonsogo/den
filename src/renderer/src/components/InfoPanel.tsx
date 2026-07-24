import { useEffect, useState } from 'react'
import { X, Layers, Lock } from 'lucide-react'
import { formatUptime } from '../lib/utils'
import { MountsPanel } from './MountsPanel'
import { AgentIcon } from './AgentIcon'
import { AccordionSection } from './AccordionSection'
import { AGENTS, type Sandbox } from '../types'

interface InjectedSecret { name: string; source?: string }

// Read an `sbx inspect --json` object. The v0.35 schema carries `secrets` as
// [{ name, source }] and an `auth_mode` string; we stay tolerant of shape drift
// (string entries, alternate key names).
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

export function InfoPanel({ sandbox, onClose }: { sandbox: Sandbox; onClose?: () => void }) {
  const [kits, setKits] = useState<string[]>([])
  // `sbx inspect --json` detail — injected secrets + auth mode.
  const [inspect, setInspect] = useState<{ secrets: InjectedSecret[]; authMode?: string } | null>(null)

  useEffect(() => {
    window.minipit?.appliedKits(sandbox.name).then((k) => setKits(k ?? [])).catch(() => setKits([]))
    window.minipit?.sbxInspect(sandbox.name)
      .then((r) => setInspect(r?.ok ? extractInspect(r.json) : null))
      .catch(() => setInspect(null))
  }, [sandbox.name])

  return (
    <div className="info-dock">
      <div className="info-dock-hd">
        <span className="info-dock-title">Sandbox info</span>
        {onClose && (
          <button className="info-dock-x" onClick={onClose} title="Close"><X size={15} /></button>
        )}
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
          <span className="is-v is-agent"><AgentIcon agent={sandbox.agent} size={14} />{AGENTS.find((a) => a.id === sandbox.agent)?.label ?? sandbox.agent}</span>
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
            onDoubleClick={() => window.minipit?.openInFinder(sandbox.workspace)}
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
