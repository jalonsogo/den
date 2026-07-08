import { useEffect, useRef, useState } from 'react'
import { GitCompare, ChevronDown, Check } from 'lucide-react'

// Side-by-side diff: parse a unified diff into aligned old (left) / new (right)
// rows. Runs of deletions and additions are paired positionally (GitHub-style),
// so a modified line shows old on the left and new on the right; unmatched
// deletions/additions leave a filler cell on the opposite side.
type SbsCell = { num: number | null; text: string; type: 'ctx' | 'del' | 'add' | 'empty' }
type SbsRow = { kind: 'hunk'; text: string } | { kind: 'line'; left: SbsCell; right: SbsCell }

function parseSideBySide(diff: string): SbsRow[] {
  const rows: SbsRow[] = []
  let oldNum = 0
  let newNum = 0
  let dels: string[] = []
  let adds: string[] = []
  const flush = () => {
    const n = Math.max(dels.length, adds.length)
    for (let i = 0; i < n; i++) {
      const d = i < dels.length ? dels[i] : null
      const a = i < adds.length ? adds[i] : null
      rows.push({
        kind: 'line',
        left: d != null ? { num: oldNum++, text: d, type: 'del' } : { num: null, text: '', type: 'empty' },
        right: a != null ? { num: newNum++, text: a, type: 'add' } : { num: null, text: '', type: 'empty' }
      })
    }
    dels = []
    adds = []
  }
  for (const ln of diff.split('\n')) {
    if (ln === '') continue
    if (ln.startsWith('@@')) {
      flush()
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(ln)
      if (m) { oldNum = parseInt(m[1], 10); newNum = parseInt(m[2], 10) }
      rows.push({ kind: 'hunk', text: ln })
      continue
    }
    // File-level headers add nothing in side-by-side (the surface titles the file).
    if (/^(diff |index |--- |\+\+\+ |new file|deleted file|rename |similarity |Binary |old mode|new mode)/.test(ln)) continue
    if (ln.startsWith('-')) { dels.push(ln.slice(1)); continue }
    if (ln.startsWith('+')) { adds.push(ln.slice(1)); continue }
    flush()
    const text = ln.startsWith(' ') ? ln.slice(1) : ln
    rows.push({
      kind: 'line',
      left: { num: oldNum++, text, type: 'ctx' },
      right: { num: newNum++, text, type: 'ctx' }
    })
  }
  flush()
  return rows
}

function SideBySideDiff({ diff }: { diff: string }) {
  const rows = parseSideBySide(diff)
  return (
    <div className="fp-sbs">
      {rows.map((r, i) =>
        r.kind === 'hunk' ? (
          <div key={i} className="fp-sbs-hunk">{r.text}</div>
        ) : (
          <div key={i} className="fp-sbs-row">
            <div className={`fp-sbs-num ${r.left.type}`}>{r.left.num ?? ''}</div>
            <div className={`fp-sbs-code ${r.left.type}`}>{r.left.text || ' '}</div>
            <div className={`fp-sbs-num ${r.right.type}`}>{r.right.num ?? ''}</div>
            <div className={`fp-sbs-code ${r.right.type}`}>{r.right.text || ' '}</div>
          </div>
        )
      )}
    </div>
  )
}

// Inline (unified) diff — one column, colored by line kind.
function InlineDiff({ diff }: { diff: string }) {
  return (
    <pre className="fp-diff">
      {diff.split('\n').map((ln, i) => {
        const cls =
          ln.startsWith('@@') ? 'd-hunk'
            : /^(\+\+\+|---|diff |index |new file|deleted file|rename |similarity |Binary )/.test(ln) ? 'd-meta'
              : ln.startsWith('+') ? 'd-add'
                : ln.startsWith('-') ? 'd-del'
                  : 'd-ctx'
        return <div key={i} className={`fp-diff-line ${cls}`}>{ln || ' '}</div>
      })}
    </pre>
  )
}

// Diff view: switches between inline (unified) and flow (side-by-side). Falls
// back to a note when git couldn't produce a textual patch (truly binary).
export function DiffView({ diff, mode }: { diff: string; mode: 'inline' | 'flow' }) {
  if (/^Binary files /m.test(diff)) {
    return <div className="few-msg">Git can’t show a textual diff for this file — it’s detected as binary.</div>
  }
  return mode === 'flow' ? <SideBySideDiff diff={diff} /> : <InlineDiff diff={diff} />
}

// A "Diff" tab that doubles as its own layout dropdown: click to switch to the
// Diff view; once active, a chevron opens a menu to choose Side-by-side vs Inline.
export function DiffTab({
  active,
  mode,
  onSelect,
  onMode
}: {
  active: boolean
  mode: 'inline' | 'flow'
  onSelect: () => void
  onMode: (m: 'inline' | 'flow') => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="fp-tab-wrap" ref={ref}>
      <button
        className={`fp-tab${active ? ' on' : ''}`}
        onClick={() => (active ? setOpen((v) => !v) : onSelect())}
        title={active ? 'Diff layout' : 'Diff'}
      >
        <GitCompare size={12} /> Diff
        {active && <ChevronDown size={11} className="fp-tab-chev" />}
      </button>
      {open && active && (
        <div className="fp-tab-menu" role="listbox">
          {([
            { v: 'flow', l: 'Side by side' },
            { v: 'inline', l: 'Inline' }
          ] as const).map((o) => (
            <button
              key={o.v}
              role="option"
              aria-selected={mode === o.v}
              className={`fp-tab-menu-item${mode === o.v ? ' sel' : ''}`}
              onClick={() => { onMode(o.v); setOpen(false) }}
            >
              {o.l}{mode === o.v && <Check size={13} className="fp-tab-menu-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
