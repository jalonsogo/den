import { useStore } from '../store'
import type { Sandbox } from '../types'

// Claude Code's own statusline reading (context/tokens/cost) — same data the
// terminal's status bar shows, in its own dock so it isn't buried in Info.
// Only Claude Code emits this (see den's injected `statusLine` hook in
// main/index.ts), so this stays empty until the first payload arrives.
export function StatsPanel({ sandbox }: { sandbox: Sandbox }) {
  const status = useStore((s) => s.agentStatus[sandbox.name])

  return (
    <div className="info-dock">
      <div className="info-dock-hd">
        <span className="info-dock-title">Stats</span>
      </div>
      <div className="info-panel">
        {status ? (
          <div className="info-stats" style={{ margin: 0 }}>
            <div className="info-stat">
              <span className="is-k">Input tokens</span>
              <span className="is-v">{status.inputTokens?.toLocaleString() ?? '—'}</span>
            </div>
            <div className="info-stat">
              <span className="is-k">Output tokens</span>
              <span className="is-v">{status.outputTokens?.toLocaleString() ?? '—'}</span>
            </div>
            <div className="info-stat">
              <span className="is-k">Cache creation tokens</span>
              <span className="is-v">{status.cacheCreationInputTokens?.toLocaleString() ?? '—'}</span>
            </div>
            <div className="info-stat">
              <span className="is-k">Cache read tokens</span>
              <span className="is-v">{status.cacheReadInputTokens?.toLocaleString() ?? '—'}</span>
            </div>
            <div className="info-stat">
              <span className="is-k">Cost</span>
              <span className="is-v">{status.costUsd != null ? `$${status.costUsd.toFixed(2)}` : '—'}</span>
            </div>
          </div>
        ) : (
          <div className="np-empty">No stats yet — waiting on Claude Code's statusline.</div>
        )}
      </div>
    </div>
  )
}
