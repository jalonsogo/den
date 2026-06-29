import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { SbxRelease } from '../types'

const CAP = 200_000
const MANAGER_LABEL: Record<string, string> = {
  brew: 'Homebrew', winget: 'winget', apt: 'apt', manual: 'manual install'
}

// Extract the base x.y.z semver from a version string for comparison.
function baseSemver(v?: string | null): string | null {
  const m = v?.match(/(\d+)\.(\d+)\.(\d+)/)
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null
}

function cmpSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

function fmtDate(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export function SbxRuntimePanel({
  sbxPath,
  onChangePath
}: {
  sbxPath: string
  onChangePath: (path: string) => void
}) {
  const [version, setVersion] = useState<string | null>(null)
  const [versionErr, setVersionErr] = useState<string | null>(null)
  const [releases, setReleases] = useState<SbxRelease[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<null | 'update' | 'redownload'>(null)
  const [output, setOutput] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [verify, setVerify] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle')
  const [install, setInstall] = useState<import('../types').SbxInstallInfo | null>(null)
  const outRef = useRef<HTMLDivElement>(null)

  const loadVersion = () => {
    window.minipit?.sbxVersion(sbxPath).then((r) => {
      if (r?.ok) { setVersion(r.version ?? r.raw ?? null); setVersionErr(null) }
      else setVersionErr(r?.error ?? 'sbx not found')
    }).catch(() => setVersionErr('sbx not found'))
  }

  const handleVerify = async () => {
    setVerify('checking')
    const res = await window.minipit?.sbxVersion(sbxPath).catch(() => null)
    setVerify(res?.ok ? 'ok' : 'fail')
    if (res?.ok) { setVersion(res.version ?? res.raw ?? null); setVersionErr(null) }
    setTimeout(() => setVerify('idle'), 2500)
  }

  useEffect(() => {
    loadVersion()
    window.minipit?.sbxInstallInfo().then((i) => setInstall(i ?? null)).catch(() => {})
    window.minipit?.sbxReleases().then((r) => setReleases(r ?? [])).catch(() => {}).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Stream brew output while an update/redownload runs.
  useEffect(() => {
    const unsub = window.minipit?.onRuntimeOutput((chunk) => {
      setOutput((t) => {
        const next = t + chunk
        return next.length > CAP ? next.slice(-CAP) : next
      })
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight
  }, [output])

  const run = async (action: 'update' | 'redownload') => {
    setBusy(action)
    setOutput('')
    const res = await window.minipit?.sbxUpdate(action).catch(() => null)
    setBusy(null)
    if (res?.ok) loadVersion()
  }

  const latest = releases[0]?.version
  const curBase = baseSemver(version)
  const latestBase = baseSemver(latest)
  const updateAvailable = curBase && latestBase ? cmpSemver(curBase, latestBase) < 0 : false

  return (
    <div className="page-body" style={{ padding: '8px 28px 28px' }}>
      <div className="ss">
        <div className="ss-hdr">Runtime</div>
        <div className="ss-row">
          <div>
            <div className="ss-lbl">Installed version</div>
            <div className="ss-sub" style={{ fontFamily: "'SF Mono','Menlo',monospace" }}>
              {versionErr ? <span style={{ color: 'var(--destruct)' }}>{versionErr}</span> : version ?? 'Checking…'}
            </div>
          </div>
          {updateAvailable
            ? <span className="rt-badge rt-badge-update">Update available → {latest}</span>
            : version && latest
              ? <span className="rt-badge rt-badge-ok">Up to date</span>
              : null}
        </div>
        <div className="ss-row">
          <div>
            <div className="ss-lbl">sbx binary path</div>
            <div className="ss-sub">
              {install ? `Installed via ${MANAGER_LABEL[install.manager]}. ` : ''}Click Save to persist.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <input
              className="s-input"
              value={sbxPath}
              onChange={(e) => onChangePath(e.target.value)}
              style={{ width: 192 }}
            />
            <button className="btn btn-default btn-sm" onClick={handleVerify} disabled={verify === 'checking'}>
              {verify === 'checking' ? '…' : verify === 'ok' ? '✓ OK' : verify === 'fail' ? '✗ Failed' : 'Verify'}
            </button>
          </div>
        </div>
        <div className="ss-row">
          <div>
            <div className="ss-lbl">Latest release</div>
            <div className="ss-sub">{loading ? 'Checking GitHub…' : latest ? `${latest} · ${fmtDate(releases[0]?.date)}` : 'Unavailable'}</div>
          </div>
          {install && !install.canAutoUpdate ? (
            <button className="btn btn-default btn-sm" onClick={() => window.minipit?.openPath(install.releasesUrl)}>
              <ExternalLink size={13} /> Download
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 7 }}>
              <button
                className={`btn btn-sm ${updateAvailable ? 'btn-primary' : 'btn-default'}`}
                onClick={() => run('update')}
                disabled={busy !== null}
              >
                {busy === 'update' ? 'Updating…' : 'Update'}
              </button>
              <button className="btn btn-default btn-sm" onClick={() => run('redownload')} disabled={busy !== null}>
                {busy === 'redownload' ? 'Reinstalling…' : 'Redownload'}
              </button>
            </div>
          )}
        </div>
        {install && !install.canAutoUpdate && (
          <div className="ss-row" style={{ paddingTop: 0 }}>
            <div className="rt-cmdhint">
              {install.manager === 'apt'
                ? <>Update with: <code>{install.updateCmd}</code></>
                : <>This sbx wasn’t installed by a package manager den can drive. Update by downloading the latest build above (or re-run your installer).</>}
            </div>
          </div>
        )}
        {output && (
          <div className="ss-row" style={{ paddingTop: 0 }}>
            <div className="rt-output" ref={outRef}>
              <pre className="logs-pre">{output}</pre>
            </div>
          </div>
        )}
      </div>

      <div className="ss">
        <div className="ss-hdr" style={{ display: 'flex', alignItems: 'center' }}>
          <span>Latest changes</span>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={() => releases[0] && window.minipit?.openPath(releases[0].url)}
          >
            View on GitHub
          </button>
        </div>
        {loading ? (
          <div className="ss-row"><div className="ss-sub">Loading release notes…</div></div>
        ) : releases.length === 0 ? (
          <div className="ss-row"><div className="ss-sub">Could not fetch release notes (offline?).</div></div>
        ) : (
          releases.map((r) => (
            <div className="rt-rel" key={r.version}>
              <div className="rt-rel-hdr" onClick={() => setExpanded((e) => (e === r.version ? null : r.version))}>
                <span className="rt-rel-ver">{r.version}</span>
                {r.prerelease && <span className="rt-badge rt-badge-pre">pre-release</span>}
                <span className="rt-rel-date">{fmtDate(r.date)}</span>
                <span className="rt-rel-chevron">{expanded === r.version ? '▾' : '▸'}</span>
              </div>
              {expanded === r.version && (
                <pre className="rt-rel-body">{r.body?.trim() || 'No release notes.'}</pre>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
