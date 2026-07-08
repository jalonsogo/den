import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Eye, Code2, Download, FileWarning, GitCompare, ChevronDown, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
// The common bundle (~35 popular languages) keeps the code viewer small; any
// language it doesn't include falls back to plain escaped text in highlightToHtml.
import hljs from 'highlight.js/lib/common'
import { categorize, languageOf, imageMime, sniffBinary, base64ToUtf8 } from './lib/filePreview'

type View = 'loading' | 'error' | 'image' | 'markdown' | 'html' | 'code' | 'binary'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Highlight code to HTML using the mapped language, falling back to plain
// (escaped) text when the grammar is unknown — hljs throws on unregistered ids.
function highlightToHtml(code: string, lang: string): string {
  if (lang && lang !== 'plaintext' && hljs.getLanguage(lang)) {
    try { return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value } catch { /* fall through */ }
  }
  return escapeHtml(code)
}

// Read-only highlighted code with a line-number gutter. The gutter is a
// separate column (pinned left during horizontal scroll); numbers align with
// code lines because both share the same monospace line-height and the code
// never wraps (white-space: pre), so one source line = one visual row.
function CodeView({ code, lang }: { code: string; lang: string }) {
  const count = code.split('\n').length
  const gutter = Array.from({ length: count }, (_, i) => i + 1).join('\n')
  return (
    <div className="fp-code-wrap">
      <div className="fp-gutter" aria-hidden="true">{gutter}</div>
      <pre className="hljs fp-code"><code dangerouslySetInnerHTML={{ __html: highlightToHtml(code, lang) }} /></pre>
    </div>
  )
}

// Editable code with a line-number gutter. The gutter scrolls in sync with the
// textarea; `wrap="off"` disables soft-wrapping so one line = one row and the
// numbers stay aligned (long lines scroll horizontally instead of wrapping).
function EditCode({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const gutRef = useRef<HTMLDivElement>(null)
  const count = value.split('\n').length
  const gutter = Array.from({ length: count }, (_, i) => i + 1).join('\n')
  const syncScroll = () => {
    if (gutRef.current && taRef.current) gutRef.current.scrollTop = taRef.current.scrollTop
  }
  return (
    <div className="fp-edit-wrap">
      <div className="fp-gutter fp-edit-gutter" ref={gutRef} aria-hidden="true">{gutter}</div>
      <textarea
        ref={taRef}
        className="few-editor fp-edit-ta"
        value={value}
        spellCheck={false}
        wrap="off"
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
      />
    </div>
  )
}

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
    // File-level headers add nothing in side-by-side (the window titles the file).
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
function DiffView({ diff, mode }: { diff: string; mode: 'inline' | 'flow' }) {
  if (/^Binary files /m.test(diff)) {
    return <div className="few-msg">Git can’t show a textual diff for this file — it’s detected as binary.</div>
  }
  return mode === 'flow' ? <SideBySideDiff diff={diff} /> : <InlineDiff diff={diff} />
}

// The Diff tab doubles as its own layout dropdown: click to switch to the Diff
// tab; once active, a chevron opens a menu to choose Side-by-side vs Inline.
function DiffTab({
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

// Resolve the app theme the same way main.tsx does at startup, so the preview
// window follows the selected theme (localStorage is shared across windows).
function resolveTheme(): 'light' | 'dark' {
  const pref = localStorage.getItem('minipit:themePref') ?? 'system'
  if (pref === 'dark') return 'dark'
  if (pref === 'light') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Standalone previewer rendered in its own BrowserWindow (route #/editor).
export function FileEditorWindow({ sandbox, path, name, openDiff }: { sandbox: string; path: string; name: string; openDiff?: boolean }) {
  const [view, setView] = useState<View>('loading')
  const [content, setContent] = useState('')       // text for code/markdown/html
  const [orig, setOrig] = useState('')              // last-saved text (code edit)
  const [dataUrl, setDataUrl] = useState('')        // image data URL
  const [diff, setDiff] = useState('')              // unified git diff (if any)
  const [noContent, setNoContent] = useState(false) // file couldn't be read (e.g. deleted) — diff only
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'preview' | 'edit' | 'source' | 'diff'>('preview')
  // Diff layout: 'flow' (side-by-side) or 'inline' (unified). Persisted.
  const [diffMode, setDiffModeState] = useState<'inline' | 'flow'>(
    () => (localStorage.getItem('minipit:diffMode') === 'inline' ? 'inline' : 'flow')
  )
  const setDiffMode = (m: 'inline' | 'flow') => { localStorage.setItem('minipit:diffMode', m); setDiffModeState(m) }

  const lang = useMemo(() => languageOf(name), [name])
  const hasDiff = diff.trim().length > 0

  // Follow the app theme live: re-apply data-theme when it changes in the main
  // window (shared-origin localStorage fires a `storage` event here) or when the
  // OS appearance changes while "system" is selected.
  useEffect(() => {
    const apply = () => document.documentElement.setAttribute('data-theme', resolveTheme())
    apply()
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    window.addEventListener('storage', apply)
    mq?.addEventListener?.('change', apply)
    return () => { window.removeEventListener('storage', apply); mq?.removeEventListener?.('change', apply) }
  }, [])

  useEffect(() => {
    document.title = name
    let alive = true
    const kind = categorize(name)
    setView('loading')
    setTab('preview')
    setDiff('')
    setNoContent(false)
    ;(async () => {
      // Read the file content. A read failure isn't fatal on its own — a changed
      // file can be a deletion/rename whose path no longer exists, in which case
      // we still want to show its diff.
      let textish = false
      let readErr: string | null = null
      try {
        if (kind === 'image') {
          const { base64 } = await window.minipit!.readFileBytes(sandbox, path)
          if (!alive) return
          setDataUrl(`data:${imageMime(name)};base64,${base64}`); setView('image')
        } else if (kind === 'unknown') {
          // Sniff the bytes: text-like → treat as code, otherwise "can't preview".
          const { base64 } = await window.minipit!.readFileBytes(sandbox, path)
          if (!alive) return
          if (sniffBinary(base64)) setView('binary')
          else { const t = base64ToUtf8(base64); setContent(t); setOrig(t); setView('code'); textish = true }
        } else {
          const t = (await window.minipit!.readFile(sandbox, path)) ?? ''
          if (!alive) return
          setContent(t); setOrig(t); setView(kind); textish = true
        }
      } catch (e) {
        readErr = e instanceof Error ? e.message : String(e)
        textish = true   // still attempt a diff — the file may just be deleted
      }

      // Load the git diff (text files, or a file we couldn't read).
      let d = ''
      if (textish) {
        const r = await window.minipit?.gitDiffFile(sandbox, path).catch(() => null)
        d = r?.diff?.trim() ? r.diff : ''
      }
      if (!alive) return

      if (readErr) {
        // Couldn't read the file: show the diff if we have one, else the error.
        if (d) { setDiff(d); setContent(''); setOrig(''); setNoContent(true); setView('code'); setTab('diff') }
        else { setErr(readErr); setView('error') }
        return
      }
      if (d) { setDiff(d); if (openDiff) setTab('diff') }
    })()
    return () => { alive = false }
  }, [sandbox, path, name, openDiff])

  const dirty = view === 'code' && content !== orig

  const save = async () => {
    if (view !== 'code') return
    setSaving(true)
    try {
      await window.minipit?.writeFile(sandbox, path, content)
      setOrig(content)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  // ⌘S / Ctrl+S to save (code edit only).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (dirty) save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Tabs available for the current view (a Diff tab is appended when the file
  // has git changes). When the file couldn't be read (deleted/renamed), only the
  // Diff is meaningful.
  type Tab = { id: 'preview' | 'edit' | 'source' | 'diff'; label: string; Icon: typeof Eye }
  const baseTabs: Tab[] = noContent
    ? []
    : view === 'code' ? [{ id: 'preview', label: 'Preview', Icon: Eye }, { id: 'edit', label: 'Edit', Icon: Code2 }]
      : view === 'html' ? [{ id: 'preview', label: 'Preview', Icon: Eye }, { id: 'source', label: 'Code', Icon: Code2 }]
        : view === 'markdown' ? [{ id: 'preview', label: 'Preview', Icon: Eye }, { id: 'source', label: 'Source', Icon: Code2 }]
          : []
  const tabs: Tab[] = hasDiff
    ? [...baseTabs, { id: 'diff', label: 'Diff', Icon: GitCompare }]
    : baseTabs

  return (
    <div className="few">
      <div className="few-bar">
        <span className="few-name">{name}{dirty ? ' •' : ''}</span>
        <span className="few-path" title={path}>{path}</span>
        <div style={{ flex: 1 }} />
        {tabs.length > 0 && (
          <div className="fp-tabs" role="group">
            {tabs.map(({ id, label, Icon }) =>
              id === 'diff' ? (
                <DiffTab
                  key="diff"
                  active={tab === 'diff'}
                  mode={diffMode}
                  onSelect={() => setTab('diff')}
                  onMode={setDiffMode}
                />
              ) : (
                <button key={id} className={`fp-tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
                  <Icon size={12} /> {label}
                </button>
              )
            )}
          </div>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => window.minipit?.openPath(path)} title="Open in default app">
          <ExternalLink size={13} />
        </button>
        {view === 'code' && tab === 'edit' && (
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>

      {view === 'loading' ? (
        <div className="few-msg">Loading…</div>
      ) : view === 'error' ? (
        <div className="few-msg" style={{ color: 'var(--destruct)' }}>{err}</div>
      ) : view === 'image' ? (
        <div className="fp-body fp-img"><img className="fp-img-el" src={dataUrl} alt={name} /></div>
      ) : view === 'binary' ? (
        <div className="fp-body fp-binary">
          <FileWarning size={30} />
          <div className="fp-binary-title">We can’t preview this file</div>
          <div className="fp-binary-sub">It looks like a binary file. Download it or open it in your default app.</div>
          <div className="fp-binary-actions">
            <button className="btn btn-default btn-sm" onClick={() => window.minipit?.downloadFrom(sandbox, path)}>
              <Download size={13} /> Download…
            </button>
            <button className="btn btn-default btn-sm" onClick={() => window.minipit?.openPath(path)}>
              <ExternalLink size={13} /> Open in default app
            </button>
          </div>
        </div>
      ) : tab === 'diff' && hasDiff ? (
        <div className="fp-body"><DiffView diff={diff} mode={diffMode} /></div>
      ) : view === 'markdown' ? (
        tab === 'source' ? (
          <div className="fp-body"><CodeView code={content} lang="markdown" /></div>
        ) : (
          <div className="fp-body md-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              // rehype-raw parses embedded HTML (READMEs often use <div align>,
              // <img>, <br>) so it renders instead of showing as literal tags;
              // it runs first so highlight sees the full tree. React won't
              // execute <script>/inline handlers, and our `a` override neutralizes
              // javascript: links, so raw local-file HTML is safe enough to render.
              rehypePlugins={[rehypeRaw, rehypeHighlight]}
              components={{
                a: ({ href, children }) => (
                  <a
                    href={href}
                    onClick={(e) => { e.preventDefault(); if (href && /^https?:/i.test(href)) window.minipit?.openPath(href) }}
                  >{children}</a>
                )
              }}
            >{content}</ReactMarkdown>
          </div>
        )
      ) : view === 'html' ? (
        tab === 'source' ? (
          <div className="fp-body"><CodeView code={content} lang="xml" /></div>
        ) : (
          // Locked-down: no scripts, no same-origin. Renders HTML + CSS only.
          <iframe className="fp-iframe" sandbox="" srcDoc={content} title={name} />
        )
      ) : (
        // code
        tab === 'edit' ? (
          <EditCode value={content} onChange={setContent} />
        ) : (
          <div className="fp-body"><CodeView code={content} lang={lang} /></div>
        )
      )}
    </div>
  )
}
