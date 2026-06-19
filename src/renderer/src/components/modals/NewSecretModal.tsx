import { useState, useEffect } from 'react'
import { useStore } from '../../store'
import { SECRET_SERVICES, type SecretService } from '../../types'

export function NewSecretModal() {
  const { setModal, secretTarget } = useStore()
  const [configured, setConfigured] = useState<Set<string>>(new Set())
  const [service, setService] = useState<SecretService>(secretTarget ?? SECRET_SERVICES[0].id)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [oauthing, setOauthing] = useState(false)
  const [error, setError] = useState('')

  // Anthropic uses our custom OAuth flow; OpenAI uses sbx's built-in --oauth.
  const oauthService = service === 'anthropic' || service === 'openai' ? service : null

  const handleOAuth = async () => {
    const fn = service === 'anthropic' ? window.minipit?.anthropicOAuth : () => window.minipit?.oauthSecret('openai')
    if (typeof window.minipit?.anthropicOAuth !== 'function' || typeof window.minipit?.oauthSecret !== 'function') {
      setError('OAuth needs an app restart to load. Quit minipit and relaunch, then try again.')
      return
    }
    setOauthing(true)
    setError('')
    try {
      await fn?.()
      setModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOauthing(false)
    }
  }

  // Load which providers already have a stored secret (to disable them).
  useEffect(() => {
    window.minipit?.listSecrets().then((list) => {
      const ids = new Set((list ?? []).map((s) => s.name))
      setConfigured(ids)
      // When adding (no preselected target), default to the first unconfigured provider.
      if (!secretTarget) {
        const firstFree = SECRET_SERVICES.find((s) => !ids.has(s.id))
        if (firstFree) setService(firstFree.id)
      }
    }).catch(() => {})
  }, [secretTarget])

  const handleSave = async () => {
    if (!apiKey) return
    setSaving(true)
    setError('')
    try {
      await window.minipit?.setSecret(service, apiKey)
      setModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <div className="overlay" onClick={() => !saving && setModal(null)}>
      <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="m-hdr">
          <div className="m-title">{secretTarget ? 'Edit Secret' : 'Add Secret'}</div>
          <div className="m-sub">Stored in OS keychain · never exposed to agents.</div>
        </div>

        <div className="m-body">
          <div className="fg">
            <label className="flabel">Provider</label>
            <select
              className="finput"
              style={{ cursor: 'pointer' }}
              value={service}
              onChange={(e) => setService(e.target.value as SecretService)}
            >
              {SECRET_SERVICES.map((s) => {
                // Disable already-added providers, unless it's the one being edited.
                const isAdded = configured.has(s.id) && s.id !== secretTarget
                return (
                  <option key={s.id} value={s.id} disabled={isAdded}>
                    {s.label}{isAdded ? ' — added' : ''}
                  </option>
                )
              })}
            </select>
          </div>

          {oauthService && (
            <div className="fg">
              <button className="btn btn-default" style={{ width: '100%', justifyContent: 'center' }} onClick={handleOAuth} disabled={oauthing || saving}>
                {oauthing ? 'Waiting for browser…' : `Connect with ${oauthService === 'anthropic' ? 'Anthropic' : 'OpenAI'} (OAuth)`}
              </button>
              <div className="fhint">Opens your browser to sign in, then stores the token automatically. Or paste a key below.</div>
            </div>
          )}

          <div className="fg">
            <label className="flabel">API Key</label>
            <input
              className="finput"
              type="password"
              placeholder="sk-ant-api03-…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoFocus
            />
            <div className="fhint">
              Stored via{' '}
              <code style={{ fontFamily: 'SF Mono,Menlo,monospace', fontSize: 10.5, background: 'var(--bg-subtle)', padding: '1px 5px', borderRadius: 4 }}>
                sbx secret set -g {service}
              </code>
            </div>
          </div>

          {error && (
            <div style={{ color: 'var(--destruct)', fontSize: 12, marginTop: 4, padding: '8px 10px', background: 'rgba(239,68,68,0.06)', borderRadius: 6 }}>
              {error}
            </div>
          )}
        </div>

        <div className="m-ftr">
          <button className="btn btn-ghost" onClick={() => setModal(null)} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!apiKey || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
