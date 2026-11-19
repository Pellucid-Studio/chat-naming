// Local naming core for the pellucid-chat-naming Claude Code plugin.
//
// The hooks module starts this file with `node --no-warnings` once per core call:
//   node chat-naming-core.mjs --state-dir <absolute dir>   one JSON request on stdin, one response on stdout
//   node chat-naming-core.mjs --probe                      reports whether this Node.js can run the core
// It opens the local SQLite ledger in the state directory, answers one request and exits.
// It makes no network requests. Exit codes: 0 = a response was written; 2 = usage; 3 = unsupported Node.js.

import { readFileSync, writeSync } from 'node:fs'

const MIN_NODE = [22, 13]
const [major, minor] = process.versions.node.split('.').map(Number)
const supported = major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1])

function write(text) {
  writeSync(1, text + '\n')
}

async function main() {
  if (!supported) {
    process.stderr.write(`chat-naming-core: Node.js ${MIN_NODE.join('.')} or later is required (found ${process.versions.node})\n`)
    process.exitCode = 3
    return
  }
  if (process.argv.includes('--probe')) {
    await import('node:sqlite')
    write(JSON.stringify({ ok: true, node: process.versions.node }))
    return
  }
  // Loaded after the version check, so an old Node.js gets a clear message instead of a link error.
  const { parseHelperArgs } = await import('./helper-args.mjs')
  const { dispatch, errorCode, protocolError } = await import('./protocol.mjs')
  const { openCoreBackend } = await import('./core-backend.mjs')

  const args = parseHelperArgs(process.argv)
  if ('error' in args) {
    process.stderr.write('chat-naming-core: ' + args.error + '\n')
    process.exitCode = 2
    return
  }
  const request = readFileSync(0, 'utf8')
  let response
  let close = null
  try {
    const opened = openCoreBackend({ stateDir: args.stateDir })
    close = opened.close
    response = await dispatch(opened.backend, request)
  } catch (error) {
    // Opening the ledger failed: answer in protocol so the plugin degrades.
    response = protocolError(errorCode(error) === 'backend_error' ? 'core_open_failed' : errorCode(error), String(error))
  } finally {
    try {
      close?.()
    } catch {
      // Closing must not hide the response.
    }
  }
  write(response)
}

await main()
