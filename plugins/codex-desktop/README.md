# Chat Naming for Codex Desktop

Gives your local Codex Desktop chats short titles with a topic, a phase number and a focus, such as `Checkout · phase 1 — Refund retries`. It runs as skills inside Codex and uses Codex Desktop's built-in title action. Version 0.2.1, macOS.

## Install

1. Add this repository as a plugin marketplace. The repository root carries a Codex marketplace file (`.agents/plugins/marketplace.json`) that points to this folder. With the Codex CLI (bundled with Codex Desktop or installed on its own):

   ```sh
   codex plugin marketplace add Pellucid-Studio/chat-naming
   codex plugin add pellucid-chat-naming@pellucid
   ```

   Offline, run the same `marketplace add` with the path of a downloaded copy of the whole repository.
2. In Codex Desktop, open **Pellucid Chat Naming** and choose **Setup**, or start **Pellucid Naming Setup** from the skill menu. The setup follows the app's language and lets you pick another language for chat titles.

The release also carries `pellucid-chat-naming-0.2.1-codex-desktop.zip`: the same plugin folder as a single archive, for plugin directories that take an upload.

Setup saves only the options you pick, in `${CODEX_HOME:-$HOME/.codex}/pellucid-chat-naming/preferences.plist`. They apply to this Codex profile across local projects. Saving outside the current project may need your approval in Codex.

## Modes

- **On request.** In a chat, choose **Name this chat** from the skill menu (`$pellucid-chat-naming:pellucid-name-chat`). Ordinary turns do not rename the chat in this mode.
- **Automatic.** Turn it on in Setup. Chat Naming then names a new local chat on its first substantive turn. The **Name this chat** skill stays available.
- **Change settings.** Open **Pellucid Naming Setup** from the skill menu.

## What it runs and stores

- The skills ask Codex to compose the title and apply it with the app's own title action. The setup and the skills read and write the preferences file with `references/preferences.sh`, which uses macOS system utilities such as `plutil`.
- Nothing is sent to a separate service, and no extra model call is made.
- A title you set yourself is kept when its origin is known or suspected. The title action has no atomic guard, so a manual rename at the same moment can be overwritten.

## Limits

- Local Codex Desktop chats on macOS only. Codex CLI support is in development.
- Not affiliated with or endorsed by OpenAI.
