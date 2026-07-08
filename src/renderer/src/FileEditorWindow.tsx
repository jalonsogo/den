import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Eye, Code2, Download, FileWarning, GitCompare } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
// The common bundle (~35 popular languages) keeps the code viewer small; any
// language it doesn't include falls back to plain escaped text in highlightToHtml.
import hljs from 'highlight.js/lib/common'
import { categorize, languageOf, imageMime, sniffBinary, base64ToUtf8 } from './lib/filePreview'
import { DiffView, DiffTab } from './components/DiffView'

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

// Normalize a path, resolving `.`/`..` segments.
function normalizePath(p: string): string {
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return (p.startsWith('/') ? '/' : '') + out.join('/')
}

// A markdown/HTML <img>. Relative (local) paths can't load as URLs — they live
// in the sandbox — so resolve against the doc's directory, read the bytes, and
// inline as a data: URL. http(s)/data srcs are used as-is.
function MdImg({ src, alt, width, height, sandbox, baseDir }: {
  src?: string; alt?: string; width?: string | number; height?: string | number; sandbox: string; baseDir: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setUrl(null); setFailed(false)
    if (!src) { setFailed(true); return }
    if (/^(https?:|data:)/i.test(src)) { setUrl(src); return }
    const rel = src.replace(/^\.\//, '')
    const abs = normalizePath(rel.startsWith('/') ? rel : `${baseDir}/${rel}`)
    let alive = true
    window.minipit?.readFileBytes(sandbox, abs)
      .then((r) => { if (alive) setUrl(`data:${imageMime(abs)};base64,${r.base64}`) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [src, sandbox, baseDir])
  if (failed) return <span className="md-img-missing" title={src}>🖼 {alt || src || 'image'}</span>
  if (url === null) return <span className="md-img-loading" />
  // Honor the source width (e.g. <img width="300">) but never overflow the pane;
  // height auto keeps the aspect ratio.
  return <img src={url} alt={alt} width={width} height={height} style={{ maxWidth: '100%', height: 'auto' }} />
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
export function FileEditorWindow({ sandbox, path, name, openDiff, reviewBranch }: { sandbox: string; path: string; name: string; openDiff?: boolean; reviewBranch?: string | null }) {
  const [view, setView] = useState<View>('loading')
  const [content, setContent] = useState('')       // text for code/markdown/html
  const [orig, setOrig] = useState('')              // last-saved text (code edit)
  const [dataUrl, setDataUrl] = useState('')        // image data URL
  const [diff, setDiff] = useState('')              // unified git diff (if any)
  const [noContent, setNoContent] = useState(false) // file couldn't be read (e.g. deleted) — diff only
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [allowScripts, setAllowScripts] = useState(false)   // HTML preview: run page JS (opt-in)
  const [tab, setTab] = useState<'preview' | 'edit' | 'source' | 'diff'>('preview')
  const mdDir = path.replace(/\/[^/]*$/, '') || ''          // dir of the doc, for resolving relative images
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
    setAllowScripts(false)
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

      // Load the git diff (text files, or a file we couldn't read). With a
      // reviewBranch, diff the branch vs base on the host; else the sandbox's
      // working tree.
      let d = ''
      if (textish) {
        const r = reviewBranch
          ? await window.minipit?.reviewFileDiff(sandbox, path.replace(/\/[^/]*$/, '') || '/', reviewBranch, path).catch(() => null)
          : await window.minipit?.gitDiffFile(sandbox, path).catch(() => null)
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
  }, [sandbox, path, name, openDiff, reviewBranch])

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
                ),
                img: ({ src, alt, width, height }) => <MdImg src={typeof src === 'string' ? src : undefined} alt={alt} width={width} height={height} sandbox={sandbox} baseDir={mdDir} />
              }}
            >{content}</ReactMarkdown>
          </div>
        )
      ) : view === 'html' ? (
        tab === 'source' ? (
          <div className="fp-body"><CodeView code={content} lang="xml" /></div>
        ) : (
          // Sandboxed iframe. Scripts are off until the user opts in (per file).
          <div className="fp-html">
            {!allowScripts && (
              <div className="fp-html-bar">
                <span>JavaScript is disabled in this preview.</span>
                <button
                  className="btn btn-default btn-sm"
                  onClick={() => { if (window.confirm('Run this page’s JavaScript?\n\nOnly enable this for HTML you trust — it will execute in a sandboxed frame.')) setAllowScripts(true) }}
                >
                  Enable scripts
                </button>
              </div>
            )}
            <iframe className="fp-iframe" sandbox={allowScripts ? 'allow-scripts' : ''} srcDoc={content} title={name} />
          </div>
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
