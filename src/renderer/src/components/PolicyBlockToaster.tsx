import { useEffect, useState } from 'react'
import { ShieldAlert, AlertTriangle, X } from 'lucide-react'
import { useStore } from '../store'
import type { PolicyBlock, SandboxError } from '../types'

// Transient alerts for fresh network-policy denials, stacked bottom-right.
// Each offers a one-click Allow (adds the host to the policy) and a jump to the
// sandbox to manage it. Auto-dismisses so it never piles up.
function Toast({ block }: { block: PolicyBlock }) {
  const { dismissToast, setActiveSandboxId, dismissPolicyBlocks, notePolicyChange } = useStore()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'err'>('idle')

  useEffect(() => {
    const t = setTimeout(() => dismissToast(block), 12000)
    return () => clearTimeout(t)
  }, [])

  const allow = async () => {
    setState('busy')
    const res = await window.minipit?.policyAllow(block.sandbox, block.host).catch(() => null)
    setState(res?.ok ? 'done' : 'err')
    if (res?.ok) {
      // Same bookkeeping as allowing from the Network panel: the host is handled
      // (drop it from the panel's list) but inert until a restart (which the
      // panel's docked footer now asks for).
      notePolicyChange(block.sandbox, `Allowed ${block.host}`)
      dismissPolicyBlocks(block.sandbox, block.host)
      setTimeout(() => dismissToast(block), 5000)
    }
  }

  return (
    <div className="toast">
      <ShieldAlert size={16} className="toast-ic" />
      <div className="toast-main">
        <div className="toast-title">Network request blocked</div>
        <div className="toast-sub">
          <strong>{block.sandbox}</strong> → {block.host}
        </div>
        {state === 'done' && <div className="toast-note ok">Rule added — not active until the sandbox restarts</div>}
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

// A refused launch. Unlike the block toast this one doesn't auto-dismiss: the
// sandbox is left stopped and won't start until the cause is fixed, so the alert
// should survive until it's read. Opening the sandbox shows the full banner.
function StartErrorToast({ err }: { err: SandboxError }) {
  const { setActiveSandboxId, clearSandboxError } = useStore()
  return (
    <div className="toast">
      <AlertTriangle size={16} className="toast-ic" />
      <div className="toast-main">
        <div className="toast-title">
          {err.kind === 'workspace-missing' ? 'Workspace folder is missing' : 'Sandbox failed to start'}
        </div>
        <div className="toast-sub">
          <strong>{err.sandbox}</strong>
          {err.kind === 'workspace-missing' ? ` → ${err.path}` : ''}
        </div>
        <div className="toast-actions">
          <button className="btn btn-default btn-sm" onClick={() => setActiveSandboxId(err.sandbox)}>
            Open sandbox
          </button>
        </div>
      </div>
      <button className="toast-x" onClick={() => clearSandboxError(err.sandbox)} aria-label="Dismiss">
        <X size={13} />
      </button>
    </div>
  )
}

export function PolicyBlockToaster() {
  const toasts = useStore((s) => s.toasts)
  const errors = useStore((s) => s.sandboxErrors)
  const activeSandboxId = useStore((s) => s.activeSandboxId)
  const sandboxes = useStore((s) => s.sandboxes)
  // Don't double up: the sandbox you're looking at already shows the full banner.
  const activeName = sandboxes.find((s) => s.id === activeSandboxId)?.name
  const errList = Object.values(errors).filter((e) => e.sandbox !== activeName)
  if (toasts.length === 0 && errList.length === 0) return null
  return (
    <div className="toaster">
      {errList.map((e) => <StartErrorToast key={`${e.sandbox}|${e.at}`} err={e} />)}
      {toasts.map((b) => <Toast key={`${b.sandbox}|${b.host}|${b.at}`} block={b} />)}
    </div>
  )
}
