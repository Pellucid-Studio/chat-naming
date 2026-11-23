---
name: pellucid-name-chat
description: Name the current local Codex Desktop chat when the user explicitly selects this skill. Uses the settings saved in Pellucid Naming Setup. Does not run automatically.
---

# Name this chat on request

Run only when the user explicitly chooses this skill. Read [the title workflow](references/title-workflow.md) and the current local profile's preferences. Both on demand and automatic modes allow an explicit call. If no valid settings exist, ask the user to finish Pellucid Naming Setup. Do not write settings.

Use the current task or conversation as context. Ask for a short topic only if the conversation is too empty to name. When an existing user-chosen title is known or suspected, preserve it unless the user explicitly asks to replace it. Do not name another chat. After the native write succeeds, reply with the applied title and continue any task the user also requested. If the write fails, say so.
