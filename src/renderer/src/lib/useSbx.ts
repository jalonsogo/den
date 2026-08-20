import { useEffect, useState } from 'react'

// What the installed runtime can do. den's floor is sbx 0.38; everything v0.39
// added is additive, so it's gated here rather than required — a 0.38 user keeps
// a working app and simply isn't shown what their runtime can't honour.
//
// Deliberately optimistic-free: `false` until the probe answers. The version
// read needs the daemon, and a runtime that's merely still starting shouldn't
// have its features hidden *and* shouldn't have them offered — so callers get
// `known` and can wait rather than flashing an affordance in or out.
export interface SbxCaps {
  known: boolean
  version: string
  /** sbx >= 0.39: prune, .sbxenv.yaml, dynamic secrets, kit signing. */
  hasEnvFiles: boolean
}

const EMPTY: SbxCaps = { known: false, version: '', hasEnvFiles: false }

export function useSbxCaps(): SbxCaps {
  const [caps, setCaps] = useState<SbxCaps>(EMPTY)
  useEffect(() => {
    let cancelled = false
    const check = () => {
      void window.minipit?.sbxVersionCheck?.()
        .then((r) => {
          if (cancelled || !r?.known) return
          setCaps({ known: true, version: r.version, hasEnvFiles: !!r.hasEnvFiles })
        })
        .catch(() => {})
    }
    check()
    // Same cadence as the outdated-runtime banner: the first probe can land
    // before the daemon answers, and an sbx updated from Settings should light
    // these up without relaunching den.
    const t = setInterval(check, 15_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])
  return caps
}
