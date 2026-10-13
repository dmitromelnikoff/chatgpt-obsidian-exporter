'use strict';
const button = document.getElementById('export');
const statusElement = document.getElementById('status');
const attachmentsCheck = document.getElementById('attachments');
const imagesCheck = document.getElementById('images');
const incomingCheck = document.getElementById('incoming');
const paceCheck = document.getElementById('pace');
const paceSeconds = document.getElementById('paceSeconds');
function updatePaceState() { paceSeconds.disabled = !paceCheck.checked; }
// The delay is a user preference, not a synchronization setting for the vault.
try {
  const stored = localStorage.getItem('chatgpt-obsidian-exporter-download-delay');
  if (stored) {
    const saved = JSON.parse(stored);
    if (typeof saved.enabled === 'boolean') paceCheck.checked = saved.enabled;
    if (Number.isFinite(Number(saved.seconds)) && Number(saved.seconds) >= 0.5 && Number(saved.seconds) <= 30) {
      paceSeconds.value = String(saved.seconds);
    }
  }
} catch { /* unavailable storage: keep defaults */ }
function rememberPace() {
  try { localStorage.setItem('chatgpt-obsidian-exporter-download-delay', JSON.stringify({enabled: paceCheck.checked, seconds: Number(paceSeconds.value)})); }
  catch { /* the exporter works without persisted settings */ }
}
paceCheck.addEventListener('change', () => { updatePaceState(); rememberPace(); });
paceSeconds.addEventListener('change', rememberPace);
updatePaceState();
function updateIncomingState() {
  incomingCheck.disabled = !attachmentsCheck.checked && !imagesCheck.checked;
}
attachmentsCheck.addEventListener('change', updateIncomingState);
imagesCheck.addEventListener('change', updateIncomingState);
updateIncomingState();
button.addEventListener('click', async () => {
  button.disabled = true;
  statusElement.textContent = 'Запускаю экспорт во вкладке…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !/^https:\/\/(?:chatgpt\.com|chat\.openai\.com)(?:\/|$)/i.test(tab.url || '')) {
      throw new Error('Откройте нужный диалог на chatgpt.com/c/…');
    }
    const delaySeconds = Number(paceSeconds.value);
    if (paceCheck.checked && (!Number.isFinite(delaySeconds) || delaySeconds < 0.5 || delaySeconds > 30)) {
      throw new Error('Задержка должна быть от 0,5 до 30 секунд.');
    }
    rememberPace();
    const options = {
      includeAttachments: attachmentsCheck.checked,
      includeImages: imagesCheck.checked,
      includeIncomingAttachments: !incomingCheck.disabled && incomingCheck.checked,
      separateLog: document.getElementById('log').checked,
      paceDownloads: paceCheck.checked,
      delayBetweenFilesMs: paceCheck.checked ? Math.round(delaySeconds * 1000) : 1500,
      maxFileMB: Math.min(500, Math.max(1, Number(document.getElementById('limit').value) || 100))
    };
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['zip.js', 'renderer.js', 'core.js', 'reliability.js', 'page.js'] });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (opts) => { window.__ChatGPTObsidianExporter.start(opts); },
      args: [options]
    });
    statusElement.textContent = 'Экспорт запущен. Смотрите панель во вкладке ChatGPT.';
  } catch (error) {
    statusElement.textContent = error.message || String(error);
  } finally {
    button.disabled = false;
  }
});
