import { useEffect, useRef, useState } from 'react'
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
}

// A real VT100 terminal (xterm.js) that handles full-screen TUIs like Claude Code.
function XTerm({ sandboxId, visible, theme, subscribe, onInput, onResize, onStart, onDispose }: XTermProps) {
  const ref = useRef<HTMLDivElement>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const termRef = useRef<Terminal | null>(null)

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

  // Refit + focus when this tab becomes visible.
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => { try { fitRef.current?.fit() } catch { /* ignore */ } }, 0)
    return () => clearTimeout(t)
  }, [visible])

  return <div ref={ref} style={{ flex: 1, minHeight: 0, width: '100%', height: '100%', padding: '6px 8px' }} />
}

// ── Agent tab ─────────────────────────────────────────────────────────────

function AgentTerminal({ sandbox, visible, theme }: { sandbox: Sandbox; visible: boolean; theme: ITheme }) {
  if (sandbox.status !== 'running') {
    return (
      <div style={{
        flex: 1, background: '#0a0a0a', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.2)', fontSize: 12
      }}>
        Start the sandbox to launch the agent.
      </div>
    )
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
    />
  )
}

// ── Shell tab ─────────────────────────────────────────────────────────────

function ShellTerminal({ sandbox, visible, theme }: { sandbox: Sandbox; visible: boolean; theme: ITheme }) {
  if (sandbox.status !== 'running') {
    return (
      <div style={{
        flex: 1, background: '#0a0a0a', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.2)', fontSize: 12
      }}>
        Start the sandbox to open a shell.
      </div>
    )
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

export function TerminalPanel({ sandbox }: { sandbox: Sandbox }) {
  const [segment, setSegment] = useState<'agent' | 'shell'>('agent')
  const termThemeId = useStore((s) => s.termTheme)
  const theme = resolveTermTheme(termThemeId).theme

  return (
    <div className="term">
      <div className="term-bar">
        <div className="term-seg">
          <div className={`term-seg-item${segment === 'agent' ? ' active' : ''}`} onClick={() => setSegment('agent')}>
            Agent
          </div>
          <div className={`term-seg-item${segment === 'shell' ? ' active' : ''}`} onClick={() => setSegment('shell')}>
            Shell
          </div>
        </div>
      </div>

      {/*
        Keep both mounted (visibility, not display:none) so each terminal keeps
        its dimensions and session when switching segments.
      */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: '#0a0a0a',
        visibility: segment === 'agent' ? 'visible' : 'hidden',
        pointerEvents: segment === 'agent' ? 'auto' : 'none',
        position: segment === 'agent' ? 'relative' : 'absolute',
        inset: segment === 'agent' ? undefined : 0
      }}>
        <AgentTerminal sandbox={sandbox} visible={segment === 'agent'} theme={theme} />
      </div>

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: '#0a0a0a',
        visibility: segment === 'shell' ? 'visible' : 'hidden',
        pointerEvents: segment === 'shell' ? 'auto' : 'none',
        position: segment === 'shell' ? 'relative' : 'absolute',
        inset: segment === 'shell' ? undefined : 0
      }}>
        <ShellTerminal sandbox={sandbox} visible={segment === 'shell'} theme={theme} />
      </div>
    </div>
  )
}
