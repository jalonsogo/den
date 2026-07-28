import { useEffect, useRef, useState, useCallback } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Folder, Info, Play, AlertTriangle, Network, SquareTerminal, GitCompare } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import type { ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { useStore, unackedBlockCount } from '../store'
import { termTheme as resolveTermTheme } from '../lib/termThemes'
import { AgentIcon } from './AgentIcon'
import { AGENTS, type Sandbox } from '../types'

interface XTermProps {
  sandboxId: string
  visible: boolean
  theme: ITheme
  // Subscribe to live output; return an unsubscribe fn. `write` feeds the terminal.
  subscribe: (write: (data: string) => void) => (() => void) | undefined
  onInput: (data: string) => void
  onResize: (cols: number, rows: number) => void
  // Called once after the first fit with the real size (start/attach the session).
  onStart: (cols: number, rows: number) => void
  onDispose?: () => void
  // If provided, the terminal accepts dropped files (e.g. images for the agent).
  onDropFiles?: (files: File[]) => void
  // When true, Shift+Enter inserts a newline (ESC+CR) instead of submitting.
  shiftEnterNewline?: boolean
}

// GPU (WebGL) rendering toggle, OFF by default. The WebGL renderer intermittently
// leaves the terminal blank/partially-painted until a resize forces a full
// repaint — a known issue with hidden/shown/remounted GPU canvases, which den
// does constantly (tab + segment switches). The DOM renderer repaints reliably
// on refresh, and the GPU gain is marginal for a chat-style TUI. Flip to true to
// re-enable (would need per-visibility clearTextureAtlas/refresh handling first).
const ENABLE_WEBGL = false

// A real VT100 terminal (xterm.js) that handles full-screen TUIs like Claude Code.
function XTerm({ sandboxId, visible, theme, subscribe, onInput, onResize, onStart, onDispose, onDropFiles, shiftEnterNewline }: XTermProps) {
  const ref = useRef<HTMLDivElement>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const termRef = useRef<Terminal | null>(null)
  // Size last pushed to the PTY, shared so the visibility effect can tell whether
  // it needs to resync the backend (a hidden tab is laid out at a different size
  // than the visible one — see the visibility effect below).
  const sentColsRef = useRef(0)
  const sentRowsRef = useRef(0)
  // onResize identity changes each render; keep it in a ref so forceRedraw can be
  // a stable callback (otherwise effects depending on it would re-fire endlessly).
  const onResizeRef = useRef(onResize)
  onResizeRef.current = onResize
  // onInput likewise changes identity each render; the context-menu callbacks
  // read it through a ref so they don't need to be rebuilt on every render.
  const onInputRef = useRef(onInput)
  onInputRef.current = onInput
  const [dragging, setDragging] = useState(false)
  // Right-click menu: null when closed, else where to anchor it and whether
  // there's a selection to copy. Positioned relative to the container.
  const [menu, setMenu] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null)

  const copySelection = useCallback(() => {
    const sel = termRef.current?.getSelection()
    if (sel) navigator.clipboard?.writeText(sel).catch(() => {})
  }, [])

  const pasteClipboard = useCallback(() => {
    navigator.clipboard?.readText().then((t) => { if (t) onInputRef.current(t) }).catch(() => {})
  }, [])

  // Force the attached agent to repaint. Refit, then push the size to the PTY:
  // if it changed that's a real SIGWINCH (the TUI redraws); if it's unchanged —
  // e.g. a fresh terminal after a sandbox switch reattaching to a running agent,
  // where the grid matches but our buffer is empty — do a brief resize round-trip
  // so the agent still redraws its full frame. This is the redraw "toggling a
  // side panel" used to trigger, now done deliberately.
  const forceRedraw = useCallback(() => {
    const term = termRef.current
    const fit = fitRef.current
    if (!term || !fit) return
    try {
      fit.fit()
      if (term.rows <= 0) return
      const resize = onResizeRef.current
      if (term.cols !== sentColsRef.current || term.rows !== sentRowsRef.current) {
        sentColsRef.current = term.cols; sentRowsRef.current = term.rows
        resize(term.cols, term.rows)
      } else {
        resize(term.cols, Math.max(1, term.rows - 1))
        requestAnimationFrame(() => { try { resize(term.cols, term.rows) } catch { /* ignore */ } })
      }
      term.refresh(0, term.rows - 1)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!ref.current) return
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "SF Mono", "DejaVu Sans Mono", monospace',
      fontSize: 12,
      lineHeight: 1.0,
      theme,
      allowProposedApi: true,
      scrollback: 5000,
      // Rescue floor for text that would otherwise be unreadable: any foreground
      // under 3:1 against the background it's actually drawn on — cell background,
      // or the selection block over it — gets nudged until it clears. Catches a
      // TUI whose palette assumes the opposite polarity (Claude Code painting its
      // dark theme's near-white text into a light terminal, `ls`'s dark blue on
      // black) and low-contrast pairs inside a selection.
      //
      // Deliberately 3 rather than WCAG-AA 4.5: at 4.5 this stops being a rescue
      // and starts rewriting palettes, pushing every dim-by-design grey (ANSI 0,
      // Dracula's comment grey, Solarized's base01) into mid-grey. den's own
      // themes are tuned to clear 3:1 unselected, so nothing there is adjusted at
      // all; only genuinely invisible combinations get touched. Dim cells need
      // half the ratio, so dim text still reads as dim.
      minimumContrastRatio: 3,
      // Needed by the force-select interceptor below: on macOS xterm only lets
      // the emulator take a drag away from a mouse-tracking TUI when Option is
      // held AND this option is on (it defaults to off). altClickMovesCursor is
      // turned off so the Option press we synthesize can never be mistaken for
      // an alt-click, which would send cursor-movement keys to the agent.
      macOptionClickForcesSelection: true,
      altClickMovesCursor: false
    })
    termRef.current = term
    const fit = new FitAddon()
    term.loadAddon(fit)
    // Make URLs printed by the agent (e.g. PR/auth links) clickable. xterm
    // doesn't linkify by default, and the agent runs inside a headless sandbox
    // that has no browser — so route the click to the host via openPath, which
    // opens http(s) URLs in the Mac's default browser (scheme-checked in main).
    term.loadAddon(new WebLinksAddon((_event, uri) => { window.minipit?.openPath(uri) }))
    term.open(ref.current)
    fitRef.current = fit

    // GPU-accelerated rendering. Much cheaper redraws than the default DOM
    // renderer, which matters for a full-screen TUI that repaints often. The
    // WebGL context can be lost (GPU reset, tab backgrounded, driver hiccup);
    // when that happens the addon emits onContextLoss — dispose it so xterm
    // falls back to its DOM renderer instead of freezing on a dead canvas.
    if (ENABLE_WEBGL) {
      try {
        const webgl = new WebglAddon()
        webgl.onContextLoss(() => { try { webgl.dispose() } catch { /* ignore */ } })
        term.loadAddon(webgl)
      } catch { /* WebGL unavailable — xterm keeps its DOM renderer */ }
    }

    // Fit to the container and force a repaint. xterm's canvas can render blank
    // if it was sized before layout settled (navigation, font load, dock width),
    // so refit across a couple of frames + a delayed fallback — otherwise the
    // screen stays empty until some resize (e.g. toggling a dock) forces a fit.
    let disposed = false
    // Set once the agent writes anything, so the reattach nudges below can stop
    // pestering a terminal that has already painted.
    let gotData = false
    const refit = () => {
      try {
        fit.fit()
        if (term.rows > 0) term.refresh(0, term.rows - 1)
      } catch { /* container not sized yet */ }
    }

    // Track the size last pushed to the PTY. A full-screen TUI (Claude Code)
    // only repaints on a real SIGWINCH, so if the agent attaches before layout
    // and fonts settle it can sit blank until something resizes it — the
    // "toggle a panel to fix the white screen" symptom. Once the grid settles we
    // push the corrected size, which makes the agent redraw on its own.
    const syncSize = () => {
      if (disposed) return
      if (term.cols !== sentColsRef.current || term.rows !== sentRowsRef.current) {
        sentColsRef.current = term.cols; sentRowsRef.current = term.rows
        onResize(term.cols, term.rows)
      }
    }
    const kick = () => { if (disposed) return; refit(); syncSize() }

    refit()
    sentColsRef.current = term.cols; sentRowsRef.current = term.rows
    // Subscribe to output BEFORE attaching the session, so we never miss the
    // first frame or the reattach replay (main emits it during agent-ensure).
    const unsub = subscribe((data) => { gotData = true; term.write(data) })
    const dataDisp = term.onData(onInput)
    onStart(term.cols, term.rows)
    requestAnimationFrame(() => { kick(); requestAnimationFrame(kick) })
    // A fresh terminal reattaching to an already-running agent starts empty and
    // only fills when the agent redraws in response to our resize nudge. A BUSY
    // agent (mid-response — worst on the actively-working sandbox) may defer that
    // first SIGWINCH, leaving the view blank until another resize lands: the
    // "white until I toggle a dock" symptom. So re-nudge on a schedule until the
    // agent actually paints something (gotData), then stop.
    const settleTimers = [150, 500, 1200, 2500, 4000].map((ms) =>
      setTimeout(() => { if (!disposed && !gotData) forceRedraw() }, ms)
    )
    // Monospace metrics are sometimes measured before the web font loads, giving
    // a mis-sized (occasionally blank) grid; refit + redraw once fonts are ready.
    document.fonts?.ready?.then(() => { if (!disposed) forceRedraw() }).catch(() => {})
    if (visible) setTimeout(() => { try { term.focus() } catch { /* ignore */ } }, 0)

    // xterm draws its selection on a canvas, not as a DOM selection, so the
    // browser/menu copy machinery can't see it. Intercept the 'copy' event
    // (fired by Cmd+C and the Edit ▸ Copy menu role) and fill the clipboard
    // from xterm's own selection. Without this the menu copy role would copy
    // the empty DOM selection and clobber whatever was on the clipboard.
    const el = ref.current
    const onCopy = (ev: ClipboardEvent) => {
      const sel = term.getSelection()
      if (!sel) return
      ev.clipboardData?.setData('text/plain', sel)
      ev.preventDefault()
    }
    el.addEventListener('copy', onCopy)

    // Let a plain left-drag select text even while the agent has mouse tracking
    // on. With tracking on, xterm reports the button to the PTY and its
    // SelectionService stays disabled unless shouldForceSelection() is true —
    // Option on macOS (and only with macOptionClickForcesSelection), Shift
    // elsewhere. So a plain drag never selected anything here: the highlight you
    // saw was the TUI painting its own (unthemed, dark-on-dark in light themes),
    // while getSelection() still held whatever stale selection was made before
    // the agent grabbed the mouse — which is what Copy then pasted.
    //
    // Swallow the plain press and re-dispatch it as the force-select chord: the
    // emulator selects (themed, and getSelection() matches the highlight exactly)
    // and doesn't report the button to the PTY. Its own document mousemove/mouseup
    // listeners then drive the rest of the drag, so click-count gestures
    // (double = word, triple = line) keep working via `detail`. Modified clicks
    // are left alone, so Cmd+click still reaches the TUI.
    const forceSelectKey = /Mac/i.test(navigator.userAgent) ? 'altKey' : 'shiftKey'
    let synthesizing = false
    const onMouseDownCapture = (e: MouseEvent) => {
      if (synthesizing || e.button !== 0) return
      if (e.altKey || e.shiftKey || e.metaKey || e.ctrlKey) return
      // Tracking off (shell, or an agent that hasn't enabled it): xterm already
      // owns the drag, and forcing here would break Shift-click range-extend.
      if (term.modes.mouseTrackingMode === 'none') return
      e.preventDefault()
      e.stopPropagation()
      synthesizing = true
      try {
        e.target?.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true, cancelable: true, view: window,
          clientX: e.clientX, clientY: e.clientY,
          screenX: e.screenX, screenY: e.screenY,
          button: e.button, buttons: e.buttons, detail: e.detail,
          [forceSelectKey]: true
        }))
      } finally {
        synthesizing = false
      }
    }
    el.addEventListener('mousedown', onMouseDownCapture, true)

    // Ctrl+Shift+C → copy the selection (Windows/Linux, where a bare Ctrl+C must
    // stay SIGINT for the shell/agent). macOS Cmd+C is handled by the DOM 'copy'
    // listener above instead, so it cooperates with the Edit ▸ Copy menu role.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown' && e.code === 'KeyC' && e.ctrlKey && e.shiftKey
          && !e.metaKey && !e.altKey && term.hasSelection()) {
        const sel = term.getSelection()
        if (sel) navigator.clipboard?.writeText(sel).catch(() => {})
        return false
      }
      // Cmd/Ctrl+Shift+V → paste from the clipboard into the PTY (a reliable
      // in-terminal paste that doesn't depend on the menu reaching xterm).
      if (e.type === 'keydown' && (e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyV') {
        navigator.clipboard?.readText().then((t) => { if (t) onInput(t) }).catch(() => {})
        return false
      }
      // Shift+Enter: insert a newline instead of submitting. The encoding
      // depends on the agent's keyboard mode. Claude Code turns on the Kitty
      // keyboard protocol (CSI > 1 u), under which modified Enter must be sent
      // as CSI-u: `CSI 13 ; 2 u` (13 = Enter, 2 = Shift). In legacy mode neither
      // \r nor \n works (both submit), so we fall back to \n (== Ctrl+J newline)
      // for agents that don't enable the protocol.
      if (shiftEnterNewline && e.key === 'Enter' && e.shiftKey
          && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Send ESC+CR — identical to Alt/Option+Enter, which the agent treats as
        // a literal newline (verified in-app). Emit once, on keydown, and return
        // false for EVERY event type of this chord (keydown/keypress/keyup):
        // otherwise xterm's keypress handler turns Enter's charCode (13) into a
        // bare CR and the agent submits despite the newline we just sent.
        if (e.type === 'keydown') onInput('\x1b\r')
        return false
      }
      return true
    })

    const ro = new ResizeObserver(() => { kick() })
    ro.observe(ref.current)

    return () => {
      disposed = true
      settleTimers.forEach(clearTimeout)
      ro.disconnect()
      dataDisp.dispose()
      el.removeEventListener('copy', onCopy)
      el.removeEventListener('mousedown', onMouseDownCapture, true)
      unsub?.()
      term.dispose()
      onDispose?.()
    }
    // Re-create the terminal when the sandbox changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandboxId])

  // Apply theme changes live to the existing terminal.
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = theme
  }, [theme])

  // Force a repaint when this tab becomes visible (the inactive tab is laid out
  // at a different size than the active one, so the agent's last frame won't match
  // the now-visible grid) and refocus it.
  useEffect(() => {
    if (!visible) { termRef.current?.blur(); return }
    const raf = requestAnimationFrame(() => {
      forceRedraw()
      try { termRef.current?.focus() } catch { /* ignore */ }
    })
    // The terminal's canvas can be blanked while the window is backgrounded or
    // occluded — you return to a white screen that only a resize repaints (the
    // old "toggle a dock to fix it"). Repaint when the window is refocused or the
    // page becomes visible again. Only while this segment is the visible one.
    const repaint = () => { if (!document.hidden) forceRedraw() }
    window.addEventListener('focus', repaint)
    document.addEventListener('visibilitychange', repaint)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('focus', repaint)
      document.removeEventListener('visibilitychange', repaint)
    }
  }, [visible, forceRedraw])

  // Dismiss the right-click menu on Escape or when the window loses focus.
  // (Outside clicks are handled by the container's onMouseDown.)
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    const close = () => setMenu(null)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  // A drop only fires if dragover is preventDefault'd — otherwise Electron's
  // default file-open kicks in and the drop never reaches us.
  const dnd = onDropFiles
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (![...e.dataTransfer.types].includes('Files')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          if (!dragging) setDragging(true)
        },
        onDragLeave: (e: React.DragEvent) => {
          // Ignore leaves into child nodes; only clear when leaving the container.
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          setDragging(false)
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault()
          setDragging(false)
          const files = [...e.dataTransfer.files]
          if (files.length) onDropFiles(files)
        }
      }
    : {}

  // Right-click opens Copy/Paste over the selection a drag just made (see the
  // force-select interceptor above). contextmenu still bubbles to us even when
  // xterm forwards the mouse button to the PTY.
  const onContextMenu = (e: React.MouseEvent) => {
    if (!visible) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    // Clamp so the ~150×80 menu stays inside the terminal container.
    const x = Math.min(e.clientX - rect.left, rect.width - 150)
    const y = Math.min(e.clientY - rect.top, rect.height - 80)
    setMenu({ x: Math.max(0, x), y: Math.max(0, y), hasSelection: !!termRef.current?.hasSelection() })
  }

  // Clicking anywhere in the container (incl. padding) focuses the terminal.
  // The xterm mount (`ref`) is a dedicated inner div so xterm can own its DOM
  // while React owns the wrapper (overlay + drop handlers).
  return (
    <div
      onMouseDown={(e) => {
        // A left/middle click dismisses an open menu; right-click is handled by
        // onContextMenu. Focus the terminal (unless the click is on the menu).
        if (menu && e.button !== 2) setMenu(null)
        if (visible) termRef.current?.focus()
      }}
      onContextMenu={onContextMenu}
      style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', height: '100%' }}
      {...dnd}
    >
      <div ref={ref} style={{ width: '100%', height: '100%', padding: '6px 8px' }} />
      {dragging && (
        <div className="term-drop">
          <span>Drop files to attach to the agent</span>
        </div>
      )}
      {menu && (
        <div
          className="term-ctx"
          style={{ position: 'absolute', top: menu.y, left: menu.x }}
          // Keep the terminal's selection alive: don't let a mousedown in the
          // menu move focus/clear the canvas selection before Copy runs.
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            className="term-ctx-item"
            disabled={!menu.hasSelection}
            onClick={() => { copySelection(); setMenu(null) }}
          >
            Copy
          </button>
          <button
            className="term-ctx-item"
            onClick={() => { pasteClipboard(); setMenu(null) }}
          >
            Paste
          </button>
        </div>
      )}
    </div>
  )
}

// Placeholder with an inline Start button (so you don't reach for the header).
function StoppedView({ theme, label, status, onStart }: { theme: ITheme; label: string; status: string; onStart?: () => void }) {
  const busy = status !== 'stopped'
  return (
    <div style={{
      flex: 1, background: theme.background, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16
    }}>
      <span style={{ color: theme.foreground, opacity: 0.4, fontSize: 12 }}>{label}</span>
      {onStart && (
        <button className="btn btn-primary btn-sm" onClick={onStart} disabled={busy}>
          <Play size={11} fill="currentColor" strokeWidth={0} />
          {status === 'starting' ? 'Starting…' : 'Start sandbox'}
        </button>
      )}
    </div>
  )
}

// ── Agent tab ─────────────────────────────────────────────────────────────

function AgentTerminal({ sandbox, visible, theme, onStart }: { sandbox: Sandbox; visible: boolean; theme: ITheme; onStart?: () => void }) {
  if (sandbox.status !== 'running') {
    return <StoppedView theme={theme} label="Start the sandbox to launch the agent." status={sandbox.status} onStart={onStart} />
  }
  return (
    <XTerm
      sandboxId={sandbox.id}
      visible={visible}
      theme={theme}
      shiftEnterNewline
      subscribe={(write) => window.minipit?.onAgentOutput((name, data) => { if (name === sandbox.name) write(data) })}
      onInput={(data) => window.minipit?.agentWrite(sandbox.name, data)}
      onResize={(cols, rows) => window.minipit?.agentResize(sandbox.name, cols, rows)}
      onStart={(cols, rows) => window.minipit?.agentEnsure(sandbox.name, cols, rows)}
      onDropFiles={async (files) => {
        // Copy each dropped file into the sandbox, then type its in-sandbox path
        // into the agent — TUIs like Claude Code take a file path, not raw bytes.
        // Any file type works (images, PDFs, docs, spreadsheets, text, …); the
        // agent decides how to read it. Skip directories (no type, zero size).
        const paths: string[] = []
        for (const file of files) {
          if (!file.type && file.size === 0) continue
          const bytes = new Uint8Array(await file.arrayBuffer())
          const path = await window.minipit?.agentDropFile(sandbox.name, file.name, bytes)
          if (path) paths.push(path)
        }
        // One write with space-separated paths so multiple files land as args.
        if (paths.length) window.minipit?.agentWrite(sandbox.name, paths.join(' ') + ' ')
      }}
    />
  )
}

// ── Shell tab ─────────────────────────────────────────────────────────────

function ShellTerminal({ sandbox, visible, theme, onStart }: { sandbox: Sandbox; visible: boolean; theme: ITheme; onStart?: () => void }) {
  if (sandbox.status !== 'running') {
    return <StoppedView theme={theme} label="Start the sandbox to open a shell." status={sandbox.status} onStart={onStart} />
  }
  return (
    <XTerm
      sandboxId={sandbox.id}
      visible={visible}
      theme={theme}
      subscribe={(write) => window.minipit?.onPtyOutput((name, data) => { if (name === sandbox.name) write(data) })}
      onInput={(data) => window.minipit?.ptyWrite(sandbox.name, data)}
      onResize={(cols, rows) => window.minipit?.ptyResize(sandbox.name, cols, rows)}
      onStart={(cols, rows) => window.minipit?.ptyStart(sandbox.name, cols, rows)}
      onDispose={() => window.minipit?.ptyStop(sandbox.name)}
    />
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────

export function TerminalPanel({ sandbox, dock, filesTab, onToggleFiles, onShowInfo, onShowNetwork, onShowChanges, onStart }: {
  sandbox: Sandbox
  dock?: 'files' | 'info' | 'network' | null
  // Which sub-tab the Files dock is showing — lets the rail highlight Files vs
  // Changes distinctly even though both open the same dock.
  filesTab?: 'files' | 'changes'
  onToggleFiles?: () => void
  onShowInfo?: () => void
  onShowNetwork?: () => void
  onShowChanges?: () => void
  onStart?: () => void
}) {
  const [segment, setSegment] = useState<'agent' | 'shell'>('agent')
  const termThemeId = useStore((s) => s.termTheme)
  const appTheme = useStore((s) => s.theme)
  const theme = resolveTermTheme(termThemeId, appTheme).theme
  const bg = theme.background ?? '#0a0a0a'
  // Pending (unacknowledged) network-policy denials for this sandbox — surfaced
  // as a red warning in the rail, which opens Network (clearing the badge).
  const hasBlocks = useStore((s) => unackedBlockCount(s.policyBlocks, s.blocksSeenAt, sandbox.name) > 0)
  // Uncommitted-change count for the Changes rail badge.
  const changeCount = useStore((s) => s.sandboxChanges[sandbox.name] ?? 0)
  const filesActive = dock === 'files' && filesTab !== 'changes'
  const changesActive = dock === 'files' && filesTab === 'changes'
  const agentLabel = AGENTS.find((a) => a.id === sandbox.agent)?.label ?? sandbox.agent

  // Styled hover preview for a rail icon (the rail hides text labels, so the
  // tooltip carries the name + a one-line description). Left side, since the
  // rail sits against the right edge.
  const tip = (title: string, sub: string, node: React.ReactElement) => (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{node}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="term-tip" side="left" sideOffset={9}>
          <span className="term-tip-title">{title}</span>
          <span className="term-tip-sub">{sub}</span>
          <Tooltip.Arrow className="sb-tip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )

  return (
    <div
      className="term"
      style={{ ['--tbg' as string]: bg, ['--tfg' as string]: theme.foreground ?? '#d4d4d4' }}
    >
      {/* Terminal content column. Keep both terminals mounted (visibility, not
          display:none) so each keeps its dimensions and session when switching. */}
      <div className="term-main">
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: bg,
          visibility: segment === 'agent' ? 'visible' : 'hidden',
          pointerEvents: segment === 'agent' ? 'auto' : 'none',
          position: segment === 'agent' ? 'relative' : 'absolute',
          inset: segment === 'agent' ? undefined : 0
        }}>
          <AgentTerminal sandbox={sandbox} visible={segment === 'agent'} theme={theme} onStart={onStart} />
        </div>

        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: bg,
          visibility: segment === 'shell' ? 'visible' : 'hidden',
          pointerEvents: segment === 'shell' ? 'auto' : 'none',
          position: segment === 'shell' ? 'relative' : 'absolute',
          inset: segment === 'shell' ? undefined : 0
        }}>
          <ShellTerminal sandbox={sandbox} visible={segment === 'shell'} theme={theme} onStart={onStart} />
        </div>
      </div>

      {/* Vertical activity rail: the terminal switch (Agent / Shell) on top, then
          the docked panels (Info / Network / Files / Changes) below a separator —
          what the pane shows, then what opens beside it. Hover previews carry the
          labels the rail itself hides. */}
      <Tooltip.Provider delayDuration={300} skipDelayDuration={500}>
        <div className="term-rail">
          {tip(agentLabel, 'Agent terminal',
            <button
              className={`term-rail-btn${segment === 'agent' ? ' active' : ''}`}
              onClick={() => setSegment('agent')}
            >
              <AgentIcon agent={sandbox.agent} size={17} mono />
            </button>
          )}

          {tip('Shell', 'Interactive shell in the sandbox',
            <button
              className={`term-rail-btn${segment === 'shell' ? ' active' : ''}`}
              onClick={() => setSegment('shell')}
            >
              <SquareTerminal size={17} />
            </button>
          )}

          <div className="term-rail-sep" />

          {/* Grouped with the panels rather than the terminal switch: it opens the
              Network dock, same as the icon two rows down. */}
          {hasBlocks && onShowNetwork && tip('Network blocked', 'Requests were denied — view details',
            <button
              className="term-rail-btn warn"
              onClick={onShowNetwork}
            >
              <AlertTriangle size={16} />
            </button>
          )}

          {onShowInfo && tip('Info', 'Status, workspaces, kits & secrets',
            <button
              className={`term-rail-btn${dock === 'info' ? ' active' : ''}`}
              onClick={onShowInfo}
            >
              <Info size={17} />
            </button>
          )}
          {onShowNetwork && tip('Network', 'Ports & network policy',
            <button
              className={`term-rail-btn${dock === 'network' ? ' active' : ''}`}
              onClick={onShowNetwork}
            >
              <Network size={17} />
            </button>
          )}
          {onToggleFiles && tip('Files', filesActive ? 'Hide the file browser' : 'Browse the workspace',
            <button
              className={`term-rail-btn${filesActive ? ' active' : ''}`}
              onClick={onToggleFiles}
            >
              <Folder size={17} />
            </button>
          )}
          {onShowChanges && tip('Changes', changeCount > 0 ? `Review & merge · ${changeCount} changed` : 'Review & merge',
            <button
              className={`term-rail-btn${changesActive ? ' active' : ''}`}
              onClick={onShowChanges}
            >
              <GitCompare size={17} />
              {changeCount > 0 && <span className="term-rail-badge">{changeCount > 99 ? '99+' : changeCount}</span>}
            </button>
          )}
        </div>
      </Tooltip.Provider>
    </div>
  )
}
