import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { ACCENTS } from '../lib/accent'
import { TERM_THEMES } from '../lib/termThemes'
import { SecretsPanel } from './SecretsPage'
import { LogsPanel } from './LogsPanel'
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
  const { theme, toggleTheme, accent, accentColor, setAccent, setCustomAccent, termTheme, setTermTheme } = useStore()
  const [tab, setTab] = useState<'general' | 'secrets' | 'logs'>('general')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)
  const [palette, setPalette] = useState<string[]>([])

  // When a custom accent is active, generate its ramp via rampa (main process).
  useEffect(() => {
    if (accent !== 'custom') { setPalette([]); return }
    window.minipit?.generatePalette(accentColor).then((p) => setPalette(p ?? [])).catch(() => setPalette([]))
  }, [accent, accentColor])

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
        {tab === 'general' && (
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={handleSave}>
            {saved ? '✓ Saved' : 'Save'}
          </button>
        )}
      </div>

      <div className="tabs">
        <div className={`tab${tab === 'general' ? ' active' : ''}`} onClick={() => setTab('general')}>General</div>
        <div className={`tab${tab === 'secrets' ? ' active' : ''}`} onClick={() => setTab('secrets')}>Secrets</div>
        <div className={`tab${tab === 'logs' ? ' active' : ''}`} onClick={() => setTab('logs')}>Logs</div>
      </div>

      {tab === 'logs' ? (
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
            <select className="s-input" style={{ width: 160, cursor: 'pointer' }} value={termTheme} onChange={(e) => setTermTheme(e.target.value)}>
              {TERM_THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
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
              {/* Custom color — generates a ramp via rampa-sdk */}
              <label
                className={`accent-sw accent-sw-custom${accent === 'custom' ? ' on' : ''}`}
                title="Custom color"
                style={{ background: accent === 'custom' ? accentColor : undefined }}
              >
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setCustomAccent(e.target.value)}
                  style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                />
              </label>
            </div>
          </div>
          {accent === 'custom' && palette.length > 0 && (
            <div className="ss-row" style={{ paddingTop: 0 }}>
              <div>
                <div className="ss-lbl">Generated palette</div>
                <div className="ss-sub">Ramp generated from your color with rampa.</div>
              </div>
              <div className="ramp-strip">
                {palette.map((c, i) => (
                  <span key={i} className="ramp-step" title={c} style={{ background: c }} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="ss">
          <div className="ss-hdr">Docker Sandboxes</div>
          <div className="ss-row">
            <div>
              <div className="ss-lbl">sbx binary path</div>
              <div className="ss-sub">Auto-detected via Homebrew.</div>
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              <input
                className="s-input"
                value={settings.sbxPath}
                onChange={(e) => setSettings((s) => ({ ...s, sbxPath: e.target.value }))}
                style={{ width: 192 }}
              />
              <button className="btn btn-default btn-sm">Verify</button>
            </div>
          </div>
          <div className="ss-row">
            <div>
              <div className="ss-lbl">Account</div>
              <div className="ss-sub">javier.alonso@docker.com</div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--destruct)' }}>Sign out</button>
          </div>
        </div>

        <div className="ss">
          <div className="ss-hdr">Polling</div>
          <div className="ss-row">
            <div>
              <div className="ss-lbl">Interval (focused)</div>
              <div className="ss-sub">While minipit is the active window.</div>
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
