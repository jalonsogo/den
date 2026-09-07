import { useEffect, useState } from 'react'

// The installed runtime's version, read from the main process. den 0.11.0
// requires sbx 0.42+ outright (MIN_SBX_VERSION in src/main/index.ts) — there's
// no gated/additive surface left to report here, just whether the version has
// been read yet and what it is. The outdated-runtime banner (driven by the
// same `sbxVersionCheck` result's `outdated` field) is what actually blocks a
// too-old runtime; this hook is for anything that just wants to show the
// version or wait for it to be known.
export interface SbxCaps {
  known: boolean
  version: string
}

const EMPTY: SbxCaps = { known: false, version: '' }

export function useSbxCaps(): SbxCaps {
  const [caps, setCaps] = useState<SbxCaps>(EMPTY)
  useEffect(() => {
    let cancelled = false
    const check = () => {
      void window.den?.sbxVersionCheck?.()
        .then((r) => {
          if (cancelled || !r?.known) return
          setCaps({ known: true, version: r.version })
        })
        .catch(() => {})
    }
    check()
    // Same cadence as the outdated-runtime banner: the first probe can land
    // before the daemon answers, and an sbx updated from Settings should
    // reflect the new version without relaunching den.
    const t = setInterval(check, 15_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])
  return caps
}
