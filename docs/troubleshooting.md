# Troubleshooting

- **Nothing happens:** Open a normal conversation URL `https://chatgpt.com/c/...`; check the active tab, popup status, and the browser console. This extension uses `activeTab` permission and injects code only after a click.
- **Export has fewer messages:** ChatGPT's endpoint may have failed or fallen back to page extraction. Check `04_Отчёт экспорта.md` for the completeness status. Some branches and hidden records are not accessible.
- **Attachments missing:** Check `artifacts.json` and the report for skipped inbound files, size limits, expired links, HTTP errors, or unavailable tool-generated images. A pointer is not proof of a downloadable file.
- **Obsidian wiki-link doesn't resolve:** Extract the *whole* named export folder into one vault; do not rename individual parts or move assets outside that folder.
- **Intelligent UI differs from the website:** Dynamic UI isn't reproduced. Look for retained DIL sources in `03_Исходники/DIL`.
- **ZIP not downloading:** Check Chrome download permissions, the export panel and console, then retry the open conversation. Archives use ZIP32 and an overall asset budget.

For a bug report, include extension and Chrome versions, steps, expected/actual result, and **sanitized** snippets only.
