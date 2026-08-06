// Work out what to clone from whatever the user pasted into the "Import from a
// Git repository" field.
//
// People paste the URL they have, which is usually the one in their browser's
// address bar — often pointing at a subfolder on a branch — not sbx's canonical
// `git+https://host/owner/repo.git#ref=<rev>&dir=<subdir>` form. All of these
// resolve to the same clone:
//
//   https://github.com/owner/repo
//   https://github.com/owner/repo/tree/v1.2/kits/ruff-lint
//   https://github.com/owner/repo/blob/main/kits/ruff-lint/spec.yaml
//   git+https://github.com/owner/repo.git#ref=v1.2&dir=kits/ruff-lint
//   git@github.com:owner/repo.git
//   git+ssh://git@github.com/owner/repo.git#dir=kits/ruff-lint

// A kit found inside a cloned repo — one entry per spec.yaml.
export interface RepoKit { dir: string; name: string; kind: string; displayName: string; description: string }

export interface GitKitRef {
  repo: string   // what to hand to `git clone`
  ref: string    // branch, tag or commit to check out ('' = default branch)
  dir: string    // subdirectory holding spec.yaml ('' = repo root)
  name: string   // kit name to import under
}

// A subdirectory is joined onto the clone and then copied into the kit library,
// so it must stay inside the clone. Also the guard for a subdirectory chosen in
// the renderer (the kit picker).
export function assertRepoSubdir(raw: string): string {
  const parts = (raw || '').split('/').map((s) => s.trim()).filter((s) => s && s !== '.')
  if (parts.some((p) => p === '..')) throw new Error(`invalid subdirectory: ${raw}`)
  return parts.join('/')
}
const cleanDir = assertRepoSubdir

function kitName(repo: string, dir: string): string {
  const base = dir ? dir.split('/').pop()! : (repo.replace(/\.git$/i, '').split(/[:/]/).pop() || 'kit')
  return base.replace(/[^A-Za-z0-9._-]/g, '-') || 'kit'
}

// The web-UI path shapes that carry a revision and a subpath:
//   GitHub / Gitea:  /tree/<ref>/<path>   /blob/<ref>/<path>
//   GitLab:          /-/tree/<ref>/<path> /-/blob/<ref>/<path>
//   Bitbucket:       /src/<ref>/<path>
const BROWSE_RE = /^(.*?)\/(?:-\/)?(tree|blob|src|raw)\/([^/]+)(?:\/(.*))?$/

export function parseGitKitRef(input: string): GitKitRef {
  let raw = (input || '').trim()
  if (!raw) throw new Error('Repository URL is required.')
  raw = raw.replace(/^git\+/, '')

  // Split off the fragment, but only when it's sbx's `ref=`/`dir=` form — a
  // plain `#readme` or `#L20` anchor from a browser URL is not a kit selector.
  let fragRef = '', fragDir = ''
  const hash = raw.indexOf('#')
  if (hash >= 0) {
    const frag = raw.slice(hash + 1)
    if (/(?:^|&)(ref|dir)=/.test(frag)) {
      fragRef = /(?:^|&)ref=([^&]*)/.exec(frag)?.[1] ?? ''
      fragDir = /(?:^|&)dir=([^&]*)/.exec(frag)?.[1] ?? ''
      raw = raw.slice(0, hash)
    } else {
      raw = raw.slice(0, hash)
    }
  }
  raw = raw.replace(/\?.*$/, '').replace(/\/+$/, '')
  if (!raw) throw new Error('Repository URL is required.')

  let repo = raw
  let ref = decodeURIComponent(fragRef)
  let dir = cleanDir(decodeURIComponent(fragDir))

  // scp-style (`git@host:owner/repo.git`) has no browse form to unpick.
  const isScp = /^[^/]+@[^/:]+:/.test(raw) && !raw.includes('://')
  if (!isScp) {
    const m = BROWSE_RE.exec(raw)
    if (m) {
      repo = m[1]
      // An explicit `#ref=`/`#dir=` wins over what the browse URL implies.
      if (!ref) ref = decodeURIComponent(m[3])
      if (!dir) {
        const path = cleanDir(decodeURIComponent(m[4] ?? ''))
        // A file URL points at something *inside* the kit — use its folder. Any
        // other file is the best guess we have for which kit was being read.
        dir = m[2] === 'blob' || m[2] === 'raw' ? path.split('/').slice(0, -1).join('/') : path
      }
    }
  }

  repo = repo.replace(/\/+$/, '')
  if (!repo) throw new Error(`Could not work out a repository URL from "${input.trim()}".`)
  return { repo, ref, dir, name: kitName(repo, dir) }
}

// Shallow-clone `repo` into `dest` at `ref` (a branch, tag or commit). `--branch`
// covers branches and tags in one shot; a commit sha isn't a valid `--branch`
// value, so fall back to fetching that single object. `run` is injected so this
// stays free of electron/app wiring.
export async function cloneAtRef(
  repo: string,
  ref: string,
  dest: string,
  run: (args: string[], timeout?: number) => Promise<void>
): Promise<void> {
  const base = ['clone', '--depth', '1', '--single-branch']
  if (!ref) { await run([...base, repo, dest], 180000); return }
  try {
    await run([...base, '--branch', ref, repo, dest], 180000)
  } catch (branchErr) {
    if (!/^[0-9a-f]{7,40}$/i.test(ref)) throw branchErr
    const fs = require('fs')
    fs.rmSync(dest, { recursive: true, force: true })
    fs.mkdirSync(dest, { recursive: true })
    await run(['-C', dest, 'init', '--quiet'], 30000)
    await run(['-C', dest, 'remote', 'add', 'origin', repo], 30000)
    await run(['-C', dest, 'fetch', '--depth', '1', 'origin', ref], 180000)
    await run(['-C', dest, 'checkout', '--quiet', 'FETCH_HEAD'], 30000)
  }
}

// Decide which subdirectory of a fresh clone to import, given the subdirectory
// the reference asked for (which may be '' for the repo root, wrong, or a folder
// of kits rather than a kit):
//   { dir }     → import this subdirectory ('' = the clone root)
//   { choices } → several candidates, ask which
//   { }         → nothing kit-shaped in there
export function resolveKitDir(clone: string, subdir: string): { dir?: string; choices?: RepoKit[] } {
  const fs = require('fs')
  const path = require('path')
  if (fs.existsSync(path.join(clone, subdir, 'spec.yaml'))) return { dir: subdir }
  // A subdirectory that holds no kit (or doesn't exist) falls back to scanning
  // the whole clone rather than dead-ending on the typo.
  const inSubdir = subdir ? findKitsInRepo(path.join(clone, subdir), subdir) : []
  const found = inSubdir.length ? inSubdir : findKitsInRepo(clone)
  if (found.length === 0) return {}
  if (found.length === 1) return { dir: found[0].dir }
  return { choices: found }
}

// Find the kits in a cloned repo: every spec.yaml within a few levels, with just
// enough of each spec read to label it in the picker. Depth-limited and
// blocklisted so a large repo doesn't turn this into a full-tree walk. `prefix`
// is prepended to the returned paths when `root` is itself a subdirectory of the
// clone, so a chosen `dir` is always relative to the clone root.
export function findKitsInRepo(root: string, prefix = '', maxDepth = 3): RepoKit[] {
  const fs = require('fs')
  const path = require('path')
  const SKIP = new Set(['.git', 'node_modules', 'dist', 'out', 'vendor', 'target'])
  const out: RepoKit[] = []
  const walk = (abs: string, rel: string, depth: number) => {
    let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[]
    try { entries = fs.readdirSync(abs, { withFileTypes: true }) } catch { return }
    if (entries.some((e) => e.isFile() && e.name === 'spec.yaml')) {
      let raw = ''
      try { raw = fs.readFileSync(path.join(abs, 'spec.yaml'), 'utf8') } catch { /* unreadable */ }
      const field = (k: string) =>
        raw.match(new RegExp(`^${k}:[ \\t]*(.+)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '') ?? ''
      const kind = field('kind')
      out.push({
        dir: [prefix, rel].filter(Boolean).join('/'),
        name: field('name') || path.basename(abs),
        // sbx spells full-agent kits `agent`; den's library calls them `sandbox`.
        kind: kind === 'agent' ? 'sandbox' : kind || 'mixin',
        displayName: field('displayName'),
        description: field('description')
      })
      return  // a kit's own files aren't more kits
    }
    if (depth >= maxDepth) return
    for (const e of entries) {
      if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith('.')) continue
      walk(path.join(abs, e.name), rel ? `${rel}/${e.name}` : e.name, depth + 1)
    }
  }
  walk(root, '', 0)
  return out.sort((a, b) => a.dir.localeCompare(b.dir))
}
