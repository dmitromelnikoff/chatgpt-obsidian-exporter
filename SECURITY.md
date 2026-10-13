# Security policy

## Responsible disclosure

Do not post exploit details, authentication material, private ChatGPT exports, or personal documents in public Issues. Use GitHub's private vulnerability-reporting option **if it is enabled**; otherwise contact the repository owner privately using an established GitHub contact channel before publishing details. There is no guaranteed security response SLA.

## Scope and risks

- Chrome Manifest V3 permissions: `activeTab`, `scripting` (see `manifest.json`).
- The exporter runs in an authenticated ChatGPT page context; its requests use your existing session and eligible file hosts.
- Source conversations and attachments can contain untrusted Markdown, SVG, filenames and URLs. The renderer restricts supported SVG elements and attributes; this is **not a formal security proof**.
- The ZIP writer checks paths for traversal segments and maintains integrity metadata, but custom extensions and changing website behavior can create new risks.
- Saved ZIPs may contain very sensitive information and should not be published or uploaded to public issue trackers.
- No analytics SDK or third-party developer-operated submission endpoint was identified in the v0.3.8 source. ChatGPT network access is still required.

## User precautions

Load only a trusted unpacked copy, keep Chrome updated, inspect permissions and exported archives, and use fabricated fixtures when reporting bugs. Avoid opening untrusted exported HTML/SVG files outside your normal security controls.
