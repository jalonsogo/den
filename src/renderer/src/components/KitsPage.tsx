import { useEffect, useState, useCallback } from 'react'
import { Plus, Layers, Package, FolderOpen, Trash2, Boxes } from 'lucide-react'
import { useStore } from '../store'

interface Kit { name: string; kind: string; dir: string; hasZip: boolean }

export function KitsPage({ variant }: { variant: 'mixin' | 'sandbox' }) {
  const { modal, setModal, sandboxes } = useStore()
  const [kits, setKits] = useState<Kit[]>([])
  const [addFor, setAddFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setKits((await window.minipit?.listKits()) ?? [])
  }, [])

  // Load on mount and refresh when the new-kit modal closes.
  useEffect(() => { if (modal === null) load() }, [modal, load])

  const running = sandboxes.filter((s) => s.status === 'running')
  const shown = kits.filter((k) => k.kind === variant)
  const title = variant === 'mixin' ? 'Mixins' : 'Kits'
  const blurb = variant === 'mixin'
    ? 'Mixin kits layer extra tools, credentials, and config onto an existing agent.'
    : 'Sandbox kits define a complete agent from scratch — image, entrypoint, network, and more.'

  const remove = async (k: Kit) => {
    if (!confirm(`Delete kit "${k.name}"?`)) return
    await window.minipit?.removeKit(k.dir).catch(() => {})
    load()
  }

  const addToSandbox = async (kit: Kit, sandboxName: string) => {
    setBusy(true)
    setMsg(null)
    const res = await window.minipit?.kitAdd(sandboxName, kit.dir).catch(() => null)
    setBusy(false)
    setAddFor(null)
    setMsg(res?.ok
      ? { ok: true, text: `Added "${kit.name}" to ${sandboxName}.` }
      : { ok: false, text: res?.error || 'Failed to add kit.' })
  }

  return (
    <div className="page">
      <div className="page-hdr">
        <span className="page-title">{title}</span>
        <span className="lib-badge" style={{ marginLeft: 8 }}>Experimental</span>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setModal('new-kit')}>
          <Plus size={13} /> New {variant === 'mixin' ? 'mixin' : 'kit'}
        </button>
      </div>

      <div className="page-body" style={{ maxWidth: 720 }}>
        <p style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 14 }}>{blurb} Authored under <code>~/minipit-kits</code> and packed with <code>sbx kit pack</code>.</p>

        {msg && (
          <div className={`np-banner ${msg.ok ? 'ok' : 'err'}`} style={{ marginBottom: 12 }}>
            <span className="np-banner-txt">{msg.text}</span>
          </div>
        )}

        {shown.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--t3)', fontSize: 13, padding: '32px 0' }}>
            No {variant} kits yet — create one to get started.
          </div>
        ) : (
          <div className="lib-tbl">
            {shown.map((k) => (
              <div key={k.dir}>
                <div className="lib-row lib-row-kit">
                  <div className="lib-primary">
                    {variant === 'mixin' ? <Layers size={14} /> : <Package size={14} />}
                    <span>{k.name}</span>
                  </div>
                  <div className="lib-muted">{k.hasZip ? 'packed' : 'not packed'}</div>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-default btn-sm"
                      title="Add this kit to a running sandbox"
                      onClick={() => setAddFor(addFor === k.dir ? null : k.dir)}
                      disabled={busy}
                    >
                      <Boxes size={13} /> Add to sandbox
                    </button>
                    <button className="btn btn-ghost btn-sm tpl-icon-btn" title="Reveal in Finder" onClick={() => window.minipit?.openInFinder(k.dir)}>
                      <FolderOpen size={14} />
                    </button>
                    <button className="btn btn-ghost btn-sm tpl-icon-btn" style={{ color: 'var(--destruct)' }} title="Delete kit" onClick={() => remove(k)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {addFor === k.dir && (
                  <div className="kit-add-picker">
                    {running.length === 0 ? (
                      <span className="kit-add-empty">No running sandboxes. Start one, or pass this kit at creation in New Sandbox.</span>
                    ) : (
                      running.map((s) => (
                        <button key={s.id} className="kit-add-sb" onClick={() => addToSandbox(k, s.name)} disabled={busy}>
                          {s.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
