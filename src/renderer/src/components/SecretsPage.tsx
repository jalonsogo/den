import { useEffect, useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { useStore } from '../store'
import { SecretIcon } from './SecretIcon'
import { SECRET_SERVICES, COMMON_SECRET_SERVICES, type StoredSecret, type SecretService } from '../types'

export function SecretsPage() {
  const { modal, setModal, setSecretTarget } = useStore()
  const [secrets, setSecrets] = useState<StoredSecret[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.minipit?.listSecrets()
      setSecrets(result ?? [])
    } catch {
      setSecrets([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Load on mount and refresh whenever the secret modal closes (after a save).
  useEffect(() => {
    if (modal === null) load()
  }, [modal, load])

  const secretFor = (id: SecretService) => secrets.find((s) => s.name === id)

  // Show the basic providers plus any others added via "Add Secret".
  const configuredIds = new Set(secrets.map((s) => s.name))
  const visibleServices = SECRET_SERVICES.filter(
    (s) => COMMON_SECRET_SERVICES.includes(s.id) || configuredIds.has(s.id)
  )

  const openModal = (id: SecretService) => {
    setSecretTarget(id)
    setModal('new-secret')
  }

  const handleRemove = async (id: SecretService) => {
    if (!confirm(`Remove the stored ${id} secret?`)) return
    await window.minipit?.removeSecret(id).catch(() => {})
    load()
  }

  return (
    <div className="secrets-tab">
      <div className="secrets-tab-top">
        <p style={{ fontSize: 12.5, color: 'var(--t3)', margin: 0 }}>
          Stored in your OS keychain by sbx. Agents receive credentials via proxy — tokens are never exposed.
          {loading && ' · Loading…'}
        </p>
        <button
          className="btn btn-primary btn-sm"
          style={{ flexShrink: 0 }}
          onClick={() => { setSecretTarget(null); setModal('new-secret') }}
        >
          <Plus size={13} />
          Add Secret
        </button>
      </div>

      <div>
        <div className="sec-tbl">
          <div className="sec-hdr">
            <div className="sec-th">Provider</div>
            <div className="sec-th">Scope</div>
            <div className="sec-th">Status</div>
            <div className="sec-th" />
          </div>

          {visibleServices.map((svc) => {
            const stored = secretFor(svc.id)
            const configured = !!stored
            return (
              <div className="sec-row" key={svc.id}>
                <div className="sec-svc">
                  <div className="sec-ico"><SecretIcon service={svc.id} size={16} /></div>
                  <div className="sec-name">{svc.label}</div>
                </div>
                <div className="sec-scope">{configured ? 'Global' : '—'}</div>
                <div className={`sec-st ${configured ? 'ok' : 'no'}`}>
                  <div className="sec-sd" />
                  <span className="sec-mask">{configured ? (stored?.masked || 'Configured') : 'Not set'}</span>
                </div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openModal(svc.id)}>
                    {configured ? 'Edit' : 'Set'}
                  </button>
                  {configured && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--destruct)' }}
                      onClick={() => handleRemove(svc.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 10 }}>
          Need another provider? Use <strong>Add Secret</strong> to choose from all supported services.
        </p>
      </div>
    </div>
  )
}

export const SecretsPanel = SecretsPage
