import { useEffect, useRef, useState } from 'react'
import { ShieldAlert, AlertTriangle, X, ChevronDown, Check, Ban, Network, Box } from 'lucide-react'
import { useStore } from '../store'
import type { PolicyBlock, SandboxError } from '../types'

// Transient alerts for fresh network-policy denials, stacked bottom-right.
//
// Which sandbox was denied leads, because that's the part you can't infer: the
// host is in the agent's output but the sandbox name usually isn't on screen.
// It's a chip rather than a line of text so it reads as the thing it is — bare,
// it ran straight into the copy below and parsed as one sentence
// ("den-evolution tried to reach …"), which is exactly what it isn't.
// Two CTAs — go there, or decide the rule from here without leaving.
function Toast({ block }: { block: PolicyBlock }) {
  const {
    dismissToast, setActiveSandboxId, setActivePage, setPendingDock,
    dismissPolicyBlocks, notePolicyChange
  } = useStore()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'err'>('idle')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Hold the auto-dismiss while the menu is open — having the toast vanish
  // mid-decision would be the one moment it must not.
  useEffect(() => {
    if (menuOpen || state === 'busy') return
    const t = setTimeout(() => dismissToast(block), 12000)
    return () => clearTimeout(t)
  }, [menuOpen, state])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const goToSandbox = () => {
    setActiveSandboxId(block.sandbox)
    setActivePage('sandbox')
  }

  // Allow and Block are the same call shape with opposite verbs, so they share
  // one path — only the wording and the IPC differ.
  const decide = async (decision: 'allow' | 'block') => {
    setMenuOpen(false)
    setState('busy')
    const api = decision === 'allow' ? window.den?.policyAllow : window.den?.policyDeny
    const res = await api?.(block.sandbox, block.host).catch(() => null)
    setState(res?.ok ? 'done' : 'err')
    if (res?.ok) {
      // Same bookkeeping as deciding from the Network panel: the host is handled
      // (drop it from the panel's list) but inert until a restart (which the
      // panel's docked footer now asks for).
      notePolicyChange(block.sandbox, `${decision === 'allow' ? 'Allowed' : 'Blocked'} ${block.host}`)
      dismissPolicyBlocks(block.sandbox, block.host)
      setTimeout(() => dismissToast(block), 5000)
    }
  }

  // Open the sandbox with its Network panel already showing. Routed through the
  // store rather than the `den:toggle-dock` event, which toggles and is only
  // heard once SandboxDetail is mounted.
  const review = () => {
    setMenuOpen(false)
    setPendingDock('network')
    goToSandbox()
  }

  return (
    <div className="toast">
      <ShieldAlert size={16} className="toast-ic" />
      <div className="toast-main">
        <div className="toast-title">Network request blocked</div>
        <div className="toast-sbx">
          <Box size={12} />
          <span className="toast-sbx-name">{block.sandbox}</span>
        </div>
        <div className="toast-sub">
          Tried to reach <span className="toast-host">{block.host}</span>
        </div>
        {state === 'done' && <div className="toast-note ok">Rule added — not active until the sandbox restarts</div>}
        {state === 'err' && <div className="toast-note err">Couldn’t add rule</div>}
        {state !== 'done' && (
          <div className="toast-actions">
            <button className="btn btn-default btn-sm" onClick={goToSandbox}>Go to sandbox</button>
            {/* Split button: Allow is the common case and stays one click, with
                the alternatives a caret away. */}
            <div className="toast-split" ref={menuRef}>
              <button
                className="btn btn-sm toast-split-main"
                onClick={() => decide('allow')}
                disabled={state === 'busy'}
              >
                {state === 'busy' ? 'Working…' : 'Allow'}
              </button>
              <button
                className="btn btn-sm toast-split-caret"
                onClick={() => setMenuOpen((o) => !o)}
                disabled={state === 'busy'}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="More rule options"
              >
                <ChevronDown size={13} />
              </button>
              {menuOpen && (
                <div className="toast-menu" role="menu">
                  <button className="toast-menu-item" role="menuitem" onClick={() => decide('allow')}>
                    <Check size={13} /> Allow <span className="toast-menu-host">{block.host}</span>
                  </button>
                  <button className="toast-menu-item" role="menuitem" onClick={() => decide('block')}>
                    <Ban size={13} /> Block <span className="toast-menu-host">{block.host}</span>
                  </button>
                  <div className="toast-menu-sep" />
                  <button className="toast-menu-item" role="menuitem" onClick={review}>
                    <Network size={13} /> Review in Network panel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
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
