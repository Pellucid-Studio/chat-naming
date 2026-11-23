// NamingBackend client: runs libexec/chat-naming-core once per call and speaks
// the JSON protocol in protocol.ts. The exec function is injected (register.ts
// wraps `$.process.run`), so this file never touches `$` or runtime globals.
// Every output is shape-checked, so a wrong helper can never yield `verified`.

import { BackendError, decodeResponse, encodeRequest, isObject } from './protocol.js'
import type { Method } from './protocol.js'
import type {
  ApplyStartOutcome,
  HandoffOutcome,
  NamingBackend,
  Operation,
  PendingPhase,
  PrepareOutcome,
  ReadbackOutcome,
  RecoverOutcome,
  UnfreezeOutcome,
} from './types.js'

export { BackendError } from './protocol.js'

export type ExecResult = { exitCode: number; stdout: string; stderr: string }
export type Exec = (argv: readonly string[], stdin: string) => Promise<ExecResult>

function isOperation(v: unknown): v is Operation {
  return (
    isObject(v) &&
    typeof v.operationId === 'string' &&
    typeof v.ownerToken === 'string' &&
    typeof v.title === 'string' &&
    (v.previousTitle === null || typeof v.previousTitle === 'string')
  )
}

function bad(op: string, detail: string): never {
  throw new BackendError('bad_response', `${op}: ${detail}`)
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function obj(op: string, v: unknown): Record<string, unknown> {
  if (!isObject(v)) bad(op, 'output is not an object')
  return v
}

function frozenFlag(op: string, v: Record<string, unknown>): boolean {
  if (typeof v.frozen !== 'boolean') bad(op, 'frozen flag missing')
  return v.frozen
}

export function checkPrepare(raw: unknown): PrepareOutcome {
  const v = obj('prepare', raw)
  switch (v.kind) {
    case 'operation':
      if (!isOperation(v.operation)) bad('prepare', 'operation is malformed')
      return { kind: 'operation', operation: v.operation }
    case 'unchanged':
      if (typeof v.title !== 'string') bad('prepare', 'unchanged.title missing')
      return { kind: 'unchanged', title: v.title }
    case 'blocked':
      return { kind: 'blocked', reason: str(v.reason), frozen: frozenFlag('prepare', v) }
    case 'pending':
      return { kind: 'pending', reason: str(v.reason) }
    case 'rejected':
      return { kind: 'rejected', code: str(v.code), reason: str(v.reason) }
    default:
      return bad('prepare', 'unknown kind')
  }
}

export function checkApplyStart(raw: unknown): ApplyStartOutcome {
  const v = obj('applyStart', raw)
  switch (v.kind) {
    case 'applying':
      return { kind: 'applying' }
    case 'already_desired':
      return { kind: 'already_desired' }
    case 'verified':
      return { kind: 'verified' }
    case 'blocked':
      return { kind: 'blocked', reason: str(v.reason), frozen: frozenFlag('applyStart', v) }
    case 'stale':
      return { kind: 'stale', reason: str(v.reason) }
    default:
      return bad('applyStart', 'unknown kind')
  }
}

export function checkReadback(op: string, raw: unknown): ReadbackOutcome {
  const v = obj(op, raw)
  switch (v.kind) {
    case 'verified':
      return { kind: 'verified' }
    case 'not_applied':
      return { kind: 'not_applied', reason: str(v.reason) }
    case 'conflict':
      return { kind: 'conflict', frozen: frozenFlag(op, v), reason: str(v.reason) }
    case 'still_pending':
      return { kind: 'still_pending', state: str(v.state) }
    default:
      return bad(op, 'unknown kind')
  }
}

const PHASES: readonly PendingPhase[] = ['reserved', 'applying', 'applied_unverified']
const KINDS = ['name', 'history', 'undo'] as const

export function checkRecover(raw: unknown): RecoverOutcome {
  const v = obj('recover', raw)
  const frozen = frozenFlag('recover', v)
  const verifiedTitle =
    v.verifiedTitle === null || typeof v.verifiedTitle === 'string' ? v.verifiedTitle : bad('recover', 'verifiedTitle')
  let pending: RecoverOutcome['pending'] = null
  if (v.pending !== null && v.pending !== undefined) {
    const p = v.pending
    if (
      !isObject(p) ||
      !isOperation(p.operation) ||
      !PHASES.includes(p.phase as PendingPhase) ||
      !(KINDS as readonly unknown[]).includes(p.kind)
    ) {
      bad('recover', 'pending is malformed')
    }
    pending = { operation: p.operation, phase: p.phase as PendingPhase, kind: p.kind as (typeof KINDS)[number] }
  }
  return { frozen, verifiedTitle, pending }
}

function checkUnfreeze(raw: unknown): UnfreezeOutcome {
  const v = obj('unfreeze', raw)
  if (v.kind === 'unfrozen') return { kind: 'unfrozen' }
  if (v.kind === 'not_registered') return { kind: 'not_registered' }
  if (v.kind === 'pending') return { kind: 'pending', reason: str(v.reason) }
  return bad('unfreeze', 'unknown kind')
}

function checkHandoff(raw: unknown): HandoffOutcome {
  const v = obj('exportHandoff', raw)
  if (v.kind === 'handoff' && typeof v.document === 'string') return { kind: 'handoff', document: v.document }
  if (v.kind === 'rejected') return { kind: 'rejected', code: str(v.code), reason: str(v.reason) }
  return bad('exportHandoff', 'unknown kind')
}

export function createProcessBackend(exec: Exec, helperArgv: readonly string[]): NamingBackend {
  async function call(op: Method, input: unknown): Promise<unknown> {
    const res = await exec(helperArgv, encodeRequest(op, input))
    if (res.exitCode !== 0) {
      throw new BackendError('helper_exit', `${op}: helper exited ${res.exitCode}: ${res.stderr.slice(0, 500)}`)
    }
    return decodeResponse(op, res.stdout)
  }

  return {
    recover: async (input) => checkRecover(await call('recover', input)),
    prepare: async (input) => checkPrepare(await call('prepare', input)),
    abandon: async (input) => {
      const v = obj('abandon', await call('abandon', input))
      if (typeof v.abandoned !== 'boolean') bad('abandon', 'abandoned flag missing')
      return { abandoned: v.abandoned }
    },
    applyStart: async (input) => checkApplyStart(await call('applyStart', input)),
    markApplied: async (input) => {
      await call('markApplied', input)
    },
    confirm: async (input) => checkReadback('confirm', await call('confirm', input)),
    resolveInDoubt: async (input) => checkReadback('resolveInDoubt', await call('resolveInDoubt', input)),
    freeze: async (input) => ({ frozen: frozenFlag('freeze', obj('freeze', await call('freeze', input))) }),
    unfreeze: async (input) => checkUnfreeze(await call('unfreeze', input)),
    exportHandoff: async (input) => checkHandoff(await call('exportHandoff', input)),
  }
}

/** Optional Agent SDK readback helper output: {"found":bool,"customTitle":string|null}. */
export function parseReadbackOutput(stdout: string): { found: boolean; customTitle: string | null } {
  let v: unknown
  try {
    v = JSON.parse(stdout)
  } catch {
    throw new BackendError('bad_json', 'readback helper stdout is not JSON')
  }
  if (!isObject(v) || typeof v.found !== 'boolean') throw new BackendError('bad_response', 'readback: found missing')
  const t = v.customTitle
  if (t !== null && t !== undefined && typeof t !== 'string') throw new BackendError('bad_response', 'readback: customTitle')
  return { found: v.found, customTitle: typeof t === 'string' ? t : null }
}
