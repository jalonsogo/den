// Notification cues. Built-ins are synthesized with the Web Audio API so we
// don't ship binary assets; the user can also point at their own audio file
// (stored as a data URL in localStorage). Settings live alongside the other
// `minipit:*` prefs.
//
// Two independent cues:
//   • finalize — the agent finished a turn (Stop)
//   • ask      — the agent needs you: a question, permission, or idle input

export type SoundId = 'chime' | 'ding' | 'blip' | 'question' | 'knock' | 'custom'

export const SOUND_OPTIONS: { id: SoundId; label: string }[] = [
  { id: 'chime', label: 'Chime' },
  { id: 'ding', label: 'Ding' },
  { id: 'blip', label: 'Blip' },
  { id: 'question', label: 'Question' },
  { id: 'knock', label: 'Knock' },
  { id: 'custom', label: 'Custom file…' }
]

// ── Finalize cue (agent finished) ──
const KEY_ENABLED = 'minipit:soundEnabled'
const KEY_SOUND = 'minipit:finalizeSound'
const KEY_CUSTOM = 'minipit:finalizeSoundData'

export const isSoundEnabled = (): boolean => localStorage.getItem(KEY_ENABLED) !== '0'
export const setSoundEnabled = (on: boolean): void => localStorage.setItem(KEY_ENABLED, on ? '1' : '0')
export const getSoundId = (): SoundId => (localStorage.getItem(KEY_SOUND) as SoundId) || 'chime'
export const setSoundId = (id: SoundId): void => localStorage.setItem(KEY_SOUND, id)
export const getCustomSound = (): string | null => localStorage.getItem(KEY_CUSTOM)
export const setCustomSound = (dataUrl: string): void => localStorage.setItem(KEY_CUSTOM, dataUrl)

// ── Ask cue (agent needs your input) ──
const KEY_ASK_ENABLED = 'minipit:askSoundEnabled'
const KEY_ASK_SOUND = 'minipit:askSound'
const KEY_ASK_CUSTOM = 'minipit:askSoundData'

export const isAskSoundEnabled = (): boolean => localStorage.getItem(KEY_ASK_ENABLED) !== '0'
export const setAskSoundEnabled = (on: boolean): void => localStorage.setItem(KEY_ASK_ENABLED, on ? '1' : '0')
export const getAskSoundId = (): SoundId => (localStorage.getItem(KEY_ASK_SOUND) as SoundId) || 'question'
export const setAskSoundId = (id: SoundId): void => localStorage.setItem(KEY_ASK_SOUND, id)
export const getAskCustomSound = (): string | null => localStorage.getItem(KEY_ASK_CUSTOM)
export const setAskCustomSound = (dataUrl: string): void => localStorage.setItem(KEY_ASK_CUSTOM, dataUrl)

let ctx: AudioContext | null = null
function audioCtx(): AudioContext {
  return (ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)())
}

// Browsers/Electron start an AudioContext "suspended" until a user gesture, so
// cues triggered by background events (agent finished / needs you) would be
// silent. Unlock the context on the first user interaction so later
// event-driven sounds actually play.
if (typeof window !== 'undefined') {
  const unlock = () => {
    try { audioCtx().resume().catch(() => {}) } catch { /* no Web Audio */ }
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

// Play a short sequence of sine "notes" with a quick attack/decay envelope.
function tones(freqs: number[], step = 0.13): void {
  const ac = audioCtx()
  if (ac.state === 'suspended') ac.resume().catch(() => {})
  freqs.forEach((f, i) => {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = f
    osc.connect(gain)
    gain.connect(ac.destination)
    const t0 = ac.currentTime + i * step
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + step)
    osc.start(t0)
    osc.stop(t0 + step)
  })
}

const BUILTINS: Record<Exclude<SoundId, 'custom'>, () => void> = {
  chime: () => tones([880, 1318.51]),          // A5 → E6, gentle rise (finish)
  ding: () => tones([1568]),                   // single high G6
  blip: () => tones([587.33, 880], 0.09),      // quick two-note
  question: () => tones([659.25, 880, 1108.73], 0.11), // E5 → A5 → C#6, rising "?" intonation
  knock: () => tones([392, 392], 0.12)         // two equal low taps (G4) — "knock knock"
}

// Preview a sound. `customUrl` lets a caller preview the cue-specific custom file
// (the finalize and ask cues store their custom audio separately).
export function previewSound(id: SoundId, customUrl?: string | null): void {
  if (id === 'custom') {
    const url = customUrl ?? getCustomSound()
    if (url) { const a = new Audio(url); a.volume = 0.7; a.play().catch(() => {}) }
    return
  }
  BUILTINS[id]()
}

// Play the configured finalize cue (agent finished), honoring its toggle.
export function playFinalizeSound(): void {
  if (!isSoundEnabled()) return
  previewSound(getSoundId(), getCustomSound())
}

// Play the configured ask cue (agent needs your input), honoring its toggle.
export function playAskSound(): void {
  if (!isAskSoundEnabled()) return
  previewSound(getAskSoundId(), getAskCustomSound())
}
