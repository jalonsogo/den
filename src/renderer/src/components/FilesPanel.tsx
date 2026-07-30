import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, File, FileUp, RefreshCw, Box, Home, GitBranch, ArrowUpRight } from 'lucide-react'
import type { Sandbox, FileEntry, FileChange } from '../types'
import { ChangesReview } from './ChangesReview'
import { useStore } from '../store'
import { bringSandboxToHost } from '../lib/featureChanges'

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

// Listing cache, keyed by sandbox + absolute path. Module-scoped so it survives
// panel remounts (toggling the dock, switching sandboxes and back) — re-opening
// a folder we've already seen is then instant instead of another `sbx exec`.
const dirCache = new Map<string, FileEntry[]>()
const cacheKey = (name: string, path: string): string => `${name}\0${path}`

async function fetchDir(name: string, path: string): Promise<FileEntry[]> {
  // Throw (rather than cache an empty listing) if the bridge is missing or the
  // listing fails — main now rejects on a real exec failure, so a caught error
  // here means "couldn't read", not "empty dir". Only a resolved array is cached.
  const api = window.minipit
  if (!api) throw new Error('bridge unavailable')
  const res = await api.listFiles(name, path)
  dirCache.set(cacheKey(name, path), res)
  return res
}

function dropSandboxCache(name: string): void {
  const prefix = `${name}\0`
  for (const k of dirCache.keys()) if (k.startsWith(prefix)) dirCache.delete(k)
}

// "Loading…" only shows if a fetch is genuinely slow — fast loads (cache hits,
// snappy sandboxes) never flash the placeholder.
const SLOW_MS = 200

interface FileMenu { x: number; y: number; path: string; name: string; isDir: boolean }

function FileRow({
  entry,
  depth,
  path,
  sandboxName,
  refreshKey,
  onOpenFile,
  onEnterDir,
  onContext,
  changeFor,
  dirChangeFor
}: {
  entry: FileEntry
  depth: number
  path: string
  sandboxName: string
  refreshKey: number
  onOpenFile: (path: string, name: string) => void
  onEnterDir: (path: string) => void
  onContext: (e: React.MouseEvent, path: string, name: string, isDir: boolean) => void
  changeFor: (path: string) => string | undefined
  dirChangeFor: (path: string) => { count: number; status: string } | undefined
}) {
  const badge = entry.type === 'file' ? changeFor(path) : undefined
  const badgeStatus = badge === 'N' ? 'new' : badge === 'D' ? 'deleted' : badge === 'R' ? 'renamed' : 'modified'
  const [open, setOpen] = useState(false)
  // Seed children from the cache so a previously-opened folder renders instantly.
  const [children, setChildren] = useState<FileEntry[] | null>(
    () => (entry.type === 'dir' ? dirCache.get(cacheKey(sandboxName, path)) ?? null : null)
  )
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState(false)

  // For a directory, summarize the changes underneath it so collapsed folders
  // still surface "there are changes in here" (shown only while collapsed —
  // once expanded, the changed files carry their own badges).
  const dirAgg = entry.type === 'dir' ? dirChangeFor(path) : undefined

  // Load this directory's children. `spinner` keeps the current rows visible and
  // refreshes silently (used for live updates); without it we show the delayed
  // "Loading…" placeholder (used for the first manual expand of an empty cache).
  const loadChildren = useCallback(async (spinner: boolean) => {
    let t: ReturnType<typeof setTimeout> | undefined
    if (spinner) t = setTimeout(() => setSlow(true), SLOW_MS)
    try {
      const res = await fetchDir(sandboxName, path)
      setChildren(res)
      setError(false)
    } catch {
      setError(true)
      setChildren((prev) => prev ?? [])
    } finally {
      if (t) clearTimeout(t)
      setSlow(false)
    }
  }, [sandboxName, path])

  const handleClick = () => {
    if (entry.type !== 'dir') { onOpenFile(path, entry.name); return }
    const next = !open
    setOpen(next)
    // Spinner only when there's nothing cached to show; otherwise refresh quietly.
    if (next) loadChildren(children === null)
  }

  // Live refresh: when the tree's refresh token bumps (debounced file-change
  // events), re-read any *open* directory in place so new files appear without
  // a collapse/expand — and without blanking the rows that are already there.
  useEffect(() => {
    if (open && refreshKey > 0) loadChildren(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  return (
    <>
      <div
        className="frow"
        onClick={handleClick}
        onDoubleClick={() => { if (entry.type === 'dir') onEnterDir(path) }}
        title={entry.type === 'dir' ? 'Double-click to open this folder' : undefined}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContext(e, path, entry.name, entry.type === 'dir') }}
      >
        <div className="frow-pad" style={{ width: depth * 14 }} />
        <div className={`frow-chev${entry.type === 'dir' ? (open ? ' open' : '') : ' leaf'}`}>
          <ChevronRight size={11} />
        </div>
        <div className="frow-icon">
          {entry.type === 'dir'
            ? (open ? <FolderOpen size={13} /> : <Folder size={13} />)
            : <File size={13} />}
        </div>
        <span className={`fname${entry.type === 'dir' ? ' dir' : ''}`}>{entry.name}</span>
        {badge && <span className={`frow-badge chg-${badgeStatus}`}>{badge}</span>}
        {!open && dirAgg && (
          <span className={`frow-badge frow-badge-count chg-${dirAgg.status}`} title={`${dirAgg.count} changed`}>
            {dirAgg.count}
          </span>
        )}
        {entry.size && <span className="fsize">{entry.size}</span>}
      </div>
      {open && (
        <>
          {slow && children === null && (
            <div className="frow" style={{ color: 'var(--t3)', fontSize: 12 }}>
              <div className="frow-pad" style={{ width: (depth + 1) * 14 }} />
              Loading…
            </div>
          )}
          {error && (
            <div className="frow" style={{ color: 'var(--destruct)', fontSize: 12 }}>
              <div className="frow-pad" style={{ width: (depth + 1) * 14 }} />
              Failed to read directory
            </div>
          )}
          {children?.length === 0 && !slow && !error && (
            <div className="frow" style={{ color: 'var(--t3)', fontSize: 12 }}>
              <div className="frow-pad" style={{ width: (depth + 1) * 14 }} />
              Empty
            </div>
          )}
          {children?.map((child) => (
            <FileRow
              key={child.name}
              entry={child}
              depth={depth + 1}
              path={joinPath(path, child.name)}
              sandboxName={sandboxName}
              refreshKey={refreshKey}
              onOpenFile={onOpenFile}
              onEnterDir={onEnterDir}
              onContext={onContext}
              changeFor={changeFor}
              dirChangeFor={dirChangeFor}
            />
          ))}
        </>
      )}
    </>
  )
}

export function FilesPanel({ sandbox, tab: tabProp, onTabChange }: {
  sandbox: Sandbox
  // Controlled tab: when provided, the parent (the activity rail) owns which
  // sub-tab is shown so its Files/Changes icons can reflect and drive it. Falls
  // back to internal state when used standalone.
  tab?: 'files' | 'changes'
  onTabChange?: (t: 'files' | 'changes') => void
}) {
  // The directory the tree is rooted at. Defaults to the workspace; navigating
  // into a folder (double-click) or a breadcrumb re-roots here.
  const [cwd, setCwd] = useState(sandbox.workspace)
  // Root the tree at the sandbox's *actual* readable directory. The stored
  // workspace is a host path that isn't always valid inside the container, so
  // resolve it (falls back to the container's working dir) — this is what makes
  // browsing work even when the host path is gone or mounted elsewhere.
  // `rootReady` gates the first listing on that resolution. Without it we always
  // fired one listing at the unresolved host path, which for any sandbox whose
  // workspace isn't valid in-container is a guaranteed failure — a console error
  // per mount and a retry cycle before the resolved path even gets a turn.
  const [rootReady, setRootReady] = useState(false)
  useEffect(() => {
    setCwd(sandbox.workspace)
    setRootReady(false)
    if (sandbox.status !== 'running') return
    let cancelled = false
    window.minipit?.workspaceRoot(sandbox.name, sandbox.workspace)
      .then((root) => { if (!cancelled) { if (root) setCwd(root); setRootReady(true) } })
      // Couldn't resolve (sandbox not ready yet): fall back to listing the stored
      // path rather than leaving the panel permanently blank.
      .catch(() => { if (!cancelled) setRootReady(true) })
    return () => { cancelled = true }
  }, [sandbox.id, sandbox.workspace, sandbox.status, sandbox.name])

  const rootKey = cacheKey(sandbox.name, cwd)
  const [tree, setTree] = useState<FileEntry[]>(() => dirCache.get(rootKey) ?? [])
  const [slow, setSlow] = useState(false)
  // Holds the underlying failure reason (sbx stderr) so the panel can explain
  // *why* a workspace couldn't be read, not just that it failed.
  const [error, setError] = useState<string | null>(null)
  // A listing failed but we're still auto-retrying — keep showing the loading
  // placeholder (not the "empty"/"failed" message) so a reconnect flicker doesn't
  // read as "workspace is empty".
  const [retrying, setRetrying] = useState(false)
  const [changes, setChanges] = useState<FileChange[]>([])
  const [tabInternal, setTabInternal] = useState<'files' | 'changes'>('files')
  const tab = tabProp ?? tabInternal
  const setTab = (t: 'files' | 'changes') => { setTabInternal(t); onTabChange?.(t) }
  const [menu, setMenu] = useState<FileMenu | null>(null)
  // Legacy "Review & merge →" entry points still dispatch this to jump to the
  // Changes tab; when controlled, the notify flows back up to the parent.
  useEffect(() => {
    const onOpenChanges = () => setTab('changes')
    window.addEventListener('den:open-changes', onOpenChanges)
    return () => window.removeEventListener('den:open-changes', onOpenChanges)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Bumping this re-reads every open directory in the tree (live refresh).
  const [refreshKey, setRefreshKey] = useState(0)
  // Bumping this re-runs the root load — used by the auto-retry after a failure.
  const [reloadNonce, setReloadNonce] = useState(0)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  // Bounded exponential-backoff retry for the root listing, so a failed reconnect
  // heals itself instead of stranding a stale "empty"/"failed" view until a manual
  // refresh. Reset whenever we retarget (sandbox or folder change) or succeed.
  const MAX_RETRIES = 5
  const retryCount = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    retryCount.current = 0
    return () => { if (retryTimer.current) clearTimeout(retryTimer.current) }
  }, [sandbox.id, cwd])

  // Close the file context menu on any outside click / scroll.
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [menu])

  // A click opens the in-app previewer or hands off to the host's default app,
  // per the user's setting. "Default app" only works for workspace files (the
  // bind-mounted host folder), so paths elsewhere in the container always fall
  // back to the previewer.
  const fileOpenMode = useStore((s) => s.fileOpenMode)
  const openFile = (path: string, name: string) => {
    const inWorkspace = path === sandbox.workspace || path.startsWith(sandbox.workspace + '/')
    if (fileOpenMode === 'system' && inWorkspace) window.minipit?.openPath(path)
    else window.minipit?.openFileWindow(sandbox.name, path, name)
  }
  // Always open the in-app previewer, regardless of the setting (context menu).
  const openInPreview = (path: string, name: string) => window.minipit?.openFileWindow(sandbox.name, path, name)

  // Map a file's absolute path to its git change status (paths are repo-relative).
  const changeBadge = (absPath: string): string | undefined => {
    const rel = absPath.startsWith(sandbox.workspace + '/') ? absPath.slice(sandbox.workspace.length + 1) : absPath
    const c = changes.find((x) => x.path === rel)
    if (!c) return undefined
    return c.status === 'new' ? 'N' : c.status === 'deleted' ? 'D' : c.status === 'renamed' ? 'R' : 'M'
  }

  // Summarize the changes living under a directory so a collapsed folder shows
  // a count and rolls up the most relevant status for color (new wins, so it's
  // easy to spot folders that contain new files).
  const dirChangeSummary = (absPath: string): { count: number; status: string } | undefined => {
    const rel = absPath.startsWith(sandbox.workspace + '/') ? absPath.slice(sandbox.workspace.length + 1) : absPath
    const prefix = rel ? rel + '/' : ''
    const within = changes.filter((x) => x.path.startsWith(prefix))
    if (within.length === 0) return undefined
    const status = (['new', 'modified', 'renamed', 'deleted'] as const).find((s) => within.some((c) => c.status === s)) ?? 'modified'
    return { count: within.length, status }
  }

  const fetchChanges = useCallback(() => {
    window.minipit?.gitStatus(sandbox.name, sandbox.workspace).then((r) => {
      if (mounted.current && r) setChanges(r.changes)
    }).catch(() => {})
  }, [sandbox.name, sandbox.workspace])

  // Reload the root listing. Keeps the current rows visible while refetching;
  // only shows the (delayed) placeholder when we have nothing cached yet.
  const load = useCallback(async () => {
    if (sandbox.status !== 'running' || !rootReady) return
    const haveCache = dirCache.has(cacheKey(sandbox.name, cwd))
    let t: ReturnType<typeof setTimeout> | undefined
    if (!haveCache) t = setTimeout(() => { if (mounted.current) setSlow(true) }, SLOW_MS)
    try {
      const res = await fetchDir(sandbox.name, cwd)
      if (mounted.current) { setTree(res); setError(null); setRetrying(false) }
      retryCount.current = 0
    } catch (e) {
      if (!mounted.current) return
      if (!haveCache) setTree([])
      // Transient failures are common right in the reconnect window (the
      // sandbox's exec backend isn't ready yet). Retry a few times with backoff
      // before surfacing an error, so the panel self-heals; keep the loading
      // placeholder up meanwhile rather than flashing "empty"/"failed".
      if (retryCount.current < MAX_RETRIES) {
        const delay = Math.min(4000, 400 * 2 ** retryCount.current)
        retryCount.current += 1
        setRetrying(true)
        if (retryTimer.current) clearTimeout(retryTimer.current)
        retryTimer.current = setTimeout(() => { if (mounted.current) setReloadNonce((k) => k + 1) }, delay)
      } else {
        // Keep the first meaningful line of the sbx stderr — enough to tell a
        // stopped/missing container from a gone workspace path.
        const raw = (e instanceof Error ? e.message : String(e)).trim()
        setError(raw.split('\n').map((l) => l.trim()).find(Boolean) || 'Unknown error')
        setRetrying(false)
      }
    } finally {
      if (t) clearTimeout(t)
      if (mounted.current) setSlow(false)
    }
  }, [sandbox.name, cwd, sandbox.status, rootReady])

  // Seed from cache (instant for a directory we've viewed before), then refresh.
  // reloadNonce re-runs this after a failed attempt (the auto-retry backoff).
  useEffect(() => {
    setTree(dirCache.get(cacheKey(sandbox.name, cwd)) ?? [])
    load()
  }, [sandbox.id, sandbox.status, cwd, load, reloadNonce])

  // One debounced refresh path for everything that can change the workspace:
  // Claude Code's PostToolUse hook (instant-ish) plus a slow poll for shell
  // edits and non-Claude agents. Bursts of writes coalesce into a single pass
  // of: git status + root listing + live refresh of open folders.
  useEffect(() => {
    if (sandbox.status !== 'running') { setChanges([]); return }
    let timer: ReturnType<typeof setTimeout> | undefined
    const refreshNow = () => {
      fetchChanges()
      load()
      setRefreshKey((k) => k + 1)
    }
    const debounced = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(refreshNow, 500)
    }
    fetchChanges()
    const id = setInterval(fetchChanges, 15000)
    const unsub = window.minipit?.onFilesChanged?.((name) => { if (name === sandbox.name) debounced() })
    return () => { if (timer) clearTimeout(timer); clearInterval(id); unsub?.() }
  }, [sandbox.name, sandbox.workspace, sandbox.status, load, fetchChanges])

  const stopped = sandbox.status !== 'running'
  const atWorkspace = cwd === sandbox.workspace
  // Clone-isolated sandboxes keep the workspace in a private in-container clone,
  // so files created here never reach the host folder until they're fetched back.
  // Surface that where the confusion happens (the Files panel), but only while
  // browsing inside the workspace — paths elsewhere in the container are
  // container-only regardless of isolation.
  const isolated = useStore((s) => s.sandboxIsolation[sandbox.name] === true)
  const withinWorkspace = cwd === sandbox.workspace || cwd.startsWith(sandbox.workspace + '/')
  // Absolute path segments for the breadcrumb. Every ancestor is clickable, so
  // you can browse anywhere in the sandbox filesystem — including above the
  // workspace (../). The Home button jumps back to the workspace root.
  const segments = cwd.split('/').filter(Boolean)
  const segPath = (i: number) => '/' + segments.slice(0, i + 1).join('/')
  // How many trailing segments stay inline; the rest collapse to an ellipsis.
  const TAIL = 2
  const tailStart = Math.max(0, segments.length - TAIL)

  // Dropdown (opened from the sandbox chip or the ellipsis) listing the full
  // path so any ancestor is reachable even when the middle is collapsed.
  const [pathMenuOpen, setPathMenuOpen] = useState(false)
  const pathMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pathMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (pathMenuRef.current && !pathMenuRef.current.contains(e.target as Node)) setPathMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pathMenuOpen])
  // Close the dropdown once we navigate.
  useEffect(() => { setPathMenuOpen(false) }, [cwd])

  // Manual refresh = drop this sandbox's cached listings and re-read from scratch.
  const hardRefresh = () => {
    dropSandboxCache(sandbox.name)
    // Reset the auto-retry so a manual click starts a clean attempt sequence.
    retryCount.current = 0
    if (retryTimer.current) clearTimeout(retryTimer.current)
    setError(null)
    load()
    fetchChanges()
    setRefreshKey((k) => k + 1)
  }

  const handleDelete = async (m: FileMenu) => {
    setMenu(null)
    if (!confirm(`Delete ${m.isDir ? 'folder' : 'file'} "${m.name}"?`)) return
    await window.minipit?.deletePath(sandbox.name, m.path).catch((e) => console.error(e))
    hardRefresh()
  }

  // Repo-relative path for a workspace file (git patterns are relative to the
  // repo root, which is the workspace here).
  const relOf = (absPath: string) =>
    absPath.startsWith(sandbox.workspace + '/') ? absPath.slice(sandbox.workspace.length + 1) : absPath
  // A broader glob for the same file anywhere in the tree. Keep the parent dir
  // when it's a dot-config dir (e.g. `.claude/settings.local.json`) so the
  // pattern stays specific; otherwise match by filename.
  const globOf = (rel: string) => {
    const parts = rel.split('/')
    const base = parts[parts.length - 1]
    const parent = parts.length > 1 ? parts[parts.length - 2] : ''
    return parent.startsWith('.') ? `**/${parent}/${base}` : `**/${base}`
  }
  const addToGitignore = async (patterns: string[]) => {
    setMenu(null)
    const r = await window.minipit?.gitIgnoreAdd(sandbox.name, sandbox.workspace, patterns).catch(() => null)
    if (r && !r.ok) { alert(`Couldn't update .gitignore: ${r.error ?? 'unknown error'}`); return }
    // Ignored files drop out of git status → refresh the tree badges and the
    // Changes review surface.
    hardRefresh()
    window.dispatchEvent(new Event('den:refresh-changes'))
  }

  // Copy host files into the current folder. Reads the bytes in the renderer
  // (like the agent file-drop) and streams them into the sandbox — no host path
  // needed, so it works anywhere in the filesystem. Shared by the two ways in:
  // dropping onto the panel, and the toolbar's Add-files button.
  const [dropActive, setDropActive] = useState(false)
  const copyIntoCwd = async (incoming: File[]) => {
    if (stopped) return
    // Skip directories (the File API can't read them: no type, zero size).
    const picked = incoming.filter((f) => f.type || f.size > 0)
    if (picked.length === 0) return

    // Warn before overwriting anything already in this folder.
    const existing = new Set(tree.map((t) => t.name))
    const clash = picked.map((f) => f.name).filter((n) => existing.has(n))
    if (clash.length > 0 &&
      !confirm(`This will overwrite ${clash.length} existing item${clash.length > 1 ? 's' : ''} in this folder:\n\n${clash.join('\n')}\n\nContinue?`)) return

    const files = await Promise.all(
      picked.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))
    )
    const results = await window.minipit?.copyInto(sandbox.name, cwd, files).catch(() => null)
    const failed = (results ?? []).filter((r) => !r.ok)
    if (!results) {
      alert('Copy failed — the sandbox may not be running.')
    } else if (failed.length > 0) {
      alert(`Couldn't copy ${failed.length} item${failed.length > 1 ? 's' : ''} — check you have write permission here:\n\n` +
        failed.map((f) => `• ${f.name}: ${f.error ?? 'unknown error'}`).join('\n'))
    }
    hardRefresh()
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDropActive(false)
    await copyIntoCwd(Array.from(e.dataTransfer.files))
  }

  // The toolbar button drives a hidden file input rather than a main-process
  // dialog: the picker hands back File objects, so the button and the drop land
  // in exactly the same code path above.
  const pickRef = useRef<HTMLInputElement>(null)
  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    // Clear the input, or picking the same file twice in a row fires no change.
    e.target.value = ''
    await copyIntoCwd(picked)
  }

  return (
    <div className="files-panel">
      {tab === 'files' ? (
      <>
      <div className="files-bar">
        <div className="files-crumbs">
          {/* Sandbox anchor — always pinned left; opens a dropdown of the whole
              path so any folder is reachable regardless of truncation. */}
          <div className="files-sbx" ref={pathMenuRef}>
            <button
              className={`files-crumb files-crumb-sandbox${pathMenuOpen ? ' open' : ''}`}
              title={`${sandbox.name} sandbox filesystem · ${cwd}`}
              onClick={() => setPathMenuOpen((o) => !o)}
            >
              <Box size={12} />
              <ChevronDown size={11} />
            </button>
            {pathMenuOpen && (
              <div className="files-path-menu">
                <button
                  className={`files-path-menu-item${cwd === '/' ? ' at' : ''}`}
                  onClick={() => setCwd('/')}
                >
                  <span className="files-path-menu-root">/</span>
                  <span className="files-path-menu-name">Filesystem root</span>
                </button>
                {segments.map((seg, i) => (
                  <button
                    key={i}
                    className={`files-path-menu-item${i === segments.length - 1 ? ' at' : ''}`}
                    style={{ paddingLeft: 10 + (i + 1) * 12 }}
                    onClick={() => setCwd(segPath(i))}
                  >
                    <Folder size={12} />
                    <span className="files-path-menu-name">{seg}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Inline trail: the middle collapses to an ellipsis, keeping only the
              current folder and its parent visible. */}
          {segments.length > TAIL && (
            <span className="files-crumb-wrap">
              <ChevronRight size={11} className="files-crumb-sep" />
              <button className="files-crumb files-crumb-ellipsis" title="Show full path" onClick={() => setPathMenuOpen(true)}>…</button>
            </span>
          )}
          {segments.slice(tailStart).map((seg, k) => {
            const i = tailStart + k
            return (
              <span className="files-crumb-wrap" key={i}>
                <ChevronRight size={11} className="files-crumb-sep" />
                <button className="files-crumb" disabled={i === segments.length - 1} onClick={() => setCwd(segPath(i))}>{seg}</button>
              </span>
            )
          })}
        </div>

        <button
          className="btn btn-ghost btn-sm"
          style={{ padding: '4px 6px' }}
          title="Refresh"
          onClick={hardRefresh}
          disabled={stopped}
        >
          <RefreshCw size={12} />
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ padding: '4px 6px' }}
          title="Add files — copy from your Mac into this folder (or drag them onto the panel)"
          onClick={() => pickRef.current?.click()}
          disabled={stopped}
        >
          <FileUp size={13} />
        </button>
        <input
          ref={pickRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handlePick}
        />
        <button
          className={`btn btn-ghost btn-sm${atWorkspace ? ' at-home' : ''}`}
          style={{ padding: '4px 6px' }}
          title={`Back to workspace — ${sandbox.workspace}`}
          onClick={() => setCwd(sandbox.workspace)}
          disabled={stopped}
        >
          <Home size={14} />
        </button>
      </div>

      <div
        className="files-body"
        onDragOver={(e) => { if (!stopped) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropActive(true) } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false) }}
        onDrop={handleDrop}
      >
        {stopped ? (
          <div className="files-empty">Sandbox is stopped</div>
        ) : error && tree.length === 0 ? (
          <div className="files-error">
            <div className="files-error-hd">Couldn’t read this workspace</div>
            <div className="files-error-path">{cwd}</div>
            <div className="files-error-msg">{error}</div>
            <button className="btn btn-default btn-sm" onClick={hardRefresh} disabled={stopped}>
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        ) : (slow || retrying || !rootReady) && tree.length === 0 ? (
          <div className="files-empty">Loading files…</div>
        ) : tree.length === 0 ? (
          <div className="files-empty">{atWorkspace ? 'Workspace is empty' : 'Folder is empty'}</div>
        ) : (
          tree.map((entry) => (
            <FileRow
              key={`${sandbox.id}:${cwd}:${entry.name}`}
              entry={entry}
              depth={0}
              path={joinPath(cwd, entry.name)}
              sandboxName={sandbox.name}
              refreshKey={refreshKey}
              onOpenFile={openFile}
              onEnterDir={setCwd}
              onContext={(e, p, n, isDir) => setMenu({ x: e.clientX, y: e.clientY, path: p, name: n, isDir })}
              changeFor={changeBadge}
              dirChangeFor={dirChangeSummary}
            />
          ))
        )}
      </div>

      {dropActive && !stopped && (
        <div className="files-drop-overlay"><span>Drop to copy into this folder</span></div>
      )}

      {isolated && withinWorkspace && !stopped && (
        <div className="files-clone-note">
          <GitBranch size={13} />
          <span>Isolated clone — files aren't on the host until fetched.</span>
          <button
            className="btn btn-ghost btn-sm"
            title="Fetch this sandbox's changes to a review branch on the host (then open a PR or merge)"
            onClick={() => bringSandboxToHost(sandbox, false)}
          >
            Bring to host
          </button>
        </div>
      )}
      </>
      ) : (
        <div className="files-body files-changes">
          <ChangesReview
            sandbox={sandbox}
            stopped={stopped}
            onContext={(e, rel, name) => setMenu({ x: e.clientX, y: e.clientY, path: `${sandbox.workspace}/${rel}`, name, isDir: false })}
          />
        </div>
      )}

      {/* Bottom bar, pinned: the local (host) folder this sandbox is mounted
          from — click to reveal it in Finder. The trailing action makes the
          click target's purpose explicit. */}
      <button
        className="ds-folder-btn files-local"
        title={`Reveal in Finder — ${sandbox.workspace}`}
        onClick={() => window.minipit?.openInFinder(sandbox.workspace)}
      >
        <Folder size={13} className="ds-folder-ico ds-folder-ico-closed" />
        <FolderOpen size={13} className="ds-folder-ico ds-folder-ico-open" />
        <span className="ds-folder">{sandbox.workspace.split('/').pop() || sandbox.workspace}</span>
        <span className="files-local-action">Reveal in Finder <ArrowUpRight size={12} /></span>
      </button>

      {menu && (
        <div
          className="ctx-menu"
          // Clamp to the viewport so the menu isn't clipped by the window edge
          // (the files dock sits against the right side).
          style={{
            top: Math.max(8, Math.min(menu.y, window.innerHeight - 260)),
            left: Math.max(8, Math.min(menu.x, window.innerWidth - 220))
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {!menu.isDir && (
            <div className="ctx-item" onClick={() => { openInPreview(menu.path, menu.name); setMenu(null) }}>Open in preview</div>
          )}
          {/* "Open in default app" and "Reveal in Finder" go through the host
              (shell.openPath / showItemInFolder), so they only work for files
              under the workspace, which is bind-mounted to the host. Files
              elsewhere in the sandbox filesystem aren't on the host. */}
          {(menu.path === sandbox.workspace || menu.path.startsWith(sandbox.workspace + '/')) && (
            <>
              <div className="ctx-item" onClick={() => { window.minipit?.openPath(menu.path); setMenu(null) }}>Open in default app</div>
              <div className="ctx-item" onClick={() => { window.minipit?.openInFinder(menu.path); setMenu(null) }}>Reveal in Finder</div>
            </>
          )}
          {/* Download copies the file out to the host via `sbx cp`, so it works
              anywhere in the sandbox — the way to get files outside the
              workspace onto your machine. */}
          {!menu.isDir && (
            <div className="ctx-item" onClick={() => {
              const path = menu.path, nm = menu.name
              setMenu(null)
              window.minipit?.downloadFrom(sandbox.name, path).then((r) => {
                if (r && !r.ok && !r.canceled) alert(`Couldn't download "${nm}": ${r.error ?? 'unknown error'}`)
              }).catch(() => {})
            }}>Download…</div>
          )}
          <div className="ctx-item" onClick={() => { navigator.clipboard?.writeText(menu.path); setMenu(null) }}>Copy path</div>
          {/* Git ignore — only for files under the workspace (the repo). Offers the
              exact file, plus a broader glob when it differs (e.g. dot-config dirs). */}
          {!menu.isDir && (menu.path === sandbox.workspace || menu.path.startsWith(sandbox.workspace + '/')) && (() => {
            const rel = relOf(menu.path)
            const glob = globOf(rel)
            return (
              <>
                <div className="ctx-sep" />
                <div className="ctx-item" onClick={() => addToGitignore([rel])}>Add to .gitignore</div>
                {glob !== rel && glob !== `**/${rel}` && (
                  <div className="ctx-item" onClick={() => addToGitignore([glob])} title={`Ignore ${glob}`}>
                    <span>Ignore all <code className="ctx-code">{glob}</code></span>
                  </div>
                )}
              </>
            )
          })()}
          <div className="ctx-sep" />
          <div className="ctx-item destructive" onClick={() => handleDelete(menu)}>Delete</div>
        </div>
      )}
    </div>
  )
}
