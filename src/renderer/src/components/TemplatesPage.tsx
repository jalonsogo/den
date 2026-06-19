import { useEffect, useState, useCallback } from 'react'
import { Play, Trash2 } from 'lucide-react'
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
  const { setModal, setNewSandboxTemplate } = useStore()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)

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

  const launch = (t: Template) => {
    setNewSandboxTemplate(`${t.repository}:${t.tag}`)
    setModal('new-sandbox')
  }

  const remove = async (t: Template) => {
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
                  <button className="btn btn-ghost btn-sm tpl-icon-btn" style={{ color: 'var(--destruct)' }} title="Delete template" onClick={() => remove(t)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
