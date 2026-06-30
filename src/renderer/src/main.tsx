import ReactDOM from 'react-dom/client'
import { App } from './App'
import { FileEditorWindow } from './FileEditorWindow'
import './styles/main.css'
import { applyAccent } from './lib/accent'

// Apply the persisted theme + accent before first paint to avoid a flash.
document.documentElement.setAttribute(
  'data-theme',
  localStorage.getItem('minipit:theme') === 'dark' ? 'dark' : 'light'
)
applyAccent(
  localStorage.getItem('minipit:accent') ?? 'graphite',
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
    />
  )
} else {
  root.render(<App />)
}
