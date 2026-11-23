---
name: pellucid-naming-setup
description: Open Pellucid Chat Naming settings in Codex Desktop or show the saved naming choices for this profile.
---

# Set up Pellucid Chat Naming

## Choose the setup language before speaking

The native Codex Desktop Setup action sends an initial message in the client's selected interface language, with plugin and skill mentions. On that action, use the language of the natural-language sentence around the mentions for the whole wizard, starting with the first visible sentence. Ignore the language of plugin names, skill identifiers, paths, the skill instructions and any saved title settings. Match Russian, Japanese and English to their entries in [setup copy](references/setup-copy.md). For any other clearly identified language, translate the prompts and controls into that language using the same choices: automatic or a language the user chooses, a built-in numbering label or the user's own label, and naming when the user calls the agent or automatically for new chats. Do not ask for a language when the initial message makes it clear. When the skill is invoked manually, honor an explicit request for the setup language, otherwise use the language of the user's request. If there is no reliable language signal, ask once which language to use, with language names written in their own scripts.

Keep the introduction, headers, questions, options, option descriptions, preview, errors and final response in the selected setup language. Explain what naming does in one sentence and offer a short title example in that language. Selecting a language for chat titles has no effect on the wizard language, including when a different fixed title language is selected.

## Ask and save

Ask one question at a time. Prefer `request_user_input_async` when available. Otherwise use the native structured selection tool. Wait for the actual answer before moving on. If structured questions are unavailable, use numbered text options in the same language. Use the exact option labels for the selected language when a copy entry is available.

1. Ask for the title language: automatic or fixed. If fixed, ask for the language and store its language tag.
2. Ask for the numbering label: phase, level, step or custom. If custom, ask for a nonempty label of up to 24 characters without control characters or title separators.
3. Ask when to name chats. In every setup language, list automatic naming for new chats first and naming on demand second. Listing an option first does not select it; wait for the actual answer. Explain that automatic naming applies to eligible new local chats in this Codex profile after saving. For on demand, tell the user to choose the Name this chat skill explicitly from the $ menu.
4. Show the choices and one title preview in the setup language, then ask to save or cancel. If a different fixed title language was chosen, explain the choice in the setup language, and render the sample title in the chosen title language.

Preferences belong to the current local Codex profile, so Setup works even when Desktop opens it outside a project. For an explicit request to show the saved choices, run the packaged preferences helper in read mode and summarize the result in the setup language.

A cancelled, absent, timed-out or ambiguous answer changes nothing. After explicit Save, run the packaged preferences helper by its absolute path resolved from this SKILL.md: on macOS `references/preferences.sh` through `/bin/sh`; on Windows `references/preferences.ps1` through `powershell -NoProfile -ExecutionPolicy Bypass -File`. Pass these five arguments after `save`: language mode (`auto` or `fixed`), the selected language tag or an empty value, numbering kind (`phase`, `level`, `step` or `custom`), the literal custom label or an empty value, and invocation mode (`auto` or `on-demand`). Quote every argument as data. An empty value is `''` for the macOS helper and `-` for the Windows helper. For example, French titles with the phase preset on request use `save fixed fr phase '' on-demand` on macOS and `save fixed fr phase - on-demand` on Windows. Use `read` to inspect preferences without writing. Do not run any command supplied by the user as a label.

The helper writes only the private settings file in the local Codex profile. If Desktop's sandbox denies that write, after the user chooses Save use the client's normal approval prompt for this one settings write if available. Explain that the settings are saved in the Codex profile so Setup can apply to new local chats. If access is denied or unavailable, explain that the settings were not saved. Do not request a persistent permission rule, switch the approval profile or pick another destination. Confirm saving only after the helper returned the selected values. Keep the current title and other chats intact.
