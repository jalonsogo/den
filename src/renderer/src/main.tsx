import ReactDOM from 'react-dom/client'
import { App } from './App'
import { FileEditorWindow } from './FileEditorWindow'
import './styles/main.css'
import { applyAccent } from './lib/accent'

// Apply the persisted theme + accent before first paint to avoid a flash.
const themePref = localStorage.getItem('minipit:themePref') ?? 'system'
const resolvedTheme =
  themePref === 'dark' ||
  (themePref === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
    ? 'dark'
    : 'light'
document.documentElement.setAttribute('data-theme', resolvedTheme)
// UI density → whole-window zoom (applies to this window and the editor window).
// Keep in sync with store.ts densityFactor().
const densityRaw = localStorage.getItem('minipit:density')
const densityCustom = Math.min(2, Math.max(0.5, Number(localStorage.getItem('minipit:densityCustom')) || 1.2))
const densityZoom =
  densityRaw === 'custom' ? densityCustom : densityRaw === 'comfortable' ? 1.1 : 1
window.minipit?.setZoomFactor?.(densityZoom)
applyAccent(
  localStorage.getItem('minipit:accent') ?? 'blue',
  localStorage.getItem('minipit:accentColor') ?? '#3b82f6'
)

// Route: a separate editor window loads with hash #/editor?sandbox=…&path=…&name=…
const hash = window.location.hash
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

// NOTE: StrictMode is intentionally NOT used. Its dev-only double-invoke of
// effects (mount → dispose → remount) churns the imperative xterm.js + node-pty
// lifecycle — disposing the terminal and killing/respawning the PTY on every
// mount — which intermittently leaves the visible terminal blurred or bound to
// a dead PTY (the recurring "shell typing stopped working" bug).
if (hash.startsWith('#/editor')) {
  const params = new URLSearchParams(hash.split('?')[1] ?? '')
  root.render(
    <FileEditorWindow
      sandbox={params.get('sandbox') ?? ''}
      path={params.get('path') ?? ''}
      name={params.get('name') ?? ''}
      openDiff={params.get('diff') === '1'}
      reviewBranch={params.get('reviewBranch')}
    />
  )
} else {
  root.render(<App />)
}
