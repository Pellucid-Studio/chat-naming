# Chat Naming for OpenCode (preview)

Gives OpenCode sessions short titles with a topic, a phase number and a focus. The assistant you already use proposes the title through the plugin's `pellucid_name_chat` tool; the plugin writes it with OpenCode's own session API and reads it back. Version 0.1.1, built for OpenCode 1.15.13; runs on macOS, Linux and Windows. This is a preview: the title write and readback passed on OpenCode 1.15.13, broader acceptance is still open.

## Install

From a copy of this folder:

```sh
python3 install.py install --config-dir ~/.config/opencode
```

Use a project's `.opencode` folder instead to install for one project. Open a new OpenCode session afterwards. To remove it:

```sh
python3 install.py uninstall --config-dir ~/.config/opencode
```

To update an earlier version, run `uninstall`, then `install` from the new copy.

The installer copies only `pellucid-chat-naming.js` into `plugins/` with a receipt. It never rewrites `opencode.json`, keeps other files, and refuses to remove a plugin file that was changed by hand. Python 3 is needed only for the installer; the plugin runs in OpenCode's own Bun runtime.

## How it behaves

- For substantive work the assistant calls `pellucid_name_chat`. Topics stay literal, continuations get unique phase numbers, and focus updates keep the phase.
- A title you set yourself freezes automatic updates. `pellucid_naming_freeze` freezes or unfreezes a session explicitly.
- `pellucid_handoff` exports a short continuation note for a new session. It never creates a session.
- Subagent sessions are skipped.
- While loaded, the plugin turns off OpenCode's built-in `title` agent through the runtime config hook, so a second title model does not overwrite the plugin's title. `opencode.json` is not changed, and uninstalling restores the usual behavior on the next load. A custom title agent is also paused while the plugin is active.

## Data

The plugin keeps a local ledger in `$XDG_STATE_HOME/pellucid-chat-naming/opencode` (or `~/.local/state/...`; on Windows `%USERPROFILE%\.local\state\...`). Uninstalling keeps it; delete the folder yourself if you no longer need it. Nothing is sent to a separate service.

## Limits

- Existing sessions that were not seen starting are not named automatically.
- OpenCode has no compare-and-set for titles, so a manual rename at the same moment as a write can be overwritten.
- `pellucid-chat-naming.js` is a readable Bun bundle of the project's TypeScript sources and parts of `zod` and `@opencode-ai/plugin`; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
- Not affiliated with or endorsed by the OpenCode project.
