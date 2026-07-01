import { useState, useEffect, useRef } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useStore } from '../store'
import { ACCENTS } from '../lib/accent'
import { TERM_THEMES, TERM_THEME_GROUPS, DEFAULT_TERM_THEME } from '../lib/termThemes'
import { SecretsPanel } from './SecretsPage'
import { LogsPanel } from './LogsPanel'
import { SbxRuntimePanel } from './SbxRuntimePanel'
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
  notifyOnError: true
}

export function SettingsPage() {
  const {
    themePref, setThemePref, accent, accentColor, customAccents,
    setAccent, setCustomAccent, saveCustomAccent, removeCustomAccent,
    termTheme, setTermTheme, display, setDisplay, setSubLineMode
  } = useStore()
  const [tab, setTab] = useState<'general' | 'runtime' | 'secrets' | 'logs'>('general')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)
  const [palette, setPalette] = useState<string[]>([])

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

  // The active custom hex: the live picker color, or a saved swatch's color.
  const activeHex =
    accent === 'custom'
      ? accentColor
      : customAccents.find((s) => s.id === accent)?.hex ?? null

  // Generate the ramp for the active custom/saved color to show the strip.
  useEffect(() => {
    if (!activeHex) { setPalette([]); return }
    window.minipit?.generatePalette(activeHex).then((p) => setPalette(p ?? [])).catch(() => setPalette([]))
  }, [activeHex])

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
        <div className={`tab${tab === 'logs' ? ' active' : ''}`} onClick={() => setTab('logs')}>Logs</div>
      </div>

      {tab === 'runtime' ? (
        <SbxRuntimePanel
          sbxPath={settings.sbxPath}
          onChangePath={(v) => setSettings((s) => ({ ...s, sbxPath: v }))}
        />
      ) : tab === 'logs' ? (
        <LogsPanel />
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
                { id: 'system', label: 'Computer', Icon: Monitor }
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
              <div className="ss-lbl">Terminal theme</div>
              <div className="ss-sub">Colors for the agent & shell terminals.</div>
            </div>
            <select className="s-input" style={{ width: 200, cursor: 'pointer' }} value={termTheme} onChange={(e) => setTermTheme(e.target.value)}>
              {TERM_THEMES.filter((t) => t.id === DEFAULT_TERM_THEME).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              {TERM_THEME_GROUPS.map((g) => (
                <optgroup key={g.mode} label={g.label}>
                  {TERM_THEMES.filter((t) => t.mode === g.mode && t.id !== DEFAULT_TERM_THEME).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="ss-row">
            <div>
              <div className="ss-lbl">Accent color</div>
              <div className="ss-sub">Used for primary buttons and highlights.</div>
            </div>
            <div className="accent-swatches">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  className={`accent-sw${accent === a.id ? ' on' : ''}`}
                  title={a.label}
                  onClick={() => setAccent(a.id)}
                  style={{ background: a.color ?? 'var(--t1)' }}
                />
              ))}
              {/* Saved custom swatches — click to apply, × to remove. */}
              {customAccents.map((s) => (
                <span key={s.id} className="accent-sw-saved">
                  <button
                    className={`accent-sw${accent === s.id ? ' on' : ''}`}
                    title={s.hex}
                    onClick={() => setAccent(s.id)}
                    style={{ background: s.hex }}
                  />
                  <button
                    className="accent-sw-x"
                    title="Remove"
                    onClick={() => removeCustomAccent(s.id)}
                  >×</button>
                </span>
              ))}
              {/* Live color picker — generates a ramp via rampa-sdk. */}
              <label
                className={`accent-sw accent-sw-custom${accent === 'custom' ? ' on' : ''}`}
                title="Pick a custom color"
                style={accent === 'custom' ? { background: accentColor } : undefined}
              >
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setCustomAccent(e.target.value)}
                />
              </label>
            </div>
          </div>
          {activeHex && palette.length > 0 && (
            <div className="ss-row" style={{ paddingTop: 0 }}>
              <div>
                <div className="ss-lbl">Generated palette</div>
                <div className="ss-sub">Ramp generated from your color with rampa — drives buttons & highlights.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="ramp-strip">
                  {palette.map((c, i) => (
                    <span key={i} className="ramp-step" title={c} style={{ background: c }} />
                  ))}
                </div>
                {accent === 'custom' && (
                  <button className="btn btn-default btn-sm" onClick={() => saveCustomAccent(accentColor)}>
                    Save swatch
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="ss">
          <div className="ss-hdr">Sidebar display</div>
          {([
            { key: 'agentBadge', lbl: 'Agent badge on avatars', sub: 'The agent glyph in each sandbox avatar’s corner.' },
            { key: 'sandboxSub', lbl: 'Sandbox status line', sub: 'The second line under each sandbox name (project · status).' },
            { key: 'projectCounts', lbl: 'Project counts', sub: 'The sandbox-count pill on projects and grouped headers.' },
            { key: 'gitBranch', lbl: 'Git info', sub: 'Branch and repo info shown next to Git-tracked projects.' },
            { key: 'changeBadge', lbl: 'Uncommitted changes', sub: 'The change-count badge on running sandboxes.' },
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
          {display.sandboxSub && (
            <div className="ss-row">
              <div>
                <div className="ss-lbl">Status line shows</div>
                <div className="ss-sub">Agent status (Working…, Waiting) or the project folder name.</div>
              </div>
              <div className="seg" role="group" aria-label="Status line content">
                {([
                  { id: 'status', label: 'Agent status' },
                  { id: 'project', label: 'Project name' },
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    className={`seg-opt${display.subLineMode === id ? ' on' : ''}`}
                    onClick={() => setSubLineMode(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
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
              <select
                className="s-input"
                style={{ width: 150, cursor: 'pointer' }}
                value={soundId}
                disabled={!soundOn}
                onChange={(e) => { const id = e.target.value as SoundId; setSound(id); setSoundId(id) }}
              >
                {SOUND_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
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
              <select
                className="s-input"
                style={{ width: 150, cursor: 'pointer' }}
                value={askId}
                disabled={!askOn}
                onChange={(e) => { const id = e.target.value as SoundId; setAsk(id); setAskSoundId(id) }}
              >
                {SOUND_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
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
              { key: 'notifyOnError', label: 'Notify on errors', sub: '' }
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
