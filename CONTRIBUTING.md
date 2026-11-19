# Contributing to Chat Naming

Thank you for helping improve Chat Naming. This file explains how changes reach the plugin.

## How this repository works

This repository holds the released plugin exactly as Claude Code installs it. Pellucid Studio develops Chat Naming in a private repository that also contains the test suites and the build that produces `libexec/` from TypeScript sources. Each release is published here as a whole.

Because of that:

- Issues and discussion in this repository are the right place for bug reports and ideas.
- Pull requests are welcome. A maintainer reviews the change, ports it to the development repository, runs the full test suite there and ships it in the next release. Your pull request is then closed with a link to that release, and you are credited in the changelog.
- Edits to files in `libexec/` are generated output. If you propose a change there, describe the behavior you want; the maintainer applies it to the source.

## Before you open an issue

- Run `/chat-naming status` in Claude Code and include its output.
- Say which Claude Code version you use (`claude --version`), your Node.js version (`node --version`) and your operating system.
- Do not paste chat transcripts, credentials, project paths you consider private or any other personal data. The plugin's local ledger may contain session topics; share only what you are comfortable making public.

## Proposing a change

1. Open an issue first for anything larger than a small fix, so we can agree on the approach.
2. Keep the change focused on one problem.
3. Follow the existing style: plain TypeScript in `src/` and `hooks/`, no new runtime dependencies, no network access.
4. Describe how you checked the change, for example the commands you ran and what Claude Code showed.

By contributing, you agree that your contribution is released under the [MIT License](LICENSE) of this project.

## Conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
