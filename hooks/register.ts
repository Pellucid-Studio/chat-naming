// pellucid-chat-naming hooks module for Claude Code (mods API).
//
// This is the only file that touches `$`. Static-analysis rules followed
// (https://code.claude.com/docs/en/plugins/mods/create): every call is written
// in full as $.namespace.method; `$` is only passed to top-level functions in
// this file; event names and matchers are string literals. Nothing imported
// here uses Bun/Node globals or the core (the core runs in the helper).

import type { EngineInterface, Register } from 'claude-code'
import { ClaudeNamingAdapter, DEFAULT_CONFIG, TOOL_TEXT } from '../src/controller.js'
import type { AdapterConfig, AdapterContext, HostPorts } from '../src/controller.js'
import { createProcessBackend } from '../src/process-backend.js'
import { COMMAND_NAME, TOOL_DESCRIPTION, TOOL_INPUT_SCHEMA, TOOL_NAME } from '../src/instructions.js'
import { resolveStateDir } from '../src/settings.js'

/** Readable core shipped inside the package, run with the user's Node.js 22.13+ (node:sqlite). */
const BUNDLED_HELPER = '/libexec/chat-naming-core.mjs'
const NODE = 'node'
const HELPER_TIMEOUT_MS = 10_000

// Passed as a variable so the documented `isDeferred` (v2.1.293+) is accepted
// even if an older generated ToolSpec does not declare it.
const TOOL_SPEC = {
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  inputSchema: TOOL_INPUT_SCHEMA,
  isDeferred: false,
}

let adapter = new ClaudeNamingAdapter(DEFAULT_CONFIG)
let optionStateDir: unknown = undefined
let toolCallsWithoutId = 0
const helperPresent = new Set<string>()
type Runtime = { ok: true; node: string } | { ok: false; reason: string }
let runtime: Runtime | null = null

/** Checks once per module load that Node.js can run the bundled core. */
async function probeRuntime($: EngineInterface, helper: string): Promise<Runtime> {
  try {
    const res = await $.process.run([NODE, '--no-warnings', helper, '--probe'], { timeoutMs: HELPER_TIMEOUT_MS })
    if (res.exitCode === 0) {
      try {
        const v = JSON.parse(res.stdout)
        if (v && v.ok === true && typeof v.node === 'string') return { ok: true, node: v.node }
      } catch {
        // fall through
      }
      return { ok: false, reason: 'the bundled core gave no valid probe answer' }
    }
    return { ok: false, reason: res.stderr.trim().slice(0, 300) || 'node exited with code ' + res.exitCode }
  } catch {
    return { ok: false, reason: 'Node.js 22.13 or later was not found on PATH' }
  }
}

function runtimeLine(): string {
  if (runtime === null) return 'runtime: not checked (no usable state directory or bundled core)'
  return runtime.ok ? 'runtime: Node.js ' + runtime.node : 'runtime: unavailable (' + runtime.reason + ')'
}

type Context = AdapterContext & { stateDir: string | null }

async function contextFor($: EngineInterface): Promise<Context> {
  const debug = (await $.env.get('CHAT_NAMING_DEBUG')) === '1'
  const state = resolveStateDir({
    envOverride: await $.env.get('CHAT_NAMING_STATE_DIR'),
    option: optionStateDir,
    claudeConfigDir: await $.env.get('CLAUDE_CONFIG_DIR'),
    home: await $.env.get('HOME'),
  })
  const helper = $.plugin.root + BUNDLED_HELPER

  if (state !== null && !helperPresent.has(helper) && (await $.fs.exists(helper))) helperPresent.add(helper)
  if (state !== null && helperPresent.has(helper) && runtime === null) runtime = await probeRuntime($, helper)
  const configured = state !== null && helperPresent.has(helper) && runtime !== null && runtime.ok

  const ports: HostPorts = {
    sessionId: () => $.session.id(),
    cwd: () => $.session.cwd(),
    projectRoot: async () => {
      try {
        return await $.session.root()
      } catch {
        return null
      }
    },
    surfaces: () => $.session.surfaces(),
    rename: async (title) => {
      const r = await $.command.run({ command: 'rename', args: title })
      return { text: typeof r?.text === 'string' ? r.text : undefined }
    },
    defer: (task) => {
      $.clock.after(0, task)
    },
    now: () => $.clock.now(),
    readNativeTitle: null,
    diag: (event, detail) => {
      if (debug) $.ui.log('diag ' + event + ' ' + JSON.stringify(detail))
    },
  }

  const backend = createProcessBackend(
    (argv, stdin) => $.process.run([...argv], { stdin, timeoutMs: HELPER_TIMEOUT_MS }),
    [NODE, '--no-warnings', helper, '--state-dir', state?.dir ?? ''],
  )
  return { ports, backend, configured, stateDir: state?.dir ?? null }
}

function readOptions(options: unknown): { config: AdapterConfig; stateDir: unknown } {
  const o = (typeof options === 'object' && options !== null ? options : {}) as Record<string, unknown>
  const min = o.min_turns_between_updates
  return {
    config: {
      desktopApply: o.desktop_apply === true,
      minTurnsBetweenUpdates:
        typeof min === 'number' && Number.isFinite(min) && min >= 1
          ? Math.floor(min)
          : DEFAULT_CONFIG.minTurnsBetweenUpdates,
    },
    stateDir: o.state_dir,
  }
}

const HANDOFF_RELATIONS = ['continuation', 'branch', 'subtask'] as const

export const register: Register = (on, options) => {
  const read = readOptions(options)
  adapter = new ClaudeNamingAdapter(read.config)
  optionStateDir = read.stateDir

  // Register the tool and the command before the first prompt. No helper call
  // here, so startup is not delayed; session state loads lazily.
  on('session.start', async ($, e, next) => {
    adapter.noteSessionStart(e)
    await $.tool.register(TOOL_SPEC)
    try {
      await $.command.register({
        name: COMMAND_NAME,
        description: 'Chat naming: status, freeze, unfreeze, or handoff for the next chat',
        argumentHint: 'status|freeze|unfreeze|handoff [continuation|branch|subtask]',
      })
    } catch {
      // A taken name must not stop the session; the tool still works.
    }
    return next(e)
  })

  // Native observations: session_title at startup/resume/clear/compact and per prompt.
  on('classic.SessionStart', async ($, e, next) => {
    await adapter.onClassicSessionStart(await contextFor($), e)
    return next(e)
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    await adapter.onClassicUserPromptSubmit(await contextFor($), e)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await adapter.onSessionEnd(await contextFor($), e)
    return next(e)
  })

  // Compact instruction for Claude only; the visible prompt is unchanged.
  on('prompt.submit', async ($, e, next) => {
    const line = await adapter.onPromptSubmit(await contextFor($), {
      text: e.text,
      originKind: e.origin?.kind ?? null,
    })
    if (line === null) return next(e)
    return next({ ...e, context: [...(e.context ?? []), line] })
  })

  // The naming tool only stages a title, so the main conversation may call it
  // without a prompt; subagents may not.
  on('tool.check', { tool: 'mcp__pellucid-chat-naming__set_chat_title' }, async ($, e, next) => {
    const decided = await next(e)
    if (decided.decision === 'deny') return decided
    if (e.agentId) return { decision: 'deny', reason: TOOL_TEXT.subagent }
    return { decision: 'allow' }
  })

  on('tool.call', { tool: 'mcp__pellucid-chat-naming__set_chat_title' }, async ($, e) => {
    // Tool arguments are fields of e beside the reserved tool, tool_use_id, agentId.
    const input = e as unknown as Record<string, unknown>
    const args: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input)) {
      if (k !== 'tool' && k !== 'tool_use_id' && k !== 'agentId') args[k] = v
    }
    const text = await adapter.onToolCall(await contextFor($), {
      agentId: typeof input.agentId === 'string' ? input.agentId : null,
      // tool_use_id is documented on ToolCallInput; the fallback keeps keys unique.
      toolUseId: typeof input.tool_use_id === 'string' ? input.tool_use_id : 'no-id-' + String(++toolCallsWithoutId),
      args,
    })
    return { result: text }
  }).catch(async ($, e, next) => {
    if (next.called) return next(e)
    return { result: TOOL_TEXT.unavailable }
  })

  // Main-conversation answers apply the staged title after the turn.
  on('turn.complete', async ($, e, next) => {
    await adapter.onTurnComplete(await contextFor($), {
      agentId: e.agentId ?? null,
      isAborted: e.isAborted,
      reason: e.reason,
    })
    return next(e)
  })

  // Any /rename not issued by this plugin is a manual/foreign title: it fences and freezes.
  on('command.run', { command: 'rename' }, async ($, e, next) => {
    const origin = e.origin
    const ours = origin?.kind === 'plugin' && origin.name === $.plugin.name
    if (!ours) {
      await adapter.onExternalRename(await contextFor($), {
        originKind: origin?.kind ?? null,
        args: typeof e.args === 'string' ? e.args : '',
      })
    }
    return next(e)
  })

  on('command.run', { command: 'chat-naming' }, async ($, e) => {
    const [verb = 'status', arg = ''] = (e.args ?? '').trim().toLowerCase().split(/\s+/)
    const ctx = await contextFor($)
    if (verb !== 'status' && !ctx.configured) {
      return { text: 'chat-naming is inactive. ' + runtimeLine() }
    }
    if (verb === 'freeze') {
      const frozen = await adapter.onFreeze(ctx)
      return { text: frozen ? 'Automatic titles are frozen for this chat.' : 'Freeze was not recorded.' }
    }
    if (verb === 'unfreeze') return { text: await adapter.onUnfreeze(ctx) }
    if (verb === 'handoff') {
      const relation = (HANDOFF_RELATIONS as readonly string[]).includes(arg)
        ? (arg as (typeof HANDOFF_RELATIONS)[number])
        : 'continuation'
      return { text: await adapter.onHandoff(ctx, relation) }
    }
    const sid = await $.session.id()
    return { text: adapter.statusText(sid, ctx.configured, ctx.stateDir) + '\n' + runtimeLine() }
  })
}
