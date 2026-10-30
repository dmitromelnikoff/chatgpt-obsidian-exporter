/* Runs in the ChatGPT tab only after the user explicitly presses Export. */
(() => {
  'use strict';
  // Allow re-injection of a newer version without keeping a stale exporter.
  if (globalThis.__ChatGPTObsidianExporter?.version === '0.3.9') return;
  const core = globalThis.ChatGPTObsidianCore;
  const zipper = globalThis.ObsidianZip;
  const reliability = globalThis.ChatGPTObsidianReliability;
  let busy = false;
  const UUID = /\/c\/([a-zA-Z0-9-]{16,})/i;
  const MAX_PAGES = 500;

  function makePanel() {
    const old = document.getElementById('chatgpt-obsidian-export-panel');
    if (old) old.remove();
    const root = document.createElement('section');
    root.id = 'chatgpt-obsidian-export-panel';
    root.dataset.exportStatus = 'running';
    root.setAttribute('role', 'status');
    root.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(410px,calc(100vw - 32px));background:#0f172a;color:white;font:13px/1.5 system-ui,sans-serif;padding:17px;box-shadow:0 8px 35px #0009;border:1px solid #64748b;border-radius:12px;';
    const title = document.createElement('strong');
    title.textContent = 'Экспорт ChatGPT → Obsidian';
    title.style.cssText = 'font-size:15px;display:block;margin-bottom:10px;';
    const state = document.createElement('div'); state.textContent = 'Подготовка…';
    const details = document.createElement('div');
    details.style.cssText = 'margin-top:7px;color:#cbd5e1;font-size:12px;white-space:pre-wrap;max-height:100px;overflow:auto;';
    const links = document.createElement('div'); links.style.cssText = 'margin-top:12px;display:flex;gap:12px;flex-wrap:wrap;';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.title = 'Закрыть панель';
    close.style.cssText = 'position:absolute;right:10px;top:7px;background:transparent;border:0;color:white;font-size:24px;cursor:pointer;';
    close.addEventListener('click', () => root.remove());
    root.append(title, state, details, links, close);
    document.body.append(root);
    return {
      set: (message, more = '') => { state.textContent = message; details.textContent = more; if (message.startsWith('ZIP подготовлен')) root.dataset.exportStatus = 'ready'; },
      error: (error) => { root.dataset.exportStatus = 'error'; state.textContent = 'Экспорт завершился ошибкой'; details.textContent = String(error.message || error); },
      link: (blob, name, label) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.textContent = label;
        a.style.cssText = 'color:#5eead4;font-weight:bold;text-decoration:underline;';
        links.append(a);
        // Leave the URL available while the panel is open; revoke on page close/reload.
        window.addEventListener('pagehide', () => URL.revokeObjectURL(url), { once: true });
        return a;
      }
    };
  }
  function getId() {
    const match = location.pathname.match(UUID);
    return match && match[1] || null;
  }
  async function getAccessToken() {
    try {
      const response = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) return null;
      const session = await response.json();
      return session.accessToken || session.access_token || null;
    } catch { return null; }
  }
  async function requestJson(url, token) {
    const response = await fetch(url, {
      method: 'GET', credentials: 'include', cache: 'no-store',
      headers: { 'Accept': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(45000)
    });
    if (!response.ok) throw reliability.httpError(response, new URL(url, location.origin).pathname);
    const ct = response.headers.get('content-type') || '';
    if (/text\/html/.test(ct)) throw Error('Сервер вернул HTML вместо JSON (возможно, требуется повторный вход).');
    return response.json();
  }
  async function fetchConversation(id, token, panel) {
    const base = `/backend-api/conversations/${encodeURIComponent(id)}`;
    try {
      const page1 = await requestJson(`${base}?num_turns=100`, token);
      if (Array.isArray(page1.messages)) {
        const pages = [page1];
        const seen = new Set();
        let cursor = page1.page_info && page1.page_info.start_cursor;
        let hasPrevious = Boolean(page1.page_info && page1.page_info.has_previous_page);
        let count = 1;
        while (hasPrevious) {
          if (!cursor || seen.has(cursor) || count >= MAX_PAGES) throw Error('Не удалось завершить постраничную загрузку без потери сообщений.');
          seen.add(cursor);
          panel.set('Получаю историю…', `Страница ${count + 1}, сообщений уже ${pages.reduce((n,p)=>n+p.messages.length,0)}`);
          const older = await requestJson(`${base}?num_turns=100&before=${encodeURIComponent(cursor)}`, token);
          if (!Array.isArray(older.messages)) throw Error('Вторая страница имеет неизвестный формат.');
          pages.unshift(older); count++;
          cursor = older.page_info && older.page_info.start_cursor;
          hasPrevious = Boolean(older.page_info && older.page_info.has_previous_page);
        }
        const combined = [];
        const seenIds = new Set();
        for (const page of pages) for (const node of page.messages) {
          const idKey = node && (node.id || node.message && node.message.id);
          if (idKey && seenIds.has(idKey)) continue;
          if (idKey) seenIds.add(idKey);
          combined.push(node);
        }
        const result = { ...page1, messages: combined,
          page_info: { ...page1.page_info, has_previous_page: false, has_next_page: false },
          _export_page_count: count, _export_pagination_checked: true, export_source: 'api' };
        if (!combined.length) throw Error('API вернул пустую переписку.');
        return result;
      }
      if (page1.mapping) return { ...page1, export_source: 'api', _export_pagination_checked: false }; 
      throw Error('Неизвестный формат plural API.');
    } catch (e) {
      panel.set('Пробую резервный API…', `Основной API: ${e.message}`);
      const old = await requestJson(`/backend-api/conversation/${encodeURIComponent(id)}`, token);
      if (!old.mapping && !Array.isArray(old.messages)) throw Error('Резервный API вернул неизвестный формат.');
      return { ...old, export_source: 'api', _export_pagination_checked: false, export_warning: `Использован резервный API: ${e.message}` }; 
    }
  }
  function domContentToMarkdown(node) {
    const ignored = 'button, svg, style, script, textarea, nav, [aria-hidden="true"], [data-testid="copy-turn-action-button"]';
    function toMd(n, inPre = false) {
      if (n.nodeType === Node.TEXT_NODE) return n.nodeValue || '';
      if (n.nodeType !== Node.ELEMENT_NODE) return '';
      const el = n;
      if (el.matches(ignored)) return '';
      const tag = el.tagName.toLowerCase();
      if (tag === 'br') return '\n';
      if (tag === 'pre') {
        const code = el.querySelector('code');
        const language = (code && [...code.classList].find(c => c.startsWith('language-')) || '').replace(/^language-/, '');
        const codeText = (code || el).textContent || '';
        return `\n\n\`\`\`${language}\n${codeText.replace(/\n$/, '')}\n\`\`\`\n\n`;
      }
      if (tag === 'img') return el.currentSrc || el.src ? `![image](${el.currentSrc || el.src})` : '[Изображение]';
      if (tag === 'a') {
        const text = Array.from(el.childNodes).map(c => toMd(c)).join('').trim() || el.getAttribute('href') || 'ссылка';
        const href = el.href || el.getAttribute('href');
        return href ? `[${text}](${href})` : text;
      }
      const inner = Array.from(el.childNodes).map(c => toMd(c, inPre)).join('');
      if (/^h[1-6]$/.test(tag)) return `\n\n${'#'.repeat(Number(tag[1]))} ${inner.trim()}\n\n`;
      if (tag === 'li') return `\n- ${inner.trim()}`;
      if (tag === 'p' || tag === 'div' && el.classList.contains('paragraph')) return `\n\n${inner.trim()}\n\n`;
      if (tag === 'blockquote') return '\n> ' + inner.trim().replace(/\n/g, '\n> ') + '\n';
      if (tag === 'strong' || tag === 'b') return `**${inner}**`;
      if (tag === 'em' || tag === 'i') return `*${inner}*`;
      if (tag === 'code') return `\`${inner.replace(/`/g, '\\`')}\``;
      if (tag === 'hr') return '\n\n---\n\n';
      if (tag === 'tr') return '| ' + Array.from(el.children).map(c => (c.innerText || c.textContent || '').trim()).join(' | ') + ' |\n';
      return inner;
    }
    return toMd(node).replace(/\n{3,}/g, '\n\n').trim();
  }
  function captureDom(id, reason) {
    let nodes = Array.from(document.querySelectorAll('article[data-testid^="conversation-turn-"]'));
    if (!nodes.length) nodes = Array.from(document.querySelectorAll('[data-message-author-role]')).filter(n => !n.parentElement || !n.parentElement.closest('[data-message-author-role]'));
    const messages = [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const attributed = node.matches('[data-message-author-role]') ? node : node.querySelector('[data-message-author-role]');
      const role = attributed && attributed.getAttribute('data-message-author-role');
      if (!['user', 'assistant'].includes(role)) continue;
      const contentNode = (attributed || node).querySelector('[data-testid="message-content"], .markdown, .prose') || attributed || node;
      const text = domContentToMarkdown(contentNode);
      if (text || contentNode.querySelector('img')) messages.push({
        id: `dom-${i + 1}`, author: { role }, create_time: null,
        content: { content_type: 'text', parts: [text || '[Изображение]'] }, metadata: {}
      });
    }
    if (!messages.length) throw Error('Не удалось прочитать сообщения из интерфейса. Возможно, поменялась структура сайта.');
    const h1 = document.querySelector('main h1');
    return {
      conversation_id: id || 'dom-export',
      title: h1 && h1.textContent && h1.textContent.trim() || document.title.replace(/\s*[-|].*$/, '') || 'Диалог ChatGPT',
      create_time: null, update_time: null, messages,
      export_source: 'dom', export_warning: reason,
      _notice: 'Only currently rendered messages are represented in DOM fallback.'
    };
  }
  function findPageLinkedAssets(existing, messages) {
    // Public links within visible turns can point at files created by ChatGPT.
    // Never fetch arbitrary external links or execute links from conversation text.
    const knownNames = new Set(existing.map(a => a.name.toLowerCase()));
    const seen = new Set();
    const additions = [];
    const anchors = document.querySelectorAll('article[data-testid^="conversation-turn-"] a[href], [data-message-author-role] a[href]');
    const ext = /\.(?:pdf|zip|txt|md|json|csv|xlsx|xls|docx|doc|pptx|ppt|png|jpe?g|gif|webp|svg|py|js|ts|html|xml|sql|mp3|mp4|wav|ogg|7z|tar|gz)$/i;
    for (const anchor of anchors) {
      const rawHref = anchor.getAttribute('href');
      if (!rawHref) continue;
      let absolute;
      try { absolute = new URL(rawHref, location.href); } catch { continue; }
      if (absolute.protocol !== 'https:' || !(['chatgpt.com', 'chat.openai.com'].includes(absolute.hostname) || absolute.hostname.endsWith('.oaiusercontent.com'))) continue;
      const pathLooksFile = /\/(?:backend-api\/(?:estuary\/content|files\/)|download\b)/i.test(absolute.pathname);
      let name = (anchor.getAttribute('download') || anchor.textContent || '').trim();
      if (!ext.test(name) && !pathLooksFile) continue;
      if (!ext.test(name)) {
        let fromPath = absolute.pathname.split('/').pop() || '';
        if (!ext.test(fromPath)) continue; // no trustworthy filename
        name = fromPath;
      }
      name = core.sanitizeName(name, 110);
      if (!name || seen.has(absolute.href)) continue;
      const nameMatches = existing.filter(a => a.name.toLowerCase() === name.toLowerCase());
      // Multiple files may have exactly the same name in one chat. A DOM anchor
      // without a reliable message ID must not silently attach to the wrong one.
      if (nameMatches.length > 1) { seen.add(absolute.href); continue; }
      const found = nameMatches[0];
      if (found) {
        // The rendered ChatGPT link may already be a resolved, time-limited URL.
        // Prefer that exact URL over guessing a download endpoint.
        if (found.kind === 'sandbox' && !found.directUrl) found.directUrl = absolute.href;
        seen.add(absolute.href);
        continue;
      }
      knownNames.add(name.toLowerCase()); seen.add(absolute.href);
      const match = messages.find(m => core.contentText(m).includes(name));
      const isImage = /\.(?:png|jpe?g|gif|webp|svg)$/i.test(name);
      const index = existing.length + additions.length + 1;
      additions.push({
        id: `linked-file-${index}`, name,
        mime: '', typeHint: 'page-download', isImage,
        messageIds: match ? [match.id] : [],
        directUrl: absolute.href,
        path: `02_Артефакты/${String(index).padStart(4, '0')}_${name}`,
        status: 'pending'
      });
    }
    return additions;
  }
  // Avoid accumulating arbitrarily many attachments in a single browser tab.
  // This is a safety guard, not a setting controlling server quotas.
  const MAX_TOTAL_ATTACHMENT_BYTES = 512 * 1024 * 1024;
  function sizeLimitError(message) {
    const error = new Error(message);
    error.sizeLimit = true;
    return error;
  }
  async function readBounded(response, maxBytes) {
    // Enforce the limit while streaming, including when Content-Length is absent/wrong.
    if (!response.body || typeof response.body.getReader !== 'function') {
      throw new Error('Браузер не предоставил поток данных: безопасная загрузка отменена.');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel().catch(() => {});
          throw sizeLimitError(`Превышен доступный лимит ${Math.floor(maxBytes / 1024 / 1024)} МБ при потоковой загрузке.`);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  }
  async function sha256Hex(bytes) {
    // SHA-256 is only evidence for downloaded bytes, never guessed for skipped files.
    if (!globalThis.crypto?.subtle) return null;
    const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
  }
  async function fetchAsset(asset, conversationId, token, maxFileMB, remainingBytes) {
    const errors = [];
    const failures = [];
    let url = asset.directUrl || null;
    if (asset.kind === 'sandbox' && !url) {
      // ChatGPT-generated files use a different endpoint from uploaded files.
      // Associate the sandbox path with the message that displayed its link.
      // This endpoint is internal and may change or return an expired-file error.
      for (const messageId of (asset.sourceMessageIds || [])) {
        const params = new URLSearchParams({
          download_intent: 'true', message_id: messageId,
          sandbox_path: asset.sandboxPath
        });
        try {
          const result = await requestJson(`/backend-api/conversation/${encodeURIComponent(conversationId)}/interpreter/download?${params}`, token);
          url = result.download_url || result.url || result.signed_url || (result.file && result.file.download_url) || null;
          if (url) break;
          errors.push(`${messageId.slice(0, 8)}: URL отсутствует в ответе`);
        } catch (e) { errors.push(`${messageId.slice(0, 8)}: ${e.message}`); failures.push(e); }
      }
      if (!url && !asset.sourceMessageIds?.length) errors.push('Неизвестен идентификатор сообщения для sandbox-файла.');
    }
    // Tool-generated image pointers are often absent from visible Markdown.
    // Try the authenticated same-origin image-content endpoint, but verify
    // actual image bytes; a pointer is NOT a successful download.
    if (asset.kind === 'tool-image' && /^file[-_][A-Za-z0-9_-]+$/.test(asset.id)) {
      const candidates = [
        `/backend-api/estuary/content?id=${encodeURIComponent(asset.id)}`,
        `/backend-api/estuary/content?file_id=${encodeURIComponent(asset.id)}`
      ];
      for (const endpoint of candidates) {
        let resp;
        try {
          resp = await fetch(endpoint, {credentials:'include',
            headers:{...(token ? {Authorization:`Bearer ${token}`} : {})},
            signal:AbortSignal.timeout(90000)});
          if (!resp.ok) {
            const err = reliability.httpError(resp,'загрузка изображения инструмента');
            await resp.body?.cancel();
            if (resp.status === 429) throw err;
            failures.push(err);errors.push(err.message);continue;
          }
          const mime = resp.headers.get('content-type') || '';
          if (!/^(?:image\/(?:png|jpeg|webp|gif)|application\/octet-stream)\b/i.test(mime)) {
            await resp.body?.cancel();errors.push('Сервер вернул не изображение для '+asset.id);continue;
          }
          const maxBytes = Math.min(maxFileMB * 1024 * 1024, remainingBytes);
          const size = Number(resp.headers.get('content-length') || 0);
          if (size > maxBytes) {await resp.body?.cancel();throw sizeLimitError('Изображение инструмента превышает оставшийся лимит архива.');}
          const bytes = await readBounded(resp,maxBytes);
          const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
          const jpeg = bytes.length >= 3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff;
          const webp = bytes.length >= 12 && new TextDecoder('ascii').decode(bytes.slice(0,4))==='RIFF' && new TextDecoder('ascii').decode(bytes.slice(8,12))==='WEBP';
          const gif = bytes.length >= 6 && new TextDecoder('ascii').decode(bytes.slice(0,3))==='GIF';
          const got = png?'image/png':jpeg?'image/jpeg':webp?'image/webp':gif?'image/gif':null;
          if (!got) {errors.push('Не распознан формат изображения инструмента');continue;}
          if (asset.mime && got !== asset.mime) {
            // Keep a matching real extension instead of writing JPEG bytes
            // under a fabricated PNG extension in the ZIP.
            asset.mime = got;
            asset.name = asset.name.replace(/\.(?:png|jpe?g|webp|gif)$/i, '.'+(got==='image/jpeg'?'jpg':got.split('/')[1]));
          }
          return bytes;
        } catch (e) {
          if (e.sizeLimit || e.httpStatus === 429) throw e;
          errors.push('image content: '+String(e?.message || e));failures.push(e);
        }
      }
    }
    if (asset.kind !== 'sandbox' && !url) {
      const fileId = encodeURIComponent(asset.id);
      const id = encodeURIComponent(conversationId);
      const candidates = [
        `/backend-api/files/download/${fileId}?conversation_id=${id}&inline=false`,
        `/backend-api/files/${fileId}/download?conversation_id=${id}`
      ];
      for (const candidate of candidates) {
        try {
          const response = await requestJson(candidate, token);
          url = response.download_url || response.url || response.signed_url || (typeof response === 'string' ? response : null);
          if (url) break;
          errors.push('В ответе нет ссылки на скачивание.');
        } catch (e) { errors.push(e.message); failures.push(e); }
      }
    }
    if (!url) throw reliability.aggregateResolutionError(errors, failures);
    const absolute = new URL(url, location.origin);
    if (absolute.protocol !== 'https:') throw Error('Ссылка на вложение не использует HTTPS.');
    const sameOrigin = absolute.origin === location.origin;
    let response;
    try {
      response = await fetch(absolute.href, {
        credentials: sameOrigin ? 'include' : 'omit',
        ...(sameOrigin && token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        signal: AbortSignal.timeout(90000)
      });
    } catch (e) {
      const err = new Error(`Не удалось получить файл (CORS/сеть): ${e.message}`);
      err.name = e?.name === 'TimeoutError' ? 'TimeoutError' : 'NetworkError';
      err.networkError = true;
      throw err;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw reliability.httpError(response, 'скачивание файла');
    }
    const contentLength = Number(response.headers.get('content-length') || 0);
    const maxBytes = Math.min(maxFileMB * 1024 * 1024, remainingBytes);
    if (contentLength > maxBytes) {
      await response.body?.cancel();
      throw sizeLimitError(`Размер файла ${Math.ceil(contentLength / 1024 / 1024)} МБ превышает оставшийся лимит архива.`);
    }
    let bytes;
    try { bytes = await readBounded(response, maxBytes); }
    catch (e) {
      if (!e.sizeLimit && (e.name === 'TypeError' || e.name === 'AbortError' || e.name === 'TimeoutError')) {
        const error = new Error(`Сетевой сбой при чтении файла: ${e.message}`);
        error.networkError = true;
        throw error;
      }
      throw e;
    }
    const mime = response.headers.get('content-type') || '';
    if (/text\/html/i.test(mime) && !/\.html?$/i.test(asset.name)) throw Error('Вместо бинарного файла сервер вернул HTML.');
    if (/application\/(?:json|problem\+json)/i.test(mime) && !/\.json$/i.test(asset.name)) throw Error('Вместо файла сервер вернул JSON.');
    return bytes;
  }
  function triggerDownload(link) {
    // May be blocked by Chrome's multi-download settings; manual links always remain visible.
    try { link.click(); } catch { /* manual links remain */ }
  }
  async function start(options = {}) {
    if (busy) return;
    busy = true;
    const panel = makePanel();
    const args = {
      includeAttachments: options.includeAttachments !== false,
      includeImages: options.includeImages !== false,
      includeIncomingAttachments: options.includeIncomingAttachments === true,
      separateLog: options.separateLog === true,
      paceDownloads: options.paceDownloads !== false,
      delayBetweenFilesMs: Math.round(Math.max(500, Math.min(30000, Number(options.delayBetweenFilesMs) || 1500))),
      maxFileMB: Math.min(500, Math.max(1, Number(options.maxFileMB) || 100)),
      sourceUrl: location.href
    };
    try {
      const id = getId();
      panel.set('Получаю сообщения…', 'Использую API текущей вкладки; без передачи данных сторонним серверам.');
      const token = await getAccessToken();
      let data;
      try {
        if (!id) throw Error('В адресе нет идентификатора /c/<conversation_id>.');
        data = await fetchConversation(id, token, panel);
      } catch (error) {
        panel.set('Использую резервное чтение страницы…', `Причина: ${error.message}`);
        data = captureDom(id, error.message);
      }
      const normalized = core.normalize(data);
      if (!normalized.messages.length) throw Error('Не найдены видимые сообщения пользователя/ассистента.');
      const assets = core.collectAssets(normalized.messages);
      const toolImages = core.collectToolImages(data, normalized.messages, assets);
      assets.push(...toolImages.assets);
      assets.push(...findPageLinkedAssets(assets, normalized.messages));
      args.toolImageDiagnostics = toolImages.diagnostics;
      const binaries = new Map();
      let totalAttachmentBytes = 0;
      // Classify independently by role and file kind. User uploads are not
      // re-downloaded unless expressly requested, including uploaded images.
      const authorByMessage = new Map(normalized.messages.map(m => [m.id, m.author?.role || m.role]));
      const downloadList = [];
      for (const a of assets) {
        const decision = core.downloadDecision(a, authorByMessage, args);
        if (!decision.download) {a.status = 'skipped';a.error = decision.reason;continue;}
        if (a.kind === 'inline-svg') {
          // Static SVG was sanitized and generated locally. Never request a
          // network URL for this asset or count it as a remote download.
          const bytes = new TextEncoder().encode(a.inlineSvg || '');
          if (bytes.byteLength > args.maxFileMB * 1024 * 1024 ||
              totalAttachmentBytes + bytes.byteLength > MAX_TOTAL_ATTACHMENT_BYTES) {
            a.status = 'limited';a.error = 'SVG превышает лимит архива.';
            continue;
          }
          binaries.set(a.id, bytes);
          totalAttachmentBytes += bytes.byteLength;
          a.sizeBytes = bytes.byteLength;
          try {a.sha256 = await sha256Hex(bytes);}catch(e){a.hashError=String(e?.message||e);}
          a.status = 'downloaded';a.downloadAttempts = 0;
          a.downloadHistory = [{attempt:0, outcome:'success', local:true}];
        } else downloadList.push(a);
      }
      for (let i = 0; i < downloadList.length; i++) {
        const a = downloadList[i];
        // Delay applies *between* files, not between obtaining a signed URL and using it.
        if (i > 0 && args.paceDownloads) {
          panel.set(`Пауза между файлами: ${(args.delayBetweenFilesMs / 1000).toLocaleString('ru-RU')} сек`,
            `Следующий: ${a.name} (${i + 1}/${downloadList.length})`);
          await reliability.sleep(args.delayBetweenFilesMs);
        }
        panel.set(`Скачиваю вложения: ${i + 1}/${downloadList.length}`, `${a.name}\nСохранено: ${binaries.size}`);
        try {
          const result = await reliability.withRetries(
            () => fetchAsset(a, normalized.id, token, args.maxFileMB,
              Math.max(0, MAX_TOTAL_ATTACHMENT_BYTES - totalAttachmentBytes)),
            ({nextAttempt, maxAttempts, delayMs, error}) => {
              panel.set(`Повторная попытка ${nextAttempt}/${maxAttempts} через ${delayMs / 1000} сек`, `${a.name}\n${error}`);
            }
          );
          binaries.set(a.id, result.value);
          totalAttachmentBytes += result.value.byteLength;
          a.sizeBytes = result.value.byteLength;
          try { a.sha256 = await sha256Hex(result.value); }
          catch (e) { a.hashError = String(e?.message || e); }
          a.status = 'downloaded';
          a.downloadAttempts = result.attempts;
          a.downloadHistory = result.history;
        } catch (e) {
          a.status = e.sizeLimit ? 'limited' : 'failed';
          a.error = e.message || String(e);
          a.downloadAttempts = e.downloadAttempts || 1;
          a.downloadHistory = e.downloadHistory || [{attempt: 1, outcome: 'failed', error: a.error}];
          if (e.httpStatus === 429) {
            // Stop issuing further file requests after exhausting a rate-limit response.
            for (const remaining of downloadList.slice(i + 1)) {
              remaining.status = 'deferred';
              remaining.error = 'Скачивание отложено: сервер вернул HTTP 429. Повторите экспорт позднее.';
              remaining.downloadAttempts = 0;
              remaining.downloadHistory = [];
            }
            break;
          }
        }
      }
      panel.set('Формирую ZIP-архив…', `Сообщений: ${normalized.messages.length}; вложений: ${binaries.size}/${assets.length}`);
      const result = core.createFiles(data, assets, binaries, args);
      const zip = await zipper.make(result.files);
      const zipLink = panel.link(zip, `${result.prefix}.zip`, `↓ ZIP (${(zip.size / 1024 / 1024).toFixed(1)} МБ)`);
      const logLink = args.separateLog
        ? panel.link(new Blob([result.logText], { type: 'text/plain;charset=utf-8' }), `${result.prefix}.log`, '↓ LOG')
        : null;
      const notice = [
        `Сообщений: ${normalized.messages.length}`,
        `Шагов протокола: ${result.manifest.steps}`, 
        `Ссылок на файлы найдено: ${result.manifest.attachments_found}`,
        `Файлов скачано: ${result.manifest.attachments_downloaded}`,
        result.manifest.attachments_created_locally ? `SVG создано локально: ${result.manifest.attachments_created_locally}` : '',
        `sandbox-ссылок: ${result.manifest.attachments_by_type.generated_sandbox_links}`,
        data.export_source === 'dom' ? 'ВНИМАНИЕ: резервное чтение страницы — архив может быть неполным.' : '',
        result.manifest.attachments_failed ? `Ошибок скачивания: ${result.manifest.attachments_failed}. Причины — 04_Отчёт экспорта.md в ZIP.` : '',
        result.manifest.attachments_limited ? `Превышен лимит размера: ${result.manifest.attachments_limited}` : '',
        `Проверка ссылок внутри ZIP: ${result.manifest.internal_links_checked} ссылок`,
        result.manifest.attachments_deferred ? `Отложено из-за ограничения сервера: ${result.manifest.attachments_deferred}` : '',
        result.manifest.attachments_skipped ? `Пропущено по настройкам: ${result.manifest.attachments_skipped}` : '',
        'Если Chrome заблокировал автоскачивание, воспользуйтесь ссылками ниже.'
      ].filter(Boolean).join('\n');
      panel.set('ZIP подготовлен; скачивание инициируется', notice);
      triggerDownload(zipLink);
      if (logLink) triggerDownload(logLink);
    } catch (error) {
      panel.error(error);
    } finally {
      busy = false;
    }
  }
  globalThis.__ChatGPTObsidianExporter = { version: '0.3.9', start };
})();
