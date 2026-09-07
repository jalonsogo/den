import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, Plus, RefreshCw, Search, Layers, X, DownloadCloud, Boxes, Zap, Pin } from 'lucide-react'
import { useStore } from '../../store'
import { AgentIcon } from '../AgentIcon'
import { KitCaps } from '../KitCaps'
import { randomName } from '../../lib/names'
import { mcpIcon, isMcpServerName } from '../../lib/mcpCatalog'
import { parseKitSpec, type ParsedKit } from '../../lib/kitSpec'
import { AGENTS, type AgentType, type Template } from '../../types'

const MEM_VALUES = ['default', '2g', '4g', '8g', '16g', '32g']

// The creation form is split across two tabs. Only the active panel mounts, so
// a field in the hidden tab keeps its state (it lives in the parent) without
// paying for its height.
type Tab = 'basic' | 'advanced'

function TabBar({ tab, onPick }: { tab: Tab; onPick: (t: Tab) => void }) {
  return (
    <div className="m-tabs" role="tablist">
      {([['basic', 'Basic'], ['advanced', 'Advanced']] as [Tab, string][]).map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={tab === id}
          className={`m-tab${tab === id ? ' active' : ''}`}
          onClick={() => onPick(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// "notion", "notion and github", "notion, github and 2 more" — the pre-loaded
// set named rather than counted, so the sentence says which servers the agent
// is limited to. Capped so a long selection doesn't wrap the mode card.
const andList = (xs: string[]): string => {
  if (xs.length <= 3) return xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
  return `${xs.slice(0, 3).join(', ')} and ${xs.length - 3} more`
}

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9._+-]+/g, '-').replace(/^-+|-+$/g, '')

// Split a free-text port list into one mapping per `-p`. Accepts commas and/or
// whitespace so "8080, 3000:3000/tcp" works; the mappings themselves are left
// untouched for sbx to validate (it owns the [[HOST_IP:]HOST_PORT:]PORT[/PROTO]
// grammar, and duplicating that here would only drift).
const parsePorts = (raw: string): string[] =>
  raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)

// Env vars are one per line, not comma-separated: a value can legitimately
// contain a comma, and splitting on it would quietly truncate.
const parseEnv = (raw: string): string[] =>
  raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))

// Lines that look like an attempt but can't be passed as KEY=value. Surfaced
// rather than dropped: a sandbox starting without a variable the user believes
// they set is invisible otherwise, and the command preview omits it too.
const badEnvLines = (raw: string): string[] =>
  raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.includes('='))

// Mirror sbx's default sandbox name: <agent>-<workdir>. Empty when no folder.
function deriveName(agent: string, workspace: string): string {
  const folder = workspace.split('/').filter(Boolean).pop() ?? ''
  if (!folder) return ''
  // An agent kit is often checked out into a folder of the same name, and
  // "nanoclaw-nanoclaw" reads like a bug.
  return slugify(agent === folder ? folder : `${agent}-${folder}`)
}

// The stock agent a sandbox kit is built on, for naming only. A kit's name says
// what it is but not what it runs, and "claude-nanoclaw" carries both.
//
// Two places declare it, neither as an agent id: the entrypoint is a command
// line (`claude --dangerously-skip-permissions`) and the image is a template
// tag (`docker/sandbox-templates:shell-docker`). Match either against the
// canonical agent list and give up quietly when neither says anything — a wrong
// prefix would be worse than none.
function baseAgentOfKit(spec: ParsedKit | undefined): string {
  if (!spec) return ''
  const ids = AGENTS.map((a) => a.id)
  const entry = (spec.entrypoint || '').trim().split(/\s+/)[0].split('/').pop() ?? ''
  if (ids.includes(entry as AgentType)) return entry
  const tag = (spec.image || '').split(':').pop() ?? ''
  // Template tags are `<flavor>-docker`, and a flavor is an agent id with an
  // optional suffix: claude-code-docker, shell-docker, codex-docker.
  const flavor = tag.replace(/-docker$/, '')
  return ids.find((id) => flavor === id || flavor.startsWith(`${id}-`)) ?? ''
}

// The name suggested for a sandbox built from an agent kit: the agent it runs,
// then the kit. Falls back to the kit alone when the base can't be identified.
function deriveKitName(kit: string, spec: ParsedKit | undefined): string {
  const base = baseAgentOfKit(spec)
  return slugify(base && base !== kit ? `${base}-${kit}` : kit)
}

export function NewSandboxModal() {
  const { setModal, setSandboxes, addCreatingSandbox, removeCreatingSandbox, setHighlightSandbox, newSandboxWorkspace, newSandboxTemplate, newSandboxFeature, setNewSandboxFeature, newSandboxGroup, setNewSandboxGroup, defaultKits, sandboxes, setSandboxGroup, prefillKit, setPrefillKit, setActivePage } = useStore()
  const feature = newSandboxFeature
  // Feature mode always isolates (a feature is an isolated clone you merge back).
  const closeModal = () => { setNewSandboxFeature(false); setNewSandboxGroup(null); setPrefillKit(null); setModal(null) }

  // Nothing registered on the gateway yet: hand the user to the page that fixes
  // that, with its Add form already open, instead of stating the dynamic default
  // and leaving no way to change it. This abandons the half-filled form, so the
  // button says where it goes.
  const registerMcp = () => { closeModal(); setActivePage('mcp'); setModal('new-mcp') }

  // Standalone (non-project) sandboxes default to the last folder we created one
  // in; project sessions always pin to the project folder (newSandboxWorkspace).
  const lastWorkspace = localStorage.getItem('den:lastWorkspace') ?? ''
  const pinnedWs = newSandboxWorkspace ?? (lastWorkspace || '')

  const [source, setSource]           = useState<'new' | 'template'>(newSandboxTemplate ? 'template' : 'new')
  const [templates, setTemplates]     = useState<Template[]>([])
  const [template, setTemplate]       = useState(newSandboxTemplate ?? '')   // "repository:tag"
  // Suggested name mirrors sbx's default (<agent>-<workdir>) once a real folder
  // is known; falls back to a random name on first run (no folder yet).
  const [name, setName]               = useState(() => deriveName('claude', pinnedWs) || randomName())
  const [nameEdited, setNameEdited]   = useState(false)
  const [agent, setAgent]             = useState<AgentType>('claude')
  const [workspace, setWorkspace]     = useState(pinnedWs)
  // sbx >= 0.42: create with no workspace bind mount at all. Off by default —
  // most sandboxes want a mounted folder, and it forces an explicit name since
  // there's no folder left to derive one from.
  const [noWorkspace, setNoWorkspace] = useState(false)
  const [wsBase, setWsBase]           = useState('')     // ~/den base for the default path
  const [wsEdited, setWsEdited]       = useState(false)  // user picked their own folder
  const [memIdx, setMemIdx]           = useState(0)
  // Ports to publish at creation (sbx v0.37+ accepts -p on create). Free text so
  // the full sbx form works; split on commas/whitespace into one -p per mapping.
  const [portsRaw, setPortsRaw]       = useState('')
  const [envRaw, setEnvRaw]           = useState('')
  // The shared skills store is mounted read-write into new sandboxes by default
  // (sbx v0.37+); this opts the sandbox out via --no-share-skills.
  const [shareSkills, setShareSkills] = useState(true)
  // A session inside a project shares that one folder, so isolate by default to
  // keep concurrent sandboxes from stomping the same working tree (toggleable).
  const [clone, setClone]             = useState(!!newSandboxWorkspace || newSandboxFeature)
  // For --clone: whether the workspace is a Git repo (null = unknown/checking).
  const [wsIsRepo, setWsIsRepo]       = useState<boolean | null>(null)
  const [gitIniting, setGitIniting]   = useState(false)
  // Creation streams its output into an in-modal terminal; it also runs in the
  // background (creating row) so the modal can be dismissed while it finishes.
  const [creating, setCreating]       = useState(false)
  const [progress, setProgress]       = useState('')
  const progRef = useRef<HTMLPreElement>(null)
  const unsubRef = useRef<(() => void) | null>(null)
  const [tab, setTab]                 = useState<Tab>('basic')
  // Command preview is pinned above the footer so it stays visible while you
  // edit the flags it renders; remember the user's show/hide choice.
  const [cmdOpen, setCmdOpen]         = useState(localStorage.getItem('den:showCreateCmd') === '1')
  const [ddOpen, setDdOpen]           = useState(false)
  const [error, setError]             = useState('')
  const [availKits, setAvailKits]     = useState<{ name: string; dir: string }[]>([])
  const [kitSpecs, setKitSpecs]       = useState<Record<string, ParsedKit>>({})  // dir → parsed spec, for preview
  const [kitKinds, setKitKinds]       = useState<Record<string, { name: string; kind: string }>>({})
  // MCP gateway servers registered on the host (Library > MCP Servers). Picking
  // any switches this sandbox to STATIC mode (--static-mcp): only those are
  // pre-loaded. Picking none leaves it DYNAMIC — the agent discovers servers
  // itself through the gateway's mcp-find tool.
  const [mcpServers, setMcpServers]   = useState<string[]>([])
  // Whether the gateway answered at all. The dynamic default holds even with an
  // empty registry, so that case still gets the section (with a way to register
  // a server); only a runtime that can't list them at all hides it.
  const [mcpListed, setMcpListed]     = useState(false)
  const [selMcps, setSelMcps]         = useState<string[]>([])

  const [selKits, setSelKits]         = useState<string[]>([])
  // Values for kit-declared args (sbx >= 0.42), keyed by kit dir → arg name.
  // Unset entries fall back to the arg's own `default` at submit time.
  const [kitArgValues, setKitArgValues] = useState<Record<string, Record<string, string>>>({})

  // An agent kit (den calls it a sandbox kit) supplies the agent itself, and
  // sbx refuses to pair one with a generic subcommand:
  //   "agent kit X (kind: agent) cannot be combined with the shell subcommand;
  //    invoke as `sbx create --kit <kit> X ...` instead"
  // So when one is selected its NAME becomes the positional, replacing whatever
  // the agent picker says — which otherwise defaulted to claude and failed.
  const baseKitDir = selKits.find((d) => kitKinds[d]?.kind === 'sandbox') ?? null
  const baseKitName = baseKitDir ? kitKinds[baseKitDir].name : null
  const effAgent = baseKitName ?? agent

  // A sandbox kit names the sandbox after itself and the agent it runs
  // (claude-nanoclaw); everything else keeps the sbx-style <agent>-<workdir>.
  // The kit is the more useful half here — the workspace is already visible in
  // the field right below, and two sandboxes from one kit are told apart by the
  // uniqueness suffix rather than by a folder that is usually the kit's own.
  const suggestedName = (): string =>
    baseKitName ? deriveKitName(baseKitName, baseKitDir ? kitSpecs[baseKitDir] : undefined)
                : deriveName(effAgent, workspace)

  // Selected kits that declare args (sbx >= 0.42), each paired with its
  // display name for the `kit.name=value` disambiguated flag form.
  const kitsWithArgs = selKits
    .map((dir) => ({ dir, name: kitKinds[dir]?.name ?? dir, args: kitSpecs[dir]?.args ?? [] }))
    .filter((k) => k.args.length > 0)
  // An arg name declared by more than one selected kit needs `kit.name=value`
  // to disambiguate; a name unique across the selection can stay bare.
  const argNameCounts = kitsWithArgs.flatMap((k) => k.args).reduce<Record<string, number>>((acc, a) => {
    acc[a.name] = (acc[a.name] ?? 0) + 1
    return acc
  }, {})
  const kitArgFlags = (): string[] =>
    kitsWithArgs.flatMap((k) => k.args.flatMap((a) => {
      const val = kitArgValues[k.dir]?.[a.name] ?? a.default ?? ''
      if (!val.trim()) return []
      const key = argNameCounts[a.name] > 1 ? `${k.name}.${a.name}` : a.name
      return [`${key}=${val}`]
    }))

  const [kitQuery, setKitQuery]       = useState('')
  const [kitDdOpen, setKitDdOpen]     = useState(false)
  // Fixed viewport coords for the portaled menu (see kitDdPlace). Exactly one
  // of top/bottom is set — which one is how the menu anchors to the trigger.
  const [kitDdPos, setKitDdPos]       =
    useState<{ left: number; width: number; maxHeight: number; top?: number; bottom?: number } | null>(null)
  const kitDdRef = useRef<HTMLDivElement>(null)
  const kitDdTrigRef = useRef<HTMLButtonElement>(null)
  const kitDdMenuRef = useRef<HTMLDivElement>(null)

  // Load available templates for the "From template" option.
  useEffect(() => {
    window.den?.listTemplates().then((t) => {
      setTemplates(t ?? [])
      if (t && t[0]) setTemplate((cur) => cur || `${t[0].repository}:${t[0].tag}`)
    }).catch(() => {})
    window.den?.mcpList?.().then((r) => {
      if (!r?.ok) return
      setMcpListed(true)
      // Filtered like the MCP page's list: sbx prints prose where the table
      // would be when nothing is registered, and a row parsed out of it showed
      // up here as a pill reading "add one" that pre-loaded a server by that
      // name into the sandbox.
      setMcpServers((r.servers ?? []).map((m) => m.name).filter(isMcpServerName))
    }).catch(() => {})
    // Mixin kits can be stacked onto the new sandbox at creation (--kit).
    window.den?.listKits().then((k) => {
      const all = k ?? []
      // specName, not the folder name: sbx matches an agent kit by the name it
      // declares, and an imported kit's folder is named after its repo.
      setKitKinds(Object.fromEntries(all.map((x) => [x.dir, { name: x.specName || x.name, kind: x.kind }])))
      const mixins = all.filter((x) => x.kind === 'mixin').map((x) => ({ name: x.name, dir: x.dir }))
      setAvailKits(mixins)
      // Sandbox kits are parsed too, for the base agent their suggested name
      // is built from. Mixins get parsed below for the capability preview.
      Promise.all(all.filter((x) => x.kind === 'sandbox').map(async (x) =>
        [x.dir, parseKitSpec((await window.den?.readKit(x.dir)) ?? '')] as const
      )).then((entries) => setKitSpecs((cur) => ({ ...cur, ...Object.fromEntries(entries) }))).catch(() => {})
      // Pre-select any kit the user starred as a default in the Kits page.
      const seed = mixins.filter((m) => defaultKits.includes(m.name)).map((m) => m.dir)
      // A sandbox kit opened via "Create sandbox" supplies the agent itself, so
      // it joins the starred mixins rather than replacing them.
      const withPrefill = prefillKit ? [...new Set([prefillKit, ...seed])] : seed
      if (withPrefill.length) setSelKits(withPrefill)
      // Load + parse each local kit's spec so we can preview its capabilities.
      Promise.all(mixins.map(async (m) =>
        [m.dir, parseKitSpec((await window.den?.readKit(m.dir)) ?? '')] as const
      // Merge, not replace — the sandbox-kit specs above land in the same map
      // and whichever of the two settles last would otherwise wipe the other.
      )).then((entries) => setKitSpecs((cur) => ({ ...cur, ...Object.fromEntries(entries) }))).catch(() => {})
    }).catch(() => {})
  }, [])

  const ddRef = useRef<HTMLDivElement>(null)
  const memValue = MEM_VALUES[memIdx]
  const memPct = `${(memIdx / (MEM_VALUES.length - 1)) * 100}%`
  const agentLabel = AGENTS.find((a) => a.id === agent)?.label ?? agent

  // Close the agent dropdown on outside click.
  useEffect(() => {
    if (!ddOpen) return
    const handler = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setDdOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ddOpen])

  // Mixin kits is the last field in the Basic panel, so a menu positioned inside
  // the scrolling body opened into clipped space beneath the pinned command
  // strip — a barely-visible sliver. It's portaled to document.body with fixed
  // coords instead, the same escape hatch FieldSelect uses, so the modal's
  // overflow can't clip it. Flips above the trigger when the viewport is tight.
  const kitDdPlace = () => {
    const el = kitDdTrigRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // Only an estimate, and only ever used to choose a direction: search row
    // (~38px) plus the 200px options cap and padding.
    const menuH = 250
    const below = window.innerHeight - r.bottom
    const openUp = below < menuH + 8 && r.top > below
    // Anchor the edge that touches the trigger. Opening upward used to set `top`
    // to `r.top - menuH`, which only lines up when the menu is exactly as tall as
    // the guess — with fewer kits than that it came out short and left the menu
    // floating well above the field. Pinning `bottom` instead is exact at any
    // height, so the estimate above can stay an estimate.
    // Never taller than the side it opened on, so a short window can't push the
    // search row off the top. The menu is a flex column, so this shrinks the
    // scrollable list rather than clipping the chrome.
    const room = Math.max(120, (openUp ? r.top : below) - 12)
    setKitDdPos(openUp
      ? { left: r.left, width: r.width, maxHeight: room, bottom: window.innerHeight - r.top + 4 }
      : { left: r.left, width: r.width, maxHeight: room, top: r.bottom + 4 })
  }
  useLayoutEffect(() => { if (kitDdOpen) kitDdPlace() }, [kitDdOpen])

  // Close on outside click, and on scroll/resize rather than keeping a fixed
  // menu glued to a moving trigger — matching FieldSelect. The scroll listener
  // captures so it sees the modal body scrolling, so exclude the menu's own
  // overflow or a long kit list would dismiss itself on the first wheel tick.
  useEffect(() => {
    if (!kitDdOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (kitDdRef.current?.contains(t) || kitDdMenuRef.current?.contains(t)) return
      setKitDdOpen(false)
    }
    const close = () => setKitDdOpen(false)
    const onScroll = (e: Event) => {
      const t = e.target as Node | null
      if (t && kitDdMenuRef.current?.contains(t)) return
      setKitDdOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [kitDdOpen])

  // Fetch the ~/den base once — only needed for the first-run fallback (no
  // project folder and no remembered last-used folder to default to).
  useEffect(() => {
    if (pinnedWs) return
    window.den?.defaultWorkspace().then((dir) => { if (dir) setWsBase(dir) }).catch(() => {})
  }, [pinnedWs])

  // First-run fallback only: default the workspace to ~/den/<name>, tracking the
  // name field until the user picks their own folder. Skipped once we have a
  // pinned folder (a project session, or the remembered last-used folder).
  useEffect(() => {
    if (pinnedWs || wsEdited || !wsBase) return
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
    setWorkspace(slug ? `${wsBase}/${slug}` : wsBase)
  }, [name, wsBase, wsEdited, pinnedWs])

  // Once a real folder is known (project session or user-picked), suggest the
  // sbx-style <agent>-<workdir> name, tracking agent/workspace until edited. In
  // the first-run case the workspace follows the name instead (effect above), so
  // this stays off to avoid a loop and the random name is kept.
  useEffect(() => {
    if (nameEdited || (!pinnedWs && !wsEdited)) return
    const n = suggestedName()
    if (n) setName(n)
  }, [agent, workspace, nameEdited, pinnedWs, wsEdited, baseKitName, kitSpecs])

  // --clone clones the host repo, so when it's on, check (debounced) whether the
  // workspace is a Git repo — if not, we offer to initialize one.
  useEffect(() => {
    if (!clone || !workspace) { setWsIsRepo(null); return }
    let cancelled = false
    setWsIsRepo(null)
    const t = setTimeout(() => {
      window.den?.isGitRepo(workspace)
        .then((r) => { if (!cancelled) setWsIsRepo(!!r) })
        .catch(() => { if (!cancelled) setWsIsRepo(null) })
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [clone, workspace])

  const handleGitInit = async () => {
    setGitIniting(true)
    setError('')
    const res = await window.den?.gitInit(workspace).catch(() => null)
    setGitIniting(false)
    if (res?.ok) setWsIsRepo(true)
    else setError(res?.error || 'Could not initialize a Git repository.')
  }

  const handleBrowse = async () => {
    const path = await window.den?.showOpenDialog()
    if (path) { setWorkspace(path); setWsEdited(true) }
  }

  // Close the modal but let creation keep running (it's tracked by the creating
  // row and the async below completes regardless of mount state).
  const dismiss = () => {
    unsubRef.current?.()
    unsubRef.current = null
    closeModal()
  }

  // Creation streams its output into the in-modal terminal and also registers a
  // background "creating" row, so the modal can be dismissed while it finishes.
  const handleLaunch = () => {
    // Surface the offending field, not just the message: the error is pinned
    // outside the tab panels, so from the Advanced tab it would otherwise name
    // a control the user can't see.
    if (noWorkspace) {
      // No folder to derive a name from — an explicit one is the only option.
      if (!name.trim()) { setTab('basic'); setError('Name is required when there is no workspace'); return }
    } else if (!workspace) {
      setTab('basic'); setError('Workspace is required'); return
    }
    const finalName = (name.trim() || suggestedName() || randomName())
    // Remember this folder so the next standalone sandbox defaults to it.
    if (!noWorkspace) localStorage.setItem('den:lastWorkspace', workspace)
    setError('')
    setProgress('')
    setCreating(true)
    addCreatingSandbox({
      id: `creating-${finalName}`, name: finalName, status: 'creating',
      agent: effAgent as typeof agent, workspace: noWorkspace ? '' : workspace, ports: [], logs: [],
      location: 'local'
    })
    const unsub = window.den?.onCreateOutput((chunk) => {
      setProgress((p) => p + chunk)
      requestAnimationFrame(() => { if (progRef.current) progRef.current.scrollTop = progRef.current.scrollHeight })
    })
    unsubRef.current = unsub ?? null
    ;(async () => {
      try {
        await window.den?.createSandbox({
          name: finalName,
          agent: effAgent,
          workspace: noWorkspace ? undefined : workspace,
          memory: memValue !== 'default' ? memValue : undefined,
          branch: noWorkspace ? false : clone,
          template: source === 'template' && template ? template : undefined,
          kits: selKits,
          staticMcps: selMcps,
          ports: parsePorts(portsRaw),
          env: parseEnv(envRaw),
          // Only sent when opting out — the store is mounted by default.
          noShareSkills: !shareSkills,
          kitArgs: kitArgFlags()
        })
        const sandboxes = await window.den?.listSandboxes()
        if (sandboxes) setSandboxes(sandboxes)
        // Honor a group pre-selected from a group header's "New sandbox…" (the
        // manual group picker was removed to simplify creation).
        if (newSandboxGroup) setSandboxGroup(finalName, newSandboxGroup)
        removeCreatingSandbox(finalName)
        setHighlightSandbox(finalName)
        unsub?.()
        closeModal()
      } catch (e) {
        removeCreatingSandbox(finalName)
        unsub?.()
        setCreating(false)
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }

  // The preview must be the *exact* command den runs so it's copy-pasteable.
  // `--kit` takes the kit's local directory (what we pass), not its name — sbx
  // can't resolve a bare name. Quote any token with spaces (e.g. the macOS
  // "Application Support" path).
  const q = (s: string): string => (/\s/.test(s) ? `"${s}"` : s)
  const cmdTokens = [
    'sbx', 'create',
    ...(name.trim() ? ['--name', name.trim()] : []),
    ...(source === 'template' && template ? ['-t', template] : []),
    ...(memValue !== 'default' ? ['-m', memValue] : []),
    ...(!noWorkspace && clone ? ['--clone'] : []),
    ...parsePorts(portsRaw).flatMap((p) => ['-p', p]),
    ...parseEnv(envRaw).flatMap((e) => ['-e', e]),
    ...(shareSkills ? [] : ['--no-share-skills']),
    ...selKits.flatMap((entry) => ['--kit', q(entry)]),
    ...kitArgFlags().flatMap((kv) => ['--kit-arg', q(kv)]),
    ...selMcps.flatMap((m) => ['--static-mcp', m]),
    effAgent,
    ...(noWorkspace ? [] : [q(workspace || '<workspace>')])
  ]

  return (
    <div className="overlay">{/* No close-on-outside-click: use Cancel / Run in background. */}
      <div className="modal" style={{ width: 'clamp(460px, 52vw, 760px)' }} onClick={(e) => e.stopPropagation()}>
        <div className="m-hdr">
          <div className="m-title">{creating ? (feature ? 'Starting Feature' : 'Creating Sandbox') : (feature ? 'New Feature' : 'New Sandbox')}</div>
          <div className="m-sub">{creating ? 'Setting up the sandbox — this can take a moment.' : 'Pick an agent and workspace, then launch.'}</div>
        </div>

        {/* Tabs sit outside .m-body so the bar stays put while the panel
            scrolls. Hidden during creation: there is nothing left to edit. */}
        {!creating && <TabBar tab={tab} onPick={setTab} />}

        <div className="m-body">
          {creating ? (
          <div className="cmd-blk create-log create-log-full">
            <pre ref={progRef} className="create-log-pre">{progress || 'Starting…'}</pre>
          </div>
          ) : (
          <>
          {tab === 'basic' && (
          <div className="m-tabpanel" role="tabpanel">
          {/* Name — random by default, regenerate or edit */}
          <div className="fg">
            <label className="flabel">Name</label>
            <div className="frow-2">
              <input
                className="finput"
                value={name}
                placeholder="furious-blackhole"
                onChange={(e) => { setName(e.target.value); setNameEdited(true) }}
              />
              <button className="btn btn-default btn-sm" onClick={() => { setName(randomName()); setNameEdited(true) }} title="Random name">
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          {/* Agent — big dropdown (always shown) */}
          <div className="fg">
          <label className="flabel">
            Agent
            {baseKitName && <span className="flabel-hint">from the “{baseKitName}” kit</span>}
          </label>
          {baseKitName ? (
            // An agent kit IS the agent — sbx rejects pairing one with a
            // generic subcommand, so there is nothing to choose here.
            <div className="agent-dd-fixed">
              <Boxes size={16} />
              <span className="agent-dd-label">{baseKitName}</span>
            </div>
          ) : (
            <div className="agent-dd" ref={ddRef}>
              <button className="agent-dd-btn" onClick={() => setDdOpen((v) => !v)}>
                <AgentIcon agent={agent} size={18} />
                <span className="agent-dd-label">{agentLabel}</span>
                <ChevronDown size={16} style={{ marginLeft: 'auto', color: 'var(--t3)' }} />
              </button>
              {ddOpen && (
                <div className="agent-dd-list">
                  {AGENTS.map((a) => (
                    <div
                      key={a.id}
                      className={`agent-dd-item${a.id === agent ? ' on' : ''}`}
                      onClick={() => { setAgent(a.id); setDdOpen(false) }}
                    >
                      <AgentIcon agent={a.id} size={18} />
                      <span>{a.label}</span>
                      {a.id === agent && <Check size={14} style={{ marginLeft: 'auto', color: 'var(--accent, var(--primary))' }} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>

          {/* Workspace — which folder to mount, and how it gets exposed.
              Grouped because the isolation toggle is meaningless without the
              path above it: it decides whether that folder is mounted
              directly or cloned first. */}
          <div className="fgroup">
            <div className="fgroup-hdr">Workspace</div>
            <div className="fg">
              <div className="tog-row">
                <button
                  className={`s-toggle${noWorkspace ? ' on' : ''}`}
                  onClick={() => setNoWorkspace(!noWorkspace)}
                />
                No workspace bind mount
              </div>
              <div className="fhint">Create a sandbox with no folder mounted. Requires an explicit name below.</div>
            </div>
            {!noWorkspace && (
            <div className="fg">
              <label className="flabel">Path</label>
              <div className="frow-2">
                <input
                  className="finput"
                  value={workspace}
                  placeholder="/Users/you/Code/my-project"
                  onChange={(e) => { setWorkspace(e.target.value); setWsEdited(true) }}
                  autoFocus
                />
                <button className="btn btn-default btn-sm" onClick={handleBrowse}>Browse…</button>
              </div>
              <div className="fhint">The directory sbx mounts as the agent's primary workspace.</div>
            </div>
            )}
            {!noWorkspace && (
            <div className="fg">
              <label className="flabel">Isolation</label>
              <div className="tog-row">
                <button
                  className={`s-toggle${clone ? ' on' : ''}`}
                  onClick={() => { if (!feature) setClone(!clone) }}
                  disabled={feature}
                  title={feature ? 'A feature always runs on an isolated clone' : undefined}
                />
                Git clone isolation{' '}
                <code style={{ fontSize: 11, background: 'var(--bg-subtle)', padding: '1px 6px', borderRadius: 4 }}>
                  --clone
                </code>
              </div>
              <div className="fhint">
                {feature
                  ? 'A feature always runs on an isolated clone — work here, then Merge work to host when it’s done.'
                  : <>Work in a standalone clone; your changes stay in the sandbox until you fetch them, instead of mounting your working tree directly.
                    {newSandboxWorkspace && ' On by default here because sessions in a project share its folder.'}</>}
              </div>

              {clone && wsIsRepo === false && (
                <div className="clone-warn">
                  <span>
                    This folder isn't a Git repository, so <code>--clone</code> has nothing to clone.
                  </span>
                  <button className="btn btn-default btn-sm" onClick={handleGitInit} disabled={gitIniting}>
                    {gitIniting ? 'Initializing…' : 'Initialize repository'}
                  </button>
                </div>
              )}

              {/* Guard: creating a non-isolated sandbox in a folder that already
                  has one means both mount the same working tree — edits collide. */}
              {!clone && (() => {
                const inUse = sandboxes.filter((s) => s.workspace === workspace).length
                return inUse > 0 ? (
                  <div className="clone-warn">
                    <span>
                      This folder already has {inUse} sandbox{inUse > 1 ? 'es' : ''}. Without isolation they mount the
                      same working tree — concurrent edits can collide or corrupt the Git index.
                    </span>
                    <button className="btn btn-default btn-sm" onClick={() => setClone(true)}>Enable isolation</button>
                  </div>
                ) : null
              })()}
            </div>
            )}
          </div>

          {/* MCP servers from the gateway. Selecting any switches this sandbox
              to static mode; selecting none leaves the agent free to discover
              servers itself at runtime.

              The mode is stated rather than hinted at: which servers a sandbox
              can reach is a consequence worth reading, and as a grey suffix on
              the label it was routinely missed. It's derived from the selection
              instead of being its own control because that's the only thing sbx
              can express — "static with nothing pre-loaded" isn't a state, so a
              switch offering it would lie. Each mode therefore carries the
              action that leaves it. */}
          {mcpListed && (
            <div className="fg">
              <label className="flabel">MCP servers</label>
              <div className={`mcp-mode${selMcps.length ? ' static' : ''}`}>
                {selMcps.length ? <Pin size={14} /> : <Zap size={14} />}
                <div className="mcp-mode-txt">
                  <b>{selMcps.length ? 'Static' : 'Dynamic'}</b>
                  <span>
                    {selMcps.length
                      ? `Only ${andList(selMcps)} ${selMcps.length === 1 ? 'is' : 'are'} loaded — nothing else is reachable.`
                      : "The agent finds servers itself through the gateway's mcp-find tool, as it needs them."}
                  </span>
                </div>
                {selMcps.length > 0 ? (
                  <button type="button" className="mcp-mode-act" onClick={() => setSelMcps([])}>
                    Back to dynamic
                  </button>
                ) : mcpServers.length === 0 && (
                  <button
                    type="button" className="mcp-mode-act" onClick={registerMcp}
                    title="Closes this form and opens Library → MCP servers"
                  >
                    Register one…
                  </button>
                )}
              </div>
              {mcpServers.length > 0 && (
                <>
                  <div className="mcp-pick-cap">Or pre-load specific servers, and only those:</div>
                  <div className="mcp-pick">
                    {mcpServers.map((m) => {
                      // Only render an icon den actually ships. Hiding a broken
                      // one after the fact still left its 14px slot, and a chip
                      // with a hole where a logo should be reads as a button
                      // that failed to load rather than one you can press.
                      const icon = mcpIcon(m.toLowerCase())
                      return (
                        <button
                          key={m}
                          className={`mcp-pick-item${selMcps.includes(m) ? ' on' : ''}`}
                          onClick={() => setSelMcps((cur) => cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m])}
                        >
                          {icon && <img src={icon} alt=""
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
                          {m}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Mixin kits — stacked onto the agent at creation (--kit). Accepts
              local kits and remote OCI references (pulled by sbx at creation). */}
          <div className="fg">
            <label className="flabel">Mixin kits <span className="flabel-hint">layered onto the agent</span></label>

            {/* Selected kits as removable items */}
            {selKits.length > 0 && (
              <div className="kit-sel-list">
                {selKits.map((entry) => {
                  const known = kitKinds[entry]
                  const k = availKits.find((a) => a.dir === entry) ?? (known ? { name: known.name, dir: entry } : undefined)
                  const remote = !k && entry.includes('/')
                  // A sandbox kit supplies the image and entrypoint, so label it
                  // as the base rather than showing mixin capability chips.
                  const isBase = known?.kind === 'sandbox'
                  return (
                    <div key={entry} className="kit-sel-item">
                      {remote ? <DownloadCloud size={13} /> : <Layers size={13} />}
                      <span className="kit-sel-name">{k?.name ?? entry}</span>
                      {remote
                        ? <span className="kit-sel-tag">remote</span>
                        : isBase
                          ? <span className="kit-sel-tag">base agent</span>
                          : kitSpecs[entry] && <KitCaps p={kitSpecs[entry]} compact />}
                      <button className="kit-sel-rm" title="Remove" onClick={() => setSelKits((s) => s.filter((d) => d !== entry))}>
                        <X size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Searchable dropdown to add a local kit or paste an OCI reference */}
            <div className="kit-dd" ref={kitDdRef}>
              <button type="button" ref={kitDdTrigRef} className="kit-dd-trigger" onClick={() => setKitDdOpen((v) => !v)}>
                <Plus size={13} /> Add a mixin kit
                <ChevronDown size={13} style={{ marginLeft: 'auto', color: 'var(--t3)' }} />
              </button>
              {kitDdOpen && kitDdPos && createPortal(
                <div
                  className="kit-dd-menu"
                  ref={kitDdMenuRef}
                  style={{ left: kitDdPos.left, width: kitDdPos.width, maxHeight: kitDdPos.maxHeight, top: kitDdPos.top, bottom: kitDdPos.bottom }}
                >
                  <div className="kit-dd-search">
                    <Search size={13} className="kit-dd-search-ic" />
                    <input
                      autoFocus
                      value={kitQuery}
                      placeholder="Search local kits or paste an OCI reference…"
                      onChange={(e) => setKitQuery(e.target.value)}
                      onKeyDown={(e) => {
                        const q = kitQuery.trim()
                        if (e.key === 'Enter' && q.includes('/') && !selKits.includes(q)) {
                          setSelKits((s) => [...s, q]); setKitQuery(''); setKitDdOpen(false)
                        }
                      }}
                    />
                  </div>
                  <div className="kit-dd-options">
                    {(() => {
                      const raw = kitQuery.trim()
                      const q = raw.toLowerCase()
                      const opts = availKits.filter((k) => !selKits.includes(k.dir) && (!q || k.name.toLowerCase().includes(q)))
                      const isRef = raw.includes('/') && !selKits.includes(raw)
                      return (
                        <>
                          {isRef && (
                            <button
                              className="kit-dd-opt kit-dd-ref"
                              onClick={() => { setSelKits((s) => [...s, raw]); setKitQuery(''); setKitDdOpen(false) }}
                            >
                              <DownloadCloud size={13} /> Add remote kit: <span className="kit-dd-ref-v">{raw}</span>
                            </button>
                          )}
                          {opts.map((k) => (
                            <div key={k.dir} className="kit-dd-opt-row">
                              <button
                                className="kit-dd-opt"
                                onClick={() => { setSelKits((s) => [...s, k.dir]); setKitQuery(''); setKitDdOpen(false) }}
                              >
                                <Layers size={13} /> {k.name}
                              </button>
                              {kitSpecs[k.dir] && <KitCaps p={kitSpecs[k.dir]} compact />}
                            </div>
                          ))}
                          {!isRef && opts.length === 0 && (
                            <div className="kit-dd-empty">
                              {raw ? 'No local match — paste a full OCI reference to add a remote kit' : 'No local kits — paste an OCI reference to add a remote kit'}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>,
                document.body
              )}
            </div>
          </div>

          {/* Kit arguments (sbx >= 0.42): named values a selected kit declares
              via `args:`, filled in here and passed as `--kit-arg`. Grouped
              under the declaring kit's name when more than one kit is
              selected, so an arg's origin is never ambiguous. */}
          {kitsWithArgs.length > 0 && (
            <div className="fgroup">
              <div className="fgroup-hdr">Kit arguments</div>
              {kitsWithArgs.map((k) => (
                <div className="fg" key={k.dir}>
                  {kitsWithArgs.length > 1 && <label className="flabel">{k.name}</label>}
                  {k.args.map((a) => (
                    <div key={a.name} style={{ marginBottom: 8 }}>
                      <label className="flabel">
                        {a.name}{a.required && <span title="Required" style={{ color: 'var(--destruct)' }}> *</span>}
                        {a.description && <span className="flabel-hint"> {a.description}</span>}
                      </label>
                      <input
                        className="finput"
                        value={kitArgValues[k.dir]?.[a.name] ?? a.default ?? ''}
                        placeholder={a.default || a.name}
                        onChange={(e) => setKitArgValues((v) => ({
                          ...v, [k.dir]: { ...v[k.dir], [a.name]: e.target.value }
                        }))}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          </div>
          )}

          {tab === 'advanced' && (
          <div className="m-tabpanel" role="tabpanel">
          {/* What the sandbox runs on, and how much of the machine it gets. */}
          <div className="fgroup">
            <div className="fgroup-hdr">Runtime</div>
            {/* Base: new agent image vs an existing template */}
            <div className="fg">
              <label className="flabel">Base image</label>
              <div className="src-seg">
                <button className={`src-seg-item${source === 'new' ? ' active' : ''}`} onClick={() => setSource('new')}>
                  Default
                </button>
                <button
                  className={`src-seg-item${source === 'template' ? ' active' : ''}`}
                  onClick={() => setSource('template')}
                  disabled={templates.length === 0}
                  title={templates.length === 0 ? 'No templates available' : undefined}
                >
                  From template
                </button>
              </div>
              {source === 'template' && (
                <>
                  <input
                    className="finput"
                    style={{ marginTop: 8 }}
                    list="tpl-refs"
                    value={template}
                    spellCheck={false}
                    placeholder="registry/repo:tag — pick a local template or paste an OCI reference"
                    onChange={(e) => setTemplate(e.target.value)}
                  />
                  <datalist id="tpl-refs">
                    {templates.map((t) => (
                      <option key={t.id} value={`${t.repository}:${t.tag}`}>{t.tag} · {t.flavor}</option>
                    ))}
                  </datalist>
                  <div className="fhint">Local templates autocomplete; or paste a full OCI reference — sbx pulls it at creation.</div>
                </>
              )}
            </div>
            <div className="fg">
              <label className="flabel" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Memory
                <span className="mem-slider-value">{memValue}</span>
              </label>
              <div className="mem-slider-wrap">
                <input
                  type="range" className="mem-slider"
                  min={0} max={MEM_VALUES.length - 1} value={memIdx}
                  style={{ '--pct': memPct } as React.CSSProperties}
                  onChange={(e) => setMemIdx(+e.target.value)}
                />
                <div className="mem-slider-labels">
                  {MEM_VALUES.map((v) => <span key={v}>{v}</span>)}
                </div>
              </div>
            </div>
          </div>

          {/* What the sandbox exposes outward and what gets passed in. */}
          <div className="fgroup">
            <div className="fgroup-hdr">Ports & environment</div>
            {/* Published ports. Only settable at creation — `sbx run`/`create`
                apply -p when the sandbox is made and ignore it on re-attach,
                so afterwards the Network panel (sbx ports) is the way in. */}
            <div className="fg">
              <label className="flabel">
                Publish ports <span className="flabel-hint">host access to sandbox services</span>
              </label>
              <input
                className="finput"
                value={portsRaw}
                spellCheck={false}
                placeholder="8080:80, 3000"
                onChange={(e) => setPortsRaw(e.target.value)}
              />
              <div className="fhint">
                <code>[[HOST_IP:]HOST_PORT:]SANDBOX_PORT[/PROTOCOL]</code>, comma-separated. Creation-time only
                (sbx v0.37+) — add or remove them later from the Network panel.
              </div>
            </div>
            <div className="fg">
              <label className="flabel">
                Environment variables <span className="flabel-hint">one KEY=value per line</span>
              </label>
              <textarea
                className="finput"
                value={envRaw}
                spellCheck={false}
                rows={3}
                placeholder={'NODE_ENV=development\nLOG_LEVEL=debug'}
                onChange={(e) => setEnvRaw(e.target.value)}
                style={{ resize: 'vertical', fontFamily: "'SF Mono','Menlo',monospace" }}
              />
              {badEnvLines(envRaw).length > 0 && (
                <div className="fhint" style={{ color: 'var(--destruct)' }}>
                  Ignored — no <code>=</code>: {badEnvLines(envRaw).map((l) => `"${l}"`).join(', ')}
                </div>
              )}
              <div className="fhint">
                Passed as <code>-e</code>. <strong>Not for secrets</strong> — a value here
                goes on the command line, where any process on this Mac can read it. Use{' '}
                <strong>Settings → Secrets</strong>, which injects through the proxy instead.
              </div>
            </div>
          </div>

          <div className="fgroup">
            <div className="fgroup-hdr">Skills</div>
            {/* Shared skills store (sbx v0.37+). Default on, matching sbx. The
                group header names the field, so no second label here. */}
            <div className="fg">
              <div className="tog-row">
                <button
                  className={`s-toggle${shareSkills ? ' on' : ''}`}
                  onClick={() => setShareSkills((v) => !v)}
                />
                Mount the shared skills store{' '}
                <code style={{ fontSize: 11, background: 'var(--bg-subtle)', padding: '1px 6px', borderRadius: 4 }}>
                  --no-share-skills
                </code>
              </div>
              <div className="fhint">
                Skills imported with <code>sbx skills import</code> are mounted read-write, so this sandbox both
                reads them and can add to them. Uncheck to isolate it (<code>--no-share-skills</code>).
              </div>
            </div>
          </div>
          </div>
          )}
          </>
          )}
        </div>

        {/* Errors are pinned rather than left in the scroll flow: with two
            tabs, a message about a field in the other panel would otherwise
            render off-screen with nothing to point at. */}
        {error && <div className="m-err">{error}</div>}

        {/* Command preview — pinned above the footer, not a third tab. It is
            a readout of the whole form, so it has to stay reachable while you
            edit the flags it renders. */}
        {!creating && (
          <div className="cmd-strip">
            <button
              className="cmd-strip-tog"
              aria-expanded={cmdOpen}
              onClick={() => { const v = !cmdOpen; setCmdOpen(v); localStorage.setItem('den:showCreateCmd', v ? '1' : '0') }}
            >
              <ChevronDown size={13} className="cmd-strip-chev" style={{ transform: cmdOpen ? undefined : 'rotate(-90deg)' }} />
              Command preview
            </button>
            {cmdOpen && (
              <div className="cmd-blk">
                {cmdTokens.map((word, i) => {
                  const cls =
                    word === 'sbx' ? 'cm-b'
                      : word === 'create' || word === agent ? 'cm-a'
                      : word.startsWith('-') ? 'cm-f'
                      : 'cm-v'
                  return <span key={i} className={cls}>{word} </span>
                })}
              </div>
            )}
          </div>
        )}
        <div className="m-ftr">
          {creating ? (
            <>
              <button className="btn btn-ghost" onClick={dismiss}>Run in background</button>
              <button className="btn btn-primary" disabled>Creating…</button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={dismiss}>Cancel</button>
              <button className="btn btn-primary" onClick={handleLaunch}>Create Sandbox</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
