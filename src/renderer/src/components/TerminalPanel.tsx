import { useEffect, useRef, useState } from 'react'
import { PanelRight, Info, Play } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import type { ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useStore } from '../store'
import { termTheme as resolveTermTheme } from '../lib/termThemes'
import type { Sandbox } from '../types'

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
}

// A real VT100 terminal (xterm.js) that handles full-screen TUIs like Claude Code.
function XTerm({ sandboxId, visible, theme, subscribe, onInput, onResize, onStart, onDispose, onDropFiles }: XTermProps) {
  const ref = useRef<HTMLDivElement>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "SF Mono", "DejaVu Sans Mono", monospace',
      fontSize: 12,
      lineHeight: 1.0,
      theme,
      allowProposedApi: true,
      scrollback: 5000
    })
    termRef.current = term
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(ref.current)
    fitRef.current = fit

    try { fit.fit() } catch { /* container not sized yet */ }
    onStart(term.cols, term.rows)
    if (visible) setTimeout(() => { try { term.focus() } catch { /* ignore */ } }, 0)

    const unsub = subscribe((data) => term.write(data))
    const dataDisp = term.onData(onInput)

    const ro = new ResizeObserver(() => {
      try { fit.fit() } catch { /* ignore */ }
      onResize(term.cols, term.rows)
    })
    ro.observe(ref.current)

    return () => {
      ro.disconnect()
      dataDisp.dispose()
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

  // Refit + focus when this tab becomes visible so keystrokes go to the
  // visible terminal (and not the hidden, still-mounted sibling).
  useEffect(() => {
    if (!visible) { termRef.current?.blur(); return }
    const t = setTimeout(() => {
      try { fitRef.current?.fit(); termRef.current?.focus() } catch { /* ignore */ }
    }, 0)
    return () => clearTimeout(t)
  }, [visible])

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

  // Clicking anywhere in the container (incl. padding) focuses the terminal.
  // The xterm mount (`ref`) is a dedicated inner div so xterm can own its DOM
  // while React owns the wrapper (overlay + drop handlers).
  return (
    <div
      onMouseDown={() => { if (visible) termRef.current?.focus() }}
      style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', height: '100%' }}
      {...dnd}
    >
      <div ref={ref} style={{ width: '100%', height: '100%', padding: '6px 8px' }} />
      {dragging && (
        <div className="term-drop">
          <span>Drop image to attach to the agent</span>
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
      subscribe={(write) => window.minipit?.onAgentOutput((name, data) => { if (name === sandbox.name) write(data) })}
      onInput={(data) => window.minipit?.agentWrite(sandbox.name, data)}
      onResize={(cols, rows) => window.minipit?.agentResize(sandbox.name, cols, rows)}
      onStart={(cols, rows) => window.minipit?.agentEnsure(sandbox.name, cols, rows)}
      onDropFiles={async (files) => {
        // Copy each image into the sandbox, then type its in-sandbox path into
        // the agent — TUIs like Claude Code take a file path, not raw bytes.
        for (const file of files) {
          if (!file.type.startsWith('image/')) continue
          const bytes = new Uint8Array(await file.arrayBuffer())
          const path = await window.minipit?.agentDropFile(sandbox.name, file.name, bytes)
          if (path) window.minipit?.agentWrite(sandbox.name, path + ' ')
        }
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

export function TerminalPanel({ sandbox, dock, onToggleFiles, onShowInfo, onStart }: {
  sandbox: Sandbox
  dock?: 'files' | 'info' | null
  onToggleFiles?: () => void
  onShowInfo?: () => void
  onStart?: () => void
}) {
  const [segment, setSegment] = useState<'agent' | 'shell'>('agent')
  const termThemeId = useStore((s) => s.termTheme)
  const appTheme = useStore((s) => s.theme)
  const theme = resolveTermTheme(termThemeId, appTheme).theme
  const bg = theme.background ?? '#0a0a0a'

  return (
    <div
      className="term"
      style={{ ['--tbg' as string]: bg, ['--tfg' as string]: theme.foreground ?? '#d4d4d4' }}
    >
      <div className="term-bar">
        <div className="term-seg">
          <div className={`term-seg-item${segment === 'agent' ? ' active' : ''}`} onClick={() => setSegment('agent')}>
            Agent
          </div>
          <div className={`term-seg-item${segment === 'shell' ? ' active' : ''}`} onClick={() => setSegment('shell')}>
            Shell
          </div>
        </div>
        <div className="term-right">
          {onShowInfo && (
            <button
              className={`term-files${dock === 'info' ? ' active' : ''}`}
              onClick={onShowInfo}
              title="Sandbox info"
            >
              <Info size={14} />
            </button>
          )}
          {onToggleFiles && (
            <button
              className={`term-files${dock === 'files' ? ' active' : ''}`}
              onClick={onToggleFiles}
              title={dock === 'files' ? 'Hide files' : 'Show files'}
            >
              <PanelRight size={14} />
              Files
            </button>
          )}
        </div>
      </div>

      {/*
        Keep both mounted (visibility, not display:none) so each terminal keeps
        its dimensions and session when switching segments.
      */}
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
  )
}
