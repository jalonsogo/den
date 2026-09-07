import { useEffect, useState, useCallback } from 'react'
import { Plus, DownloadCloud, Cloud } from 'lucide-react'
import { useStore } from '../store'
import { SecretIcon } from './SecretIcon'
import {
  COMMON_SECRET_SERVICES,
  GLOBAL_SCOPE,
  isGlobalScope,
  serviceLabel,
  type StoredSecret,
  type SecretService
} from '../types'

// A single row on the Secrets table: one (scope, store) of one service.
// `stored` is undefined for a not-yet-configured placeholder (always the
// global, local slot — cloud rows only ever appear once something's stored).
interface SecretRow {
  service: string
  scope: string
  location: 'local' | 'cloud'
  stored?: StoredSecret
}

export function SecretsPage() {
  const { modal, setModal, setSecretTarget } = useStore()
  const [secrets, setSecrets] = useState<StoredSecret[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.den?.listSecrets()
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

  // Only service secrets belong on this page (registry pull-creds are managed
  // elsewhere). Build one row per (service, scope, store): a local-global slot
  // for every common provider, plus a row for each actually-stored secret in
  // any scope or store. Local and cloud are wholly separate stores, so a
  // service can have both a local and a cloud row at the same scope — no
  // cloud placeholder, though: those only appear once something's stored, so
  // a den install that's never touched cloud secrets shows exactly what it
  // showed before this existed.
  const serviceSecrets = secrets.filter((s) => s.type === 'service')
  const entriesFor = (id: string) => serviceSecrets.filter((s) => s.name === id)
  const otherIds = [...new Set(serviceSecrets.map((s) => s.name))].filter(
    (id) => !COMMON_SECRET_SERVICES.includes(id as SecretService)
  )
  const rows: SecretRow[] = []
  for (const id of [...COMMON_SECRET_SERVICES, ...otherIds]) {
    const entries = entriesFor(id)
    const globalLocal = entries.find((e) => isGlobalScope(e.scope) && e.location === 'local')
    const globalCloud = entries.find((e) => isGlobalScope(e.scope) && e.location === 'cloud')
    if (globalLocal) rows.push({ service: id, scope: globalLocal.scope, location: 'local', stored: globalLocal })
    else if (COMMON_SECRET_SERVICES.includes(id as SecretService)) rows.push({ service: id, scope: GLOBAL_SCOPE, location: 'local' })
    if (globalCloud) rows.push({ service: id, scope: globalCloud.scope, location: 'cloud', stored: globalCloud })
    for (const e of entries.filter((e) => !isGlobalScope(e.scope))) {
      rows.push({ service: id, scope: e.scope, location: e.location, stored: e })
    }
  }

  const openModal = (service: string, scope: string, location: 'local' | 'cloud') => {
    setSecretTarget(service as SecretService, scope, location === 'cloud')
    setModal('new-secret')
  }

  // Migrate host credential env vars (e.g. ANTHROPIC_API_KEY) into the keychain.
  // sbx v0.35 no longer auto-injects host env vars, so anything you relied on
  // there needs a one-time `sbx secret import`.
  const handleImport = async () => {
    if (importing) return
    setImporting(true)
    setImportMsg(null)
    const r = await window.den?.secretImport().catch((e) => ({ ok: false, error: String(e) }))
    setImporting(false)
    const out = r && 'output' in r ? r.output : undefined
    setImportMsg(r?.ok ? (out?.trim() || 'Imported credentials from environment.') : `Import failed: ${(r && 'error' in r && r.error) || 'unknown error'}`)
    load()
  }

  const handleRemove = async (service: string, scope: string, location: 'local' | 'cloud') => {
    const where = (isGlobalScope(scope) ? 'global' : `sandbox "${scope}"`) + (location === 'cloud' ? ', cloud' : '')
    if (!confirm(`Remove the stored ${service} secret (${where})?`)) return
    await window.den?.removeSecret(service, scope, location === 'cloud').catch(() => {})
    load()
  }

  return (
    <div className="secrets-tab">
      <div className="secrets-tab-top">
        <p style={{ fontSize: 12.5, color: 'var(--t3)', margin: 0 }}>
          Stored in your OS keychain by sbx. Agents receive credentials via proxy — tokens are never exposed.
          {loading && ' · Loading…'}
        </p>
        <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
          <button
            className="btn btn-default btn-sm"
            onClick={handleImport}
            disabled={importing}
            title="Import credential env vars (e.g. ANTHROPIC_API_KEY) into the keychain — sbx no longer auto-injects host env vars"
          >
            <DownloadCloud size={13} />
            {importing ? 'Importing…' : 'Import from environment'}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { setSecretTarget(null); setModal('new-secret') }}
          >
            <Plus size={13} />
            Add Secret
          </button>
        </div>
      </div>

      {importMsg && (
        <p style={{ fontSize: 11.5, color: 'var(--t3)', margin: '2px 0 8px' }}>{importMsg}</p>
      )}

      <div>
        <div className="sec-tbl">
          <div className="sec-hdr">
            <div className="sec-th">Provider</div>
            <div className="sec-th">Scope</div>
            <div className="sec-th">Status</div>
            <div className="sec-th" />
          </div>

          {rows.map((row) => {
            const configured = !!row.stored
            return (
              <div className="sec-row" key={`${row.service}:${row.scope}:${row.location}`}>
                <div className="sec-svc">
                  <div className="sec-ico"><SecretIcon service={row.service} size={16} /></div>
                  <div className="sec-name">{serviceLabel(row.service)}</div>
                </div>
                <div className="sec-scope">
                  {isGlobalScope(row.scope) ? 'Global' : row.scope}
                  {row.location === 'cloud' && (
                    <span className="sec-badge" title="Stored in the cloud secrets store, separate from local">
                      <Cloud size={11} style={{ verticalAlign: -1, marginRight: 3 }} />cloud
                    </span>
                  )}
                </div>
                <div className={`sec-st ${configured ? (row.stored?.envOnly ? 'warn' : 'ok') : 'no'}`}>
                  <div className="sec-sd" />
                  <span className="sec-mask">{configured ? (row.stored?.masked || 'Configured') : 'Not set'}</span>
                  {row.stored?.envOnly && (
                    <span className="sec-badge sec-badge-warn" title="Only present as a host environment variable — sbx no longer auto-injects these. Use “Import from environment”.">
                      env only
                    </span>
                  )}
                  {row.stored?.oauthShadowed && (
                    <span className="sec-badge" title="An OAuth credential takes precedence over this stored key, so the stored value won’t be used.">
                      OAuth-shadowed
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openModal(row.service, row.scope, row.location)}>
                    {configured ? 'Edit' : 'Set'}
                  </button>
                  {configured && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--destruct)' }}
                      onClick={() => handleRemove(row.service, row.scope, row.location)}
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
