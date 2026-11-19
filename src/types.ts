// Shared types for the Claude Code naming adapter.
//
// The adapter never owns naming state. Title grammar, chain/phase allocation,
// ownership, freeze and verification belong to the core (NamingEngine) behind
// `NamingBackend`. The adapter only:
//   - collects the main agent's proposal through a registered tool,
//   - records native title observations it actually receives from the host,
//   - performs the native `/rename` write and reports what it observed.
//
// Observations are never invented. Claude Code has no title getter; the
// adapter's snapshot is the latest host event that carried the title
// (`session_title` in SessionStart/UserPromptSubmit, or a /rename it saw run),
// labeled with its source and time. It is NOT a fresh read at write time; see
// README "No compare-and-set".

export const PROTOCOL = 'chat-naming.claude-adapter/2' as const

export type ChatRef = {
  host: 'claude'
  sessionId: string
  cwd: string
  projectRoot: string | null
}

export type Relation = 'new' | 'continuation' | 'subtask' | 'branch'
export type Locale = 'ru' | 'en'

/** What the active main agent proposes: literal topic, current focus. */
export type Proposal = {
  topic: string
  focus: string
  relation: Relation
  /** Handoff document JSON pasted by the user from a previous chat, verbatim. */
  handoff: string | null
  locale: Locale | null
}

/** Core snapshot origin. Claude reports no origin, so the adapter uses
 *  `manual` only for a /rename it saw a person/other plugin run, else `unknown`. */
export type Origin = 'auto' | 'manual' | 'unknown' | 'ours'

export type ObservationSource =
  /** `session_title` (or its documented absence) in SessionStart input. */
  | 'claude.hook.SessionStart.session_title'
  /** `session_title` (or its documented absence) in UserPromptSubmit input. */
  | 'claude.hook.UserPromptSubmit.session_title'
  /** Arguments of a /rename seen in command.run from a person/other plugin. */
  | 'claude.command.rename.args'
  /** Agent SDK getSessionInfo().customTitle via an optional external helper. */
  | 'claude.agent-sdk.getSessionInfo.customTitle'

export type NativeObservation = {
  /** null: the source reports no custom title. */
  title: string | null
  origin: Origin
  source: ObservationSource
  /** ms since epoch when the host event was received. */
  observedAt: number
}

export type OpRef = { operationId: string; ownerToken: string }

export type Operation = OpRef & {
  title: string
  previousTitle: string | null
}

export type PrepareOutcome =
  | { kind: 'operation'; operation: Operation }
  | { kind: 'unchanged'; title: string }
  /** The core refused to write (frozen, manual/unknown title, ownership). */
  | { kind: 'blocked'; reason: string; frozen: boolean }
  /** An unfinished operation exists for this chat. */
  | { kind: 'pending'; reason: string }
  /** Invalid proposal (relation/handoff/topic/history rules). */
  | { kind: 'rejected'; code: string; reason: string }

export type ApplyStartOutcome =
  | { kind: 'applying' }
  /** Observation already equals the desired title: confirm with it, do not write. */
  | { kind: 'already_desired' }
  | { kind: 'verified' }
  | { kind: 'blocked'; reason: string; frozen: boolean }
  | { kind: 'stale'; reason: string }

export type ReadbackOutcome =
  | { kind: 'verified' }
  | { kind: 'not_applied'; reason: string }
  | { kind: 'conflict'; frozen: boolean; reason: string }
  /** The operation is still pending in the core (no decision from this observation). */
  | { kind: 'still_pending'; state: string }

export type WriteOutcome = 'ok' | 'error' | 'unknown'

export type PendingPhase = 'reserved' | 'applying' | 'applied_unverified'

export type RecoverOutcome = {
  frozen: boolean
  /** Our last verified title if the core still attributes the chat to us. */
  verifiedTitle: string | null
  pending: { operation: Operation; phase: PendingPhase; kind: 'name' | 'history' | 'undo' } | null
}

export type UnfreezeOutcome =
  | { kind: 'unfrozen' }
  | { kind: 'not_registered' }
  | { kind: 'pending'; reason: string }

export type HandoffOutcome = { kind: 'handoff'; document: string } | { kind: 'rejected'; code: string; reason: string }

/**
 * Narrow bridge to the core. Every method that needs host state receives the
 * adapter's latest real observation; none of them fabricates one.
 *  - prepare       -> NamingEngine.begin (snapshot = observed)
 *  - abandon       -> NamingEngine.abandon (only before applyStart)
 *  - applyStart    -> NamingEngine.applyStart (snapshot = observed), right before /rename
 *  - markApplied   -> NamingEngine.confirm without readback (writeOutcome only)
 *  - confirm       -> NamingEngine.confirm with readback = observed
 *  - resolveInDoubt-> NamingEngine.recover (snapshot = observed)
 *  - freeze/unfreeze/exportHandoff -> same-named engine methods
 *  - recover       -> NamingEngine.adapterPending + status (trusted local adapter)
 */
export interface NamingBackend {
  recover(input: { chat: ChatRef }): Promise<RecoverOutcome>
  prepare(input: {
    chat: ChatRef
    proposal: Proposal
    idempotencyKey: string
    observed: NativeObservation
  }): Promise<PrepareOutcome>
  abandon(input: { op: OpRef; reason: string }): Promise<{ abandoned: boolean }>
  applyStart(input: { op: OpRef; observed: NativeObservation }): Promise<ApplyStartOutcome>
  markApplied(input: { op: OpRef; writeOutcome: WriteOutcome }): Promise<void>
  confirm(input: { op: OpRef; observed: NativeObservation }): Promise<ReadbackOutcome>
  resolveInDoubt(input: { op: OpRef; observed: NativeObservation }): Promise<ReadbackOutcome>
  freeze(input: { chat: ChatRef; reason: string }): Promise<{ frozen: boolean }>
  unfreeze(input: { chat: ChatRef; observed: NativeObservation }): Promise<UnfreezeOutcome>
  exportHandoff(input: { chat: ChatRef; relation: 'continuation' | 'branch' | 'subtask' }): Promise<HandoffOutcome>
}
