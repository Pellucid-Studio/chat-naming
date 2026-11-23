---
name: pellucid-auto-name
description: Automatically name a fresh local Codex Desktop chat on its first substantive request if automatic naming was enabled in Pellucid Setup. Use on ordinary requests without a skill mention. Skip setup, greetings, follow-ups and user-chosen titles.
---

# Automatically name a fresh chat

Apply only to a fresh local Codex Desktop chat on its first substantive task. Skip setup, greetings, follow-ups, resumed chats, handoffs, explicit use of the Name this chat skill, and requests to preserve or choose a title. Preserve an explicitly user-chosen or suspected user-chosen title. A recognizable native preview or generated first-request summary can be replaced. When unsure whether the user chose the existing title, leave it in place.

Open [the title workflow](references/title-workflow.md) and read the current profile's preferences as it describes. Continue with naming only when the preferences are valid and `invocation_mode` is `auto`. If settings are absent, unreadable or on demand, answer the ordinary task without a naming action. Do not ask for permissions or offer setup during an ordinary task. When enabled, name the chat once and then answer the user's task.
