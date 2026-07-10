import { useState, useEffect, useRef } from 'react'
import { Sun, Moon, Monitor, Eye, ExternalLink } from 'lucide-react'
import { useStore } from '../store'
import { THEMES, type Theme } from '../lib/themes'
import { TERM_THEMES, TERM_THEME_GROUPS, DEFAULT_TERM_THEME } from '../lib/termThemes'
import { SecretsPanel } from './SecretsPage'
import { SbxRuntimePanel } from './SbxRuntimePanel'
import { FieldSelect, type FieldOption } from './FieldSelect'
import {
  SOUND_OPTIONS, type SoundId, isSoundEnabled, setSoundEnabled,
  getSoundId, setSoundId, setCustomSound, getCustomSound, previewSound,
  isAskSoundEnabled, setAskSoundEnabled, getAskSoundId, setAskSoundId, setAskCustomSound, getAskCustomSound
} from '../lib/sound'
import type { AppSettings } from '../types'

const DEFAULT_SETTINGS: AppSettings = {
  sbxPath: '/opt/homebrew/bin/sbx',
  pollFocused: '5s',
  pollBackground: '30s',
  launchAtLogin: true,
  menuBarOnly: true,
  notifyOnExit: true,
  notifyOnError: true,
  keepAwake: true
}

// A tiny mini-window swatch for a theme, shown inline in the theme dropdown
// (trigger + each option). Uses the theme's own light palette + accent so the
// icon previews the actual colors.
function themeIcon(t: Theme): React.ReactNode {
  return (
    <span className="theme-ico" style={{ background: t.light['--bg-subtle'] }}>
      <span className="theme-ico-bar" style={{ background: t.light['--bg-muted'] }} />
      <span className="theme-ico-dot" style={{ background: t.accent }} />
    </span>
  )
}

export function SettingsPage() {
  const {
    themePref, setThemePref, accent, setAccent,
    termTheme, setTermTheme, display, setDisplay,
    fileOpenMode, setFileOpenMode, density, setDensity, densityCustom, setDensityCustom
  } = useStore()
  const [tab, setTab] = useState<'general' | 'runtime' | 'secrets'>('general')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  // Finalize-sound prefs (stored in localStorage via lib/sound).
  const [soundOn, setSoundOn] = useState(isSoundEnabled())
  const [soundId, setSound] = useState<SoundId>(getSoundId())
  const [customName, setCustomName] = useState<string | null>(null)

  // Ask-sound prefs (agent needs your input — question/permission/idle).
  const [askOn, setAskOn] = useState(isAskSoundEnabled())
  const [askId, setAsk] = useState<SoundId>(getAskSoundId())
  const [askCustomName, setAskCustomName] = useState<string | null>(null)

  const onPickCustom = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCustomSound(reader.result as string)
      setCustomName(file.name)
      setSound('custom'); setSoundId('custom')
      previewSound('custom', reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const onPickAskCustom = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setAskCustomSound(reader.result as string)
      setAskCustomName(file.name)
      setAsk('custom'); setAskSoundId('custom')
      previewSound('custom', reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  // Snapshot of the last-persisted settings, so the auto-save effect can tell a
  // real edit from the initial load (and skip no-op saves).
  const savedSnapshot = useRef('')

  useEffect(() => {
    window.minipit?.getSettings()
      .then((s) => {
        const v = s ?? DEFAULT_SETTINGS
        savedSnapshot.current = JSON.stringify(v)
        setSettings(v)
      })
      .catch(() => { savedSnapshot.current = JSON.stringify(DEFAULT_SETTINGS) })
  }, [])

  // Auto-save: persist on change (debounced). No Save button needed.
  useEffect(() => {
    const cur = JSON.stringify(settings)
    if (!savedSnapshot.current || cur === savedSnapshot.current) return
    const t = setTimeout(() => {
      window.minipit?.saveSettings(settings).catch(() => {})
      savedSnapshot.current = cur
      setSaved(true)
      setTimeout(() => setSaved(false), 1200)
    }, 400)
    return () => clearTimeout(t)
  }, [settings])

  const toggle = (key: keyof AppSettings) =>
    setSettings((s) => ({ ...s, [key]: !s[key as keyof AppSettings] }))

  return (
    <div className="page">
      <div className="page-hdr">
        <span className="page-title">Settings</span>
        {(tab === 'general' || tab === 'runtime') && (
          <span className="ss-autosave" style={{ marginLeft: 'auto' }}>
            {saved ? '✓ Saved' : 'Changes save automatically'}
          </span>
        )}
      </div>

      <div className="tabs">
        <div className={`tab${tab === 'general' ? ' active' : ''}`} onClick={() => setTab('general')}>General</div>
        <div className={`tab${tab === 'runtime' ? ' active' : ''}`} onClick={() => setTab('runtime')}>Runtime</div>
        <div className={`tab${tab === 'secrets' ? ' active' : ''}`} onClick={() => setTab('secrets')}>Secrets</div>
      </div>

      {tab === 'runtime' ? (
        <SbxRuntimePanel
          sbxPath={settings.sbxPath}
          onChangePath={(v) => setSettings((s) => ({ ...s, sbxPath: v }))}
        />
      ) : tab === 'secrets' ? (
        <div className="page-body" style={{ padding: '16px 28px 28px' }}>
          <SecretsPanel />
        </div>
      ) : (
      <div className="page-body" style={{ padding: '24px 28px 28px' }}>
        <div className="ss">
          <div className="ss-hdr">Appearance</div>
          <div className="ss-row">
            <div>
              <div className="ss-lbl">Theme</div>
              <div className="ss-sub">Light, dark, or follow your computer.</div>
            </div>
            <div className="seg" role="group" aria-label="Theme">
              {([
                { id: 'light', label: 'Light', Icon: Sun },
                { id: 'dark', label: 'Dark', Icon: Moon },
                { id: 'system', label: 'System', Icon: Monitor }
              ] as const).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={`seg-opt${themePref === id ? ' on' : ''}`}
                  onClick={() => setThemePref(id)}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
          </div>
          <div className="ss-row">
            <div>
              <div className="ss-lbl">Density</div>
              <div className="ss-sub">
                Scales the whole interface at once. Choose Comfortable for larger,
                or Custom for your own zoom multiplier.
              </div>
            </div>
            <div className="ss-density">
              <div className="seg" role="group" aria-label="Density">
                {([
                  { id: 'default', label: 'Compact' },
                  { id: 'comfortable', label: 'Comfortable' },
                  { id: 'custom', label: 'Custom' }
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    className={`seg-opt${density === id ? ' on' : ''}`}
                    onClick={() => setDensity(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {density === 'custom' && (
                <label className="ss-density-custom">
                  <span>×</span>
                  <input
                    type="number"
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={densityCustom}
                    onChange={(e) => setDensityCustom(Number(e.target.value))}
                  />
                </label>
              )}
            </div>
          </div>
          <div className="ss-row">
            <div>
              <div className="ss-lbl">Terminal theme</div>
              <div className="ss-sub">Colors for the agent & shell terminals.</div>
            </div>
            <div style={{ width: 240 }}>
              <FieldSelect
                ariaLabel="Terminal theme"
                value={termTheme}
                onChange={setTermTheme}
                options={[
                  ...TERM_THEMES.filter((t) => t.id === DEFAULT_TERM_THEME).map(
                    (t): FieldOption => ({ value: t.id, label: t.label })
                  ),
                  ...TERM_THEME_GROUPS.flatMap((g): FieldOption[] => [
                    { value: `__hdr_${g.mode}`, label: g.label, header: true },
                    ...TERM_THEMES.filter((t) => t.mode === g.mode && t.id !== DEFAULT_TERM_THEME).map(
                      (t): FieldOption => ({ value: t.id, label: t.label })
                    )
                  ])
                ]}
              />
            </div>
          </div>
          <div className="ss-row">
            <div>
              <div className="ss-lbl">Theme</div>
              <div className="ss-sub">A soft, full-interface color palette. Each color is its own coordinated theme.</div>
            </div>
            <div style={{ width: 240 }}>
              <FieldSelect
                ariaLabel="Theme"
                value={accent}
                onChange={setAccent}
                options={THEMES.map((t): FieldOption => ({
                  value: t.id,
                  label: t.label,
                  icon: themeIcon(t)
                }))}
              />
            </div>
          </div>
        </div>

        <div className="ss">
          <div className="ss-hdr">Files</div>
          <div className="ss-row">
            <div>
              <div className="ss-lbl">Open files with</div>
              <div className="ss-sub">
                What a click on a file does. The other option stays available from the right-click menu.
              </div>
            </div>
            <div className="seg" role="group" aria-label="Open files with">
              {([
                { id: 'preview', label: 'Preview', Icon: Eye },
                { id: 'system', label: 'Default app', Icon: ExternalLink }
              ] as const).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={`seg-opt${fileOpenMode === id ? ' on' : ''}`}
                  onClick={() => setFileOpenMode(id)}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="ss">
          <div className="ss-hdr">Sidebar display</div>
          {([
            { key: 'agentBadge', lbl: 'Agent badge on avatars', sub: 'The agent glyph in each sandbox avatar’s corner.' },
            { key: 'sandboxSub', lbl: 'Sandbox status line', sub: 'The second line under each sandbox name (project · status).' },
          ] as const).map(({ key, lbl, sub }) => (
            <div className="ss-row" key={key}>
              <div>
                <div className="ss-lbl">{lbl}</div>
                <div className="ss-sub">{sub}</div>
              </div>
              <button
                className={`s-toggle${display[key] ? ' on' : ''}`}
                onClick={() => setDisplay(key, !display[key])}
              />
            </div>
          ))}
        </div>

        <div className="ss">
          <div className="ss-hdr">Notifications</div>
          <div className="ss-row">
            <div>
              <div className="ss-lbl">Sound when an agent finishes</div>
              <div className="ss-sub">Play a cue when an agent hands a task back to you.</div>
            </div>
            <button
              className={`s-toggle${soundOn ? ' on' : ''}`}
              onClick={() => { const v = !soundOn; setSoundOn(v); setSoundEnabled(v) }}
            />
          </div>
          <div className="ss-row">
            <div>
              <div className="ss-lbl">Finish sound</div>
              <div className="ss-sub">
                {soundId === 'custom' && customName ? `Custom: ${customName}` : 'Pick a built-in cue or your own audio file.'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 150 }}>
                <FieldSelect
                  ariaLabel="Finish sound"
                  value={soundId}
                  disabled={!soundOn}
                  onChange={(v) => { const id = v as SoundId; setSound(id); setSoundId(id) }}
                  options={SOUND_OPTIONS.map((o): FieldOption => ({ value: o.id, label: o.label }))}
                />
              </div>
              {soundId === 'custom' ? (
                <label className="btn btn-default btn-sm" style={{ cursor: 'pointer' }}>
                  Choose…
                  <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={onPickCustom} />
                </label>
              ) : (
                <button className="btn btn-default btn-sm" disabled={!soundOn} onClick={() => previewSound(soundId, getCustomSound())}>
                  Test
                </button>
              )}
            </div>
          </div>
          <div className="ss-row">
            <div>
              <div className="ss-lbl">Sound when an agent needs you</div>
              <div className="ss-sub">Play a different cue when the agent asks a question or needs permission.</div>
            </div>
            <button
              className={`s-toggle${askOn ? ' on' : ''}`}
              onClick={() => { const v = !askOn; setAskOn(v); setAskSoundEnabled(v) }}
            />
          </div>
          <div className="ss-row">
            <div>
              <div className="ss-lbl">Question sound</div>
              <div className="ss-sub">
                {askId === 'custom' && askCustomName ? `Custom: ${askCustomName}` : 'Pick a built-in cue or your own audio file.'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 150 }}>
                <FieldSelect
                  ariaLabel="Question sound"
                  value={askId}
                  disabled={!askOn}
                  onChange={(v) => { const id = v as SoundId; setAsk(id); setAskSoundId(id) }}
                  options={SOUND_OPTIONS.map((o): FieldOption => ({ value: o.id, label: o.label }))}
                />
              </div>
              {askId === 'custom' ? (
                <label className="btn btn-default btn-sm" style={{ cursor: 'pointer' }}>
                  Choose…
                  <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={onPickAskCustom} />
                </label>
              ) : (
                <button className="btn btn-default btn-sm" disabled={!askOn} onClick={() => previewSound(askId, getAskCustomSound())}>
                  Test
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="ss">
          <div className="ss-hdr">Polling</div>
          <div className="ss-row">
            <div>
              <div className="ss-lbl">Interval (focused)</div>
              <div className="ss-sub">While den is the active window.</div>
            </div>
            <input
              className="s-input"
              value={settings.pollFocused}
              onChange={(e) => setSettings((s) => ({ ...s, pollFocused: e.target.value }))}
              style={{ width: 52, textAlign: 'center' }}
            />
          </div>
          <div className="ss-row">
            <div>
              <div className="ss-lbl">Interval (background)</div>
              <div className="ss-sub">When minimised or behind other windows.</div>
            </div>
            <input
              className="s-input"
              value={settings.pollBackground}
              onChange={(e) => setSettings((s) => ({ ...s, pollBackground: e.target.value }))}
              style={{ width: 52, textAlign: 'center' }}
            />
          </div>
        </div>

        <div className="ss">
          <div className="ss-hdr">App</div>
          {(
            [
              { key: 'launchAtLogin', label: 'Launch at login', sub: '' },
              { key: 'menuBarOnly', label: 'Menu bar only', sub: 'Hide from Dock.' },
              { key: 'notifyOnExit', label: 'Notify on agent exit', sub: '' },
              { key: 'notifyOnError', label: 'Notify on errors', sub: '' },
              { key: 'keepAwake', label: 'Keep computer awake', sub: 'Prevent system sleep while any sandbox is running.' }
            ] as const
          ).map(({ key, label, sub }) => (
            <div className="ss-row" key={key}>
              <div>
                <div className="ss-lbl">{label}</div>
                {sub && <div className="ss-sub">{sub}</div>}
              </div>
              <button
                className={`s-toggle${settings[key] ? ' on' : ''}`}
                onClick={() => toggle(key)}
              />
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  )
}
