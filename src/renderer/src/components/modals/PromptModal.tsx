import { useState } from 'react'
import { useStore } from '../../store'

// Reusable single-input dialog driven by the store's `prompt` config, so any
// place (save snapshot, push to hub, …) can request a value without wiring its
// own modal. Callers throw from onSubmit to keep it open with an error.
export function PromptModal() {
  const prompt = useStore((s) => s.prompt)
  const closePrompt = useStore((s) => s.closePrompt)
  const [value, setValue] = useState(prompt?.defaultValue ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!prompt) return null

  const submit = async () => {
    const v = value.trim()
    if (!v || busy) return
    setBusy(true)
    setError('')
    try {
      await prompt.onSubmit(v)
      closePrompt()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={() => !busy && closePrompt()}>
      <div className="modal" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="m-hdr">
          <div className="m-title">{prompt.title}</div>
          {prompt.message && <div className="m-sub">{prompt.message}</div>}
        </div>

        <div className="m-body">
          <div className="fg">
            {prompt.label && <label className="flabel">{prompt.label}</label>}
            <input
              className="finput"
              autoFocus
              value={value}
              placeholder={prompt.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                else if (e.key === 'Escape' && !busy) closePrompt()
              }}
            />
          </div>

          {error && (
            <div style={{ color: 'var(--destruct)', fontSize: 12, marginTop: 4, padding: '8px 10px', background: 'rgba(239,68,68,0.06)', borderRadius: 6 }}>
              {error}
            </div>
          )}
        </div>

        <div className="m-ftr">
          <button className="btn btn-ghost" onClick={closePrompt} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!value.trim() || busy}>
            {busy ? 'Working…' : (prompt.confirmText ?? 'Save')}
          </button>
        </div>
      </div>
    </div>
  )
}
