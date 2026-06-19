import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'

// Standalone editor rendered in its own BrowserWindow (route #/editor).
export function FileEditorWindow({ sandbox, path, name }: { sandbox: string; path: string; name: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [orig, setOrig] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    document.title = name
    let alive = true
    window.minipit?.readFile(sandbox, path)
      .then((c) => { if (alive) { setContent(c ?? ''); setOrig(c ?? '') } })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
  }, [sandbox, path, name])

  const dirty = content !== null && content !== orig

  const save = async () => {
    if (content === null) return
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

  // ⌘S / Ctrl+S to save.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="few">
      <div className="few-bar">
        <span className="few-name">{name}{dirty ? ' •' : ''}</span>
        <span className="few-path" title={path}>{path}</span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={() => window.minipit?.openPath(path)} title="Open in default app">
          <ExternalLink size={13} />
        </button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {err ? (
        <div className="few-msg" style={{ color: 'var(--destruct)' }}>{err}</div>
      ) : content === null ? (
        <div className="few-msg">Loading…</div>
      ) : (
        <textarea className="few-editor" value={content} spellCheck={false} onChange={(e) => setContent(e.target.value)} />
      )}
    </div>
  )
}
