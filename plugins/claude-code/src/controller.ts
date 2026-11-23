// Claude Code naming adapter: event decisions, independent of the mods API.
//
// register.ts translates mods events into calls on `ClaudeNamingAdapter` and
// supplies `HostPorts` (built from `$`) plus a `NamingBackend`. Plain
// TypeScript, no runtime globals.
//
// Core lifecycle as driven here:
//   tool call            -> prepare (core begin, snapshot = latest observation) -> staged
//   main turn.complete   -> scheduled with $.clock.after(0)
//   scheduled callback   -> applyStart (snapshot = latest observation; the fence)
//                        -> native /rename -> markApplied (core confirm, no readback)
//   next real observation-> confirm (core confirm with readback) -> verified | failed | conflict
// Before applyStart an op may be abandoned; after it, only an observation
// settles it (confirm / resolveInDoubt). Nothing is verified without a real
// host observation equal to the title.
//
// Observations: `session_title` (or its documented absence) from SessionStart
// and UserPromptSubmit, a /rename seen in command.run, or the optional SDK
// helper (used only as post-write readback). Claude Code has no title getter,
// so the snapshot given to applyStart is the latest event, not a fresh read:
// a rename that bypasses these events between that event and our write cannot
// be detected (no native compare-and-set).

import type { ChatRef, NamingBackend, NativeObservation, Operation, Proposal, ReadbackOutcome, Relation } from './types.js'
import { checkClaudeTitle } from './title.js'
import { HANDOFF_PREFIX, ORDINARY_PROMPT_ORIGINS, firstTitleInstruction, focusUpdateInstruction } from './instructions.js'

export interface HostPorts {
  sessionId(): Promise<string>
  cwd(): Promise<string>
  projectRoot(): Promise<string | null>
  surfaces(): Promise<readonly string[]>
  /** Native setter: the built-in `/rename` command. */
  rename(title: string): Promise<{ text?: string }>
  /** Run after the current dispatch resolves (`$.clock.after(0, fn)`). */
  defer(task: () => Promise<void>): void
  now(): Promise<number>
  /** Optional out-of-process post-write readback (Agent SDK helper). */
  readNativeTitle: ((chat: ChatRef) => Promise<NativeObservation | null>) | null
  diag(event: string, detail: Record<string, unknown>): void
}

export type AdapterContext = {
  ports: HostPorts
  backend: NamingBackend
  /** False when no usable state dir or helper exists: the adapter stays silent. */
  configured: boolean
}

export type AdapterConfig = {
  /** Apply natively when the session draws on the Desktop surface. Unverified either way. */
  desktopApply: boolean
  /** Main turns after an applied title before a focus update is invited/allowed. */
  minTurnsBetweenUpdates: number
}

export const DEFAULT_CONFIG: AdapterConfig = { desktopApply: false, minTurnsBetweenUpdates: 3 }

/** Substrings of documented refusal reasons after an interrupt (mods API docs). */
const RETRYABLE_REFUSALS = [
  'the session was stopped and nobody has sent input since',
  'was removed from the queue before it ran',
]

const RELATIONS: readonly Relation[] = ['new', 'continuation', 'subtask', 'branch']

export const TOOL_TEXT = {
  subagent: 'chat-naming: only the main conversation names the chat. Do not call this tool from a subagent.',
  frozen: 'chat-naming: this chat title is frozen (manual, existing or user-requested). Do not call this tool again in this chat.',
  recent: 'chat-naming: the title was updated recently. Keep working; do not call this tool again yet.',
  pending: 'chat-naming: a title change is still being confirmed. Keep working; do not call this tool again yet.',
  unavailable: 'chat-naming: naming is unavailable right now. Continue the user\'s task.',
  unconfigured: 'chat-naming: naming is not configured in this installation. Continue the user\'s task.',
  noObservation:
    'chat-naming: Claude Code has not reported the current title yet, so it cannot be changed safely. Continue the task.',
} as const

/** `started`: core applyStart already happened (a retry), so abandon is no longer allowed. */
type InFlight = { op: Operation; phase: 'scheduled' | 'native'; started: boolean }

type SessionState = {
  chat: ChatRef
  frozen: boolean
  /** A non-naming operation (history/undo) is pending for this chat. */
  foreignPending: boolean
  /** Latest real host observation; null = none (fail closed). */
  observation: NativeObservation | null
  promptsSeen: number
  staged: { op: Operation; key: string } | null
  /** applyStart done, native call refused retryably; core state `applying`. */
  retry: Operation | null
  inFlight: InFlight | null
  cancelled: Set<string>
  /** Native call returned; core `applied_unverified`; waiting for an observation. */
  awaitingReadback: Operation | null
  /** Left `applying` by an earlier process or a fenced retry; settled by an observation. */
  inDoubt: Operation | null
  lastVerifiedTitle: string | null
  mainTurnsSinceApply: number
}

export type SessionSnapshot = Readonly<{
  sessionId: string
  frozen: boolean
  observation: NativeObservation | null
  staged: string | null
  retry: string | null
  inFlight: string | null
  awaitingReadback: string | null
  inDoubt: string | null
  lastVerifiedTitle: string | null
}>

export function isRetryableRefusal(message: string): boolean {
  return RETRYABLE_REFUSALS.some((s) => message.includes(s))
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function parseProposal(
  args: Record<string, unknown>,
): { ok: true; proposal: Proposal } | { ok: false; reason: string } {
  const topic = typeof args.topic === 'string' ? args.topic.trim() : ''
  const focus = typeof args.focus === 'string' ? args.focus.trim() : ''
  const relation = args.relation
  if (topic === '' || topic.length > 80) return { ok: false, reason: 'topic must be 1-80 characters' }
  if (focus === '' || focus.length > 120) return { ok: false, reason: 'focus must be 1-120 characters' }
  if (typeof relation !== 'string' || !RELATIONS.includes(relation as Relation)) {
    return { ok: false, reason: 'relation must be one of new, continuation, subtask, branch' }
  }
  let handoff: string | null = null
  if (args.handoff !== undefined && args.handoff !== null) {
    if (typeof args.handoff !== 'string' || args.handoff.length > 2000) {
      return { ok: false, reason: 'handoff must be the pasted handoff text (at most 2000 characters)' }
    }
    let text = args.handoff.trim()
    if (text.startsWith(HANDOFF_PREFIX.trim())) text = text.slice(HANDOFF_PREFIX.trim().length).trim()
    handoff = text === '' ? null : text
  }
  let locale: 'ru' | 'en' | null = null
  if (args.locale !== undefined && args.locale !== null) {
    if (args.locale !== 'ru' && args.locale !== 'en') return { ok: false, reason: 'locale must be ru or en' }
    locale = args.locale
  }
  return { ok: true, proposal: { topic, focus, relation: relation as Relation, handoff, locale } }
}

export class ClaudeNamingAdapter {
  private readonly sessions = new Map<string, SessionState>()
  private readonly initializing = new Map<string, Promise<SessionState>>()
  private interactive: boolean | null = null

  constructor(readonly config: AdapterConfig = DEFAULT_CONFIG) {}

  snapshot(sessionId: string): SessionSnapshot | null {
    const st = this.sessions.get(sessionId)
    if (!st) return null
    return {
      sessionId,
      frozen: st.frozen,
      observation: st.observation,
      staged: st.staged?.op.title ?? null,
      retry: st.retry?.title ?? null,
      inFlight: st.inFlight?.op.title ?? null,
      awaitingReadback: st.awaitingReadback?.title ?? null,
      inDoubt: st.inDoubt?.title ?? null,
      lastVerifiedTitle: st.lastVerifiedTitle,
    }
  }

  /** Human-readable status for `/chat-naming status`. States limits explicitly. */
  statusText(sessionId: string, configured: boolean, stateDir: string | null): string {
    const lines = [
      'configured: ' + (configured ? 'yes' : 'no (no usable state directory or helper; adapter is silent)'),
      'state dir: ' + (stateDir ?? 'none'),
      'interactive: ' + (this.interactive === null ? 'unknown' : String(this.interactive)),
      'desktop_apply: ' +
        (this.config.desktopApply ? 'on (set by user; Desktop title behavior is UNVERIFIED)' : 'off (Desktop unverified)'),
      'session: ' + JSON.stringify(this.snapshot(sessionId)),
    ]
    if (this.interactive === false) {
      lines.push('note: non-interactive run; a one-shot -p process can exit before the title is applied (unsupported)')
    }
    return lines.join('\n')
  }

  noteSessionStart(e: { isInteractive?: unknown }): void {
    this.interactive = typeof e.isInteractive === 'boolean' ? e.isInteractive : null
  }

  // ---- observations ---------------------------------------------------------

  /** classic.SessionStart: `session_title` is present whenever a custom title is set (hooks reference). */
  async onClassicSessionStart(ctx: AdapterContext, e: { source?: unknown; session_title?: unknown }): Promise<void> {
    if (!ctx.configured) return
    const st = await this.ensureState(ctx)
    await this.observe(ctx, st, {
      title: typeof e.session_title === 'string' && e.session_title !== '' ? e.session_title : null,
      origin: 'unknown',
      source: 'claude.hook.SessionStart.session_title',
      observedAt: await ctx.ports.now(),
    })
  }

  /** classic.UserPromptSubmit: same documented `session_title` semantics. */
  async onClassicUserPromptSubmit(ctx: AdapterContext, e: { session_title?: unknown }): Promise<void> {
    if (!ctx.configured) return
    const st = await this.ensureState(ctx)
    await this.observe(ctx, st, {
      title: typeof e.session_title === 'string' && e.session_title !== '' ? e.session_title : null,
      origin: 'unknown',
      source: 'claude.hook.UserPromptSubmit.session_title',
      observedAt: await ctx.ports.now(),
    })
  }

  /**
   * command.run for `rename` not issued by this plugin: a person (or another
   * plugin) chose a title. It fences our pending work and freezes the chat.
   * `/rename` without a name lets the host generate a title we cannot see, so
   * the observation becomes unknown until the next host event (fail closed).
   */
  async onExternalRename(ctx: AdapterContext, e: { originKind: string | null; args: string }): Promise<void> {
    if (!ctx.configured) return
    const st = await this.ensureState(ctx)
    const title = e.args.trim() === '' ? null : e.args.trim()
    st.observation =
      title === null
        ? null
        : { title, origin: 'manual', source: 'claude.command.rename.args', observedAt: await ctx.ports.now() }
    if (st.staged) {
      await this.safeAbandon(ctx, st.staged.op, 'manual-rename')
      st.staged = null
    }
    if (st.retry) {
      st.inDoubt = st.retry
      st.retry = null
    }
    try {
      st.frozen = (await ctx.backend.freeze({ chat: st.chat, reason: 'manual-rename:' + (e.originKind ?? 'unknown') })).frozen
    } catch (err) {
      st.frozen = true // fail closed locally
      ctx.ports.diag('freeze_error', { error: errorMessage(err) })
    }
    if (st.inDoubt && st.observation) await this.settleInDoubt(ctx, st, st.observation)
  }

  // ---- session lifecycle ---------------------------------------------------

  /** session.end: work that cannot run any more is abandoned; a native call in progress stays in doubt. */
  async onSessionEnd(ctx: AdapterContext, e: { reason?: unknown }): Promise<void> {
    if (!ctx.configured) return
    const reason = 'session-ended:' + (typeof e.reason === 'string' ? e.reason : 'unknown')
    const st = this.sessions.get(await ctx.ports.sessionId())
    if (!st) return
    if (st.staged) {
      await this.safeAbandon(ctx, st.staged.op, reason)
      st.staged = null
    }
    const flight = st.inFlight
    if (flight?.phase === 'scheduled') {
      st.cancelled.add(flight.op.operationId)
      st.inFlight = null
      if (flight.started) st.inDoubt = flight.op // core `applying`: settled by a later observation
      else await this.safeAbandon(ctx, flight.op, reason + ':before-native-call')
    } else if (flight?.phase === 'native') {
      ctx.ports.diag('exit_during_native_call', { op: flight.op.operationId })
    }
  }

  // ---- prompt / tool / turn ----------------------------------------------

  /** prompt.submit: returns one context line for Claude, or null. */
  async onPromptSubmit(ctx: AdapterContext, e: { text: string; originKind: string | null }): Promise<string | null> {
    if (!ctx.configured) return null
    if (e.originKind === null || !ORDINARY_PROMPT_ORIGINS.includes(e.originKind)) return null
    if (e.text.trimStart().startsWith('/')) return null
    const st = await this.ensureState(ctx)
    const firstPrompt = st.promptsSeen === 0
    st.promptsSeen += 1
    if (st.frozen || st.foreignPending) return null
    // Without any host observation (e.g. classic hooks disabled), naming cannot proceed safely.
    if (st.observation === null && !firstPrompt) return null
    const own =
      st.awaitingReadback?.title ?? st.inFlight?.op.title ?? st.retry?.title ?? st.inDoubt?.title ?? st.lastVerifiedTitle
    const observed = st.observation?.title ?? null
    // An existing title we did not write is preserved; the core would refuse anyway.
    if (observed !== null && observed !== own) return null
    if (own === null && st.staged === null) return firstTitleInstruction()
    if (st.mainTurnsSinceApply >= this.config.minTurnsBetweenUpdates) return focusUpdateInstruction(own)
    return null
  }

  /** tool.call for the naming tool. Returns the text Claude reads as the result. */
  async onToolCall(
    ctx: AdapterContext,
    e: { agentId: string | null; toolUseId: string; args: Record<string, unknown> },
  ): Promise<string> {
    if (e.agentId !== null) return TOOL_TEXT.subagent
    if (!ctx.configured) return TOOL_TEXT.unconfigured
    const parsed = parseProposal(e.args)
    if (!parsed.ok) return 'chat-naming: invalid input: ' + parsed.reason
    let st: SessionState
    try {
      st = await this.ensureState(ctx)
    } catch (err) {
      ctx.ports.diag('tool_state_error', { error: errorMessage(err) })
      return TOOL_TEXT.unavailable
    }
    if (st.frozen) return TOOL_TEXT.frozen
    const key = st.chat.sessionId + ':' + e.toolUseId
    if (st.staged?.key === key) {
      return 'chat-naming: title staged and applied after this answer: "' + st.staged.op.title + '". Continue the task.'
    }
    const settling = st.awaitingReadback !== null || st.inFlight !== null || st.retry !== null || st.inDoubt !== null
    const hasApplied = settling || st.lastVerifiedTitle !== null
    if (hasApplied && st.mainTurnsSinceApply < this.config.minTurnsBetweenUpdates) return TOOL_TEXT.recent
    if (settling || st.foreignPending) return TOOL_TEXT.pending
    if (st.observation === null) return TOOL_TEXT.noObservation
    if (st.staged) {
      await this.safeAbandon(ctx, st.staged.op, 'superseded')
      st.staged = null
    }

    let outcome
    try {
      outcome = await ctx.backend.prepare({
        chat: st.chat,
        proposal: parsed.proposal,
        idempotencyKey: key,
        observed: st.observation,
      })
    } catch (err) {
      ctx.ports.diag('prepare_error', { error: errorMessage(err) })
      return TOOL_TEXT.unavailable
    }

    switch (outcome.kind) {
      case 'blocked':
        if (outcome.frozen) st.frozen = true
        return outcome.frozen ? TOOL_TEXT.frozen : 'chat-naming: title not changed (' + outcome.reason + '). Continue the task.'
      case 'pending':
        return TOOL_TEXT.pending
      case 'rejected':
        return 'chat-naming: proposal rejected (' + outcome.code + '): ' + outcome.reason
      case 'unchanged':
        return 'chat-naming: the title is already current: "' + outcome.title + '". Continue the task.'
      case 'operation': {
        const op = outcome.operation
        const check = checkClaudeTitle(op.title)
        if (!check.ok) {
          await this.safeAbandon(ctx, op, 'host-title-constraint')
          return 'chat-naming: the rendered title cannot be applied here (' + check.reason + '). Continue the task.'
        }
        st.staged = { op, key }
        return 'chat-naming: title staged and applied after this answer: "' + op.title + '". Continue the task; do not mention the title.'
      }
    }
  }

  /** turn.complete: only a completed main-conversation answer applies a staged title. */
  async onTurnComplete(
    ctx: AdapterContext,
    e: { agentId: string | null; isAborted: boolean; reason: string },
  ): Promise<void> {
    if (e.agentId !== null || !ctx.configured) return
    const st = await this.ensureState(ctx)
    if (st.mainTurnsSinceApply !== Number.POSITIVE_INFINITY) st.mainTurnsSinceApply += 1

    const staged = st.staged?.op ?? null
    const op = staged ?? st.retry
    if (!op) return
    if (staged) st.staged = null
    else st.retry = null

    if (e.isAborted || e.reason !== 'answer') {
      if (staged) await this.safeAbandon(ctx, op, 'turn-' + (e.isAborted ? 'aborted' : e.reason))
      else st.retry = op // a refused retry waits for a completed answer
      return
    }
    const started = staged === null
    st.inFlight = { op, phase: 'scheduled', started }
    ctx.ports.defer(() => this.apply(ctx, st, op, started))
  }

  // ---- user commands ------------------------------------------------------

  async onFreeze(ctx: AdapterContext): Promise<boolean> {
    const st = await this.ensureState(ctx)
    st.frozen = (await ctx.backend.freeze({ chat: st.chat, reason: 'user' })).frozen
    if (st.staged) {
      await this.safeAbandon(ctx, st.staged.op, 'frozen')
      st.staged = null
    }
    return st.frozen
  }

  /** Explicit consent: the latest real observation becomes the accepted baseline. */
  async onUnfreeze(ctx: AdapterContext): Promise<string> {
    const st = await this.ensureState(ctx)
    if (st.observation === null) {
      return 'Cannot unfreeze yet: Claude Code has not reported the current title. Send a message first, then retry.'
    }
    const r = await ctx.backend.unfreeze({ chat: st.chat, observed: st.observation })
    if (r.kind === 'pending') return 'Cannot unfreeze while a title change is unconfirmed: ' + r.reason
    st.frozen = false
    return r.kind === 'unfrozen'
      ? 'Automatic titles are enabled for this chat; the current title is accepted as the baseline.'
      : 'This chat was not frozen.'
  }

  async onHandoff(ctx: AdapterContext, relation: 'continuation' | 'branch' | 'subtask'): Promise<string> {
    const st = await this.ensureState(ctx)
    const r = await ctx.backend.exportHandoff({ chat: st.chat, relation })
    if (r.kind === 'rejected') return 'No handoff: ' + r.reason
    return 'Paste this line into the first message of the next chat (relation ' + relation + '):\n' + HANDOFF_PREFIX + r.document
  }

  // ---- internals ----------------------------------------------------------

  private async apply(ctx: AdapterContext, st: SessionState, op: Operation, started: boolean): Promise<void> {
    const { ports, backend } = ctx
    if (st.cancelled.has(op.operationId)) return
    let wrote = false
    try {
      const sid = await ports.sessionId()
      const surfaces = await ports.surfaces()
      const desktopBlocked = surfaces.includes('desktop') && !this.config.desktopApply
      if (sid !== st.chat.sessionId || desktopBlocked || st.observation === null) {
        const reason =
          sid !== st.chat.sessionId ? 'session-changed' : desktopBlocked ? 'surface-desktop-unverified' : 'no-native-observation'
        ports.diag('apply_skipped', { op: op.operationId, reason, surfaces: [...surfaces] })
        // Before applyStart nothing was written; after it, only an observation may settle the op.
        if (started) st.inDoubt = op
        else await this.safeAbandon(ctx, op, reason)
        return
      }
      const observed = st.observation
      const start = await backend.applyStart({ op, observed })
      if (start.kind === 'already_desired') {
        this.applyReadback(st, op, await backend.confirm({ op, observed }))
        return
      }
      if (start.kind === 'verified') {
        st.lastVerifiedTitle = op.title
        return
      }
      if (start.kind === 'blocked' || start.kind === 'stale') {
        if (start.kind === 'blocked' && start.frozen) st.frozen = true
        ports.diag('apply_refused', { op: op.operationId, kind: start.kind, reason: start.reason })
        if (started) {
          st.inDoubt = op
          await this.settleInDoubt(ctx, st, observed)
        }
        return
      }
      if (st.cancelled.has(op.operationId)) {
        // session.end arrived during applyStart: do not write; the core op stays `applying`.
        st.inDoubt = op
        return
      }
      if (st.inFlight?.op === op) st.inFlight = { op, phase: 'native', started: true }
      try {
        const report = await ports.rename(op.title)
        ports.diag('setter_report', { op: op.operationId, text: report?.text ?? null })
      } catch (err) {
        const message = errorMessage(err)
        if (isRetryableRefusal(message)) {
          st.retry = op
          ports.diag('rename_refused_retry', { op: op.operationId, message })
          return
        }
        await backend.markApplied({ op, writeOutcome: 'error' })
        st.awaitingReadback = op
        ports.diag('rename_error', { op: op.operationId, message })
        return
      }
      await backend.markApplied({ op, writeOutcome: 'ok' })
      st.awaitingReadback = op
      st.mainTurnsSinceApply = 0
      wrote = true
    } catch (err) {
      ports.diag('apply_error', { op: op.operationId, error: errorMessage(err) })
    } finally {
      if (st.inFlight?.op === op) st.inFlight = null
    }

    if (wrote && ports.readNativeTitle) {
      try {
        const obs = await ports.readNativeTitle(st.chat)
        // SDK customTitle may be an AI title; it is only used as readback, never as a baseline.
        if (obs && st.awaitingReadback === op) {
          const r = await backend.confirm({ op, observed: obs })
          this.applyReadback(st, op, r)
          if (r.kind === 'verified') st.observation = obs
        }
      } catch (err) {
        ports.diag('readback_error', { op: op.operationId, error: errorMessage(err) })
      }
    }
  }

  private applyReadback(st: SessionState, op: Operation, r: ReadbackOutcome): void {
    if (r.kind === 'still_pending') return
    if (st.awaitingReadback === op) st.awaitingReadback = null
    if (st.inDoubt === op) st.inDoubt = null
    if (r.kind === 'verified') st.lastVerifiedTitle = op.title
    else if (r.kind === 'conflict' && r.frozen) st.frozen = true
  }

  private async observe(ctx: AdapterContext, st: SessionState, obs: NativeObservation): Promise<void> {
    if (st.inFlight?.phase === 'native') {
      // Our native call is running; this observation may predate the write.
      ctx.ports.diag('observation_during_native_call', { source: obs.source })
      return
    }
    st.observation = obs
    if (st.inDoubt) await this.settleInDoubt(ctx, st, obs)
    const op = st.awaitingReadback
    if (op) {
      try {
        this.applyReadback(st, op, await ctx.backend.confirm({ op, observed: obs }))
      } catch (err) {
        ctx.ports.diag('confirm_error', { op: op.operationId, error: errorMessage(err) })
      }
    }
  }

  private async settleInDoubt(ctx: AdapterContext, st: SessionState, obs: NativeObservation): Promise<void> {
    const op = st.inDoubt
    if (!op) return
    try {
      this.applyReadback(st, op, await ctx.backend.resolveInDoubt({ op, observed: obs }))
    } catch (err) {
      ctx.ports.diag('resolve_in_doubt_error', { op: op.operationId, error: errorMessage(err) })
    }
  }

  private async safeAbandon(ctx: AdapterContext, op: Operation, reason: string): Promise<void> {
    try {
      const r = await ctx.backend.abandon({ op, reason })
      if (!r.abandoned) ctx.ports.diag('abandon_refused', { op: op.operationId, reason })
    } catch (err) {
      ctx.ports.diag('abandon_error', { op: op.operationId, reason, error: errorMessage(err) })
    }
  }

  private async ensureState(ctx: AdapterContext): Promise<SessionState> {
    const sid = await ctx.ports.sessionId()
    const existing = this.sessions.get(sid)
    if (existing) return existing
    const pending = this.initializing.get(sid)
    if (pending) return pending
    const init = (async () => {
      const chat: ChatRef = {
        host: 'claude',
        sessionId: sid,
        cwd: await ctx.ports.cwd(),
        projectRoot: await ctx.ports.projectRoot(),
      }
      const st: SessionState = {
        chat,
        frozen: false,
        foreignPending: false,
        observation: null,
        promptsSeen: 0,
        staged: null,
        retry: null,
        inFlight: null,
        cancelled: new Set(),
        awaitingReadback: null,
        inDoubt: null,
        lastVerifiedTitle: null,
        mainTurnsSinceApply: Number.POSITIVE_INFINITY,
      }
      try {
        const r = await ctx.backend.recover({ chat })
        st.frozen = r.frozen
        st.lastVerifiedTitle = r.verifiedTitle
        const p = r.pending
        if (p && p.kind !== 'name') st.foreignPending = true
        else if (p?.phase === 'reserved') await this.safeAbandon(ctx, p.operation, 'stale-after-restart')
        else if (p?.phase === 'applying') st.inDoubt = p.operation
        else if (p?.phase === 'applied_unverified') st.awaitingReadback = p.operation
      } catch (err) {
        ctx.ports.diag('recover_error', { error: errorMessage(err) })
      }
      this.sessions.set(sid, st)
      return st
    })()
    this.initializing.set(sid, init)
    try {
      return await init
    } finally {
      this.initializing.delete(sid)
    }
  }
}
