import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { ACCENTS } from '../lib/accent'
import { TERM_THEMES, TERM_THEME_GROUPS, DEFAULT_TERM_THEME } from '../lib/termThemes'
import { SecretsPanel } from './SecretsPage'
import { LogsPanel } from './LogsPanel'
import { SbxRuntimePanel } from './SbxRuntimePanel'
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
    theme, toggleTheme, accent, accentColor, customAccents,
    setAccent, setCustomAccent, saveCustomAccent, removeCustomAccent,
    termTheme, setTermTheme
  } = useStore()
  const [tab, setTab] = useState<'general' | 'runtime' | 'secrets' | 'logs'>('general')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)
  const [palette, setPalette] = useState<string[]>([])

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

  useEffect(() => {
    window.minipit?.getSettings().then((s) => setSettings(s ?? DEFAULT_SETTINGS)).catch(() => {})
  }, [])

  const handleSave = async () => {
    await window.minipit?.saveSettings(settings).catch(() => {})
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const toggle = (key: keyof AppSettings) =>
    setSettings((s) => ({ ...s, [key]: !s[key as keyof AppSettings] }))

  return (
    <div className="page">
      <div className="page-hdr">
        <span className="page-title">Settings</span>
        {(tab === 'general' || tab === 'runtime') && (
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={handleSave}>
            {saved ? '✓ Saved' : 'Save'}
          </button>
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
      <div className="page-body" style={{ padding: '8px 28px 28px' }}>
        <div className="ss">
          <div className="ss-hdr">Appearance</div>
          <div className="ss-row">
            <div>
              <div className="ss-lbl">Theme</div>
              <div className="ss-sub">Light or dark interface.</div>
            </div>
            <button className="btn btn-default btn-sm" onClick={toggleTheme}>
              {theme === 'dark' ? 'Dark' : 'Light'}
            </button>
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
