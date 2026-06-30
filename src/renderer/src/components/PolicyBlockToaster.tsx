import { useEffect, useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'
import { useStore } from '../store'
import type { PolicyBlock } from '../types'

// Transient alerts for fresh network-policy denials, stacked bottom-right.
// Each offers a one-click Allow (adds the host to the policy) and a jump to the
// sandbox to manage it. Auto-dismisses so it never piles up.
function Toast({ block }: { block: PolicyBlock }) {
  const { dismissToast, setActiveSandboxId } = useStore()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'err'>('idle')

  useEffect(() => {
    const t = setTimeout(() => dismissToast(block), 12000)
    return () => clearTimeout(t)
  }, [])

  const allow = async () => {
    setState('busy')
    const res = await window.minipit?.policyAllow(block.sandbox, block.host).catch(() => null)
    setState(res?.ok ? 'done' : 'err')
    if (res?.ok) setTimeout(() => dismissToast(block), 3500)
  }

  return (
    <div className="toast">
      <ShieldAlert size={16} className="toast-ic" />
      <div className="toast-main">
        <div className="toast-title">Network request blocked</div>
        <div className="toast-sub">
          <strong>{block.sandbox}</strong> → {block.host}
        </div>
        {state === 'done' && <div className="toast-note ok">Allowed · restart the sandbox to apply</div>}
        {state === 'err' && <div className="toast-note err">Couldn’t add rule</div>}
        <div className="toast-actions">
          {state === 'idle' || state === 'busy' ? (
            <button className="btn btn-primary btn-sm" onClick={allow} disabled={state === 'busy'}>
              {state === 'busy' ? 'Allowing…' : `Allow ${block.host}`}
            </button>
          ) : (
            <button className="btn btn-default btn-sm" onClick={() => setActiveSandboxId(block.sandbox)}>
              Open sandbox
            </button>
          )}
        </div>
      </div>
      <button className="toast-x" onClick={() => dismissToast(block)} aria-label="Dismiss"><X size={13} /></button>
    </div>
  )
}

export function PolicyBlockToaster() {
  const toasts = useStore((s) => s.toasts)
  if (toasts.length === 0) return null
  return (
    <div className="toaster">
      {toasts.map((b) => <Toast key={`${b.sandbox}|${b.host}|${b.at}`} block={b} />)}
    </div>
  )
}
