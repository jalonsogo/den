import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, Folder, FolderOpen, File, RefreshCw } from 'lucide-react'
import type { Sandbox, FileEntry, FileChange } from '../types'

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

interface FileMenu { x: number; y: number; path: string; name: string; isDir: boolean }

function FileRow({
  entry,
  depth,
  path,
  sandboxName,
  onOpenFile,
  onContext,
  changeFor
}: {
  entry: FileEntry
  depth: number
  path: string
  sandboxName: string
  onOpenFile: (path: string, name: string) => void
  onContext: (e: React.MouseEvent, path: string, name: string, isDir: boolean) => void
  changeFor: (path: string) => string | undefined
}) {
  const badge = entry.type === 'file' ? changeFor(path) : undefined
  const badgeStatus = badge === 'N' ? 'new' : badge === 'D' ? 'deleted' : badge === 'R' ? 'renamed' : 'modified'
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<FileEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const handleClick = async () => {
    if (entry.type !== 'dir') { onOpenFile(path, entry.name); return }
    const next = !open
    setOpen(next)
    // Lazy-load children the first time the directory is expanded.
    if (next && children === null && !loading) {
      setLoading(true)
      setError(false)
      try {
        const result = await window.minipit?.listFiles(sandboxName, path)
        setChildren(result ?? [])
      } catch {
        setError(true)
        setChildren([])
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <>
      <div
        className="frow"
        onClick={handleClick}
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
        {entry.size && <span className="fsize">{entry.size}</span>}
      </div>
      {open && (
        <>
          {loading && children === null && (
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
          {children?.length === 0 && !loading && !error && (
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
              onOpenFile={onOpenFile}
              onContext={onContext}
              changeFor={changeFor}
            />
          ))}
        </>
      )}
    </>
  )
}

export function FilesPanel({ sandbox }: { sandbox: Sandbox }) {
  const [tree, setTree] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [changes, setChanges] = useState<FileChange[]>([])
  const [menu, setMenu] = useState<FileMenu | null>(null)

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

  const openFile = (path: string, name: string) => window.minipit?.openFileWindow(sandbox.name, path, name)

  // Poll git status so changed files are badged live in the tree.
  useEffect(() => {
    if (sandbox.status !== 'running') { setChanges([]); return }
    let alive = true
    const fetchChanges = () => {
      window.minipit?.gitStatus(sandbox.name, sandbox.workspace).then((r) => {
        if (alive && r) setChanges(r.changes)
      }).catch(() => {})
    }
    fetchChanges()
    const id = setInterval(fetchChanges, 3000)
    return () => { alive = false; clearInterval(id) }
  }, [sandbox.name, sandbox.workspace, sandbox.status])

  // Map a file's absolute path to its git change status (paths are repo-relative).
  const changeBadge = (absPath: string): string | undefined => {
    const rel = absPath.startsWith(sandbox.workspace + '/') ? absPath.slice(sandbox.workspace.length + 1) : absPath
    const c = changes.find((x) => x.path === rel)
    if (!c) return undefined
    return c.status === 'new' ? 'N' : c.status === 'deleted' ? 'D' : c.status === 'renamed' ? 'R' : 'M'
  }

  const load = useCallback(async () => {
    if (sandbox.status !== 'running') return
    setLoading(true)
    setError(false)
    try {
      const result = await window.minipit?.listFiles(sandbox.name, sandbox.workspace)
      setTree(result ?? [])
    } catch {
      setError(true)
      setTree([])
    } finally {
      setLoading(false)
    }
  }, [sandbox.name, sandbox.status])

  // Load the root listing when the sandbox (or its running state) changes.
  useEffect(() => {
    setTree([])
    load()
  }, [sandbox.id, sandbox.status, load])

  const stopped = sandbox.status !== 'running'

  const handleDelete = async (m: FileMenu) => {
    setMenu(null)
    if (!confirm(`Delete ${m.isDir ? 'folder' : 'file'} "${m.name}"?`)) return
    await window.minipit?.deletePath(sandbox.name, m.path).catch((e) => console.error(e))
    load()
  }

  return (
    <div className="files-panel">
      <div className="files-bar">
        <span className="files-path" title={sandbox.workspace}>{sandbox.workspace}</span>
        {changes.length > 0 && <span className="files-chg-count">{changes.length} changed</span>}
        <button
          className="btn btn-ghost btn-sm"
          style={{ padding: '4px 6px' }}
          title="Refresh"
          onClick={load}
          disabled={stopped}
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="files-body">
        {stopped ? (
          <div className="files-empty">Sandbox is stopped</div>
        ) : error ? (
          <div className="files-empty" style={{ color: 'var(--destruct)' }}>Failed to read workspace</div>
        ) : loading && tree.length === 0 ? (
          <div className="files-empty">Loading files…</div>
        ) : tree.length === 0 ? (
          <div className="files-empty">Workspace is empty</div>
        ) : (
          tree.map((entry) => (
            <FileRow
              key={entry.name}
              entry={entry}
              depth={0}
              path={joinPath(sandbox.workspace, entry.name)}
              sandboxName={sandbox.name}
              onOpenFile={openFile}
              onContext={(e, p, n, isDir) => setMenu({ x: e.clientX, y: e.clientY, path: p, name: n, isDir })}
              changeFor={changeBadge}
            />
          ))
        )}
      </div>

      {menu && (
        <div
          className="ctx-menu"
          style={{ top: menu.y, left: menu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {!menu.isDir && (
            <div className="ctx-item" onClick={() => { openFile(menu.path, menu.name); setMenu(null) }}>Open</div>
          )}
          <div className="ctx-item" onClick={() => { window.minipit?.openPath(menu.path); setMenu(null) }}>Open in default app</div>
          <div className="ctx-item" onClick={() => { window.minipit?.openInFinder(menu.path); setMenu(null) }}>Reveal in Finder</div>
          <div className="ctx-item" onClick={() => { navigator.clipboard?.writeText(menu.path); setMenu(null) }}>Copy path</div>
          <div className="ctx-sep" />
          <div className="ctx-item destructive" onClick={() => handleDelete(menu)}>Delete</div>
        </div>
      )}
    </div>
  )
}
