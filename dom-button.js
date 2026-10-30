/* Optional DOM launcher: auto-loaded by Chrome only on ChatGPT origins.
   Reuses the existing exporter and never executes source from the web page. */
(() => {
  'use strict';
  if (globalThis.__ChatGPTObsidianDomLauncher) return;
  const BUTTON_ID = 'chatgpt-obsidian-export-zip-button';
  const PANEL_ID = 'chatgpt-obsidian-export-panel';
  const HOSTS = new Set(['chatgpt.com', 'chat.openai.com']);
  const CHAT_PATH = /(?:^|\/)c\/[A-Za-z0-9-]{16,}(?:\/|$)/;
  let button = null;
  let running = false;
  let observedPath = null;
  let schedulePending = false;

  function isChatPage() {
    return location.protocol === 'https:' && HOSTS.has(location.hostname) && CHAT_PATH.test(location.pathname);
  }
  function state(value, tooltip) {
    if (!button) return;
    button.dataset.exportStatus = value;
    button.setAttribute('aria-busy', String(value === 'running'));
    button.disabled = value === 'running';
    button.textContent = value === 'running' ? 'Экспорт…' : 'Экспорт ZIP';
    button.title = tooltip || 'Сохранить чат и доступные входящие/исходящие вложения в ZIP';
  }
  async function run() {
    if (running || !isChatPage() || !button) return;
    const existing = document.getElementById(PANEL_ID);
    if (existing?.dataset.exportStatus === 'running') {
      state('running', 'Экспорт уже выполняется через Popup');
      return;
    }
    running = true;
    state('running', 'Экспорт чата выполняется');
    try {
      const exporter = globalThis.__ChatGPTObsidianExporter;
      if (!exporter || typeof exporter.start !== 'function') throw new Error('Модуль экспорта не загружен');
      await exporter.start({
        includeAttachments: true,
        includeImages: true,
        includeIncomingAttachments: true,
        separateLog: false,
        paceDownloads: true,
        delayBetweenFilesMs: 1500,
        maxFileMB: 100
      });
      const panel = document.getElementById(PANEL_ID);
      // "ready" means a ZIP link was generated and browser download was
      // requested. It does NOT prove the browser wrote the ZIP to disk.
      if (panel?.dataset.exportStatus === 'ready') {
        state('ready', 'ZIP подготовлен; скачивание инициировано. Проверьте загрузки Chrome.');
      } else if (panel?.dataset.exportStatus === 'error') {
        state('error', 'Ошибка экспорта — подробности в панели');
      } else {
        state('error', 'Результат экспорта не подтверждён — проверьте панель');
      }
    } catch (err) {
      state('error', 'Ошибка запуска: ' + String(err?.message || err));
    } finally {
      running = false;
      if (button?.dataset.exportStatus === 'running') state('idle');
    }
  }
  function createButton() {
    if (!document.body) return;
    button = document.getElementById(BUTTON_ID);
    if (button) return;
    button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.dataset.exporterMode = 'agent-dom';
    button.dataset.incomingAttachments = 'enabled';
    button.setAttribute('aria-label', 'Экспорт ZIP');
    button.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483646;'
      + 'display:block;background:#0f766e;color:#fff;border:1px solid #5eead4;'
      + 'border-radius:12px;padding:11px 17px;font:600 14px/1.3 system-ui,sans-serif;'
      + 'cursor:pointer;box-shadow:0 5px 22px #0005;min-height:42px;';
    button.addEventListener('click', run);
    document.body.append(button);
    state('idle');
  }
  function sync() {
    const visible = isChatPage();
    const pathname = location.pathname;
    if (pathname !== observedPath) {
      observedPath = pathname;
      if (!running && button) state('idle');
    }
    if (visible) {
      if (!button || !button.isConnected) {
        button = null;
        createButton();
      }
      // A Popup-initiated export can also occupy the shared exporter.
      // Clear the temporary lock when its panel reaches a terminal state.
      if (!running && button?.dataset.exportStatus === 'running') {
        const panelStatus = document.getElementById(PANEL_ID)?.dataset.exportStatus;
        if (panelStatus === 'ready') state('ready', 'ZIP подготовлен; проверьте загрузки Chrome.');
        else if (panelStatus === 'error') state('error', 'Ошибка экспорта — подробности в панели');
        else if (!panelStatus) state('idle');
      }
    } else if (button) {
      button.remove();
      button = null;
    }
  }
  function scheduleSync() {
    if (schedulePending) return;
    schedulePending = true;
    queueMicrotask(() => { schedulePending = false; sync(); });
  }
  sync();
  // Handles ChatGPT SPA route changes without modifying site history APIs.
  new MutationObserver(scheduleSync).observe(document.documentElement, {childList:true, subtree:true});
  window.addEventListener('popstate', scheduleSync);
  window.addEventListener('hashchange', scheduleSync);
  window.addEventListener('pageshow', scheduleSync);
  globalThis.__ChatGPTObsidianDomLauncher = {version:'0.3.9.1'};
})();
