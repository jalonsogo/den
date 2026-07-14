import { useEffect, useState, useCallback } from 'react'
import { Play, Trash2, MoreVertical, Info, UploadCloud } from 'lucide-react'
import { useStore } from '../store'
import { AgentIcon } from './AgentIcon'
import type { Template } from '../types'

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// Best-effort agent id from a template flavor like "claude-code-docker".
function agentFromFlavor(flavor: string): string {
  if (flavor.startsWith('claude')) return 'claude'
  if (flavor.startsWith('codex')) return 'codex'
  if (flavor.startsWith('gemini')) return 'gemini'
  if (flavor.startsWith('copilot')) return 'copilot'
  if (flavor.startsWith('cursor')) return 'cursor'
  if (flavor.startsWith('opencode')) return 'opencode'
  if (flavor.startsWith('docker')) return 'docker-agent'
  return 'shell'
}

export function TemplatesPage() {
  const { setModal, setNewSandboxTemplate, openPrompt, setInspectTemplate, dockerAccount, activeOrg } = useStore()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)
  // Row "⋮" menu.
  const [moreFor, setMoreFor] = useState<string | null>(null)
  const [morePos, setMorePos] = useState<{ top: number; right: number } | null>(null)
  // Shared signed-in account (loaded once at app boot in the store).
  const docker = dockerAccount ?? { loggedIn: false }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTemplates((await window.minipit?.listTemplates()) ?? [])
    } catch {
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!moreFor) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t?.closest('.more-menu') && !t?.closest('.more-btn')) setMoreFor(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [moreFor])

  const toggleMore = (id: string, e: React.MouseEvent) => {
    if (moreFor === id) { setMoreFor(null); return }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMorePos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    setMoreFor(id)
  }

  const launch = (t: Template) => {
    setMoreFor(null)
    setNewSandboxTemplate(`${t.repository}:${t.tag}`)
    setModal('new-sandbox')
  }

  const inspect = (t: Template) => {
    setMoreFor(null)
    setInspectTemplate(t)
  }

  const push = (t: Template) => {
    setMoreFor(null)
    const ns = activeOrg ?? docker.username ?? 'your-namespace'
    // Default to the template's own ref if it's already namespaced, else suggest one.
    const suggested = t.repository.includes('/') ? `${t.repository}:${t.tag}` : `docker.io/${ns}/${t.repository}:${t.tag}`
    openPrompt({
      title: 'Push to Hub',
      message: 'Publish this template to a registry. Requires docker login; make the repo public to share.',
      label: 'Target reference',
      defaultValue: suggested,
      placeholder: 'docker.io/user/name:tag',
      confirmText: 'Push',
      onSubmit: async (ref) => {
        const res = await window.minipit?.templatePush(ref)
        if (!res?.ok) throw new Error(res?.error ?? 'Push failed')
      },
    })
  }

  const remove = async (t: Template) => {
    setMoreFor(null)
    if (!confirm(`Delete template ${t.tag} (${t.id})?`)) return
    await window.minipit?.removeTemplate(t.id).catch((e) => console.error(e))
    load()
  }

  return (
    <div className="page">
      <div className="page-hdr">
        <span className="page-title">Templates</span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={load}>
          Refresh
        </button>
      </div>

      <div className="page-body">
        <p style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 14 }}>
          Reusable sandbox images with tools, packages, and configuration baked in — anything you'd
          rather not reinstall on every start. Pulled when a sandbox is created.
          {loading && ' · Loading…'}
        </p>

        {templates.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--t3)', fontSize: 13, padding: '32px 0' }}>
            {loading ? 'Loading templates…' : 'No templates found'}
          </div>
        ) : (
          <div className="lib-tbl">
            <div className="lib-hdr lib-hdr-tpl">
              <div>Template</div>
              <div>Flavor</div>
              <div>Created</div>
              <div />
            </div>
            {templates.map((t) => (
              <div className="lib-row lib-row-tpl" key={t.id}>
                <div className="lib-primary">
                  <AgentIcon agent={agentFromFlavor(t.flavor)} size={14} />
                  <span title={`${t.repository} · ${t.id}`}>{t.repository.split('/').pop()}:{t.tag}</span>
                </div>
                <div className="lib-muted">{t.flavor}</div>
                <div className="lib-muted">{fmtDate(t.createdAt)}</div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm tpl-icon-btn" title="New sandbox from this template" onClick={() => launch(t)}>
                    <Play size={14} />
                  </button>
                  <button className="btn btn-ghost btn-sm tpl-icon-btn more-btn" title="More actions" onClick={(e) => toggleMore(t.id, e)}>
                    <MoreVertical size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {moreFor && morePos && (() => {
        const t = templates.find((x) => x.id === moreFor)
        if (!t) return null
        return (
          <div className="more-menu" style={{ top: morePos.top, right: morePos.right }}>
            <button className="more-item" onClick={() => inspect(t)}>
              <Info size={14} /> Inspect details
            </button>
            <button className="more-item" onClick={() => launch(t)}>
              <Play size={14} /> New sandbox
            </button>
            <button className="more-item" onClick={() => push(t)}>
              <UploadCloud size={14} /> Push to Hub…
            </button>
            <div className="more-sep" />
            <button className="more-item danger" onClick={() => remove(t)}>
              <Trash2 size={14} /> Delete template
            </button>
          </div>
        )
      })()}
    </div>
  )
}
