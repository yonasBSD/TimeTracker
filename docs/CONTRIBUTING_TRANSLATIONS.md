# Contributing translations (no Git required)

This project uses **GNU gettext** `.po` files under `translations/<locale>/LC_MESSAGES/messages.po`, compiled at app startup (see [TRANSLATION_SYSTEM.md](TRANSLATION_SYSTEM.md)). You do **not** need Git or developer tools to suggest fixes.

## How we accept help (channels)

Maintainers should pick what fits workload and community size. The **default** for this repository is **A**; scale up to **B** or **C** when needed.

| Channel | Best for | Git? |
|--------|-----------|------|
| **A. GitHub issue (recommended default)** | Wrong/missing wording, one string or a small batch | No — use the “Translation improvement” template when creating an issue |
| **B. Spreadsheet or form** | Many rows at once, non-GitHub users | No — maintainer copies suggestions into `.po` |
| **C. Hosted translation platform** | Ongoing community, many languages, history and glossaries | No for translators; maintainer connects repo or uploads `.po` |

### A. GitHub issue (primary)

1. Open a new issue and choose **Translation improvement**.
2. Fill in language, where you saw the text, current UI text, and your suggested wording.
3. A maintainer updates the correct `messages.po` and merges the change.

No repository access is required.

### B. Spreadsheet or form (optional)

Use when contributors cannot or will not use GitHub:

1. Maintainer shares a table with columns such as: **Language code**, **Screen or page**, **Text as shown now**, **Should be (your suggestion)**, **Notes**.
2. Contributors only edit the suggestion column.
3. Maintainer applies changes to the `.po` files and validates placeholders (see below).

### C. Hosted platform (optional, higher volume)

Examples: [Weblate](https://weblate.org/) (open source, can be self-hosted), [Crowdin](https://crowdin.com/), [POEditor](https://poeditor.com/), [Transifex](https://www.transifex.com/). Translators work in the browser; integration or export/import keeps `.po` in sync with the codebase. Setup is maintainer-owned.

### Other options (reference)

- **Poedit:** Maintainer can zip `translations/<lang>/LC_MESSAGES/messages.po` for a trusted translator; they edit in [Poedit](https://poedit.net/) and send the file back. Avoid two people editing the same locale in parallel without coordination.
- **GitHub web editor on `.po` files:** Possible for experts only; easy to break quoting or plural blocks.

## Rules for translators

Follow these so your suggestion can be applied without breaking the app:

1. **Do not change English source keys.** In `.po` files those are `msgid` lines. In an issue or spreadsheet you describe what you see; maintainers map it to the file. Never invent a new English “key” string.
2. **Preserve placeholders exactly.** If the UI shows `Hello, %(username)s` or similar, your translation must include the same placeholders (same names, same `%(name)s`-style segments). Same for `%s`, `%d`, or other format tokens.
3. **Plurals:** Some strings have one vs many forms. If you are unsure, describe the case in **Notes** and a maintainer will set `msgstr[0]` / `msgstr[1]` correctly in the `.po` file.
4. **Context matters.** Say which **page**, **button**, or **dialog** the text appears on, and attach a **screenshot** if possible. One English phrase can appear in multiple places with different meanings.
5. **Length and tone:** Short labels (buttons, nav) should stay compact. Full sentences can be more natural in your language than literal word-for-word English.

**Supported locale codes** (see `app/config.py` `LANGUAGES`): `en`, `nl`, `de`, `fr`, `it`, `fi`, `es`, `no`, `ar`, `he`.

## Maintainer workflow

Designate at least one person responsible for translation intake (issues, spreadsheet, or platform export).

### Applying contributor suggestions

1. Identify the locale file: `translations/<locale>/LC_MESSAGES/messages.po`.
2. Find the entry (by `msgid` / English source or grep for the current `msgstr`).
3. Update `msgstr` (and plural `msgstr[n]` if needed). Remove `#, fuzzy` if you are sure the translation is correct (fuzzy entries may be ignored at compile time depending on setup).
4. Restart the app or trigger your usual deploy so `.mo` is regenerated (see [TRANSLATION_SYSTEM.md](TRANSLATION_SYSTEM.md) — compilation runs on startup via `app/utils/i18n.py`).

### After new UI strings ship in code

When developers add or change translatable strings:

```bash
pybabel extract -F babel.cfg -o messages.pot .
pybabel update -i messages.pot -d translations
```

Then fill new empty entries in each `messages.po`, run the app, and smoke-test critical screens in a few locales.

### Verification checklist

- [ ] Placeholders in `msgstr` match the `msgid` / source string.
- [ ] `.po` file is valid UTF-8 and parses (Poedit or `msgfmt --check`).
- [ ] UI checked in the target language for overflow or clipping on small screens (especially for short buttons).

## See also

- Technical overview: [TRANSLATION_SYSTEM.md](TRANSLATION_SYSTEM.md)
