#!/usr/bin/env node
// Launch a packaged Electron payload with an isolated profile and require it to
// survive startup with a renderer process. This catches main-process module
// interop failures that static inspection cannot.

import { mkdtempSync, rmSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const executable = process.argv[2]
if (!executable) throw new Error('usage: smoke-linux-startup.mjs PACKAGED_DEN_EXECUTABLE [--no-sandbox]')
const extraArgs = process.argv.slice(3)
const profile = mkdtempSync(join(tmpdir(), 'den-startup-smoke-'))
const requiredLifetimeMs = Number(process.env.DEN_SMOKE_LIFETIME_MS || 8000)
const childEnv = { ...process.env }
delete childEnv.ELECTRON_RUN_AS_NODE
const child = spawn(executable, extraArgs, {
  detached: true,
  env: {
    ...childEnv,
    HOME: profile,
    XDG_CACHE_HOME: join(profile, 'cache'),
    XDG_CONFIG_HOME: join(profile, 'config'),
    XDG_DATA_HOME: join(profile, 'data')
  },
  stdio: ['ignore', 'pipe', 'pipe']
})
let output = ''
child.stdout.on('data', (chunk) => { output += chunk })
child.stderr.on('data', (chunk) => { output += chunk })

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function descendantsOf(rootPid) {
  const result = spawnSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`ps failed: ${result.stderr}`)
  const rows = result.stdout.trim().split('\n').map((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)
    return match && { pid: Number(match[1]), ppid: Number(match[2]), args: match[3] }
  }).filter(Boolean)
  const pids = new Set([rootPid])
  let changed = true
  while (changed) {
    changed = false
    for (const row of rows) {
      if (pids.has(row.ppid) && !pids.has(row.pid)) {
        pids.add(row.pid)
        changed = true
      }
    }
  }
  return rows.filter((row) => pids.has(row.pid))
}

try {
  await sleep(requiredLifetimeMs)
  const processes = descendantsOf(child.pid)
  const renderer = processes.find((process) => process.args.includes('--type=renderer'))
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error(`packaged app exited during startup (code=${child.exitCode}, signal=${child.signalCode})`)
  }
  if (/uncaught exception|TypeError:\s*Store is not a constructor/i.test(output)) {
    throw new Error('packaged app reported an uncaught startup exception')
  }
  if (!renderer) throw new Error('packaged app did not create a renderer process')
  console.log(`packaged startup survived ${requiredLifetimeMs}ms with renderer pid ${renderer.pid}`)
} catch (error) {
  console.error(output)
  throw error
} finally {
  try { process.kill(-child.pid, 'SIGTERM') } catch {}
  await sleep(500)
  try { process.kill(-child.pid, 'SIGKILL') } catch {}
  rmSync(profile, { recursive: true, force: true })
}
