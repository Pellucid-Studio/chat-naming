# Contributing to Chat Naming

Thank you for helping improve Chat Naming. This file explains how changes reach the released editions.

## How this repository works

This repository holds the released editions under `plugins/`, each exactly as its app installs it: `claude-code`, `codex-desktop` and `opencode`. Pellucid Studio develops Chat Naming in a private repository that also contains the shared naming core, the test suites and the builds that produce generated files such as `plugins/claude-code/libexec/` and `plugins/opencode/pellucid-chat-naming.js`. Each release is published here as a whole.

Because of that:

- Issues and discussion in this repository are the right place for bug reports and ideas.
- Pull requests are welcome. A maintainer reviews the change, ports it to the development repository, runs the full test suite there and ships it in the next release. Your pull request is then closed with a link to that release, and you are credited in the changelog.
- `plugins/claude-code/libexec/` and `plugins/opencode/pellucid-chat-naming.js` are generated output. If you propose a change there, describe the behavior you want; the maintainer applies it to the source.

## Before you open an issue

- Say which app and edition you use (Claude Code, Codex Desktop or OpenCode), the app's version and your operating system.
- In Claude Code, run `/chat-naming status` and include its output, and your Node.js version (`node --version`).
- Do not paste chat transcripts, credentials, project paths you consider private or any other personal data. The plugin's local ledger may contain session topics; share only what you are comfortable making public.

## Proposing a change

1. Open an issue first for anything larger than a small fix, so we can agree on the approach.
2. Keep the change focused on one problem.
3. Follow the existing style: plain TypeScript, no new runtime dependencies, no network access.
4. Describe how you checked the change, for example the commands you ran and what the app showed.

By contributing, you agree that your contribution is released under the [MIT License](LICENSE) of this project.

## Conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
