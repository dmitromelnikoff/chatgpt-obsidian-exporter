# Development

**Requirements:** Chrome for manual testing, Node.js for script checks, Python 3 for packaging. No npm dependencies, compilation, code generation, or external build service.

```sh
git clone https://github.com/dmitromelnikoff/chatgpt-obsidian-exporter.git
cd chatgpt-obsidian-exporter
node --check core.js && node --check renderer.js && node --check page.js
node --check popup.js && node --check reliability.js && node --check zip.js
node tests/smoke.js
python3 scripts/package_extension.py
```

Load the repository folder via `chrome://extensions` → Developer mode → Load unpacked. Check the resulting `dist/chatgpt-obsidian-exporter-v0.3.8.zip` by extracting it and loading the extracted folder the same way.

A manual browser regression must verify ZIP generation on a conversation you control, internal Obsidian links, one code block, and an attachment if available. Node tests **cannot** simulate live authenticated ChatGPT API behavior or validate the Obsidian desktop renderer.

When changing serialization, avoid mutating code bodies or changing the existing full-path wiki-link format. Never add real conversation JSON, files, cookies, screenshots containing private information, or tokens to version control. Prefer synthetic minimal fixtures.
