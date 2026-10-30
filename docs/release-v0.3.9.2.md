# ChatGPT Obsidian Exporter v0.3.9.2

## English

**Stable Chrome Manifest V3 release.** The existing ChatGPT-to-Obsidian exporter can now be launched either through the regular Chrome extension Popup or through the **Экспорт ZIP** button in the bottom-right corner of an open ChatGPT conversation.

### Highlights

- **Agent-ready export:** automation tools can click a real DOM button (`#chatgpt-obsidian-export-zip-button`) without reaching Chrome's toolbar or injecting arbitrary page JavaScript.
- **All available attachments:** the DOM-button path requests incoming uploads, outgoing files, and images using the same exporter, retry policy and archive layout as the existing Popup.
- **Optional on-page button:** the Popup's first checkbox, **Включить кнопку**, is enabled by default. Uncheck to hide the button immediately across open ChatGPT tabs; re-enable it at any time. The preference survives restarts, and hiding the button does not interrupt a running export or disable Popup export.
- **Honest completeness diagnostics:** `exporter_version`, `pagination_status`, `pagination_exhausted`, per-page counts and `excluded_message_reasons` are recorded in the exported manifest. API records remain in `conversation.json`; not all are represented in the readable Markdown transcript.
- **No new website access:** a standard Chrome `storage` permission stores the button preference locally.

### Installation

1. Download the attached `chatgpt-obsidian-exporter-v0.3.9.2.zip` asset from this release.
2. Extract the ZIP into a dedicated, permanent directory.
3. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the directory containing `manifest.json`.
4. Open a conversation on `https://chatgpt.com/c/...` and click **Экспорт ZIP**, or open the extension Popup for custom settings.

To update an existing unpacked installation, replace its runtime files with the extracted contents and click **Reload** on `chrome://extensions`. Keep only one active installed copy to avoid duplicate controls.

### Validation and limitations

Browser-based acceptance checks confirmed DOM launch, ZIP generation/download, available incoming and outgoing file downloads, and Popup visibility control. Synthetic checks and the CI build run on every push. There is **no guarantee** of all hidden server content or alternative ChatGPT conversation branches. Inaccessible assets are reported instead of silently reconstructed. `data-export-status="ready"` means download was initiated, not verified on disk; automation must separately confirm that the ZIP exists.

The project is not affiliated with OpenAI or Obsidian and is not listed in the Chrome Web Store. **License decision pending**: no open-source license has yet been granted in the repository.

---

## Русский

**Стабильная версия Chrome Manifest V3.** Запуск экспорта доступен как через обычное окно расширения, так и через кнопку **«Экспорт ZIP»** в правом нижнем углу открытого разговора ChatGPT.

### Основные изменения

- **Для ИИ-агентов:** кнопка с DOM ID `chatgpt-obsidian-export-zip-button` запускает экспорт без взаимодействия с панелью Chrome и без внедрения пользовательского JavaScript.
- **Доступные вложения:** кнопка запрашивает входящие загрузки пользователя, исходящие файлы и изображения через прежнюю, уже проверенную систему экспорта.
- **Отключение кнопки:** первая галочка Popup — **«Включить кнопку»** — установлена по умолчанию. Снятие сразу скрывает кнопку во вкладках ChatGPT, повторное включение возвращает её. Выбор сохраняется между перезапусками браузера. Ручной экспорт остаётся доступным; начатый экспорт не прерывается.
- **Диагностика:** версия, признаки завершения пагинации, размеры страниц и причины исключения служебных записей отображаются в `03_Исходники/manifest.json`. Полученные API-записи остаются в `conversation.json`.
- **Разрешения:** добавлено стандартное разрешение `storage` только для локальной настройки видимости кнопки.

### Установка

1. Скачайте приложенный к релизу `chatgpt-obsidian-exporter-v0.3.9.2.zip`.
2. Распакуйте ZIP в отдельную постоянную папку.
3. Откройте `chrome://extensions` → «Режим разработчика» → «Загрузить распакованное», укажите папку с `manifest.json`.
4. Откройте разговор `https://chatgpt.com/c/...` и нажмите **«Экспорт ZIP»** либо откройте Popup для ручных настроек.

Для обновления распакованной версии замените файлы в папке и нажмите «Обновить» в Chrome. Не оставляйте две активные копии расширения без необходимости.

### Проверки и ограничения

Реальные проверки в Chrome подтвердили работу DOM-кнопки, создание ZIP, загрузку доступных входящих и исходящих файлов и переключатель видимости. Автоматические тесты и сборка запускаются в GitHub Actions. Полнота скрытых данных сервера и альтернативных веток **не гарантируется**; недоступные вложения перечисляются в отчёте. Статус `ready` означает, что скачивание запущено, но агент должен подтвердить наличие файла на диске.

Проект не связан с OpenAI или Obsidian и отсутствует в Chrome Web Store. **Лицензия пока не выбрана**, несмотря на открытый доступ к исходникам.
