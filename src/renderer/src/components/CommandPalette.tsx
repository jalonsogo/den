import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Search, Layers, Users, Settings, Plus, Play, Square, RotateCcw, Trash2,
  ScrollText, Boxes, Home, CornerDownLeft, PanelLeft, Info
} from 'lucide-react'
import { useStore } from '../store'
import { SandboxAvatar } from './SandboxAvatar'
import type { PageType } from '../types'

type Section = 'Actions' | 'Sandboxes' | 'Groups' | 'Kits'
const SECTION_ORDER: Section[] = ['Actions', 'Sandboxes', 'Groups', 'Kits']

interface CmdItem {
  id: string
  section: Section
  label: string
  hint?: string          // right-aligned subtitle / shortcut
  icon: ReactNode
  keywords?: string      // extra searchable text
  run: () => void
}

// Score `text` against `query`: substring wins (earlier = higher), then a
// loose subsequence match, else -1 (excluded). Empty query matches everything.
function score(query: string, text: string): number {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  const idx = t.indexOf(q)
  if (idx >= 0) return 1000 - idx
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++
  return qi === q.length ? 1 : -1
}

// Act on a sandbox by name — mirrors the ⌘ shortcuts in App.tsx.
function sandboxActions(id: string, name: string, running: boolean) {
  const s = useStore.getState()
  return {
    start: () => { s.updateSandbox(id, { status: 'starting' }); window.minipit?.runSandbox(name).then(() => s.updateSandbox(id, { status: 'running' })).catch(() => s.updateSandbox(id, { status: 'stopped' })) },
    stop: () => { s.updateSandbox(id, { status: 'stopping' }); window.minipit?.stopSandbox(name).then(() => s.updateSandbox(id, { status: 'stopped', uptimeSeconds: undefined })).catch(() => s.updateSandbox(id, { status: 'running' })) },
    restart: async () => { s.updateSandbox(id, { status: 'stopping' }); try { await window.minipit?.stopSandbox(name); await window.minipit?.runSandbox(name); s.updateSandbox(id, { status: 'running' }) } catch { s.updateSandbox(id, { status: 'running' }) } },
    del: () => { if (confirm(`Delete sandbox "${name}"? This can't be undone.`)) { s.updateSandbox(id, { status: 'deleting' }); window.minipit?.deleteSandbox(name).catch(() => {}) } },
    logs: () => { s.setLogsSandbox(name); s.setLogsReturn(id); s.setActivePage('logs') },
    running
  }
}

export function CommandPalette() {
  const paletteOpen = useStore((s) => s.paletteOpen)
  const setPaletteOpen = useStore((s) => s.setPaletteOpen)
  const sandboxes = useStore((s) => s.sandboxes)
  const groups = useStore((s) => s.groups)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [kits, setKits] = useState<{ name: string; kind: string; dir: string }[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset + focus on open; load the kit list (fetched lazily, only when open).
  useEffect(() => {
    if (!paletteOpen) return
    setQuery('')
    setSelected(0)
    window.minipit?.listKits().then((k) => setKits(k ?? [])).catch(() => setKits([]))
    // Focus after paint so the input is ready to receive keystrokes.
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [paletteOpen])

  const close = () => setPaletteOpen(false)
  const go = (page: PageType) => { useStore.getState().setActivePage(page); close() }

  // Assemble every searchable item. Rebuilds when the underlying data changes.
  const items = useMemo<CmdItem[]>(() => {
    const s = useStore.getState()
    const active = sandboxes.find((x) => x.id === s.activeSandboxId)
    const out: CmdItem[] = []

    // ── Actions ──────────────────────────────────────────────────────────────
    out.push({ id: 'a:new-sandbox', section: 'Actions', label: 'New Sandbox', hint: '⌘N', icon: <Plus size={15} />, keywords: 'create add', run: () => { close(); s.setModal('new-sandbox') } })
    out.push({ id: 'a:new-kit', section: 'Actions', label: 'New Kit', icon: <Plus size={15} />, keywords: 'create add mixin agent', run: () => { close(); s.setModal('new-kit') } })
    out.push({ id: 'a:new-secret', section: 'Actions', label: 'New Secret', icon: <Plus size={15} />, keywords: 'create add credential token', run: () => { close(); s.setModal('new-secret') } })
    out.push({ id: 'nav:sandboxes', section: 'Actions', label: 'Go to Sandboxes', icon: <Home size={15} />, keywords: 'overview home', run: () => go('sandboxes') })
    out.push({ id: 'nav:templates', section: 'Actions', label: 'Go to Templates', icon: <Boxes size={15} />, keywords: 'images', run: () => go('templates') })
    out.push({ id: 'nav:mixins', section: 'Actions', label: 'Go to Mixin Kits', icon: <Layers size={15} />, keywords: 'kits add-ons', run: () => go('mixins') })
    out.push({ id: 'nav:kits', section: 'Actions', label: 'Go to Sandbox Kits', icon: <Layers size={15} />, keywords: 'agents', run: () => go('kits') })
    out.push({ id: 'nav:settings', section: 'Actions', label: 'Go to Settings', icon: <Settings size={15} />, keywords: 'preferences runtime sbx', run: () => go('settings') })

    // Contextual actions for the currently open sandbox.
    if (active) {
      const act = sandboxActions(active.id, active.name, active.status === 'running')
      if (act.running) {
        out.push({ id: 'act:stop', section: 'Actions', label: `Stop “${active.name}”`, hint: '⌘S', icon: <Square size={15} />, keywords: 'sandbox halt', run: () => { close(); act.stop() } })
        out.push({ id: 'act:restart', section: 'Actions', label: `Restart “${active.name}”`, hint: '⌘R', icon: <RotateCcw size={15} />, keywords: 'sandbox reboot', run: () => { close(); act.restart() } })
      } else if (active.status === 'stopped') {
        out.push({ id: 'act:start', section: 'Actions', label: `Start “${active.name}”`, icon: <Play size={15} />, keywords: 'sandbox run', run: () => { close(); act.start() } })
      }
      out.push({ id: 'act:logs', section: 'Actions', label: `Logs — “${active.name}”`, hint: '⌘L', icon: <ScrollText size={15} />, keywords: 'sandbox output', run: () => { close(); act.logs() } })
      out.push({ id: 'act:files', section: 'Actions', label: `Toggle Files — “${active.name}”`, hint: '⌘F', icon: <PanelLeft size={15} />, keywords: 'sandbox browser', run: () => { close(); window.dispatchEvent(new CustomEvent('den:toggle-dock', { detail: 'files' })) } })
      out.push({ id: 'act:info', section: 'Actions', label: `Toggle Info — “${active.name}”`, hint: '⌘I', icon: <Info size={15} />, keywords: 'sandbox details policy', run: () => { close(); window.dispatchEvent(new CustomEvent('den:toggle-dock', { detail: 'info' })) } })
      out.push({ id: 'act:delete', section: 'Actions', label: `Delete “${active.name}”`, hint: '⌘X', icon: <Trash2 size={15} />, keywords: 'sandbox remove', run: () => { close(); act.del() } })
    }

    // ── Sandboxes (jump to) ────────────────────────────────────────────────────
    for (const sb of sandboxes) {
      const sub = sb.status === 'running' ? 'Running' : sb.status === 'stopped' ? 'Stopped' : sb.status
      out.push({
        id: `sb:${sb.id}`, section: 'Sandboxes', label: sb.name, hint: sub,
        icon: <SandboxAvatar sandbox={sb} size={18} />,
        keywords: `${sb.agent ?? ''} ${sb.workspace ?? ''} ${sb.branch ?? ''}`,
        run: () => { s.setActiveSandboxId(sb.id); close() }
      })
    }

    // ── Groups (jump to overview) ──────────────────────────────────────────────
    for (const g of groups) {
      const count = Object.values(s.sandboxGroups).filter((gid) => gid === g.id).length
      out.push({
        id: `grp:${g.id}`, section: 'Groups', label: g.name, hint: `${count} sandbox${count === 1 ? '' : 'es'}`,
        icon: <Users size={15} />, keywords: 'group',
        run: () => go('sandboxes')
      })
    }

    // ── Kits (jump to page) ────────────────────────────────────────────────────
    for (const kit of kits) {
      const page: PageType = kit.kind === 'mixin' ? 'mixins' : 'kits'
      out.push({
        id: `kit:${kit.dir}`, section: 'Kits', label: kit.name, hint: kit.kind === 'mixin' ? 'Mixin kit' : 'Sandbox kit',
        icon: <Layers size={15} />, keywords: kit.kind,
        run: () => go(page)
      })
    }

    return out
  }, [sandboxes, groups, kits]) // eslint-disable-line react-hooks/exhaustive-deps

  // Filter + rank, keeping section grouping and per-section score order.
  const grouped = useMemo(() => {
    const scored = items
      .map((it) => ({ it, sc: score(query, `${it.label} ${it.keywords ?? ''}`) }))
      .filter((x) => x.sc >= 0)
    const bySection = new Map<Section, CmdItem[]>()
    for (const sec of SECTION_ORDER) {
      const rows = scored.filter((x) => x.it.section === sec).sort((a, b) => b.sc - a.sc).map((x) => x.it)
      if (rows.length) bySection.set(sec, rows)
    }
    return bySection
  }, [items, query])

  // Flatten for keyboard navigation (section order preserved).
  const flat = useMemo(() => {
    const f: CmdItem[] = []
    for (const sec of SECTION_ORDER) { const rows = grouped.get(sec); if (rows) f.push(...rows) }
    return f
  }, [grouped])

  useEffect(() => { setSelected((i) => Math.min(i, Math.max(0, flat.length - 1))) }, [flat.length])

  // Keep the selected row in view as it moves.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!paletteOpen) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((i) => Math.min(i + 1, flat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); flat[selected]?.run() }
  }

  let running = -1 // running flat index so each row knows its keyboard position

  return (
    <div className="cmdk-scrim" onMouseDown={close}>
      <div className="cmdk" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="cmdk-input-row">
          <Search size={16} className="cmdk-input-ic" />
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Search sandboxes, groups, kits, actions…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0) }}
          />
          <span className="cmdk-esc">esc</span>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {flat.length === 0 ? (
            <div className="cmdk-empty">No matches</div>
          ) : (
            SECTION_ORDER.map((sec) => {
              const rows = grouped.get(sec)
              if (!rows) return null
              return (
                <div className="cmdk-group" key={sec}>
                  <div className="cmdk-group-hd">{sec}</div>
                  {rows.map((it) => {
                    running += 1
                    const idx = running
                    return (
                      <button
                        key={it.id}
                        data-idx={idx}
                        className={`cmdk-item${idx === selected ? ' sel' : ''}`}
                        onMouseMove={() => setSelected(idx)}
                        onClick={() => it.run()}
                      >
                        <span className="cmdk-item-ic">{it.icon}</span>
                        <span className="cmdk-item-label">{it.label}</span>
                        {it.hint && <span className="cmdk-item-hint">{it.hint}</span>}
                        {idx === selected && <CornerDownLeft size={13} className="cmdk-item-enter" />}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
