# v0.3.8 — Initial public source publication

## English

**Overview:** A Chrome MV3 extension to export a single ChatGPT conversation into an Obsidian-ready ZIP containing navigable Markdown, available attachments, source data, and an export report.

**Highlights:** structured conversation protocol; readable Markdown with code, formulas and selected Intelligent UI content; safe standalone SVG; tool-image candidate discovery; sequential asset download with retries and size limits; transparent completeness reporting.

**Known limitations:** Interactive UI is not reproduced, some citations and images may be unavailable, and changes to ChatGPT internals can interrupt export. A completed ZIP is not proof of a complete server archive.

**Install:** Download/clone the source, open `chrome://extensions` → Developer mode → Load unpacked, and select the folder containing `manifest.json`. Open one conversation at `chatgpt.com/c/...`, run the extension, and extract the entire ZIP folder into an Obsidian vault.

**Upgrade:** Replace the unpacked extension files, then reload the extension. Keep existing exported folders as independent backups. This is not a Chrome Web Store publication.

**Feedback:** Open a GitHub Issue with a synthetic minimal reproduction; never publish private exports.

## Русский

**Обзор:** расширение Chrome MV3 для сохранения одного чата ChatGPT в ZIP с протоколом Obsidian, Markdown-перепиской, доступными вложениями, исходниками и отчётом.

**Главное:** навигация по шагам, сохранение кода и формул, поддерживаемый Intelligent UI, безопасные SVG, учёт изображений инструментов, последовательные скачивания с повторами и честными статусами.

**Ограничения:** интерактивность не сохраняется; часть изображений и цитат может быть недоступной; внутренние API ChatGPT способны изменяться. ZIP не гарантирует полное содержимое сервера.

**Установка:** скачайте исходники, откройте `chrome://extensions` → «Режим разработчика» → «Загрузить распакованное», выберите папку с `manifest.json`. Откройте чат, запустите экспорт, распакуйте всю папку в Obsidian.

**Обновление:** замените файлы распакованной версии и перезагрузите расширение. Существующие экспортированные архивы остаются самостоятельными. В Chrome Web Store расширение не опубликовано.

**Обратная связь:** создавайте Issues с искусственными примерами, без личных переписок.
