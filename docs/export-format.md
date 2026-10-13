# Export format

Each export uses a uniquely timestamped root folder. The files have Russian names because they are part of the existing Obsidian compatibility contract.

- `00_Протокол.md`: navigation summary with numbered user-request steps. Each step points at `## NNN. ...` in a transcript part.
- `01_Переписка/Часть-NNN.md`: readable Markdown. Long conversations split at step boundaries where possible.
- `02_Артефакты/`: successfully saved files and locally generated safe SVG; may be absent/empty when no assets are saved.
- `03_Исходники/conversation.json`: raw conversation response accessible at export time (not a complete guarantee of server history).
- `03_Исходники/conversation.log`: log text.
- `03_Исходники/steps.json`, `artifacts.json`, `manifest.json`: navigation, download and completeness metadata.
- `03_Исходники/DIL/*.txt`: original DIL for selected structured messages.
- `04_Отчёт экспорта.md`: download outcomes, skipped assets, warnings, limits.

Example **synthetic** protocol link (no user data):

```markdown
[[Example conversation_2026-01-01_12-00-00/01_Переписка/Часть-001#001. Explain the algorithm|001. Explain the algorithm]]
**📤 [[Example conversation_2026-01-01_12-00-00/02_Артефакты/example.txt|example.txt]]**
```

**Important:** The root-directory name is part of each wikilink. Move the **entire** folder within one vault, rather than copying standalone Markdown files into unrelated directories. Links to unavailable assets must not be generated as if the files existed.

Intelligent UI is serialized to best-effort static Markdown plus retained DIL; code blocks and recognized SVG are handled separately. Some interactive state and externally resolved citations will not survive conversion.
