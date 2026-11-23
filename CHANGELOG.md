# Changelog

All notable changes to Chat Naming for Claude Code are listed here. The project follows [Semantic Versioning](https://semver.org/).

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
