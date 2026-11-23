// Loads the shipped OpenCode plugin in Bun and checks that it registers its tools.
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const bundle = resolve(import.meta.dirname, '../../plugins/opencode/pellucid-chat-naming.js')
const plugin = (await import(pathToFileURL(bundle).href)).default
const dir = mkdtempSync(join(tmpdir(), 'chat-naming-opencode-'))
const hooks = await plugin({ client: {}, directory: dir }, { stateDir: join(dir, 'state') })
assert.deepEqual(Object.keys(hooks.tool).sort(), ['pellucid_handoff', 'pellucid_name_chat', 'pellucid_naming_freeze'])
console.log('opencode tools:', Object.keys(hooks.tool).join(', '))
