import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useStore } from '../store'

// den speaks the sbx v0.38 CLI dialect only — `daemon restart`, `secret set
// --sandbox`, `--static-mcp`, `--deny-network`, kit spec v2. On an older
// runtime those surface one at a time as opaque "unknown flag" failures spread
// across unrelated features, so say it once, up front, and point at the fix.
//
// Deliberately silent until the version is actually known: the probe needs the
// daemon, and a runtime that's merely still starting shouldn't be accused of
// being out of date.
export function OutdatedRuntimeBanner() {
  const { setActivePage, setSettingsTarget } = useStore()
  const [info, setInfo] = useState<{ version: string; min: string; outdated: boolean } | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const check = () => {
      void window.minipit?.sbxVersionCheck?.()
        .then((r) => { if (!cancelled && r?.known) setInfo(r) })
        .catch(() => {})
    }
    check()
    // The first probe can land before the daemon answers; re-check for a while
    // rather than showing nothing until the next app launch.
    const t = setInterval(check, 15_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  if (!info?.outdated || dismissed) return null
  return (
    <div className="rt-outdated">
      <AlertTriangle size={14} className="rt-outdated-ic" />
      <span className="rt-outdated-txt">
        This copy of den needs <strong>sbx {info.min}</strong> or newer — you have{' '}
        <code>{info.version}</code>. Kits, secrets and network rules will misbehave until it’s updated.
      </span>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => { setActivePage('settings'); setSettingsTarget({ tab: 'runtime', acc: 'runtime-runtime' }) }}
      >
        Update sbx <ArrowRight size={13} />
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => setDismissed(true)}>Later</button>
    </div>
  )
}
