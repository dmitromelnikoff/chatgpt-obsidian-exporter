# Разработка

**Необходимое:** Chrome для ручных испытаний, Node.js для проверок, Python 3 для сборки ZIP. npm-пакеты и компиляция не требуются.

```sh
git clone https://github.com/dmitromelnikoff/chatgpt-obsidian-exporter.git
cd chatgpt-obsidian-exporter
node --check core.js && node --check renderer.js && node --check page.js
node --check popup.js && node --check reliability.js && node --check zip.js
node tests/smoke.js
node tests/button-toggle.js
python3 scripts/package_extension.py
```

Для разработки загружайте корень репозитория в `chrome://extensions` → «Режим разработчика» → «Загрузить распакованное». Проверочный пакет: `dist/chatgpt-obsidian-exporter-v0.3.9.2.zip`.

В реальном Chrome отдельно проверяйте: создание ZIP, переходы протокола в Obsidian, кодовые блоки и доступные вложения. Node-тесты **не доказывают** работу внутреннего API ChatGPT и рендеринг Obsidian.

При изменениях не меняйте содержимое исходного кода и проверенный формат полных wikilinks. Никогда не публикуйте личный JSON, файлы, cookies, секреты и необезличенные снимки экрана. Делайте минимальные искусственные тестовые примеры.
