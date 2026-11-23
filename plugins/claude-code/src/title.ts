// Host-side title constraints for Claude Code `/rename`.
//
// Source (fetched 2026-11-04, https://code.claude.com/docs/en/commands):
// "Claude Code replaces control and invisible characters in the new name with
// spaces and caps the name at 200 characters."
//
// A title that `/rename` would rewrite can never read back equal to what we
// asked for, so it would always end in a false conflict. We reject such titles
// before applying instead of guessing the host's exact rewrite. The precise set
// of "invisible" characters is not documented; Cc/Cf/Zl/Zp is a conservative
// superset (it also rejects ZWJ emoji sequences). Whether the cap counts UTF-16
// units or code points is not documented, so both must fit.

export const CLAUDE_RENAME_MAX = 200

const CONTROL_OR_INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u

export type TitleCheck = { ok: true } | { ok: false; reason: string }

export function checkClaudeTitle(title: string): TitleCheck {
  if (typeof title !== 'string' || title.trim() === '') {
    return { ok: false, reason: 'empty title' }
  }
  if (CONTROL_OR_INVISIBLE.test(title)) {
    return { ok: false, reason: 'title contains control or invisible characters that /rename replaces' }
  }
  if (title !== title.trim()) {
    return { ok: false, reason: 'title has leading or trailing whitespace' }
  }
  if (title.length > CLAUDE_RENAME_MAX || Array.from(title).length > CLAUDE_RENAME_MAX) {
    return { ok: false, reason: 'title is longer than the 200-character /rename cap' }
  }
  return { ok: true }
}
