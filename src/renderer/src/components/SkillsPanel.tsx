import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Download, FolderOpen, AlertTriangle } from 'lucide-react'
import type { SkillsImport } from '../types'

// Shared agent skills (sbx v0.37+). Skills live in per-agent folders on the host
// (~/.claude/skills, ~/.agents/skills, …); `sbx skills import` copies them into
// one store that every sandbox mounts read-write unless it was created with
// --no-share-skills. The store outlives the sandboxes that use it and is cleared
// by `sbx reset`.
//
// The panel always previews before it writes: it opens on a --dry-run so the
// import list (and the overwrite it implies) is visible first, and only the
// explicit Import button runs the real thing. That ordering isn't cosmetic —
// a bare `skills import` prompts on every existing skill and there's no TTY to
// answer, so den has to pass --force, which makes the preview the only place
// the user gets to say no.
export function SkillsPanel() {
  const [preview, setPreview] = useState<SkillsImport | null>(null)
  const [result, setResult] = useState<SkillsImport | null>(null)
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null)

  const loadPreview = useCallback(async () => {
    setBusy('preview')
    setResult(null)
    const r = await window.minipit?.skillsImport({ dryRun: true }).catch(() => null)
    setPreview(r ?? null)
    setBusy(null)
  }, [])

  useEffect(() => { void loadPreview() }, [loadPreview])

  const runImport = async () => {
    if (busy) return
    setBusy('import')
    const r = await window.minipit?.skillsImport().catch(() => null)
    setResult(r ?? null)
    setBusy(null)
    // Re-preview so the store list reflects what just landed.
    const fresh = await window.minipit?.skillsImport({ dryRun: true }).catch(() => null)
    if (fresh) setPreview(fresh)
  }

  const pending = preview?.imported ?? []
  // Only the interesting skips. ".DS_Store: not a directory" is noise; a symlink
  // skip is worth showing because the user may not know symlinked skills (a very
  // common way to share them) are silently excluded.
  const skips = (preview?.skipped ?? []).filter((s) => !/not a directory/i.test(s.reason))
  const store = preview?.store ?? []
  // A skill already in the store that would be imported again = an overwrite.
  const overwrites = pending.filter((n) => store.includes(n))

  return (
    <div className="page-body" style={{ padding: '16px 28px 28px' }}>
      <div className="ss-row">
        <div>
          <div className="ss-lbl">Shared skills store</div>
          <div className="ss-sub">
            Skills copied here are mounted into every sandbox that has sharing enabled. Cleared by{' '}
            <code>sbx reset</code>. Requires sbx v0.37+.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <button className="btn btn-default btn-sm" onClick={loadPreview} disabled={busy !== null}>
            <RefreshCw size={13} /> {busy === 'preview' ? 'Scanning…' : 'Rescan'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={runImport} disabled={busy !== null || pending.length === 0}>
            <Download size={13} />
            {busy === 'import' ? 'Importing…' : pending.length > 0 ? `Import ${pending.length}` : 'Import'}
          </button>
        </div>
      </div>

      {preview?.storePath && (
        <div className="ss-row" style={{ paddingTop: 0 }}>
          <div className="rt-cmdhint" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{ flex: 1, overflowWrap: 'anywhere' }}>{preview.storePath}</code>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => window.minipit?.openPath(preview.storePath!)}
              title="Reveal the store folder"
            >
              <FolderOpen size={13} />
            </button>
          </div>
        </div>
      )}

      {/* What the store holds right now — i.e. what sandboxes actually see. */}
      <div className="fg" style={{ marginTop: 14 }}>
        <label className="flabel">
          In the store <span className="flabel-hint">{store.length} skill{store.length === 1 ? '' : 's'}</span>
        </label>
        {store.length === 0 ? (
          <div className="fhint">
            Empty — nothing is shared into sandboxes yet. Import from the host to seed it.
          </div>
        ) : (
          <div className="skl-chips">
            {store.map((n) => <span key={n} className="skl-chip">{n}</span>)}
          </div>
        )}
      </div>

      {/* What a run would copy in, and which of those replace an existing copy. */}
      <div className="fg">
        <label className="flabel">
          Found on this Mac <span className="flabel-hint">{pending.length} importable</span>
        </label>
        {pending.length === 0 ? (
          <div className="fhint">
            No importable skills found. sbx scans <code>~/.agents/skills</code>, <code>~/.claude/skills</code>,{' '}
            <code>~/.copilot/skills</code>, <code>~/.cursor/skills</code> and <code>~/.factory/skills</code>.
          </div>
        ) : (
          <>
            <div className="skl-chips">
              {pending.map((n) => (
                <span key={n} className={`skl-chip${overwrites.includes(n) ? ' warn' : ''}`}>
                  {n}{overwrites.includes(n) ? ' · replaces' : ''}
                </span>
              ))}
            </div>
            {overwrites.length > 0 && (
              <div className="fhint">
                {overwrites.length} already in the store and will be replaced (sbx backs up the old folder first).
              </div>
            )}
          </>
        )}
      </div>

      {skips.length > 0 && (
        <div className="fg">
          <label className="flabel">
            Skipped <span className="flabel-hint">not importable</span>
          </label>
          <div className="skl-skips">
            {skips.map((s, i) => (
              <div key={`${s.name}-${i}`} className="skl-skip">
                <AlertTriangle size={12} />
                <code>{s.name}</code>
                <span>{s.reason}</span>
              </div>
            ))}
          </div>
          <div className="fhint">
            Symlinked skill folders are skipped by sbx — copy the real folder in to share it.
          </div>
        </div>
      )}

      {result && (
        <div className={`np-banner ${result.ok ? 'ok' : 'err'}`}>
          <span className="np-banner-txt">
            {result.ok
              ? `Imported ${result.imported.length} skill${result.imported.length === 1 ? '' : 's'}.`
              : `Import failed. ${result.error ?? ''}`}
            {/* sbx's own words for the detail — it explains per-skill outcomes
                better than a count, and matters most when something failed. */}
            {result.raw.trim() && <span className="np-banner-support">{result.raw.trim()}</span>}
          </span>
        </div>
      )}
    </div>
  )
}
