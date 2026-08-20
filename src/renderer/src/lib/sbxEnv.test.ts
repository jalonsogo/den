import { describe, it, expect } from 'vitest'
import { parseSbxEnv, envItemCount, hostRefs } from './sbxEnv'

// `.sbxenv.yaml` shipped experimental, so this reader is deliberately loose: it
// accepts several plausible spellings and surfaces anything it doesn't know
// rather than hiding it. These tests pin that behaviour — including the part
// where an unrecognised key must still show up.

describe('parseSbxEnv', () => {
  it('reads the documented fields', () => {
    const src = [
      'agent: claude',
      'workspace: /Users/me/Code/atlas',
      'kits:', '  - playwright', '  - github-cli',
      'ports:', '  - 8080:80',
      'secrets:', '  - anthropic'
    ].join('\n')
    const s = parseSbxEnv(src)
    expect(s.agent).toBe('claude')
    expect(s.workspace).toBe('/Users/me/Code/atlas')
    expect(s.kits).toEqual(['playwright', 'github-cli'])
    expect(s.ports).toEqual(['8080:80'])
    expect(s.secrets).toEqual(['anthropic'])
  })

  it('accepts env as a map or as KEY=value entries', () => {
    const asMapForm = parseSbxEnv('env:\n  NODE_ENV: development\n')
    const asListForm = parseSbxEnv('env:\n  - NODE_ENV=development\n')
    expect(asMapForm.envVars).toEqual([{ key: 'NODE_ENV', value: 'development', fromHost: false }])
    expect(asListForm.envVars).toEqual([{ key: 'NODE_ENV', value: 'development', fromHost: false }])
  })

  it('reads an environment.variables block too', () => {
    const s = parseSbxEnv('environment:\n  variables:\n    LOG_LEVEL: debug\n')
    expect(s.envVars).toEqual([{ key: 'LOG_LEVEL', value: 'debug', fromHost: false }])
  })

  it('reads fields nested under sandbox:', () => {
    expect(parseSbxEnv('sandbox:\n  agent: codex\n').agent).toBe('codex')
  })

  it('flags a value that defers to the host', () => {
    const s = parseSbxEnv('env:\n  TOKEN: ${MY_TOKEN}\n  PLAIN: literal\n')
    expect(s.envVars.find((e) => e.key === 'TOKEN')?.fromHost).toBe(true)
    expect(s.envVars.find((e) => e.key === 'PLAIN')?.fromHost).toBe(false)
  })

  it('surfaces keys it does not recognise instead of dropping them', () => {
    // The schema is experimental; an unknown key is more likely den being
    // behind than the file being wrong.
    const s = parseSbxEnv('agent: claude\nsomeFutureKey: a value\n')
    expect(s.extras).toContainEqual({ key: 'someFutureKey', value: 'a value' })
  })

  it('does not list known keys as extras', () => {
    const s = parseSbxEnv('agent: claude\nkits:\n  - a\n')
    expect(s.extras.map((e) => e.key)).not.toContain('agent')
    expect(s.extras.map((e) => e.key)).not.toContain('kits')
  })

  it('reports an empty document as empty', () => {
    expect(parseSbxEnv('').empty).toBe(true)
    expect(parseSbxEnv('agent: claude').empty).toBe(false)
  })

  it('reads a tab-indented file', () => {
    expect(parseSbxEnv('sandbox:\n\tagent: gemini\n').agent).toBe('gemini')
  })
})

describe('hostRefs', () => {
  it('collects both ${VAR} and $VAR, de-duplicated', () => {
    const s = parseSbxEnv('env:\n  A: ${TOKEN}\n  B: $TOKEN\n  C: ${OTHER}/x\n')
    expect(hostRefs(s).sort()).toEqual(['OTHER', 'TOKEN'])
  })

  it('returns nothing when no value defers to the host', () => {
    expect(hostRefs(parseSbxEnv('env:\n  A: plain\n'))).toEqual([])
  })
})

describe('envItemCount', () => {
  it('counts everything the file declares', () => {
    const s = parseSbxEnv('kits:\n  - a\n  - b\nports:\n  - 80\nsecrets:\n  - s1\n')
    expect(envItemCount(s)).toBe(4)
  })
})
