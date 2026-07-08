import { useState, useEffect } from 'react'
import { Globe, Box } from 'lucide-react'
import { useStore } from '../../store'
import { SECRET_SERVICES, GLOBAL_SCOPE, isGlobalScope, serviceLabel, type SecretService, type StoredSecret } from '../../types'
import { FieldSelect, type FieldOption } from '../FieldSelect'
import { SecretIcon } from '../SecretIcon'

// 1Password brand mark (keyhole in a circle), in the brand blue.
function OnePasswordIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="1Password" role="img">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="9.6" r="2.3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 11.9v4.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function NewSecretModal() {
  const { setModal, secretTarget, secretScopeTarget, sandboxes } = useStore()
  // Editing an existing secret (provider stays locked; scope can be changed,
  // which moves the secret) vs. adding a new one.
  const editing = secretTarget != null
  const [stored, setStored] = useState<StoredSecret[]>([])
  const [service, setService] = useState<SecretService>(secretTarget ?? SECRET_SERVICES[0].id)
  const [scope, setScope] = useState<string>(secretScopeTarget ?? GLOBAL_SCOPE)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [oauthing, setOauthing] = useState(false)
  const [error, setError] = useState('')
  // 1Password: pull the value from a vault reference instead of pasting it.
  const [useOp, setUseOp] = useState(false)
  const [opRef, setOpRef] = useState('')
  const [opAvail, setOpAvail] = useState<boolean | null>(null)

  useEffect(() => {
    window.minipit?.opAvailable?.().then((v) => setOpAvail(!!v)).catch(() => setOpAvail(false))
  }, [])

  // Services already stored in the currently-selected scope (to disable them).
  const configured = new Set(
    stored
      .filter((s) => (isGlobalScope(scope) ? isGlobalScope(s.scope) : s.scope === scope))
      .map((s) => s.name)
  )

  // The scope token for sbx commands shown in hints: `-g` or a sandbox name.
  const scopeArg = isGlobalScope(scope) ? '-g' : scope

  // Human label for a scope value.
  const scopeLabel = (s: string) => (isGlobalScope(s) ? 'Global — all sandboxes' : `Sandbox: ${s}`)
  const sameScope = (a: string, b: string) => (isGlobalScope(a) && isGlobalScope(b)) || a === b
  // Editing + a different scope = a move (write to new scope, remove from old).
  const moving = editing && !sameScope(scope, secretScopeTarget ?? GLOBAL_SCOPE)

  // Options for the custom (icon) dropdowns.
  const providerOptions: FieldOption[] = SECRET_SERVICES.map((s) => {
    const isAdded = configured.has(s.id) && s.id !== secretTarget
    return {
      value: s.id,
      label: `${s.label}${isAdded ? ' — added' : ''}`,
      icon: <SecretIcon service={s.id} size={16} />,
      disabled: isAdded
    }
  })
  const scopeOptions: FieldOption[] = [
    { value: GLOBAL_SCOPE, label: 'Global — all sandboxes', icon: <Globe size={16} /> },
    ...sandboxes.map((sb) => ({ value: sb.name, label: `Sandbox: ${sb.name}`, icon: <Box size={16} /> }))
  ]

  // OAuth flows only exist for the global scope (Anthropic custom flow; OpenAI
  // via sbx's built-in --oauth). Hidden when scoping to a single sandbox.
  const oauthService =
    isGlobalScope(scope) && (service === 'anthropic' || service === 'openai') ? service : null

  const handleOAuth = async () => {
    const fn = service === 'anthropic' ? window.minipit?.anthropicOAuth : () => window.minipit?.oauthSecret('openai')
    if (typeof window.minipit?.anthropicOAuth !== 'function' || typeof window.minipit?.oauthSecret !== 'function') {
      setError('OAuth needs an app restart to load. Quit den and relaunch, then try again.')
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

  // Load the stored secrets (all scopes) so we can disable already-set providers.
  useEffect(() => {
    window.minipit?.listSecrets().then((list) => {
      setStored((list ?? []).filter((s) => s.type === 'service'))
    }).catch(() => {})
  }, [])

  // When adding, keep the selected provider on one that's free in this scope —
  // re-run when the scope changes or the stored list arrives.
  useEffect(() => {
    if (editing) return
    if (configured.has(service)) {
      const firstFree = SECRET_SERVICES.find((s) => !configured.has(s.id))
      if (firstFree) setService(firstFree.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, stored, editing])

  const handleSave = async () => {
    if (useOp ? !opRef.trim() : !apiKey) return
    if (useOp && typeof window.minipit?.setSecretOp !== 'function') {
      setError('1Password support needs an app restart to load. Quit den and relaunch, then try again.')
      return
    }
    // Moving scope removes the secret from its old scope — confirm first.
    const oldScope = secretScopeTarget ?? GLOBAL_SCOPE
    if (moving && !window.confirm(
      `Move the ${serviceLabel(service)} secret from “${scopeLabel(oldScope)}” to “${scopeLabel(scope)}”?\n\n` +
      `It will be written to the new scope and removed from the old one.`
    )) return
    setSaving(true)
    setError('')
    try {
      // Write the new scope first, then remove the old one — a failure never
      // loses the secret.
      if (useOp) await window.minipit?.setSecretOp(service, opRef.trim(), scope)
      else await window.minipit?.setSecret(service, apiKey, scope)
      if (moving) await window.minipit?.removeSecret(service, oldScope)
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
            <FieldSelect
              ariaLabel="Provider"
              value={service}
              options={providerOptions}
              disabled={editing}
              onChange={(v) => setService(v as SecretService)}
            />
          </div>

          <div className="fg">
            <label className="flabel">Scope</label>
            <FieldSelect
              ariaLabel="Scope"
              value={scope}
              options={scopeOptions}
              onChange={(v) => setScope(v)}
            />
            <div className="fhint">
              {moving
                ? `Changing scope moves this secret: it’s written to ${scopeLabel(scope)} and removed from ${scopeLabel(secretScopeTarget ?? GLOBAL_SCOPE)}.`
                : 'Global secrets are available to every sandbox; a sandbox scope applies to that one only.'}
            </div>
          </div>

          {oauthService && !useOp && (
            <div className="fg">
              <button className="btn btn-default" style={{ width: '100%', justifyContent: 'center' }} onClick={handleOAuth} disabled={oauthing || saving}>
                {oauthing ? 'Waiting for browser…' : `Connect with ${oauthService === 'anthropic' ? 'Anthropic' : 'OpenAI'} (OAuth)`}
              </button>
              <div className="fhint">Opens your browser to sign in, then stores the token automatically. Or paste a key below.</div>
            </div>
          )}

          <div className="fg">
            <div className="secret-op-row">
              <span className="secret-op-label">
                <span className="op-badge"><OnePasswordIcon /></span>
                <span className="flabel" style={{ marginBottom: 0 }}>Load from 1Password</span>
              </span>
              <button
                type="button"
                className={`s-toggle${useOp ? ' on' : ''}`}
                role="switch"
                aria-checked={useOp}
                aria-label="Load from 1Password"
                disabled={opAvail === false || saving}
                title={opAvail === false ? '1Password CLI (op) not found' : 'Load the value from 1Password'}
                onClick={() => setUseOp((v) => !v)}
              />
            </div>
            {opAvail === false && (
              <div className="fhint">1Password CLI (<code className="ccode">op</code>) not found — install it to use this.</div>
            )}
          </div>

          {useOp ? (
            <div className="fg">
              <label className="flabel">1Password secret reference</label>
              <input
                className="finput"
                placeholder="op://Work/Anthropic/credential"
                value={opRef}
                onChange={(e) => setOpRef(e.target.value)}
                autoFocus
                spellCheck={false}
                autoCapitalize="off"
              />
              <div className="fhint">
                Runs{' '}
                <code className="ccode">op read</code>{' '}on your host and stores the result via{' '}
                <code className="ccode">sbx secret set {scopeArg} {service}</code>. The value is never pasted here.
              </div>
            </div>
          ) : (
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
                <code className="ccode">sbx secret set {scopeArg} {service}</code>
              </div>
            </div>
          )}

          {error && (
            <div style={{ color: 'var(--destruct)', fontSize: 12, marginTop: 4, padding: '8px 10px', background: 'rgba(239,68,68,0.06)', borderRadius: 6 }}>
              {error}
            </div>
          )}
        </div>

        <div className="m-ftr">
          <button className="btn btn-ghost" onClick={() => setModal(null)} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || (useOp ? !opRef.trim() : !apiKey)}>
            {saving ? (useOp ? 'Fetching…' : 'Saving…') : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
