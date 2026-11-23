# Security policy

## Supported versions

Only the latest released version of Chat Naming receives security fixes.

| Edition | Version | Supported |
| ------- | ------- | --------- |
| Claude Code | 0.2.x | yes |
| Codex Desktop | 0.2.x | yes |
| OpenCode (preview) | 0.1.x | yes |
| Older versions | | no |

## What the editions can touch

No edition makes network requests or calls a model of its own. Each keeps a local ledger or preferences file in its app's profile and renames chats only through the app's own rename function. The Claude Code edition runs a local Node.js helper from `libexec/`; the Codex Desktop edition runs `references/preferences.sh` with macOS system utilities; the OpenCode edition runs inside OpenCode. Each edition's README lists what it runs, reads and stores.

## Reporting a vulnerability

Please do not report security problems in public issues.

- Preferred: open the **Security** tab of this repository and choose **Report a vulnerability**. The report stays private between you and the maintainers.
- Alternatively, use the [Chat Naming support page](https://pellucid.studio/chat-naming/support/) and mark the message as a security report.

Include the edition and its version, your app version, steps to reproduce and the impact you expect. We aim to acknowledge a report within 5 working days and to agree on a disclosure date with you once a fix is ready.
