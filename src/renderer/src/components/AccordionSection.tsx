import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'

// Collapsible section with a badge that stays visible when collapsed (so
// attention items like network blocks aren't hidden). Open state persists.
export function AccordionSection({ id, title, badge, alert = false, defaultOpen = false, children }: {
  id: string
  title: string
  badge?: React.ReactNode
  alert?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const key = `minipit:info-acc:${id}`
  const [open, setOpen] = useState(() => {
    const v = localStorage.getItem(key)
    return v === null ? defaultOpen : v === '1'
  })
  const toggle = () => { const n = !open; setOpen(n); localStorage.setItem(key, n ? '1' : '0') }
  return (
    <div className={`info-acc${open ? ' open' : ''}`}>
      <button className="info-acc-hd" onClick={toggle}>
        {open ? <ChevronDown size={14} className="info-acc-chev" /> : <ChevronRight size={14} className="info-acc-chev" />}
        <span className="info-acc-title">{title}</span>
        {badge != null && <span className={`info-acc-badge${alert ? ' alert' : ''}`}>{badge}</span>}
      </button>
      {open && <div className="info-acc-body">{children}</div>}
    </div>
  )
}
