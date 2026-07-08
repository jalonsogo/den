// File-type detection + helpers for the internal previewer. Categorization is
// extension-first (fast, no read needed); the `unknown` bucket is resolved with
// a binary sniff on the actual bytes so extensionless text files still preview.

export type PreviewKind = 'image' | 'markdown' | 'html' | 'code' | 'unknown'

const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'apng', 'tiff', 'tif'
])
const MARKDOWN_EXTS = new Set(['md', 'markdown', 'mdown', 'mkd', 'mdx'])
const HTML_EXTS = new Set(['html', 'htm', 'xhtml'])

// Extension → highlight.js language id. Anything text-like but unmapped falls
// back to `plaintext` (still shown, just not highlighted).
const CODE_LANGS: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', cs: 'csharp',
  php: 'php', swift: 'swift', scala: 'scala', dart: 'dart', lua: 'lua',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  json: 'json', jsonc: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini',
  xml: 'xml', css: 'css', scss: 'scss', less: 'less', sql: 'sql', graphql: 'graphql',
  gql: 'graphql', proto: 'protobuf', dockerfile: 'dockerfile', makefile: 'makefile',
  make: 'makefile', diff: 'diff', patch: 'diff', vue: 'xml', svelte: 'xml',
  txt: 'plaintext', text: 'plaintext', log: 'plaintext', env: 'bash',
  gitignore: 'plaintext', csv: 'plaintext', tsv: 'plaintext'
}

// Filenames (lowercased) that are code even without a recognizable extension.
const CODE_NAMES: Record<string, string> = {
  dockerfile: 'dockerfile', makefile: 'makefile', '.gitignore': 'plaintext',
  '.env': 'bash', '.bashrc': 'bash', '.zshrc': 'bash', '.profile': 'bash'
}

export function extOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function categorize(name: string): PreviewKind {
  const ext = extOf(name)
  const lower = (name.split(/[\\/]/).pop() ?? name).toLowerCase()
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (MARKDOWN_EXTS.has(ext)) return 'markdown'
  if (HTML_EXTS.has(ext)) return 'html'
  if (ext in CODE_LANGS || lower in CODE_NAMES) return 'code'
  return 'unknown'
}

// highlight.js language id for a code file (used to pick the grammar).
export function languageOf(name: string): string {
  const ext = extOf(name)
  const lower = (name.split(/[\\/]/).pop() ?? name).toLowerCase()
  return CODE_LANGS[ext] ?? CODE_NAMES[lower] ?? 'plaintext'
}

// MIME type for an image extension, for building a data: URL.
export function imageMime(name: string): string {
  const ext = extOf(name)
  switch (ext) {
    case 'svg': return 'image/svg+xml'
    case 'jpg': case 'jpeg': return 'image/jpeg'
    case 'ico': return 'image/x-icon'
    case 'tif': case 'tiff': return 'image/tiff'
    case 'apng': return 'image/apng'
    default: return `image/${ext}`
  }
}

// Decode a base64 payload's leading bytes and decide whether it's binary. Text
// files have no NUL bytes and few control chars; binary files have plenty.
export function sniffBinary(base64: string): boolean {
  let head: string
  try {
    // ~4 KB of bytes ≈ 5.4 KB of base64; keep it a multiple of 4.
    head = atob(base64.slice(0, 5464))
  } catch {
    return true
  }
  let control = 0
  for (let i = 0; i < head.length; i++) {
    const c = head.charCodeAt(i)
    if (c === 0) return true                         // NUL → definitely binary
    // Allow tab/newline/CR; count other C0 control chars.
    if (c < 9 || (c > 13 && c < 32)) control++
  }
  return head.length > 0 && control / head.length > 0.1
}

// Decode a base64 payload to a UTF-8 string (for text files read as bytes).
export function base64ToUtf8(base64: string): string {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}
