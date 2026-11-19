# Security policy

## Supported versions

Only the latest released version of Chat Naming receives security fixes.

| Version | Supported |
| ------- | --------- |
| 0.2.x   | yes       |
| < 0.2   | no        |

## What the plugin can touch

Chat Naming makes no network requests and calls no model of its own. It runs a local Node.js helper from `libexec/`, keeps a SQLite ledger in its state directory (directory mode 0700, file mode 0600) and renames sessions through Claude Code's own `/rename` command. See "What it runs" and "Data and privacy" in the [README](README.md).

## Reporting a vulnerability

Please do not report security problems in public issues.

- Preferred: open the **Security** tab of this repository and choose **Report a vulnerability**. The report stays private between you and the maintainers.
- Alternatively, use the [Chat Naming support page](https://pellucid.studio/chat-naming/support/) and mark the message as a security report.

Include the plugin version, your Claude Code and Node.js versions, steps to reproduce and the impact you expect. We aim to acknowledge a report within 5 working days and to agree on a disclosure date with you once a fix is ready.
