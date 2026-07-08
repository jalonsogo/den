import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

export interface FieldOption {
  value: string
  label: string
  icon?: ReactNode
  disabled?: boolean
}

// A custom form dropdown styled like `.finput` but able to show an icon beside
// each option (native <option> can't). The popup is rendered in a portal with
// fixed positioning so it isn't clipped by a modal's `overflow: hidden` or a
// scrollable body — an absolutely-positioned menu would get cropped there.
export function FieldSelect({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  compact
}: {
  value: string
  options: FieldOption[]
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel?: string
  // Compact = auto-width, smaller — for toolbars rather than full-width fields.
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Position the menu against the trigger, flipping above it when there isn't
  // enough room below in the viewport.
  const place = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const menuH = Math.min(260, options.length * 34 + 10)
    const below = window.innerHeight - r.bottom
    const openUp = below < menuH + 8 && r.top > below
    setPos({ left: r.left, top: openUp ? Math.max(8, r.top - menuH - 4) : r.bottom + 4, width: r.width })
  }

  useLayoutEffect(() => { if (open) place() }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    // Close on scroll/resize rather than trying to keep the fixed menu glued to
    // a moving trigger (matches native <select> behavior).
    const close = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  const selected = options.find((o) => o.value === value)

  return (
    <div className={`fld-select-wrap${compact ? ' compact' : ''}`} ref={wrapRef}>
      <button
        type="button"
        ref={btnRef}
        className={`fld-select${open ? ' open' : ''}${compact ? ' compact' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        {selected?.icon && <span className="fld-ico">{selected.icon}</span>}
        <span className="fld-val">{selected?.label ?? ''}</span>
        <ChevronDown size={14} className="fld-chev" />
      </button>
      {open && pos && createPortal(
        <div
          className="fld-menu"
          ref={menuRef}
          role="listbox"
          style={{ left: pos.left, top: pos.top, width: pos.width }}
        >
          {options.map((o) => (
            <button
              type="button"
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`fld-item${o.value === value ? ' sel' : ''}${o.disabled ? ' disabled' : ''}`}
              disabled={o.disabled}
              onClick={() => { if (!o.disabled) { onChange(o.value); setOpen(false) } }}
            >
              {o.icon && <span className="fld-ico">{o.icon}</span>}
              <span className="fld-item-label">{o.label}</span>
              {o.value === value && <Check size={14} className="fld-check" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
