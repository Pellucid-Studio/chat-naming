// Where the core ledger lives. Plugin-owned state, never a settings file:
//   1. CHAT_NAMING_STATE_DIR (explicit override, e.g. probes)
//   2. userConfig `state_dir` (explicit override by an installer)
//   3. default: $CLAUDE_CONFIG_DIR/pellucid-chat-naming when CLAUDE_CONFIG_DIR
//      is absolute, else $HOME/.claude/pellucid-chat-naming when HOME is absolute
// All values come from documented sources ($.env.get, userConfig options).
// With no absolute candidate the plugin reports itself inactive.

export const STATE_DIR_NAME = 'pellucid-chat-naming'

export type StateDirInputs = {
  envOverride: unknown
  option: unknown
  claudeConfigDir: unknown
  home: unknown
}

export type StateDirChoice = { dir: string; source: 'env' | 'option' | 'claude-config-dir' | 'home' } | null

function absolute(candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null
  const dir = candidate.trim().replace(/\/+$/, '')
  if (dir === '' || !dir.startsWith('/') || dir.split('/').includes('..')) return null
  return dir
}

export function resolveStateDir(inputs: StateDirInputs): StateDirChoice {
  const env = absolute(inputs.envOverride)
  if (env) return { dir: env, source: 'env' }
  const option = absolute(inputs.option)
  if (option) return { dir: option, source: 'option' }
  const config = absolute(inputs.claudeConfigDir)
  if (config) return { dir: config + '/' + STATE_DIR_NAME, source: 'claude-config-dir' }
  const home = absolute(inputs.home)
  if (home) return { dir: home + '/.claude/' + STATE_DIR_NAME, source: 'home' }
  return null
}
