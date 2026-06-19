import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useStore } from '../../store'

interface KitForm {
  kind: 'mixin' | 'sandbox'
  name: string
  displayName: string
  description: string
  image: string
  entrypoint: string
  installCmds: string[]
  allowedDomains: string[]
  envVars: string[]
}

function buildSpec(f: KitForm): string {
  const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`
  const lines: string[] = ['schemaVersion: "1"', `kind: ${f.kind}`, `name: ${f.name || 'my-kit'}`]
  if (f.displayName.trim()) lines.push(`displayName: ${f.displayName.trim()}`)
  if (f.description.trim()) lines.push(`description: ${f.description.trim()}`)

  if (f.kind === 'sandbox') {
    const run = (f.entrypoint.trim() || 'bash').split(/\s+/).filter(Boolean).map(q).join(', ')
    lines.push('sandbox:')
    lines.push(`  image: ${q(f.image.trim() || 'docker/sandbox-templates:claude-code-docker')}`)
    lines.push('  entrypoint:', `    run: [${run}]`)
  }

  const domains = f.allowedDomains.map((s) => s.trim()).filter(Boolean)
  if (domains.length) {
    lines.push('network:', '  allowedDomains:')
    domains.forEach((d) => lines.push(`    - ${d}`))
  }

  const envs = f.envVars.map((s) => s.trim()).filter((s) => s.includes('='))
  if (envs.length) {
    lines.push('environment:', '  variables:')
    envs.forEach((e) => {
      const i = e.indexOf('=')
      lines.push(`    ${e.slice(0, i).trim()}: ${q(e.slice(i + 1).trim())}`)
    })
  }

  const cmds = f.installCmds.map((s) => s.trim()).filter(Boolean)
  if (cmds.length) {
    lines.push('commands:', '  install:')
    cmds.forEach((c) => lines.push(`    - command: ${q(c)}`))
  }
  return lines.join('\n') + '\n'
}

// A list of single-line inputs with add/remove (one entry per line).
function ListField({ label, hint, placeholder, items, onChange, addLabel }: {
  label: string; hint?: string; placeholder: string; items: string[]; onChange: (v: string[]) => void; addLabel: string
}) {
  return (
    <div className="fg">
      <label className="flabel">{label}{hint && <span className="flabel-hint">{hint}</span>}</label>
      {items.map((val, i) => (
        <div className="kit-list-row" key={i}>
          <input
            className="finput"
            value={val}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button className="btn btn-ghost btn-sm kit-list-rm" onClick={() => onChange(items.filter((_, j) => j !== i))} title="Remove">
            <X size={13} />
          </button>
        </div>
      ))}
      <button className="kit-add-line" onClick={() => onChange([...items, ''])}>
        <Plus size={12} /> {addLabel}
      </button>
    </div>
  )
}

export function NewKitModal() {
  const { setModal } = useStore()
  const [f, setF] = useState<KitForm>({
    kind: 'mixin', name: '', displayName: '', description: '',
    image: '', entrypoint: '', installCmds: [], allowedDomains: [], envVars: []
  })
  const [showSpec, setShowSpec] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const set = (k: keyof KitForm, v: KitForm[keyof KitForm]) => setF((prev) => ({ ...prev, [k]: v }))

  const handleCreate = async () => {
    if (!f.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError(''); setDone('')
    try {
      const res = await window.minipit?.createKit(f.name.trim(), buildSpec(f))
      setDone(res?.zip ? `Packed → ${res.zip}` : 'Kit created')
      setTimeout(() => setModal(null), 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <div className="overlay" onClick={() => !saving && setModal(null)}>
      <div className="modal" style={{ width: 540 }} onClick={(e) => e.stopPropagation()}>
        <div className="m-hdr">
          <div className="m-title">New Kit</div>
          <div className="m-sub">Describe the kit — minipit writes the spec.yaml and packs it.</div>
        </div>

        <div className="m-body">
          <div className="fg">
            <label className="flabel">Kind</label>
            <div className="src-seg">
              <button className={`src-seg-item${f.kind === 'mixin' ? ' active' : ''}`} onClick={() => set('kind', 'mixin')}>Mixin</button>
              <button className={`src-seg-item${f.kind === 'sandbox' ? ' active' : ''}`} onClick={() => set('kind', 'sandbox')}>Sandbox</button>
            </div>
            <div className="fhint">{f.kind === 'mixin' ? 'Layers tools/config onto an existing agent.' : 'Defines a full agent from scratch.'}</div>
          </div>

          <div className="frow-2">
            <div className="fg" style={{ flex: 1 }}>
              <label className="flabel">Name</label>
              <input className="finput" value={f.name} placeholder="my-kit" onChange={(e) => set('name', e.target.value)} autoFocus />
            </div>
            <div className="fg" style={{ flex: 1 }}>
              <label className="flabel">Display name</label>
              <input className="finput" value={f.displayName} placeholder="My Kit" onChange={(e) => set('displayName', e.target.value)} />
            </div>
          </div>

          <div className="fg">
            <label className="flabel">Description</label>
            <input className="finput" value={f.description} placeholder="What this kit does" onChange={(e) => set('description', e.target.value)} />
          </div>

          {f.kind === 'sandbox' && (
            <div className="frow-2">
              <div className="fg" style={{ flex: 1 }}>
                <label className="flabel">Image</label>
                <input className="finput" value={f.image} placeholder="docker/sandbox-templates:claude-code-docker" onChange={(e) => set('image', e.target.value)} />
              </div>
              <div className="fg" style={{ flex: 1 }}>
                <label className="flabel">Entrypoint</label>
                <input className="finput" value={f.entrypoint} placeholder="claude --dangerously-skip-permissions" onChange={(e) => set('entrypoint', e.target.value)} />
              </div>
            </div>
          )}

          <ListField label="Install commands" placeholder="uv tool install ruff@latest" addLabel="Add command"
            items={f.installCmds} onChange={(v) => set('installCmds', v)} />
          <ListField label="Allowed domains" placeholder="pypi.org" addLabel="Add domain"
            items={f.allowedDomains} onChange={(v) => set('allowedDomains', v)} />
          <ListField label="Environment variables" hint="KEY=VALUE" placeholder="IS_SANDBOX=1" addLabel="Add variable"
            items={f.envVars} onChange={(v) => set('envVars', v)} />

          <button className="adv-toggle" onClick={() => setShowSpec((v) => !v)}>
            {showSpec ? '▾' : '▸'} Preview spec.yaml
          </button>
          {showSpec && <pre className="lib-code" style={{ marginTop: 8 }}>{buildSpec(f)}</pre>}

          {error && (
            <div style={{ color: 'var(--destruct)', fontSize: 12, marginTop: 4, padding: '8px 10px', background: 'rgba(248,81,73,0.08)', borderRadius: 6, whiteSpace: 'pre-wrap' }}>
              {error}
            </div>
          )}
          {done && (
            <div style={{ color: 'var(--green)', fontSize: 12, marginTop: 4, padding: '8px 10px', background: 'var(--green-dim)', borderRadius: 6 }}>
              ✓ {done}
            </div>
          )}
        </div>

        <div className="m-ftr">
          <button className="btn btn-ghost" onClick={() => setModal(null)} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !f.name.trim()}>
            {saving ? 'Packing…' : 'Create & Pack'}
          </button>
        </div>
      </div>
    </div>
  )
}
