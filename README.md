# ChatGPT Obsidian Exporter

**Export your ChatGPT conversations. Preserve your work in an Obsidian-ready archive.**

[English](README.md) · [Русский](README.ru.md) · [Installation](#quick-start) · [Archive format](docs/export-format.md) · [Contributing](CONTRIBUTING.md)

**Version:** 0.3.9 · **Platform:** Chrome Manifest V3 · **Status:** automation preview

ChatGPT Obsidian Exporter is a browser extension that exports **one open ChatGPT conversation** into a self-contained ZIP archive. It includes readable Markdown, a numbered navigation protocol with Obsidian wiki-links, available files and images, the source conversation JSON, and a report showing what was and was not saved.

> **Not affiliated with OpenAI or Obsidian.** This project uses internal ChatGPT endpoints that can change without notice. It cannot guarantee a complete server-side export.

## Why use it?

- **Keep your work:** retain available code, explanations, generated documents, diagrams, and images alongside their conversational context.
- **Find answers again:** a numbered protocol links directly to message sections in Obsidian, even when exported conversations span multiple Markdown files.
- **Reduce manual copying:** collect available attachments and Markdown in one ZIP.
- **Know what is missing:** the export report distinguishes successful downloads, skipped files, failures, and incomplete rendering.
- **Retain the source:** an accessible `conversation.json` and DIL sources make later inspection or improved conversion possible.

## Highlights

| Area | What v0.3.9 does |
| --- | --- |
| Conversation export | Exports the current chat; splits lengthy Markdown transcripts into parts of about 200 KiB. |
| Navigation | `00_Протокол.md` with numbered Q&A steps and full-path Obsidian wiki-links. |
| Markdown | Preserves code blocks, handles supported escaping, formulas, headings, and selected structured writing blocks. |
| Intelligent UI | Uses available fallback Markdown, expands a bounded static DIL subset, saves safe inline SVG as files, and retains source DIL. **Interactive behavior is not reproduced.** |
| Attachments | Attempts to download detected outbound files, images, and eligible tool-image candidates; optionally includes inbound uploads. |
| Reliability | Serial downloads, configurable pacing, limited retries for transient errors, size limits, and integrity metadata. |
| Transparency | ZIP includes a machine-readable asset registry and human-readable export report. |


## Automation / DOM button (v0.3.9 preview)

On a ChatGPT conversation page a fixed **Экспорт ZIP** button appears in the bottom-right corner. A browser-based AI agent or user can click it directly in the DOM. Unlike the Popup route, this action uses fixed default settings with **incoming uploads enabled**, as well as outbound files and images. The existing Popup still offers its original controls.

- The button is injected only on ChatGPT domains and displayed only on conversation paths, including SPA navigation. No extra Chrome permission is requested.
- Agent target: `#chatgpt-obsidian-export-zip-button`. Read `data-export-status`: `idle`, `running`, `ready`, or `error`.
- Detailed progress appears in `#chatgpt-obsidian-export-panel` with its own `data-export-status` (`running`, `ready`, `error`).
- **ready means ZIP creation and a browser download attempt**, not proof of a completed download. The automation environment must check Chrome's downloads before moving the file.
- Default asset settings: include outbound files, images and incoming user uploads; paced downloads at 1.5 s; max 100 MB per file, with the pre-existing total download budget and error handling. Unavailable assets remain explicitly reported.

This is a preview candidate requiring a live test on an authenticated ChatGPT tab. To install from this branch, run `python3 scripts/package_extension.py` and load the extracted `dist/chatgpt-obsidian-exporter-v0.3.9.zip` via `chrome://extensions`.

## Quick start

This repository's root is the **unpacked Chrome extension directory**; there is no npm install or build step for local use.

1. Download the source archive from GitHub (or clone this repository) and extract it into a permanent folder.
2. Open `chrome://extensions`, turn on **Developer mode**, select **Load unpacked**, and choose the folder containing `manifest.json`.
3. Open a conversation at `https://chatgpt.com/c/...` and click the extension icon.
4. Choose whether to include files, images, and your own incoming uploads. Click the export button.
5. The extension shows progress on the ChatGPT page and downloads a ZIP.
6. Extract the ZIP's **entire named root folder** into your Obsidian vault. Open `00_Протокол.md`.

To update, replace files in the unpacked folder and click **Reload** on `chrome://extensions`. Avoid keeping multiple installed copies unless you intentionally need them.

**Not published in the Chrome Web Store.** Other Chromium-based browsers are not part of a verified compatibility matrix.

## Archive layout

```text
Conversation title_YYYY-MM-DD_HH-MM-SS/
├── 00_Протокол.md
├── 01_Переписка/
│   ├── Часть-001.md
│   └── Часть-002.md
├── 02_Артефакты/             # Only saved assets, when any
├── 03_Исходники/
│   ├── conversation.json
│   ├── conversation.log
│   ├── artifacts.json
│   ├── steps.json
│   ├── manifest.json
│   └── DIL/                  # When structured UI is encountered
├── 04_Отчёт экспорта.md
└── README.md
```

The title/timestamp folder avoids overwriting previous exports. Keep the root folder intact to preserve its wiki-links. Sample navigation, sanitized example paths, and field meanings: [Export format](docs/export-format.md).

## Options

- Include available files — **on** by default.
- Include available images — **on** by default.
- Include incoming user-uploaded assets — **off** by default.
- Save an additional standalone LOG — optional (the LOG is always included in the ZIP).
- Delay between downloads — **1.5 seconds** by default, adjustable from 0.5 to 30 seconds or disabled.
- Maximum size per downloadable file — defaults to **100 MB**, adjustable in the popup.

Transient failures are retried at most twice; HTTP `Retry-After` is considered. An overall downloaded-asset budget of 512 MiB also applies. If content is unavailable, the archive records the failure rather than inventing the file.

## Architecture and development

No npm packages or external bundled libraries are required. Main modules:

| File | Responsibility |
| --- | --- |
| `manifest.json`, `popup.html`, `popup.js` | Chrome MV3 entry point, popup settings, page injection. |
| `page.js` | ChatGPT session/API integration, attachment requests, export orchestration. |
| `core.js` | Conversation normalization, step creation, asset registration, file layout. |
| `renderer.js` | Markdown/structured DIL conversion, safe inline SVG conversion. |
| `reliability.js` | Retry classification, backoff, pacing. |
| `zip.js` | Local uncompressed ZIP32 writer with CRC32 and UTF-8 paths. |

[Architecture](docs/architecture.md) · [Development & validation](docs/development.md) · [Troubleshooting](docs/troubleshooting.md)

### Developer checks

```sh
node --check core.js
node --check renderer.js
node --check page.js
node --check popup.js
node --check reliability.js
node --check zip.js
node tests/smoke.js
python3 scripts/package_extension.py
```

The Python command creates `dist/chatgpt-obsidian-exporter-v0.3.9.zip` containing extension runtime files only. Node.js is used for checks; Python is used solely for packaging, **not** for running the extension.

## Security, privacy and limitations

The extension uses the Chrome permissions `activeTab` and `scripting`. It reads the currently open ChatGPT conversation and makes authenticated requests to ChatGPT endpoints and permitted asset URLs using your existing browser session. It builds the ZIP locally; no analytics or separate developer-run upload endpoint was identified in v0.3.8. **Do not publish exported ZIPs or logs without redacting private data.**

- ChatGPT endpoints, DOM structure and file access rules can change.
- The export reflects information accessible to the current session and selected branch, not necessarily all historical branches or hidden server records.
- Intelligent UI is a best-effort static conversion: dynamic state, external images without downloadable bytes, and some citation URLs may be missing.
- Tool-generated image pointers can refer to intermediate outputs and may not be downloadable.
- Files larger than configured limits or unavailable to the server are reported, not reconstructed.
- ZIP archives are uncompressed (STORE) and can be relatively large.

See [Security policy](SECURITY.md) and [Privacy notes](docs/privacy.md) for details.

## Contributing and support

Bug reports and small, reproducible test cases are welcome via [GitHub Issues](https://github.com/dmitromelnikoff/chatgpt-obsidian-exporter/issues). **Never upload entire personal conversations as public issue attachments.** Please use synthetic, redacted fixtures.

[Contributing](CONTRIBUTING.md) · [Support](SUPPORT.md) · [Changes](CHANGELOG.md) · [Release notes](docs/release-v0.3.8.md)

## License and author

**License decision pending.** The repository currently does **not** declare an open-source license; public source availability alone does not grant redistribution/modification rights. The owner should select and add a license before actively inviting code contributions or re-use.

Maintainer: [@dmitromelnikoff](https://github.com/dmitromelnikoff).
