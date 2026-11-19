// Tool registration and the compact instruction injected through prompt.submit.
//
// The main agent already understands the task, so it supplies topic and focus
// through a tool call inside its ordinary answer. No extra model request is
// made for naming.

export const PLUGIN_NAME = 'pellucid-chat-naming'
export const TOOL_NAME = 'set_chat_title'
/** Mods tools are exposed as mcp__<plugin>__<name> (mods API docs). */
export const TOOL_FULL_NAME = 'mcp__pellucid-chat-naming__set_chat_title'
export const COMMAND_NAME = 'chat-naming'
/** Prefix printed by /chat-naming handoff; the user pastes the whole line into the next chat. */
export const HANDOFF_PREFIX = 'chat-naming handoff: '

// Also imported by Codex and OpenCode. Keep this text usable in the standalone Claude hooks package.
export const TITLE_BREVITY_INSTRUCTION =
  'Write a compact title within 60 graphemes including the phase marker and separators (aim for 55). ' +
  'Use a short topic and a brief, complete focus phrase that adds the key action, distinction, or constraint. ' +
  'Keep the words that distinguish this task. Drop filler and words already in the topic. Do not use ellipses. ' +
  'For example: "Release pipeline · phase 1 — Roll back failed deploys". ' +
  'If TITLE_TOO_LONG is returned, rephrase within the reported focus budget and retry once in this answer. ' +
  'Shorten the topic too if starting a new chain. Keep an established or inherited topic and its phase. ' +
  'If the retry fails or the focus cannot fit, continue the task.'

const FOCUS_MEANING_CHECK =
  'Before calling the tool, read the title as a standalone label. ' +
  'If the task pairs a failure or constraint with a remedy, or compares two alternatives, name both sides. ' +
  'Use compact noun phrases: "Checkout timeout · phase 1 — Error and retry" or ' +
  '"Сбой оплаты · фаза 1 — Ошибка и повтор". A generic word such as "scenario" does not name the remedy. ' +
  'For a new title aim for about 18 graphemes in the topic and 24 in the focus. ' +
  'On the one retry, cut the rejected wording substantially and aim at least five graphemes below the reported focus budget. ' +
  'For a new chain, shorten the topic too if that helps keep both sides.'

export const TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    topic: {
      type: 'string',
      minLength: 1,
      maxLength: 80,
      description:
        'Persistent literal subject of the work (product, project or document name), 1-4 words, in the user\'s language.',
    },
    focus: {
      type: 'string',
      minLength: 1,
      maxLength: 120,
      description: 'A brief, complete phrase for the current task (often 2–5 words), in the requested response language.',
    },
    relation: {
      type: 'string',
      enum: ['new', 'continuation', 'subtask', 'branch'],
      description:
        'new: independent task. continuation (next phase), subtask (side check, no phase number) or branch (fork with its own topic): ONLY when the user pasted a "chat-naming handoff:" line; pass that JSON as handoff.',
    },
    handoff: {
      type: 'string',
      maxLength: 2000,
      description: 'The JSON after "chat-naming handoff:" from the user\'s message, copied verbatim. Omit when none.',
    },
    locale: {
      type: 'string',
      enum: ['ru', 'en'],
      description: 'Phase marker only: ru for Russian, en otherwise. Topic and focus use the requested response language, including Chinese, Japanese and Korean.',
    },
  },
  required: ['topic', 'focus', 'relation'],
  additionalProperties: false,
} as const

export const TOOL_DESCRIPTION =
  'Names the current chat. Call it from the main conversation only, ' +
  'when the chat has no title yet or the task focus has substantially changed. ' +
  'The title is applied after your answer ends. Do not mention this tool or the title to the user.'

export function firstTitleInstruction(): string {
  return (
    '[chat-naming] This chat has no title yet. If this message is a real task (not a greeting or a one-word reply), ' +
    `call ${TOOL_FULL_NAME} during this answer, after you understand the task, with topic, focus, relation ` +
    '(new unless the user pasted a chat-naming handoff) and locale. Write topic and focus in the requested response language, including Chinese, Japanese or Korean even when the prompt is English. Use locale ru for Russian, en otherwise; it controls only the phase marker. Then continue the task and do not mention the title. ' +
    TITLE_BREVITY_INSTRUCTION + ' ' + FOCUS_MEANING_CHECK
  )
}

export function focusUpdateInstruction(currentTitle: string | null): string {
  const shown = currentTitle === null ? 'unknown' : '"' + currentTitle + '"'
  return (
    `[chat-naming] Current chat title: ${shown}. Call ${TOOL_FULL_NAME} only if the task focus has substantially changed; ` +
    'otherwise ignore this note. ' + TITLE_BREVITY_INSTRUCTION + ' ' + FOCUS_MEANING_CHECK
  )
}

/** Prompt origins that represent a person's or SDK host's ordinary prompt. */
export const ORDINARY_PROMPT_ORIGINS: readonly string[] = ['composer', 'sdk', 'bridge']
