import { describe, it, expect } from 'vitest'
import { parseKitSpec, parseYaml, asMap, asStr } from './kitSpec'
import { buildSpec, specToForm, EMPTY_KIT, type KitForm } from './kitForm'

describe('parseYaml', () => {
  // A tab-indented spec used to score its children at indent 0, making them
  // siblings of their own parent. `sandbox:` parsed as empty, the composer
  // showed blank fields, and Save then wrote defaults over the real image.
  it('treats a tab as indentation', () => {
    const withTabs = 'sandbox:\n\timage: my/image:1\n\tentrypoint:\n\t\t- claude\n'
    const sandbox = asMap(asMap(parseYaml(withTabs)).sandbox)
    expect(asStr(sandbox.image)).toBe('my/image:1')
  })

  it('parses tabs and spaces to the same tree', () => {
    const spaces = 'sandbox:\n  image: my/image:1\n'
    const tabs = 'sandbox:\n\timage: my/image:1\n'
    expect(parseYaml(tabs)).toEqual(parseYaml(spaces))
  })

  it('ignores comments and the document marker', () => {
    const src = '---\n# a comment\nname: demo\n'
    expect(asStr(asMap(parseYaml(src)).name)).toBe('demo')
  })
})

describe('parseKitSpec', () => {
  it('reads a v1 spec', () => {
    const v1 = [
      'name: legacy', 'kind: mixin',
      'network:', '  allowedDomains:', '    - api.example.com',
      'commands:', '  install:', '    - npm i -g thing'
    ].join('\n')
    const k = parseKitSpec(v1)
    expect(k.name).toBe('legacy')
    expect(k.allowedDomains).toContain('api.example.com')
    expect(k.installCmds.map((c) => c.cmd)).toContain('npm i -g thing')
  })

  it('reads the v2 spellings into the same shape', () => {
    const v2 = [
      'schemaVersion: "2"', 'name: modern', 'kind: mixin',
      'permissions:', '  network:', '    allow:', '      - api.example.com',
      'setup:', '  install:', '    - npm i -g thing'
    ].join('\n')
    const k = parseKitSpec(v2)
    expect(k.name).toBe('modern')
    expect(k.allowedDomains).toContain('api.example.com')
    expect(k.installCmds.map((c) => c.cmd)).toContain('npm i -g thing')
  })

  it('reads the entrypoint in either shape regardless of declared version', () => {
    // A spec that mixes them, or omits schemaVersion, must keep its entrypoint —
    // losing it is what let Save overwrite a kit's real image.
    // v1 wrapped it: sandbox.entrypoint.run — v2 flattened it to a bare list.
    const v1shape = 'sandbox:\n  image: i:1\n  entrypoint:\n    run:\n      - claude\n'
    const v2shape = 'sandbox:\n  image: i:1\n  entrypoint:\n    - claude\n'
    expect(parseKitSpec(v1shape).entrypoint).toBe('claude')
    expect(parseKitSpec(v2shape).entrypoint).toBe('claude')
  })
})

describe('buildSpec / specToForm round-trip', () => {
  // This is the pairing that can destroy a user's work: the editor reads a spec
  // into a form, and Save writes the form back. Anything the reader drops is
  // silently deleted from the kit on the next save.
  const form: KitForm = {
    ...EMPTY_KIT,
    name: 'roundtrip',
    kind: 'sandbox',
    description: 'a kit that survives editing',
    image: 'docker/sandbox-templates:shell',
    entrypoint: 'claude --dangerously-skip-permissions',
    allowedDomains: ['api.example.com', 'cdn.example.com'],
    deniedDomains: ['tracker.example.com'],
    envVars: [{ key: 'MY_TOKEN_NAME', value: 'value with spaces' }],
    installCmds: [{ cmd: 'npm i -g thing', asAgent: true }],
    startupCmds: [{ cmd: 'echo hello', asAgent: true, background: true }]
  }

  it('preserves what the form carries', () => {
    const { form: back } = specToForm(buildSpec(form))
    expect(back.name).toBe(form.name)
    expect(back.description).toBe(form.description)
    expect(back.image).toBe(form.image)
    expect(back.entrypoint).toEqual(form.entrypoint)
    expect(back.allowedDomains).toEqual(expect.arrayContaining(form.allowedDomains))
    expect(back.deniedDomains).toEqual(expect.arrayContaining(form.deniedDomains))
    expect(back.envVars).toEqual(form.envVars)
    expect(back.installCmds.map((c) => c.cmd)).toEqual(['npm i -g thing'])
    expect(back.startupCmds.map((c) => c.cmd)).toEqual(['echo hello'])
  })

  it('is stable — a second pass changes nothing', () => {
    // Drift between the two directions shows up as a spec that keeps mutating
    // every time the user opens and saves without editing.
    const once = buildSpec(form)
    const twice = buildSpec(specToForm(once).form)
    expect(twice).toBe(once)
  })

  it('writes v2', () => {
    expect(buildSpec(form)).toContain('schemaVersion: "2"')
  })

  it('survives a tab-indented spec without losing the image', () => {
    // kind: sandbox — only a sandbox kit carries an image; a mixin layers onto
    // an agent that already has one.
    const tabbed = 'name: tabbed\nkind: sandbox\nsandbox:\n\timage: real/image:9\n\tentrypoint:\n\t\t- claude\n'
    const { form: back } = specToForm(tabbed)
    expect(back.image).toBe('real/image:9')
    expect(buildSpec(back)).toContain('real/image:9')
  })
})
