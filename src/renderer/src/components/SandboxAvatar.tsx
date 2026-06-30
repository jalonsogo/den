import { AgentIcon } from './AgentIcon'
import { useStore } from '../store'
import type { Sandbox, AgentState } from '../types'

// Two-letter initials from a sandbox name (alnum word starts, then first char).
export function sandboxInitials(name: string): string {
  const parts = name.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  return (parts.slice(0, 2).map((p) => p[0]).join('') || name[0] || '?').toUpperCase()
}

// Project-tinted square with the sandbox's initials and a corner agent badge.
// Shared by the sidebar and the dashboard so sandboxes read the same everywhere.
export function SandboxAvatar({
  sandbox, size = 30, deleting = false, alert = false, activity = null
}: {
  sandbox: Sandbox
  size?: number
  deleting?: boolean
  alert?: boolean
  activity?: AgentState | null
}) {
  const projColor = useStore((s) => s.projectColors[sandbox.workspace])
  const style: React.CSSProperties = { width: size, height: size }
  if (projColor) {
    style.background = `color-mix(in srgb, ${projColor} 22%, transparent)`
    style.color = projColor
  }
  return (
    <div className="sbx-avatar" style={style}>
      {deleting
        ? <div className="sbx-avatar-spinner" />
        : <span className="sbx-avatar-txt">{sandboxInitials(sandbox.name)}</span>}
      <span className="sbx-avatar-badge"><AgentIcon agent={sandbox.agent} size={11} /></span>
      {alert && <span className="sbx-avatar-alert" title="Network requests blocked" />}
      {activity && (
        <span
          className={`sbx-avatar-activity ${activity}`}
          title={activity === 'working' ? 'Agent working…' : 'Waiting for you'}
        />
      )}
    </div>
  )
}
