// One-request-per-process JSON transport between the hooks module (client)
// and libexec/chat-naming-core (server). Pure TypeScript: no Bun, Node or
// mods globals, so both sides and the mods test kit can import it.
//
// Request (stdin):   {"protocol":"chat-naming.claude-adapter/2","op":"<method>","input":{...}}
// Response (stdout): {"protocol":"chat-naming.claude-adapter/2","ok":true,"output":{...}}
//               or   {"protocol":"chat-naming.claude-adapter/2","ok":false,"error":{"code":"...","message":"..."}}

import { PROTOCOL } from './types.js'
import type { NamingBackend } from './types.js'

export const METHODS = [
  'recover',
  'prepare',
  'abandon',
  'applyStart',
  'markApplied',
  'confirm',
  'resolveInDoubt',
  'freeze',
  'unfreeze',
  'exportHandoff',
] as const

export type Method = (typeof METHODS)[number]

export class BackendError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'BackendError'
  }
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function encodeRequest(op: Method, input: unknown): string {
  return JSON.stringify({ protocol: PROTOCOL, op, input })
}

/** Client side: returns `output` or throws BackendError. */
export function decodeResponse(op: string, stdout: string): unknown {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new BackendError('bad_json', `${op}: helper stdout is not JSON`)
  }
  if (!isObject(parsed) || parsed.protocol !== PROTOCOL) {
    throw new BackendError('bad_protocol', `${op}: unexpected protocol`)
  }
  if (parsed.ok !== true) {
    const err = isObject(parsed.error) ? parsed.error : {}
    throw new BackendError(String(err.code ?? 'helper_error'), `${op}: ${String(err.message ?? 'failed')}`)
  }
  return parsed.output
}

export function protocolError(code: string, message: string): string {
  return JSON.stringify({ protocol: PROTOCOL, ok: false, error: { code, message } })
}

const errorResponse = protocolError

/** Server side: one request string in, one response string out. Never throws. */
export async function dispatch(backend: NamingBackend, raw: string): Promise<string> {
  let req: unknown
  try {
    req = JSON.parse(raw)
  } catch {
    return errorResponse('bad_json', 'request is not JSON')
  }
  if (!isObject(req) || req.protocol !== PROTOCOL) return errorResponse('bad_protocol', 'unexpected protocol')
  const op = req.op
  if (typeof op !== 'string' || !(METHODS as readonly string[]).includes(op)) {
    return errorResponse('bad_op', 'unknown op')
  }
  if (!isObject(req.input)) return errorResponse('bad_input', 'input must be an object')
  try {
    const fn = backend[op as Method] as (input: unknown) => Promise<unknown>
    const output = await fn.call(backend, req.input)
    return JSON.stringify({ protocol: PROTOCOL, ok: true, output: output ?? {} })
  } catch (err) {
    return errorResponse(errorCode(err), err instanceof Error ? err.message : String(err))
  }
}

/** BackendError and core NamingError both carry a string `code`; anything else is backend_error. */
export function errorCode(err: unknown): string {
  if (err instanceof BackendError) return err.code
  const code = isObject(err) || err instanceof Error ? (err as { code?: unknown }).code : undefined
  return typeof code === 'string' && code !== '' ? code : 'backend_error'
}
