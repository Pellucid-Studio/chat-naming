# Changelog

All notable changes to Chat Naming are listed here, per edition. The project follows [Semantic Versioning](https://semver.org/).

## [0.2.2] - 2026-11-23 - Windows support: Claude Code 0.2.2, Codex Desktop 0.2.2, OpenCode 0.1.1

- Claude Code: on Windows the plugin found no state directory and stayed silent, and its core helper refused Windows paths. Both now accept drive (`C:\...`) and UNC paths; the plugin uses `%USERPROFILE%\.claude\pellucid-chat-naming` by default and keeps `CLAUDE_CONFIG_DIR`, `CHAT_NAMING_STATE_DIR` and the `state_dir` option first. Node.js 22.13 or later is still needed on `PATH`.
- All editions with a local ledger (Claude Code, OpenCode): Windows reports synthetic permission bits, so the POSIX "accessible by other users" checks refused to open the ledger there. These checks now run on macOS and Linux only; on Windows access is governed by the user profile.
- Codex Desktop: new `references/preferences.ps1` for Windows PowerShell 5.1 and later, with the same commands, checks and output as `preferences.sh`. Preferences on Windows are stored in `preferences.json` in the Codex profile. The skills choose the helper for the current system.
- OpenCode: to update from 0.1.0, run `install.py uninstall`, then `install` from the new copy.
- Repository: a GitHub Actions workflow runs the shipped Claude Code core, the OpenCode plugin and the PowerShell preferences helper on Windows for every push.

## [2026-11-23] - Repository: all editions

No released edition changed its code: this release reorganizes the repository around the apps Chat Naming supports and publishes the OpenCode preview for the first time.

- Every released edition lives under `plugins/`: Claude Code 0.2.1, Codex Desktop 0.2.1 and an OpenCode 0.1.0 preview. The Claude Code install command is unchanged.
- The repository is also a Codex plugin marketplace (`.agents/plugins/marketplace.json`): `codex plugin marketplace add Pellucid-Studio/chat-naming`, then `codex plugin add pellucid-chat-naming@pellucid`. Claude Code keeps reading `.claude-plugin/marketplace.json`.
- The Codex Desktop plugin folder is attached to the release as a ZIP.
- README: a cover, a recording of a real Claude Code session being renamed, and a table of supported apps (Codex CLI in development, Antigravity not supported yet).
- One MIT license for all editions.

## [0.2.1] - 2026-11-23

- `set_chat_title` now runs only after Claude Code's permission check, and the plugin never allows it on your behalf. Claude Code asks once, like for any tool; choose **Yes, and don't ask again**, or add `mcp__pellucid-chat-naming__set_chat_title` to `permissions.allow`. Subagent calls are still refused.
- README: a section on what the mod hooks, runs and reads inside Claude Code; the first-run permission prompt.
- Repository is a Claude Code marketplace named `pellucid`: install with `/plugin install pellucid-chat-naming --marketplace Pellucid-Studio/chat-naming`.
- Plugin icon and a README screenshot of real session titles.

## [0.2.0] - 2026-11-17

First public release for Claude Code.

- Names an untitled session from the main agent's own understanding of the first real request: a stable topic, a numbered phase and a short focus. No extra model call.
- Applies the title with Claude Code's built-in `/rename` and reads it back to verify it.
- Never overwrites a title you set yourself; `/chat-naming freeze`, `unfreeze`, `status` and `handoff` commands.
- Local core runs on Node.js 22.13 or later with the built-in `node:sqlite`; without Node.js the plugin stays silent and `/chat-naming status` explains why.
- Released under the MIT License.
