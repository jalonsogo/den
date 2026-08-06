import type { ReactNode } from 'react'

export interface EmptyFeature {
  icon: ReactNode
  title: string
  sub: string
}

// The welcome screen a library page shows when it has nothing to list: the same
// shape as den's own first-run dashboard — mark, eyebrow, one sentence on what
// the thing is for, a single call to action, and three boxes covering what it
// buys you. Shared rather than copied per page so they can't drift apart.
//
// The parent must be a flex column (`.page-body-center`) for this to centre —
// `.home-empty` sizes itself with `flex: 1`, which a plain block ignores.
export function EmptyState({ icon, eyebrow, title, sub, actions, features }: {
  icon: ReactNode
  eyebrow?: ReactNode
  title: string
  sub: ReactNode
  actions?: ReactNode
  features?: EmptyFeature[]
}) {
  return (
    <div className="home-empty">
      <span className="empty-mark">{icon}</span>
      {eyebrow && <span className="home-empty-eyebrow">{eyebrow}</span>}
      <h1 className="home-empty-title">{title}</h1>
      <p className="home-empty-sub">{sub}</p>
      {actions && <div className="home-empty-actions">{actions}</div>}
      {features && features.length > 0 && (
        <div className="home-empty-features">
          {features.map((f) => (
            <div className="home-empty-feat" key={f.title}>
              <span className="home-empty-feat-ic">{f.icon}</span>
              <span className="home-empty-feat-title">{f.title}</span>
              <span className="home-empty-feat-sub">{f.sub}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
