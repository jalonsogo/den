import { describe, it, expect } from 'vitest'
import { parsePorcelain, semverLt } from './parse'

describe('parsePorcelain', () => {
  // The bug this file exists for: porcelain writes two status columns, and a
  // worktree-only change leaves the first blank. Trimming the output ate that
  // space and took a character off the filename — and git lists tracked changes
  // first, so the very first line is where it happened.
  it('keeps the first character of a worktree-only change on the first line', () => {
    const raw = ' M README.md\n?? notes.txt\n'
    expect(parsePorcelain(raw)).toEqual([
      { path: 'README.md', status: 'modified' },
      { path: 'notes.txt', status: 'new' }
    ])
  })

  it('does not depend on the caller trimming', () => {
    // The regression came from `stdout.trim()` upstream. If someone reintroduces
    // it, the leading space is gone and the name loses a character — assert the
    // difference explicitly so the failure names the cause.
    const raw = ' M README.md'
    expect(parsePorcelain(raw)[0].path).toBe('README.md')
    expect(parsePorcelain(raw.trim())[0]?.path).not.toBe('EADME.md')
  })

  it('maps the status codes', () => {
    const raw = [
      'A  added.ts',
      ' M modified.ts',
      ' D deleted.ts',
      '?? untracked.ts',
      'MM staged-and-dirty.ts'
    ].join('\n')
    expect(parsePorcelain(raw)).toEqual([
      { path: 'added.ts', status: 'new' },
      { path: 'modified.ts', status: 'modified' },
      { path: 'deleted.ts', status: 'deleted' },
      { path: 'untracked.ts', status: 'new' },
      { path: 'staged-and-dirty.ts', status: 'modified' }
    ])
  })

  it('reports a rename by its new name', () => {
    expect(parsePorcelain('R  old.ts -> new.ts')).toEqual([
      { path: 'new.ts', status: 'renamed' }
    ])
  })

  it('keeps spaces inside a filename', () => {
    expect(parsePorcelain(' M my notes.md')[0].path).toBe('my notes.md')
  })

  it('keeps non-ASCII names intact (quotePath=false)', () => {
    expect(parsePorcelain(' M café.md')[0].path).toBe('café.md')
  })

  it('skips anything that is not the XY shape rather than mangling it', () => {
    const raw = 'fatal: not a git repository\n M real.ts\n\n'
    expect(parsePorcelain(raw)).toEqual([{ path: 'real.ts', status: 'modified' }])
  })

  it('tolerates CRLF', () => {
    expect(parsePorcelain(' M a.ts\r\n?? b.ts\r\n')).toEqual([
      { path: 'a.ts', status: 'modified' },
      { path: 'b.ts', status: 'new' }
    ])
  })

  it('returns nothing for empty output', () => {
    expect(parsePorcelain('')).toEqual([])
  })
})

describe('semverLt', () => {
  it('orders by major, then minor, then patch', () => {
    expect(semverLt('0.38.0', '0.39.0')).toBe(true)
    expect(semverLt('0.39.0', '0.38.0')).toBe(false)
    expect(semverLt('0.9.0', '0.10.0')).toBe(true)   // not string order
    expect(semverLt('1.0.0', '0.99.99')).toBe(false)
    expect(semverLt('0.39.1', '0.39.2')).toBe(true)
  })

  it('treats equal versions as not-older', () => {
    expect(semverLt('0.39.0', '0.39.0')).toBe(false)
  })

  it('ignores a leading v and any suffix', () => {
    expect(semverLt('v0.38.0', '0.39.0')).toBe(true)
    expect(semverLt('0.39.0-rc.1', '0.39.0')).toBe(false)
    expect(semverLt('sbx version 0.38.2', '0.39.0')).toBe(true)
  })

  it('treats an unparseable version as 0.0.0', () => {
    // Callers gate features on this, so the safe direction is "older".
    expect(semverLt('', '0.39.0')).toBe(true)
    expect(semverLt('unknown', '0.1.0')).toBe(true)
  })
})
