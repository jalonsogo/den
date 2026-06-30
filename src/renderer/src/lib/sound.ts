// Finalize cues. Built-ins are synthesized with the Web Audio API so we don't
// ship binary assets; the user can also point at their own audio file (stored
// as a data URL in localStorage). Settings live alongside the other
// `minipit:*` prefs.

export type SoundId = 'chime' | 'ding' | 'blip' | 'custom'

export const SOUND_OPTIONS: { id: SoundId; label: string }[] = [
  { id: 'chime', label: 'Chime' },
  { id: 'ding', label: 'Ding' },
  { id: 'blip', label: 'Blip' },
  { id: 'custom', label: 'Custom file…' }
]

const KEY_ENABLED = 'minipit:soundEnabled'
const KEY_SOUND = 'minipit:finalizeSound'
const KEY_CUSTOM = 'minipit:finalizeSoundData'

export const isSoundEnabled = (): boolean => localStorage.getItem(KEY_ENABLED) !== '0'
export const setSoundEnabled = (on: boolean): void => localStorage.setItem(KEY_ENABLED, on ? '1' : '0')
export const getSoundId = (): SoundId => (localStorage.getItem(KEY_SOUND) as SoundId) || 'chime'
export const setSoundId = (id: SoundId): void => localStorage.setItem(KEY_SOUND, id)
export const getCustomSound = (): string | null => localStorage.getItem(KEY_CUSTOM)
export const setCustomSound = (dataUrl: string): void => localStorage.setItem(KEY_CUSTOM, dataUrl)

let ctx: AudioContext | null = null
function audioCtx(): AudioContext {
  return (ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)())
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
  chime: () => tones([880, 1318.51]),          // A5 → E6, gentle rise
  ding: () => tones([1568]),                   // single high G6
  blip: () => tones([587.33, 880], 0.09)       // quick two-note
}

// Preview a specific sound (used by the Settings test button).
export function previewSound(id: SoundId): void {
  if (id === 'custom') {
    const url = getCustomSound()
    if (url) { const a = new Audio(url); a.volume = 0.7; a.play().catch(() => {}) }
    return
  }
  BUILTINS[id]()
}

// Play the configured finalize cue, honoring the enabled toggle.
export function playFinalizeSound(): void {
  if (!isSoundEnabled()) return
  previewSound(getSoundId())
}
