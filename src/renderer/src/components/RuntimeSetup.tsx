import { useEffect, useState } from 'react'
import { Download, FolderOpen, HardDrive, ShieldCheck, Zap, AlertTriangle } from 'lucide-react'

// First-run gate for the sbx runtime.
//
// den's default is the managed runtime — the exact version it was built and
// tested against. But "default" must not mean a silent 127 MB download on top of
// an sbx the user already has working, so den asks once and offers their
// existing install right here as the alternative.
//
// Shown only when there is no explicit choice AND no managed runtime installed.
// Once either option is taken the answer is persisted and this never returns.

type Setup = Awaited<ReturnType<NonNullable<typeof window.minipit>['runtimeSetupState']>>

export function RuntimeSetup({ onDone }: { onDone: () => void }) {
  const [setup, setSetup] = useState<Setup | null>(null)
  const [busy, setBusy] = useState<'managed' | 'system' | null>(null)
  const [prog, setProg] = useState<{ phase: string; got: number; total: number } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void window.minipit?.runtimeSetupState?.().then(setSetup).catch(() => {})
    const off = window.minipit?.onRuntimeProgress?.(setProg)
    return () => { off?.() }
  }, [])

  const useManaged = async () => {
    setBusy('managed'); setError(''); setProg(null)
    const r = await window.minipit?.runtimeInstall()
      .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }))
    setBusy(null); setProg(null)
    if (r?.ok) onDone()
    else setError(r?.error || 'The install did not complete.')
  }

  const useSystem = async () => {
    setBusy('system'); setError('')
    // Nothing to point at yet — let them find it rather than dead-ending. The
    // picker verifies the file answers `sbx version` before storing it, so a
    // wrong choice fails here instead of as ENOENTs all over the app.
    if (!setup?.systemPath) {
      const picked = await window.minipit?.pickSbxBinary?.().catch(() => null)
      if (!picked?.ok) {
        setBusy(null)
        if (picked?.error) setError(picked.error)
        return
      }
    }
    const r = await window.minipit?.runtimeSetSource('system').catch(() => null)
    setBusy(null)
    if (r?.ok) onDone()
    else setError('Could not switch to your own install.')
  }

  if (!setup) return null

  const pct = prog?.total ? Math.round((prog.got / prog.total) * 100) : 0

  return (
    <div className="rs-gate">
      <div className="rs-card">
        <span className="empty-mark"><HardDrive size={34} /></span>
        <span className="home-empty-eyebrow"><Zap size={11} /> One-time setup</span>
        <h1 className="home-empty-title">Choose how den runs sbx</h1>
        <p className="home-empty-sub">
          den drives Docker Sandboxes. It can manage its own copy — the version this build was
          tested against — or use the one you already have.
        </p>

        <div className="rs-options">
          {/* Recommended: the version den's UI is written for. */}
          <button
            className={`rs-opt${setup.supported ? ' rs-opt-primary' : ' rs-opt-off'}`}
            disabled={!setup.supported || busy !== null}
            onClick={() => void useManaged()}
          >
            <span className="rs-opt-hd">
              <Download size={16} />
              <span className="rs-opt-title">Let den manage it</span>
              {setup.supported && <span className="lib-badge">Recommended</span>}
            </span>
            {setup.supported ? (
              <>
                <span className="rs-opt-sub">
                  Downloads sbx {setup.pinned}, the version this build of den is made for, and keeps
                  it inside den. Your system stays untouched.
                </span>
                <span className="rs-opt-meta">About 127 MB · nothing is installed system-wide</span>
              </>
            ) : (
              <span className="rs-opt-sub">{setup.unsupportedReason}</span>
            )}
          </button>

          <button
            className="rs-opt"
            disabled={busy !== null}
            onClick={() => void useSystem()}
          >
            <span className="rs-opt-hd">
              <FolderOpen size={16} />
              <span className="rs-opt-title">Use my own install</span>
            </span>
            {setup.systemPath ? (
              <>
                <span className="rs-opt-sub">den found sbx already installed on this machine.</span>
                <span className="rs-opt-meta"><code>{setup.systemPath}</code></span>
              </>
            ) : (
              <>
                <span className="rs-opt-sub">
                  Point den at an sbx you installed yourself — with Homebrew, winget, or by hand.
                </span>
                <span className="rs-opt-meta">You’ll be asked to locate the binary</span>
              </>
            )}
          </button>
        </div>

        {busy === 'managed' && (
          <div className="rs-progress-wrap">
            <div className="ss-sub" style={{ marginBottom: 6 }}>
              {prog?.phase === 'download'
                ? prog.total ? `Downloading — ${pct}%` : 'Downloading…'
                : prog?.phase === 'extract' ? 'Verified. Unpacking…'
                : prog?.phase === 'verify' ? 'Checking the binary runs…'
                : 'Starting…'}
            </div>
            <div className="rt-progress">
              <div
                className={`rt-progress-fill${prog?.phase === 'download' && prog.total ? '' : ' indet'}`}
                style={prog?.phase === 'download' && prog.total ? { width: `${pct}%` } : undefined}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="np-banner err" style={{ marginTop: 14, textAlign: 'left' }}>
            <AlertTriangle size={13} />
            <span className="np-banner-txt" style={{ whiteSpace: 'pre-wrap' }}>{error}</span>
          </div>
        )}

        <p className="rs-foot">
          <ShieldCheck size={12} /> You can change this any time in Settings → Runtime.
        </p>
      </div>
    </div>
  )
}
