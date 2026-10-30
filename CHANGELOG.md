# Changelog

This project uses [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) style. The first public source publication starts at 0.3.8; prior iterations were developed and tested privately rather than reconstructed as Git commits.

## [0.3.9.2] — Stable: DOM button and optional visibility

- Added a default-on **Включить кнопку** checkbox as the first Popup option.
- Immediately show/hide the ChatGPT-page ZIP button when the setting changes; remember the choice across sessions using `chrome.storage.local`.
- Keep the Popup export fully available while the button is hidden and let an already-running export finish.
- Request the standard `storage` permission (no new site access).
- Add automated visibility and persistence regression tests.

## [0.3.9.1] — Export provenance / diagnostics fix

- Fix the internal exporter version and ZIP README so they agree with Chrome manifest.
- Explicitly distinguish API-pagination exhaustion from absent pagination metadata.
- Include per-page message counts, duplicate count, and readable-transcript filtering reasons.
- Keep best-effort completeness wording; this update does not claim access to hidden server history.
- Add regression checks for archive version and intentional filtering.

## [0.3.9] — Initial automation preview (validated in later builds)

- A single-click **Экспорт ZIP** button on ChatGPT conversation pages, including SPA route changes.
- Automatically includes available inbound and outbound attachments in the DOM-button mode; Popup configuration unchanged.
- DOM statuses for RPA agents; no new Chrome permissions; uses the original exporter and ZIP layout.
- Automated syntax and synthetic browser tests only; downloading authenticated ChatGPT attachments must be validated by the user.

## [0.3.8] — Initial public source publication

### Added
- Bounded static DIL label recovery in readable Markdown.
- Sanitized inline SVG as an Obsidian-compatible asset.
- Discovery and status tracking for tool-generated image pointers.

### Available in this release
- Numbered protocol, linked Markdown transcript, raw accessible JSON and LOG.
- Asset registry, serial downloads, retries, size limits, SHA-256 metadata where available.
- Markdown code preservation, source DIL, and fallback-based Intelligent UI conversion.

### Known limitations
- Dynamic Intelligent UI is not reproduced; some media and citations remain unresolved.
- ChatGPT internal API/DOM changes may interrupt exports.
- A public source release is not a Chrome Web Store listing.
