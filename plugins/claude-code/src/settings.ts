// Where the core ledger lives. Plugin-owned state, never a settings file:
//   1. CHAT_NAMING_STATE_DIR (explicit override, e.g. probes)
//   2. userConfig `state_dir` (explicit override by an installer)
//   3. default: $CLAUDE_CONFIG_DIR/pellucid-chat-naming when CLAUDE_CONFIG_DIR
//      is absolute, else <home>/.claude/pellucid-chat-naming, where <home> is
//      %USERPROFILE% when it is a Windows absolute path, else $HOME when absolute
// Absolute means a POSIX path (/...), a Windows drive path (C:\... or C:/...) or a UNC path (\\server\share...).
// All values come from documented sources ($.env.get, userConfig options).
// With no absolute candidate the plugin reports itself inactive.

export const STATE_DIR_NAME = 'pellucid-chat-naming'

export type StateDirInputs = {
  envOverride: unknown
  option: unknown
  claudeConfigDir: unknown
  home: unknown
  userProfile?: unknown
}

export type StateDirChoice = { dir: string; source: 'env' | 'option' | 'claude-config-dir' | 'home' } | null

const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/
const WINDOWS_UNC = /^\\\\[^\\/]+[\\/][^\\/]+/

function isWindowsPath(dir: string): boolean {
  return WINDOWS_DRIVE.test(dir) || WINDOWS_UNC.test(dir)
}

function absolute(candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null
  const raw = candidate.trim()
  const windows = isWindowsPath(raw)
  if (!windows && !raw.startsWith('/')) return null
  // Trailing separators go, but a drive root such as C:\ keeps its own.
  const dir = windows ? raw.replace(/(?<=[^:\\/])[\\/]+$/, '') : raw.replace(/\/+$/, '')
  if (dir === '' || dir.split(/[\\/]/).includes('..')) return null
  return dir
}

function child(dir: string, ...names: string[]): string {
  const sep = isWindowsPath(dir) ? '\\' : '/'
  return (dir.endsWith('/') || dir.endsWith('\\') ? dir : dir + sep) + names.join(sep)
}

export function resolveStateDir(inputs: StateDirInputs): StateDirChoice {
  const env = absolute(inputs.envOverride)
  if (env) return { dir: env, source: 'env' }
  const option = absolute(inputs.option)
  if (option) return { dir: option, source: 'option' }
  const config = absolute(inputs.claudeConfigDir)
  if (config) return { dir: child(config, STATE_DIR_NAME), source: 'claude-config-dir' }
  const profile = absolute(inputs.userProfile)
  const home = profile !== null && isWindowsPath(profile) ? profile : absolute(inputs.home)
  if (home) return { dir: child(home, '.claude', STATE_DIR_NAME), source: 'home' }
  return null
}
