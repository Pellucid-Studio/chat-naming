# Changelog

All notable changes to Chat Naming for Claude Code are listed here. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

- Repository is now a Claude Code marketplace named `pellucid`: install with `/plugin install pellucid-chat-naming --marketplace Pellucid-Studio/chat-naming`.
- Plugin icon and a README screenshot of real session titles.

## [0.2.0] - 2026-11-17

First public release for Claude Code.

- Names an untitled session from the main agent's own understanding of the first real request: a stable topic, a numbered phase and a short focus. No extra model call.
- Applies the title with Claude Code's built-in `/rename` and reads it back to verify it.
- Never overwrites a title you set yourself; `/chat-naming freeze`, `unfreeze`, `status` and `handoff` commands.
- Local core runs on Node.js 22.13 or later with the built-in `node:sqlite`; without Node.js the plugin stays silent and `/chat-naming status` explains why.
- Released under the MIT License.
