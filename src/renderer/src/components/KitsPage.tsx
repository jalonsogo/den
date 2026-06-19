import { useEffect, useState, useCallback } from 'react'
import { Plus, Layers, Package, FolderOpen, Trash2 } from 'lucide-react'
import { useStore } from '../store'

interface Kit { name: string; kind: string; dir: string; hasZip: boolean }

export function KitsPage({ variant }: { variant: 'mixin' | 'sandbox' }) {
  const { modal, setModal } = useStore()
  const [kits, setKits] = useState<Kit[]>([])

  const load = useCallback(async () => {
    setKits((await window.minipit?.listKits()) ?? [])
  }, [])

  // Load on mount and refresh when the new-kit modal closes.
  useEffect(() => { if (modal === null) load() }, [modal, load])

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

        {shown.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--t3)', fontSize: 13, padding: '32px 0' }}>
            No {variant} kits yet — create one to get started.
          </div>
        ) : (
          <div className="lib-tbl">
            {shown.map((k) => (
              <div className="lib-row lib-row-kit" key={k.dir}>
                <div className="lib-primary">
                  {variant === 'mixin' ? <Layers size={14} /> : <Package size={14} />}
                  <span>{k.name}</span>
                </div>
                <div className="lib-muted">{k.hasZip ? 'packed' : 'not packed'}</div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm tpl-icon-btn" title="Reveal in Finder" onClick={() => window.minipit?.openInFinder(k.dir)}>
                    <FolderOpen size={14} />
                  </button>
                  <button className="btn btn-ghost btn-sm tpl-icon-btn" style={{ color: 'var(--destruct)' }} title="Delete kit" onClick={() => remove(k)}>
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
