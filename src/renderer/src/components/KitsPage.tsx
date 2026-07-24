import { useEffect, useState, useCallback } from 'react'
import { Plus, Layers, Package, PackagePlus, FolderOpen, Trash2, MoreVertical, UploadCloud, DownloadCloud, Star, Globe, RefreshCw, Check, BadgeCheck, Github, FileArchive, Box, ChevronDown } from 'lucide-react'
import { useStore } from '../store'
import { parseKitSpec } from '../lib/kitSpec'
import { MCP_CATALOG, mcpIcon } from '../lib/mcpCatalog'
import { KitCaps } from './KitCaps'
import type { HubKit } from '../types'

interface Kit { name: string; kind: string; dir: string; hasZip: boolean }

function KitSummary({ spec }: { spec: string }) {
  const p = parseKitSpec(spec)
  const envCount = p.envVars.length
  return (
    <div className="kit-summary">
      <div className="ks-row"><span className="ks-k">Kind</span><span className="ks-v">{p.kind === 'sandbox' ? 'Sandbox kit — full agent' : 'Mixin kit — add-on'}</span></div>
      {p.kind === 'sandbox' && p.image && <div className="ks-row"><span className="ks-k">Base</span><span className="ks-v ks-mono">{p.image}</span></div>}
      {p.kind === 'sandbox' && p.entrypoint && <div className="ks-row"><span className="ks-k">Entrypoint</span><span className="ks-v ks-mono">{p.entrypoint}</span></div>}
      {p.mcps.length > 0 && (
        <div className="ks-block">
          <span className="ks-k">Remote MCPs · {p.mcps.length}</span>
          <div className="ks-mcps">
            {p.mcps.map((id) => {
              const m = MCP_CATALOG.find((x) => x.id === id)
              return <span className="ks-mcp" key={id}><img src={mcpIcon(id)} alt="" />{m?.name ?? id}</span>
            })}
          </div>
        </div>
      )}
      {(p.allowedDomains.length > 0 || p.deniedDomains.length > 0) && (
        <div className="ks-block">
          <span className="ks-k">Network · {p.allowedDomains.length} allowed · {p.deniedDomains.length} denied</span>
          <div className="ks-mcps">
            {p.allowedDomains.map((d) => <span className="ks-tag" key={d}>{d}</span>)}
            {p.deniedDomains.map((d) => <span className="ks-tag ks-tag-deny" key={d}>{d}</span>)}
          </div>
        </div>
      )}
      {p.installCmds.length > 0 && (
        <div className="ks-block">
          <span className="ks-k">Commands · {p.installCmds.length}</span>
          {p.installCmds.map((c, i) => <div className="ks-cmd" key={i}>{c}</div>)}
        </div>
      )}
      {envCount > 0 && <div className="ks-row"><span className="ks-k">Env vars</span><span className="ks-v">{envCount}</span></div>}
      {p.agentContext && (
        <div className="ks-block"><span className="ks-k">Agent memory</span><div className="ks-memo">{p.agentContext}</div></div>
      )}
    </div>
  )
}

// Map a docker.io OCI reference to its Docker Hub repo page (for "make public").
function hubRepoUrl(ref: string): string | null {
  const noDigest = ref.split('@')[0]
  const slash = noDigest.lastIndexOf('/')
  if (slash < 0) return null
  const repoPath = `${noDigest.slice(0, slash)}/${noDigest.slice(slash + 1).split(':')[0]}`
  const m = repoPath.match(/^(?:docker\.io\/|index\.docker\.io\/)(.+)$/)
  return m ? `https://hub.docker.com/r/${m[1]}` : null
}

export function KitsPage({ variant }: { variant: 'mixin' | 'sandbox' }) {
  const { modal, setModal, sandboxes, defaultKits, toggleDefaultKit, setEditKit, dockerAccount, activeOrg } = useStore()
  const [kits, setKits] = useState<Kit[]>([])
  const [specs, setSpecs] = useState<Record<string, ReturnType<typeof parseKitSpec>>>({})
  const [addFor, setAddFor] = useState<string | null>(null)
  // Fixed-position anchor for the dropdown so it escapes the table's overflow:hidden.
  const [addPos, setAddPos] = useState<{ top: number; right: number } | null>(null)
  // sandbox name → kit names already applied (to disable them in the picker).
  const [appliedMap, setAppliedMap] = useState<Record<string, string[]>>({})

  const toggleAdd = async (dir: string, e: React.MouseEvent) => {
    if (addFor === dir) { setAddFor(null); return }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setAddPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    setAddFor(dir)
    // Refresh which sandboxes already have each kit so the picker can disable them.
    const entries = await Promise.all(
      sandboxes.map(async (s) => [s.name, (await window.minipit?.appliedKits(s.name)) ?? []] as const)
    )
    setAppliedMap(Object.fromEntries(entries))
  }

  // Close the "Add to sandbox" dropdown on any outside click.
  useEffect(() => {
    if (!addFor) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t?.closest('.kit-add-menu') && !t?.closest('.kit-add-wrap')) setAddFor(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [addFor])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string; restart?: string; share?: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [editFor, setEditFor] = useState<string | null>(null)
  const [spec, setSpec] = useState('')
  const [savingSpec, setSavingSpec] = useState(false)
  const [specView, setSpecView] = useState<'summary' | 'code'>('summary')
  // A kit panel opens in read-only view mode; editing the code / saving is gated
  // behind an explicit "Edit" toggle.
  const [editing, setEditing] = useState(false)
  // Row "⋮" menu (Open in Finder / Upload to Hub / Delete).
  const [moreFor, setMoreFor] = useState<string | null>(null)
  const [morePos, setMorePos] = useState<{ top: number; right: number } | null>(null)
  // "Upload to Hub" — push the kit as an OCI artifact to a registry.
  const [pushFor, setPushFor] = useState<string | null>(null)
  const [pushRef, setPushRef] = useState('')
  const [pushing, setPushing] = useState(false)
  // Shared signed-in account (loaded once at app boot in the store).
  const docker = dockerAccount ?? { loggedIn: false }
  // Import a kit from one of several sources (dropdown menu). `importMenuOpen`
  // is the source picker; `importForm` is which ref-input is showing (OCI or
  // Git) — zip/folder use a native dialog and need no inline form.
  const [importMenuOpen, setImportMenuOpen] = useState(false)
  // Fixed-position anchor so the menu escapes the subbar's overflow clipping.
  const [importMenuPos, setImportMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [importForm, setImportForm] = useState<'oci' | 'git' | null>(null)
  const [importRef, setImportRef] = useState('')
  const [importing, setImporting] = useState(false)

  // Close the import source menu on any outside click.
  useEffect(() => {
    if (!importMenuOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t?.closest('.kit-import-menu') && !t?.closest('.kit-import-btn')) setImportMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [importMenuOpen])
  // "Hub" gallery — kits published to the Docker Hub catalogue, browsed live and
  // imported into the local library on demand (via `sbx kit pull`).
  const [tab, setTab] = useState<'library' | 'browse'>('library')
  const [hubKits, setHubKits] = useState<HubKit[] | null>(null)
  const [hubErr, setHubErr] = useState<string | null>(null)
  const [hubLoading, setHubLoading] = useState(false)
  const [importingRef, setImportingRef] = useState<string | null>(null)

  const loadHub = useCallback(async () => {
    setHubLoading(true)
    setHubErr(null)
    // Surface the real rejection reason (e.g. "No handler registered …" when the
    // main process is stale) instead of masking it behind a generic message.
    const res = await window.minipit?.listHubKits()
      .catch((e) => ({ ok: false as const, kits: undefined, error: e instanceof Error ? e.message : String(e) }))
    setHubLoading(false)
    if (res?.ok && res.kits) {
      setHubKits(res.kits)
    } else {
      setHubKits([])
      setHubErr(res?.error || 'Could not reach Docker Hub — check your connection and try again.')
    }
  }, [])

  // Fetch the gallery the first time the Hub tab is opened.
  useEffect(() => { if (tab === 'browse' && hubKits === null && !hubLoading) loadHub() }, [tab, hubKits, hubLoading, loadHub])

  const importHubKit = async (kit: HubKit) => {
    setImportingRef(kit.ref)
    setMsg(null)
    const res = await window.minipit?.kitImport(kit.ref).catch(() => null)
    setImportingRef(null)
    if (res?.ok) {
      await load()
      setTab('library')
      setMsg({ ok: true, text: `Imported "${res.name}" into your library.` })
    } else {
      setMsg({ ok: false, text: res?.error || 'Import failed — check the reference is reachable and you can pull it.' })
    }
  }

  // OCI reference / Git URL — both take a text ref via the inline form.
  const doImport = async () => {
    const ref = importRef.trim()
    if (!ref || importing) return
    setImporting(true)
    setMsg(null)
    const res = importForm === 'git'
      ? await window.minipit?.kitImportGit(ref).catch(() => null)
      : await window.minipit?.kitImport(ref).catch(() => null)
    setImporting(false)
    if (res?.ok) {
      setImportForm(null)
      setImportRef('')
      load()
      setMsg({ ok: true, text: `Imported "${res.name}" into your library.` })
    } else {
      setMsg({ ok: false, text: res?.error || 'Import failed — check the reference and that the source is accessible.' })
    }
  }

  // Zip / folder — the main process opens a native picker and imports in one
  // step, so there's no inline form; just reflect busy + result.
  const runFileImport = async (kind: 'zip' | 'folder') => {
    setImportMenuOpen(false)
    setImportForm(null)
    setImporting(true)
    setMsg(null)
    // Surface the real rejection (e.g. "No handler registered …" when the main
    // process is stale) instead of a generic failure.
    const fail = (e: unknown) => ({ ok: false as const, canceled: false, name: undefined, error: e instanceof Error ? e.message : String(e) })
    const res = kind === 'zip'
      ? await window.minipit?.kitImportZip().catch(fail)
      : await window.minipit?.kitImportFolder().catch(fail)
    setImporting(false)
    if (res?.canceled) return
    if (res?.ok) {
      load()
      setMsg({ ok: true, text: `Imported "${res.name}" into your library.` })
    } else {
      setMsg({ ok: false, text: res?.error || 'Import failed.' })
    }
  }

  // Pick an import source from the dropdown.
  const pickImport = (source: 'oci' | 'git' | 'zip' | 'folder') => {
    setImportMenuOpen(false)
    setMsg(null)
    if (source === 'oci' || source === 'git') { setImportForm(source); setImportRef('') }
    else runFileImport(source)
  }

  const toggleMore = (dir: string, e: React.MouseEvent) => {
    if (moreFor === dir) { setMoreFor(null); return }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMorePos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    setMoreFor(dir)
  }

  useEffect(() => {
    if (!moreFor) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t?.closest('.kit-more-menu') && !t?.closest('.kit-more-btn')) setMoreFor(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [moreFor])

  const openPush = (k: Kit) => {
    setMoreFor(null)
    // Prefill with the active namespace (selected org) or the user's own name.
    const ns = activeOrg ?? docker.username ?? 'your-namespace'
    setPushRef(`docker.io/${ns}/${k.name}:latest`)
    setPushFor(k.dir)
  }

  const doPush = async (k: Kit) => {
    const ref = pushRef.trim()
    if (!ref || pushing) return
    setPushing(true)
    setMsg(null)
    const res = await window.minipit?.kitPush(k.dir, ref).catch(() => null)
    setPushing(false)
    if (res?.ok) {
      setPushFor(null)
      setMsg({ ok: true, text: `Pushed "${k.name}" to ${ref}. Share that reference — make the repo public on Docker Hub first.`, share: ref })
    } else {
      setMsg({ ok: false, text: res?.error || 'Push failed — make sure you are logged in (docker login) and the reference is valid.' })
    }
  }

  const doValidate = async (k: Kit) => {
    setMoreFor(null)
    setMsg(null)
    const res = await window.minipit?.kitValidate(k.dir).catch(() => null)
    if (res?.ok) setMsg({ ok: true, text: `"${k.name}" is valid.` })
    else setMsg({ ok: false, text: res?.error || `"${k.name}" failed validation.` })
  }

  const doExport = async (k: Kit) => {
    setMoreFor(null)
    setMsg(null)
    const res = await window.minipit?.kitPack(k.dir, k.name).catch(() => null)
    if (res?.canceled) return
    if (res?.ok) setMsg({ ok: true, text: `Exported "${k.name}" to ${res.path}.` })
    else setMsg({ ok: false, text: res?.error || 'Export failed.' })
  }

  const load = useCallback(async () => {
    const list = (await window.minipit?.listKits()) ?? []
    setKits(list)
    // Read + parse each kit's spec so the table can summarize its capabilities.
    const entries = await Promise.all(
      list.map(async (k) => [k.dir, parseKitSpec((await window.minipit?.readKit(k.dir)) ?? '')] as const)
    )
    setSpecs(Object.fromEntries(entries))
  }, [])

  // Load on mount and refresh when the new-kit modal closes.
  useEffect(() => { if (modal === null) load() }, [modal, load])

  const shown = kits.filter((k) => k.kind === variant)
  const title = variant === 'mixin' ? 'Mixin Kits' : 'Sandbox Kits'
  const blurb = variant === 'mixin'
    ? 'Mixin kits layer extra tools, MCPs, credentials, and config onto an existing agent — stack several on a sandbox.'
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
    // sbx v0.35 applies the kit by recreating the sandbox container (state is
    // preserved) and applies the kit's network rules on the running sandbox —
    // so no manual restart is needed.
    setMsg(res?.ok
      ? { ok: true, text: `Added "${kit.name}" to ${sandboxName}. The sandbox was recreated with the kit applied (state preserved); its network rules are now active.` }
      : { ok: false, text: res?.error || 'Failed to add kit.' })
  }

  const restartSandbox = async (name: string) => {
    setBusy(true)
    try {
      await window.minipit?.stopSandbox(name)
      await window.minipit?.runSandbox(name)
      setMsg({ ok: true, text: `Restarted ${name} — kit applied.` })
    } catch {
      setMsg({ ok: false, text: `Couldn't restart ${name} — stop and run it manually.` })
    } finally { setBusy(false) }
  }

  const openEdit = async (k: Kit) => {
    if (editFor === k.dir) { setEditFor(null); setEditing(false); return }
    setAddFor(null)
    setEditing(false)          // open read-only; user opts into editing
    setSpecView('summary')
    setSpec((await window.minipit?.readKit(k.dir)) ?? '')
    setEditFor(k.dir)
  }

  // Leave edit mode without saving — reload the spec from disk so the code panel
  // shows the last-saved content again.
  const cancelEdit = async (k: Kit) => {
    setSpec((await window.minipit?.readKit(k.dir)) ?? '')
    setEditing(false)
  }

  const saveSpec = async (k: Kit) => {
    setSavingSpec(true)
    const res = await window.minipit?.updateKit(k.dir, spec).catch(() => null)
    setSavingSpec(false)
    if (res?.ok) { setEditing(false); setSpecView('summary'); load(); setMsg({ ok: true, text: `Saved & re-packed "${k.name}".` }) }
    else setMsg({ ok: false, text: res?.error || 'Failed to save spec.' })
  }

  return (
    <div className="page">
      <div className="page-hdr">
        <span className="page-title">{title}</span>
        <span className="lib-badge" style={{ marginLeft: 8 }}>Experimental</span>
      </div>

      <div className="page-subbar">
        <div className="kit-tabs">
          <button className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}>Your kits</button>
          <button className={tab === 'browse' ? 'on' : ''} onClick={() => setTab('browse')}>Hub</button>
        </div>
        <div className="page-subbar-actions">
          {tab === 'library' ? (
            <>
              <div className="kit-import-wrap">
                <button
                  className="btn btn-default btn-sm kit-import-btn"
                  onClick={(e) => {
                    if (importMenuOpen) { setImportMenuOpen(false); return }
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    // Clamp so the 236px-wide menu keeps an 8px gap from the window edge.
                    const left = Math.max(8, Math.min(r.left, window.innerWidth - 244))
                    setImportMenuPos({ top: r.bottom + 4, left })
                    setImportMenuOpen(true)
                  }}
                >
                  <DownloadCloud size={13} /> Import <ChevronDown size={12} />
                </button>
                {importMenuOpen && importMenuPos && (
                  <div className="kit-import-menu" style={{ top: importMenuPos.top, left: importMenuPos.left }}>
                    <button className="kit-import-item" onClick={() => pickImport('oci')}>
                      <Box size={14} /><span><b>OCI reference</b><small>Pull from a registry</small></span>
                    </button>
                    <button className="kit-import-item" onClick={() => pickImport('git')}>
                      <Github size={14} /><span><b>Git repository</b><small>Clone a repo (or subfolder)</small></span>
                    </button>
                    <button className="kit-import-item" onClick={() => pickImport('zip')}>
                      <FileArchive size={14} /><span><b>Zip archive…</b><small>A packed kit file</small></span>
                    </button>
                    <button className="kit-import-item" onClick={() => pickImport('folder')}>
                      <FolderOpen size={14} /><span><b>Local folder…</b><small>A kit source directory</small></span>
                    </button>
                  </div>
                )}
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => { setEditKit(null); setModal('new-kit') }}>
                <Plus size={13} /> New {variant === 'mixin' ? 'mixin kit' : 'sandbox kit'}
              </button>
            </>
          ) : (
            <button className="btn btn-default btn-sm" onClick={loadHub} disabled={hubLoading}>
              <RefreshCw size={13} className={hubLoading ? 'spin' : ''} /> Refresh
            </button>
          )}
        </div>
      </div>

      <div className="page-body home-dash">
        <p style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 14 }}>
          {tab === 'library'
            ? <>{blurb} Managed by den and packed with <code>sbx kit pack</code>.</>
            : <>{variant === 'mixin' ? 'Mixin' : 'Sandbox'} kits published to <a className="kit-repo-link" onClick={() => window.minipit?.openPath('https://hub.docker.com/search?type=sbx_kit')}>Docker Hub</a>. Import one to add it to your library.</>}
        </p>

        {tab === 'library' && importForm && (
          <div className="kit-import-box">
            <label className="kit-push-lbl">
              {importForm === 'git' ? 'Import a kit from a Git repository' : 'Import a kit by OCI reference'}
            </label>
            <div className="kit-push-row">
              <input
                className="finput kit-push-input"
                autoFocus
                value={importRef}
                spellCheck={false}
                placeholder={importForm === 'git'
                  ? 'https://github.com/owner/repo  ·  append #dir=subfolder if needed'
                  : 'registry/repo:tag — e.g. docker.io/javieralonso716/my-kit:latest'}
                onChange={(e) => setImportRef(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doImport() }}
              />
              <button className="btn btn-ghost btn-sm" onClick={() => { setImportForm(null); setImportRef('') }} disabled={importing}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={doImport} disabled={importing || !importRef.trim()}>
                {importing ? (importForm === 'git' ? 'Cloning…' : 'Pulling…') : 'Import'}
              </button>
            </div>
            <div className="kit-push-hint">
              {importForm === 'git'
                ? <>Clones the repo and packs the kit. Add <code>#dir=&lt;subfolder&gt;</code> when the <code>spec.yaml</code> lives in a subdirectory.</>
                : <>Pulls the artifact with <code>sbx kit pull</code> into your kit library. Private repos require <code>docker login</code>.</>}
            </div>
          </div>
        )}

        {tab === 'library' && importing && !importForm && (
          <div className="kit-import-box kit-import-busy">Importing kit…</div>
        )}

        {msg && msg.share ? (
          <div className="kit-share-cta">
            <div className="kit-share-hd">
              <UploadCloud size={16} />
              <span>Kit published</span>
              <button className="kit-share-x" title="Dismiss" onClick={() => setMsg(null)}>×</button>
            </div>
            <div className="kit-share-ref">{msg.share}</div>
            <p className="kit-share-desc">
              Share this reference with anyone. They install it with one command — no files to send.
              First <strong>make the repo public</strong> on Docker Hub (new repos are private).
            </p>
            <div className="kit-share-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  navigator.clipboard.writeText(`sbx kit add <sandbox> ${msg.share}`).then(() => {
                    setCopied(true); setTimeout(() => setCopied(false), 1500)
                  }).catch(() => {})
                }}
              >
                {copied ? 'Copied!' : 'Copy install command'}
              </button>
              {hubRepoUrl(msg.share) && (
                <button className="btn btn-default btn-sm" onClick={() => window.minipit?.openPath(hubRepoUrl(msg.share!)!)}>
                  Open on Docker Hub
                </button>
              )}
            </div>
          </div>
        ) : msg && (
          <div className={`np-banner ${msg.ok ? 'ok' : 'err'}`} style={{ marginBottom: 12 }}>
            <span className="np-banner-txt">{msg.text}</span>
            {msg.restart && (
              <button className="btn btn-default btn-sm" onClick={() => restartSandbox(msg.restart!)} disabled={busy}>
                {busy ? 'Restarting…' : 'Restart sandbox'}
              </button>
            )}
          </div>
        )}

        {tab === 'library' && (shown.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--t3)', fontSize: 13, padding: '32px 0' }}>
            No {variant} kits yet — create one to get started.
          </div>
        ) : (
          <div className="lib-tbl">
            <div className="lib-hdr lib-hdr-kit">
              <span>{variant === 'mixin' ? 'MIXIN KIT' : 'SANDBOX KIT'}</span>
              {/* One header per capability column — aligned to the KitCaps grid. */}
              <div className="kit-caps-hdr">
                <span>MCP</span>
                <span>Policies</span>
                <span>Env</span>
                <span>Commands</span>
                <span>Memory</span>
              </div>
              <span></span>
            </div>
            {shown.map((k) => (
              <div key={k.dir}>
                <div
                  className={`lib-row lib-row-kit lib-row-click${editFor === k.dir ? ' open' : ''}`}
                  onClick={() => openEdit(k)}
                  title="View / edit kit"
                >
                  <div className="lib-primary">
                    {variant === 'mixin' ? <Layers size={14} /> : <Package size={14} />}
                    <span>{k.name}</span>
                    {!k.hasZip && <span className="kit-unpacked" title="Not packed yet">unpacked</span>}
                  </div>
                  <KitCaps p={specs[k.dir]} />
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                    {variant === 'mixin' && (
                      <button
                        className={`btn btn-ghost btn-sm tpl-icon-btn kit-star-btn${defaultKits.includes(k.name) ? ' on' : ''}`}
                        title={defaultKits.includes(k.name) ? 'Default kit — auto-added to new sandboxes. Click to unset.' : 'Make default — auto-add to new sandboxes'}
                        onClick={() => toggleDefaultKit(k.name)}
                      >
                        <Star size={15} fill={defaultKits.includes(k.name) ? 'currentColor' : 'none'} />
                      </button>
                    )}
                    <div className="kit-add-wrap">
                      <button
                        className="btn btn-default btn-sm"
                        title="Add this kit to a running sandbox"
                        onClick={(e) => toggleAdd(k.dir, e)}
                        disabled={busy}
                      >
                        <PackagePlus size={14} /> Add to sandbox
                      </button>
                      {addFor === k.dir && addPos && (
                        <div className="kit-add-menu" style={{ top: addPos.top, right: addPos.right }}>
                          <div className="kit-add-label">Add to sandbox</div>
                          {sandboxes.length === 0 ? (
                            <span className="kit-add-empty">No sandboxes yet — create one, or pass this kit at creation in New Sandbox.</span>
                          ) : (
                            sandboxes.map((s) => {
                              const has = appliedMap[s.name]?.includes(k.name)
                              return (
                                <button
                                  key={s.id}
                                  className="kit-add-sb"
                                  onClick={() => addToSandbox(k, s.name)}
                                  disabled={busy || has}
                                  title={has ? 'Already has this kit' : s.status}
                                >
                                  <span className={`kit-add-dot${s.status === 'running' ? ' on' : ''}`} />
                                  <span className="kit-add-sb-name">{s.name}</span>
                                  {has && <span className="kit-add-has">added</span>}
                                </button>
                              )
                            })
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      className={`btn btn-ghost btn-sm tpl-icon-btn kit-more-btn${moreFor === k.dir ? ' active' : ''}`}
                      title="More…"
                      onClick={(e) => toggleMore(k.dir, e)}
                    >
                      <MoreVertical size={15} />
                    </button>
                    {moreFor === k.dir && morePos && (
                      <div className="kit-more-menu" style={{ top: morePos.top, right: morePos.right }}>
                        <button className="kit-more-item" onClick={() => { setMoreFor(null); window.minipit?.openInFinder(k.dir) }}>
                          <FolderOpen size={14} /> Open in Finder
                        </button>
                        <button className="kit-more-item" onClick={() => doValidate(k)}>
                          <Check size={14} /> Validate spec
                        </button>
                        <button className="kit-more-item" onClick={() => doExport(k)}>
                          <DownloadCloud size={14} /> Export as zip…
                        </button>
                        <button className="kit-more-item" onClick={() => openPush(k)}>
                          <UploadCloud size={14} /> Upload to Hub…
                        </button>
                        <div className="kit-more-sep" />
                        <button className="kit-more-item danger" onClick={() => { setMoreFor(null); remove(k) }}>
                          <Trash2 size={14} /> Delete kit
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {pushFor === k.dir && (
                  <div className="kit-push-box" onClick={(e) => e.stopPropagation()}>
                    <label className="kit-push-lbl">Publish as OCI artifact</label>
                    <div className="kit-push-row">
                      <input
                        className="finput kit-push-input"
                        value={pushRef}
                        spellCheck={false}
                        placeholder="registry/repo:tag — e.g. docker.io/myorg/my-kit:1.0"
                        onChange={(e) => setPushRef(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') doPush(k) }}
                      />
                      <button className="btn btn-ghost btn-sm" onClick={() => setPushFor(null)} disabled={pushing}>Cancel</button>
                      <button className="btn btn-primary btn-sm" onClick={() => doPush(k)} disabled={pushing || !pushRef.trim()}>
                        {pushing ? 'Pushing…' : 'Push'}
                      </button>
                    </div>
                    <div className="kit-push-hint">
                      Runs <code>sbx kit push</code>.{' '}
                      {docker.loggedIn
                        ? <>Logged in to Docker Hub as <strong>{docker.username}</strong>.</>
                        : <>Requires <code>docker login</code> to the target registry.</>}
                    </div>
                  </div>
                )}
                {editFor === k.dir && (
                  <div className="kit-spec-edit">
                    <div className="kit-spec-tabs">
                      <button className={specView === 'summary' ? 'on' : ''} onClick={() => setSpecView('summary')}>Summary</button>
                      <button className={specView === 'code' ? 'on' : ''} onClick={() => setSpecView('code')}>Code</button>
                    </div>

                    {specView === 'summary' ? (
                      <KitSummary spec={spec} />
                    ) : (
                      <textarea
                        className={`kit-spec-area${editing ? '' : ' readonly'}`}
                        value={spec}
                        spellCheck={false}
                        readOnly={!editing}
                        onChange={(e) => setSpec(e.target.value)}
                      />
                    )}

                    <div className="kit-spec-actions">
                      {editing ? (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => cancelEdit(k)} disabled={savingSpec}>Cancel</button>
                          <button className="btn btn-primary btn-sm" onClick={() => saveSpec(k)} disabled={savingSpec}>
                            {savingSpec ? 'Saving…' : 'Save & repack'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditFor(null); setEditing(false) }}>Close</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(true); setSpecView('code') }}>Edit code</button>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => { setEditKit({ dir: k.dir, name: k.name }); setModal('new-kit'); setEditFor(null); setEditing(false) }}
                          >
                            Edit
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {tab === 'browse' && (
          hubLoading && hubKits === null ? (
            <div style={{ textAlign: 'center', color: 'var(--t3)', fontSize: 13, padding: '32px 0' }}>Loading kits from Docker Hub…</div>
          ) : hubErr ? (
            <div className="np-banner err" style={{ marginBottom: 12 }}>
              <span className="np-banner-txt">{hubErr}</span>
              <button className="btn btn-default btn-sm" onClick={loadHub} disabled={hubLoading}>Retry</button>
            </div>
          ) : (() => {
            // Sandbox Kits page shows full-agent kits; Mixin Kits page shows add-ons.
            const gallery = (hubKits ?? []).filter((k) => k.kind === variant)
            // A kit imports under a name derived from its ref's last path segment,
            // so match on that (not the slug) to flag ones already in the library.
            const installed = new Set(kits.map((k) => k.name))
            const importName = (k: HubKit) => (k.slug.split('/').pop() ?? '').replace(/[^A-Za-z0-9._-]/g, '-')
            if (gallery.length === 0) {
              return <div style={{ textAlign: 'center', color: 'var(--t3)', fontSize: 13, padding: '32px 0' }}>No {variant} kits found on Docker Hub.</div>
            }
            return (
              <div className="kit-gallery">
                {gallery.map((k) => {
                  const has = installed.has(importName(k))
                  const parsed = k.spec ? parseKitSpec(k.spec) : null
                  return (
                    <div className="kit-card" key={k.slug}>
                      <div className="kit-card-hd">
                        {k.logo
                          ? <img className="kit-card-logo" src={k.logo} alt="" width={16} height={16} />
                          : (variant === 'mixin' ? <Layers size={15} /> : <Package size={15} />)}
                        <span className="kit-card-name">{k.title}</span>
                        {k.verified && <BadgeCheck size={13} className="kit-card-verified" aria-label="Verified publisher" />}
                        {has && <span className="kit-card-has"><Check size={11} /> Imported</span>}
                      </div>
                      <div className="kit-card-meta">
                        <span className="kit-card-pub">{k.publisher}</span>
                        {k.pullCount && <span className="kit-card-pulls"><DownloadCloud size={11} />{k.pullCount}</span>}
                        {k.stars > 0 && <span className="kit-card-stars"><Star size={11} />{k.stars}</span>}
                      </div>
                      {k.description && <p className="kit-card-desc">{k.description}</p>}
                      {variant === 'sandbox' && parsed?.image && (
                        <div className="kit-card-image" title="Base image"><Package size={11} />{parsed.image}</div>
                      )}
                      {parsed && <KitCaps p={parsed} compact />}
                      <div className="kit-card-actions">
                        <a className="kit-card-link" onClick={() => window.minipit?.openPath(`https://hub.docker.com/r/${k.slug}`)}>
                          <Globe size={12} /> View on Hub
                        </a>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => importHubKit(k)}
                          disabled={importingRef !== null}
                        >
                          {importingRef === k.ref ? 'Importing…' : <><DownloadCloud size={13} /> {has ? 'Re-import' : 'Import'}</>}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()
        )}
      </div>
    </div>
  )
}
