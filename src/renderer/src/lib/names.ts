// Generates random sandbox names like "furious-blackhole" by combining an
// adjective with a cosmic noun.

const ADJECTIVES = [
  'furious', 'cosmic', 'stellar', 'lunar', 'solar', 'radiant', 'silent', 'ancient',
  'golden', 'crimson', 'frozen', 'blazing', 'hidden', 'quantum', 'electric', 'velvet',
  'rogue', 'swift', 'brave', 'mellow', 'cobalt', 'amber', 'dusky', 'feral', 'lucid',
  'gentle', 'restless', 'wandering', 'humble', 'nimble'
]

const NOUNS = [
  'blackhole', 'nebula', 'quasar', 'pulsar', 'comet', 'meteor', 'galaxy', 'nova',
  'orbit', 'eclipse', 'horizon', 'photon', 'asteroid', 'cosmos', 'satellite', 'aurora',
  'zenith', 'vortex', 'cluster', 'singularity', 'starfield', 'corona', 'nucleus', 'drift'
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function randomName(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}`
}
