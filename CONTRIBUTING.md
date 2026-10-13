# Contributing

Thank you for helping make conversation archives more reliable. Small, focused changes are preferred; avoid adding a framework or significant dependencies without a clear need.

1. Read [Development](docs/development.md) and [Architecture](docs/architecture.md).
2. Open an Issue describing a reproducible problem or improvement (or check existing Issues).
3. Create a feature branch, change the minimal set of files, and document relevant behavior.
4. Run `node tests/smoke.js`, `node --check` on touched JS, and `python3 scripts/package_extension.py`.
5. Test manually in an unpacked Chrome extension if changing the UI or authenticated API access.
6. Open a pull request using the repository template, including limitations and evidence.

**Privacy:** Never include real exported conversations, file contents, private images, credentials, or secret tokens in test fixtures or Issues. Use fabricated examples with fake identifiers and file paths.

**Current license status:** No open-source license has been chosen yet. Before contributing substantial code, please contact the maintainer through an Issue to agree on licensing and contribution terms.

Potential starter tasks: improve diagnostic messages, update synthetic tests for new markup components, refine multilingual documentation, or add tests for archive path edge cases.
