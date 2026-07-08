import { FilePlus, FilePen, FileMinus, FileSymlink, type LucideIcon } from 'lucide-react'
import type { FileChange } from '../types'

// Per-status colour + icon for a changed file. `new`/`deleted`/`renamed` map to
// git's porcelain states; anything else reads as a modification.
const STATUS_META: Record<string, { color: string; Icon: LucideIcon; label: string }> = {
  new:      { color: 'var(--green)',    Icon: FilePlus,    label: 'Added' },
  modified: { color: 'var(--yellow)',   Icon: FilePen,     label: 'Modified' },
  deleted:  { color: 'var(--destruct)', Icon: FileMinus,   label: 'Deleted' },
  renamed:  { color: 'var(--blue)',     Icon: FileSymlink, label: 'Renamed' }
}

// A flat list of changed files with a status icon/colour. `onOpen` receives the
// repo-relative path + filename (deleted files aren't openable, so they're inert).
// `onContext` fires on right-click with the same path/name, for a file menu
// (Reveal in Finder, Download, …) mirroring the Files tab.
export function ChangesList({ changes, onOpen, onContext, empty, statFor, allowDeleted }: {
  changes: FileChange[]
  onOpen?: (relPath: string, name: string) => void
  onContext?: (e: React.MouseEvent, relPath: string, name: string) => void
  empty?: string
  // Optional per-file added/deleted counts (review surface). `binary` hides counts.
  statFor?: (relPath: string) => { added: number; deleted: number; binary?: boolean } | undefined
  // Allow opening deleted files (their diff is still viewable in review mode).
  allowDeleted?: boolean
}) {
  if (changes.length === 0) return <div className="changes-empty">{empty ?? 'No uncommitted changes.'}</div>
  const sorted = [...changes].sort((a, b) => a.path.localeCompare(b.path))
  return (
    <div className="changes-list">
      {sorted.map((c) => {
        const m = STATUS_META[c.status] ?? STATUS_META.modified
        const name = c.path.split('/').pop() || c.path
        const dir = c.path.slice(0, c.path.length - name.length).replace(/\/$/, '')
        const openable = !!onOpen && (allowDeleted || c.status !== 'deleted')
        const Icon = m.Icon
        const stat = statFor?.(c.path)
        return (
          <button
            key={c.path}
            className={`changes-row${openable ? '' : ' static'}`}
            title={`${m.label} · ${c.path}`}
            onClick={() => openable && onOpen!(c.path, name)}
            onContextMenu={onContext ? (e) => { e.preventDefault(); e.stopPropagation(); onContext(e, c.path, name) } : undefined}
          >
            <Icon size={13} style={{ color: m.color, flexShrink: 0 }} />
            <span className="changes-name">{name}</span>
            {dir && <span className="changes-dir">{dir}</span>}
            {stat && !stat.binary && (stat.added > 0 || stat.deleted > 0) && (
              <span className="changes-stat">
                <span className="changes-add">+{stat.added}</span>{' '}
                <span className="changes-del">−{stat.deleted}</span>
              </span>
            )}
            {stat?.binary && <span className="changes-stat changes-bin">bin</span>}
            <span className="changes-tag" style={{ color: m.color }} title={m.label}>{c.status.charAt(0).toUpperCase()}</span>
          </button>
        )
      })}
    </div>
  )
}
