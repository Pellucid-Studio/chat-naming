// Runs the shipped Claude Code core the way the plugin does: state paths, helper process, ledger writes
// and a read-only reopen. Node.js 22.18+ (imports settings.ts with built-in type stripping).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const plugin = resolve(import.meta.dirname, '../../plugins/claude-code')
const helper = join(plugin, 'libexec', 'chat-naming-core.mjs')
const windows = process.platform === 'win32'

const { resolveStateDir } = await import(pathToFileURL(join(plugin, 'src', 'settings.ts')).href)
const none = { envOverride: undefined, option: undefined, claudeConfigDir: undefined, home: process.env.HOME }
const home = resolveStateDir({ ...none, userProfile: process.env.USERPROFILE })
const expectedHome = windows ? process.env.USERPROFILE : process.env.HOME
assert.equal(home?.dir, join(expectedHome, '.claude', 'pellucid-chat-naming'), 'default state directory')
console.log('state dir:', home.dir)

const probe = spawnSync(process.execPath, ['--no-warnings', helper, '--probe'], { encoding: 'utf8' })
assert.equal(probe.status, 0, probe.stderr)
console.log('probe:', probe.stdout.trim())

const root = mkdtempSync(join(tmpdir(), 'chat-naming-'))
const stateDir = join(root, 'state')
const project = join(root, 'project')
const chat = { sessionId: 'smoke-session', cwd: project }

function call(op, input) {
  const request = JSON.stringify({ protocol: 'chat-naming.claude-adapter/2', op, input })
  const res = spawnSync(process.execPath, ['--no-warnings', helper, '--state-dir', stateDir], { input: request, encoding: 'utf8' })
  assert.equal(res.status, 0, `${op}: exit ${res.status} ${res.stderr}`)
  const reply = JSON.parse(res.stdout)
  assert.equal(reply.ok, true, `${op}: ${res.stdout}`)
  return reply.output
}

assert.deepEqual(call('recover', { chat }), { frozen: false, verifiedTitle: null, pending: null })
assert.equal(call('freeze', { chat, reason: 'smoke test' }).frozen, true)
assert.equal(call('recover', { chat }).frozen, true)
assert.equal(call('unfreeze', { chat, observed: { title: null, origin: 'unknown' } }).kind, 'unfrozen')
assert.equal(call('recover', { chat }).frozen, false)
console.log('ledger:', stateDir)

const { NamingEngine } = await import(pathToFileURL(join(plugin, 'libexec', 'core', 'engine.mjs')).href)
NamingEngine.open({ stateDir, readOnly: true }).close()
console.log('read-only reopen: ok')
