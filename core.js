/* No network: normalize a ChatGPT conversation into Obsidian-ready files. */
(() => {
  'use strict';
  const EXPORTER_VERSION = '0.3.9.2';
  const pad = (n) => String(n).padStart(4, '0');
  const sanitizeName = (value, max = 90) => String(value || 'Без названия')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*\[\]#^]/g, '-')
    .replace(/\s+/g, ' ').replace(/\.{2,}/g, '.').trim()
    .replace(/^[. ]+|[. ]+$/g, '').slice(0, max) || 'Без названия';
  function toISO(value) {
    if (!value) return null;
    const d = typeof value === 'number'
      ? new Date(value < 1e12 ? value * 1000 : value)
      : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  function shortId(id) {
    return String(id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(-8) || 'unknown';
  }
  function fileIdFrom(value) {
    if (typeof value !== 'string') return null;
    const m = value.match(/file[-_][a-zA-Z0-9_-]+/);
    return m ? m[0] : null;
  }
  function normalize(data) {
    if (!data || typeof data !== 'object') throw Error('Некорректные данные диалога.');
    let messages = [];
    if (Array.isArray(data.messages)) {
      messages = data.messages.map(node => node && (node.message || node)).filter(Boolean);
    } else if (data.mapping && typeof data.mapping === 'object') {
      const mapping = data.mapping;
      let current = data.current_node;
      if (!mapping[current]) {
        const leaves = Object.values(mapping).filter(n => n && n.message && (!n.children || !n.children.length));
        leaves.sort((a, b) => (b.message.create_time || 0) - (a.message.create_time || 0));
        current = leaves[0] && leaves[0].id;
      }
      const visited = new Set(), live = [];
      while (current && mapping[current] && !visited.has(current)) {
        visited.add(current);
        const node = mapping[current];
        if (node.message) live.push(node.message);
        current = node.parent;
      }
      messages = live.reverse();
    } else throw Error('В ответе нет messages или mapping.');
    // Explain intentional filtering without changing the readable-transcript policy.
    // All API records remain available in conversation.json.
    const excludedMessagesByReason = {
      non_user_assistant_role: 0,
      visually_hidden: 0,
      non_public_recipient: 0,
      service_channel: 0,
      non_readable_content_type: 0
    };
    function exclusionReason(m) {
      const role = m.author && m.author.role || m.role;
      const channel = m.metadata && m.metadata.channel;
      const type = m.content && m.content.content_type;
      if (role !== 'user' && role !== 'assistant') return 'non_user_assistant_role';
      if (m.metadata && m.metadata.is_visually_hidden_from_conversation) return 'visually_hidden';
      if (m.recipient && m.recipient !== 'all') return 'non_public_recipient';
      if (['analysis', 'commentary', 'justify', 'confidence', 'notification'].includes(channel)) return 'service_channel';
      if (['thoughts', 'reasoning_recap', 'analysis', 'tool_result', 'execution_output'].includes(type)) return 'non_readable_content_type';
      return null;
    }
    const visible = messages.filter(m => {
      const reason = exclusionReason(m);
      if (reason) excludedMessagesByReason[reason]++;
      return !reason;
    });
    return {
      id: data.conversation_id || data.id || 'unknown',
      title: data.title || 'Диалог ChatGPT',
      created: toISO(data.create_time),
      updated: toISO(data.update_time),
      messages: visible,
      rawMessagesCount: messages.length,
      excludedMessagesByReason,
      source: data.export_source || 'api'
    };
  }
  // A file may be referenced by an API file ID or by a generated-file sandbox link.
  // Merely discovering a reference does NOT prove the bytes are available to download.
  function collectAssets(messages) {
    const map = new Map();
    function add(item, messageId, typeHint) {
      if (!item || typeof item !== 'object') return;
      const fileId = [item.file_id, item.id, item.asset_pointer, item.fileId].map(fileIdFrom).find(Boolean);
      if (!fileId) return;
      const name = item.name || item.filename || item.file_name || item.title;
      const mime = item.mime_type || item.mimetype || item.mime || item.type;
      let asset = map.get(fileId);
      if (!asset) {
        asset = { id: fileId, kind: 'file-id', name: name || '', mime: typeof mime === 'string' ? mime : '',
          messageIds: [], pointer: item.asset_pointer || '', typeHint: typeHint || '' };
        map.set(fileId, asset);
      }
      if (name && !asset.name) asset.name = name;
      if (typeof mime === 'string' && !asset.mime) asset.mime = mime;
      if (typeHint && !asset.typeHint) asset.typeHint = typeHint;
      if (messageId && !asset.messageIds.includes(messageId)) asset.messageIds.push(messageId);
    }
    function scan(node, messageId, hint, depth = 0) {
      if (!node || depth > 8) return;
      if (Array.isArray(node)) { for (const x of node) scan(x, messageId, hint, depth + 1); return; }
      if (typeof node !== 'object') return;
      if (node.asset_pointer || node.file_id || node.fileId || ((node.content_type || hint === 'attachment') && node.id)) add(node, messageId, node.content_type || hint);
      for (const [k, value] of Object.entries(node)) {
        if (k === 'text' || (k === 'content' && typeof value === 'string')) continue;
        if (value && typeof value === 'object') scan(value, messageId, node.content_type || hint, depth + 1);
      }
    }
    function addSandboxLink(rawPath, message, displayLabel) {
      // Paths may contain subdirectories. Reject traversal, encoded separators,
      // Windows separators, control chars and ambiguous path components.
      let relative = rawPath;
      try { relative = decodeURIComponent(relative); } catch { return; }
      if (!relative || relative.length > 500 || /[\\\u0000-\u001f]/.test(relative) ||
          /%(?:2e|2f|5c|00)/i.test(relative) ||
          relative.startsWith('/') || relative.endsWith('/') ||
          relative.split('/').some(part => !part || part === '.' || part === '..' || part.length > 200)) return;
      const name = relative.split('/').at(-1);
      const sandboxPath = `/mnt/data/${relative}`;
      const messageId = message.id || 'unknown';
      const id = `sandbox:${messageId}:${sandboxPath}`;
      let a = map.get(id);
      if (!a) {
        a = { id, kind: 'sandbox', name, mime: '', messageIds: [],
          sandboxPath, typeHint: 'generated-file',
          sourceMessageIds: [], displayLabel: displayLabel || name };
        map.set(id, a);
      }
      if (!a.messageIds.includes(messageId)) a.messageIds.push(messageId);
      const ids = [messageId, ...((message.metadata && message.metadata.source_message_ids) || [])];
      for (const sourceId of ids) {
        if (typeof sourceId === 'string' && /^[\da-f-]{20,}$/i.test(sourceId) && !a.sourceMessageIds.includes(sourceId)) {
          a.sourceMessageIds.push(sourceId);
        }
      }
    }
    for (const m of messages) {
      const id = m.id || 'unknown';
      scan(m.content, id, 'content');
      scan(m.metadata && m.metadata.attachments, id, 'attachment');
      // Generated download links are plain Markdown, not API attachment objects.
      // Only explicit Markdown file links count; code examples containing bare
      // sandbox paths are deliberately excluded from the actual-file count.
      const fallback = globalThis.ChatGPTObsidianMarkdownRenderer?.fallbackOf(m) || '';
      // Scan both primary content and an optional UI fallback. Never interpret
      // sandbox examples inside code fences or CodeBlock elements as files.
      const links = /\[([^\]\r\n]{1,400})\]\(sandbox:\/mnt\/data\/((?:[^()\r\n]|\([^()\r\n]*\))+)\)/g;
      for (const source of [contentText(m), fallback]) {
        const body = source
          .replace(/<CodeBlock\b[^>]*>[\s\S]*?<\/CodeBlock>/gi, '')
          .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t]*$/gm, '');
        for (const found of body.matchAll(links)) addSandboxLink(found[2], m, found[1]);
        // A visible DIL Link can reference an artifact without using Markdown.
        for (const found of body.matchAll(/<Link\b([^>]*?)\/?\s*>/gi)) {
          const attrs = found[1];
          const address = attrs.match(/\burl\s*=\s*["']sandbox:\/mnt\/data\/([^"']+)["']/i);
          if (address) addSandboxLink(address[1], m, (attrs.match(/\btitle\s*=\s*["']([^"']+)["']/i) || [,''])[1]);
        }
      }
    }
    // Locally generated SVG documents are real archive assets, not remote
    // downloads. Include them only after the renderer's static SVG sanitizer
    // approves the markup; retain the original source in DIL either way.
    for (const m of messages) {
      const converted = globalThis.ChatGPTObsidianMarkdownRenderer?.renderMessage(m);
      for (const svg of converted?.inlineSvgs || []) {
        if (map.has(svg.id)) continue;
        map.set(svg.id, {id:svg.id, kind:'inline-svg', name:svg.name,
          mime:'image/svg+xml', typeHint:'inline-svg', inlineSvg:svg.xml,
          messageIds:[m.id], generatedLocally:true});
      }
    }
    const list = Array.from(map.values());
    list.forEach((a, i) => {
      const extension = a.mime.startsWith('image/') ? '.' + (a.mime.split('/')[1] === 'jpeg' ? 'jpg' : a.mime.split('/')[1]) :
        a.mime === 'application/pdf' ? '.pdf' : a.typeHint === 'image_asset_pointer' ? '.png' : '.bin';
      a.name = sanitizeName(a.name || `file_${shortId(a.id)}${extension}`, 110);
      a.isImage = a.mime.startsWith('image/') || /image/.test(a.typeHint) || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(a.name);
      a.path = `02_Артефакты/${pad(i + 1)}_${a.name}`;
      a.status = 'pending';
    });
    return list;
  }
  // Image-generation tool results live outside the displayed user/assistant
  // messages. These are *candidate* images, not proof that a particular image
  // was displayed or intended as the final choice. Never invent bytes or a
  // confident message binding from mere temporal adjacency.
  function collectToolImages(data, visibleMessages, existing = []) {
    const raw = Array.isArray(data?.messages) ? data.messages.map(n => n?.message || n).filter(Boolean) : (() => {
      const mapping = data?.mapping || {};
      const result = [], seen = new Set();let id = data.current_node;
      while (mapping[id] && !seen.has(id)) {
        seen.add(id);if (mapping[id].message) result.push(mapping[id].message);
        id = mapping[id].parent;
      }
      return result.reverse();
    })();
    const known = new Set(existing.map(a => a.id));
    const visibleIds = new Set(visibleMessages.map(m => m.id));
    const candidates = [], seenIds = new Set();
    let rawPointers = 0, linked = 0, unlinked = 0;
    let lastVisibleAssistant = null;
    for (let i = 0; i < raw.length; i++) {
      const m = raw[i];
      const role = m?.author?.role || m?.role;
      if (role === 'user' && visibleIds.has(m.id)) {
        lastVisibleAssistant = null;
      }
      if (role === 'assistant' && visibleIds.has(m.id)) lastVisibleAssistant = m.id;
      if (role !== 'tool' || !Array.isArray(m?.content?.parts)) continue;
      for (const part of m.content.parts) {
        if (part?.content_type !== 'image_asset_pointer' || typeof part.asset_pointer !== 'string') continue;
        const id = fileIdFrom(part.asset_pointer);
        if (!id || !/^sediment:\/\/file[-_]/i.test(part.asset_pointer)) continue;
        rawPointers++;
        if (known.has(id) || seenIds.has(id)) continue;
        seenIds.add(id);
        // A later visible assistant in the same user turn is preferable;
        // otherwise use the earlier assistant from this very same turn.
        let nextAssistant = null;
        for (let j = i + 1; j < raw.length; j++) {
          const candidate = raw[j];
          if ((candidate?.author?.role || candidate?.role) === 'user' && visibleIds.has(candidate.id)) break;
          if ((candidate?.author?.role || candidate?.role) === 'assistant' && visibleIds.has(candidate.id)) {
            nextAssistant = candidate.id;break;
          }
        }
        const messageId = nextAssistant || lastVisibleAssistant;
        if (messageId) linked++; else unlinked++;
        const mime = typeof part.mime_type === 'string' && /^image\/(?:png|jpeg|webp|gif)$/i.test(part.mime_type) ? part.mime_type : 'image/png';
        const ext = mime.endsWith('jpeg') ? 'jpg' : mime.split('/')[1];
        candidates.push({id, kind:'tool-image', name:`tool-image-${String(id).slice(-12)}.${ext}`,
          mime, typeHint:'image_asset_pointer', pointer:part.asset_pointer,
          toolMessageId:m.id, messageIds:messageId ? [messageId] : [],
          linkConfidence:messageId ? 'turn-proximity' : 'unresolved',
          origin:'tool-generated-image-candidate', isImage:true, status:'pending',
          path:`02_Артефакты/tool-image-${String(id).slice(-12)}.${ext}`});
        if (candidates.length >= 200) break;
      }
      if (candidates.length >= 200) break;
    }
    return {assets:candidates, diagnostics:{raw_image_pointers:rawPointers,
      candidates:candidates.length, linked_by_turn:linked, unlinked,
      duplicates_or_existing:Math.max(0,rawPointers-candidates.length)}};
  }
  function replaceCitations(text, metadata) {
    let result = String(text || '');
    for (const r of metadata && Array.isArray(metadata.content_references) ? metadata.content_references : []) {
      if (!r.matched_text || !/[\uE000-\uF8FF]/u.test(r.matched_text)) continue;
      const substitute = typeof r.alt === 'string' ? r.alt : '';
      result = result.split(r.matched_text).join(substitute);
    }
    return result.replace(/[\uE200-\uE203]/g, '');
  }
  function contentText(m) {
    const c = m.content || {};
    const output = [];
    if (Array.isArray(c.parts)) {
      for (const part of c.parts) {
        if (typeof part === 'string') output.push(part);
        else if (part && typeof part === 'object') {
          const id = fileIdFrom(part.asset_pointer || part.file_id || part.fileId || '');
          if (id) output.push(`@@ATTACH:${id}@@`);
          else if (typeof part.text === 'string') output.push(part.text);
          else if (typeof part.transcript === 'string') output.push(part.transcript);
          else if (part.content_type === 'audio_transcription' && part.text) output.push(part.text);
        }
      }
    } else if (typeof c.text === 'string') output.push(c.text);
    else if (typeof c.content === 'string') output.push(c.content);
    else if (typeof c.summary === 'string') output.push(c.summary);
    else if (typeof c.result === 'string') output.push(c.result);
    return replaceCitations(output.join('\n\n').trim(), m.metadata);
  }
  // Block IDs must be stable, unique per conversation and compatible with Obsidian:
  // Latin letters, digits and dashes only. The source message ID is used directly.
  function stableId(id, fallback) {
    const normalized = String(id || '').replace(/[^A-Za-z0-9-]/g, '-').replace(/-{2,}/g, '-').slice(0, 100);
    return normalized || String(fallback || 'unknown').replace(/[^A-Za-z0-9-]/g, '-');
  }
  function safeWikiLabel(s) {
    return String(s || '').replace(/[\[\]|\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function safeMdText(s) {
    return String(s || '').replace(/[\r\n]+/g, ' ').replace(/([\\`*\[\]<>|])/g, '\\$1').replace(/\s+/g, ' ').trim();
  }
  // Headings are link targets, so remove Markdown and Obsidian-link control
  // characters from their text. The human-readable protocol labels are separate.
  function safeHeadingTitle(value) {
    return String(value || 'Сообщение')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[\\`*_~#^|:%\[\]<>]/g, ' ')
      .replace(/\s+/g, ' ').trim() || 'Сообщение';
  }
  const pad2 = n => String(n).padStart(2, '0');
  function humanTime(value) {
    const iso = toISO(value);
    if (!iso) return '';
    const d = new Date(iso);
    // User-facing time is in the local timezone of the browser performing export.
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }
  // Use a path containing the entire snapshot folder. A bare filename or
  // artifact subfolder is ambiguous when multiple exports are in one vault.
  function wikiLink(target, label, embed = false) {
    const value = String(target || '');
    const hash = value.indexOf('#');
    const file = (hash < 0 ? value : value.slice(0, hash)).replace(/[\[\]|#^]/g, '_');
    const heading = hash < 0 ? '' : '#' + value.slice(hash + 1).replace(/[\[\]|#^]/g, ' ');
    return `${embed ? '!' : ''}[[${file}${heading}|${safeWikiLabel(label)}]]`;
  }
  function visibleText(m) { return globalThis.ChatGPTObsidianMarkdownRenderer.renderMessage(m).markdown.trim(); }
  function hasAttachedAsset(m, assets) { return assets.some(a => a.messageIds.includes(m.id)); }
  function summarizeLine(source, limit = 70) {
    let line = String(source || '')
      .replace(/^\s*(`{3,}|~{3,})[\s\S]*?\1/gm, ' ')
      .replace(/!??\[([^\]]{1,150})\]\([^)]*\)/g, '$1')
      .replace(/<[^>]*>/g, ' ')
      .replace(/^(?:#{1,6}\s+|[-*>]\s+)/gm, '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
    if (line.length <= limit) return line;
    let clipped = line.slice(0, limit + 1);
    const boundary = clipped.lastIndexOf(' ');
    if (boundary >= Math.floor(limit * 0.68)) clipped = clipped.slice(0, boundary);
    else clipped = clipped.slice(0, limit);
    return clipped.trimEnd() + '…';
  }
  function fallbackTitle(step, referencedAssets) {
    const user = step.messages.find(m => (m.author?.role || m.role) === 'user');
    const body = user ? visibleText(user) : '';
    const brief = summarizeLine(body);
    const continuation = /^(?:да|ага|ок|окей|хорошо|продолжай(?:те)?|дальше|делай|сделай|поехали|приступай|выполняй|go|continue|yes)[.!?\s…]*$/i.test(body.trim());
    if (brief && !continuation) return brief;
    const response = step.messages.find(m => (m.author?.role || m.role) === 'assistant' && visibleText(m));
    if (response) {
      const answerName = summarizeLine(visibleText(response));
      if (answerName) return continuation ? `Продолжение — ${answerName}` : answerName;
    }
    const incoming = referencedAssets.filter(a => step.messages.some(m => (m.author?.role || m.role) === 'user' && a.messageIds.includes(m.id)));
    if (incoming.length) return `Файл: ${summarizeLine(incoming[0].name, 64)}`;
    return brief || 'Сообщение без заголовка';
  }
  function makeSteps(messages, assets) {
    const steps = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const role = m.author?.role || m.role;
      if (!visibleText(m) && !hasAttachedAsset(m, assets)) continue;
      if (role === 'user') {
        steps.push({ messages: [m], sourceMessageId: m.id || `user-${i}`, sourceOrder: i });
      } else if (role === 'assistant') {
        if (!steps.length) steps.push({ messages: [m], sourceMessageId: m.id || `assistant-${i}`, sourceOrder: i, unpaired: true });
        else steps[steps.length - 1].messages.push(m);
      }
    }
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      step.index = i + 1;
      step.anchor = `q-${stableId(step.sourceMessageId, `step-${i + 1}`)}`;
      const linkedAssets = assets.filter(a => step.messages.some(m => a.messageIds.includes(m.id)));
      step.title = fallbackTitle(step, linkedAssets);
      step.headingTitle = `${pad3(step.index)}. ${safeHeadingTitle(step.title)}`;
      step.assets = linkedAssets;
    }
    return steps;
  }
  function mediaLink(a, fromTranscript = false, exportFolder = '') {
    if (a.status === 'skipped') return safeMdText(a.name);
    if (a.status !== 'downloaded') return `${safeMdText(a.name)} (не скачан)`;
    if (!exportFolder) throw Error('Нет корневой папки экспорта для ссылки на вложение.');
    // Wikilink path includes the snapshot folder to disambiguate filenames
    // that occur in other archived chats or export sessions.
    const target = `${exportFolder}/${a.path}`;
    return wikiLink(target, a.name, Boolean(a.isImage && fromTranscript));
  }
  function expandReferences(text, assetList, currentMessageId, exportFolder) {
    const find = (predicate) => assetList.find(a => a.messageIds.includes(currentMessageId) && predicate(a));
    let result = String(text).replace(/@@ATTACH:(file[-_][A-Za-z0-9_-]+)@@/g, (original, id) => {
      const a = find(x => x.id === id) || assetList.find(x => x.id === id);
      return a ? mediaLink(a, true, exportFolder) : `Файл ${safeMdText(id)} (не удалось идентифицировать)`;
    });
    result = result.replace(/@@SVGREF:(inline-svg:[A-Za-z0-9_-]+:\d+)@@/g, (original, id) => {
      const a = find(x => x.id === id) || assetList.find(x => x.id === id);
      return a ? mediaLink(a, true, exportFolder) : 'SVG-схема (не удалось идентифицировать; см. исходный DIL)';
    });
    // Avoid ambiguous basename matching when two generated files have the same name:
    // only replace the link with the file from this exact message.
    result = result.replace(/(!?)\[([^\]\r\n]+)\]\(sandbox:\/mnt\/data\/((?:[^()\r\n]|\([^()\r\n]*\))+)\)/g,
      (original, bang, label, encodedName) => {
        let name = encodedName;
        try { name = decodeURIComponent(name); } catch { /* ignore */ }
        const asset = find(a => a.kind === 'sandbox' && a.sandboxPath === `/mnt/data/${name}`);
        return asset ? mediaLink(asset, Boolean(bang), exportFolder) : original;
      });
    return result;
  }
  const yamlString = (v) => JSON.stringify(v == null ? '' : String(v));
  const pad3 = n => String(n).padStart(3, '0');
  const utf8Bytes = s => new TextEncoder().encode(s).length;
  // Direction (incoming/outgoing) and kind (image/file) are independent.
  // Uploaded inputs are skipped by default; generated outputs are included.
  function downloadDecision(asset, roleByMessage, options = {}) {
    const incoming = asset.messageIds.some(id => roleByMessage.get(id) === 'user');
    if (incoming && options.includeIncomingAttachments !== true) {
      return { download: false, reason: 'Входящее вложение из запроса: загрузка не запрошена.' };
    }
    if (asset.isImage) {
      if (options.includeImages === false) return { download: false, reason: 'Загрузка изображений отключена.' };
    } else if (options.includeAttachments === false) {
      return { download: false, reason: 'Загрузка файлов отключена.' };
    }
    return { download: true, reason: null };
  }
  function createFiles(data, assetList, fileBlobs, options = {}) {
    const chat = normalize(data);
    const now = new Date();
    const exported = now.toISOString();
    // Human-readable *local* clock time (not UTC) for exported directory.
    // Seconds are sufficient for typical use; same-second exports in this
    // browser tab are numbered to avoid identical root directory names.
    const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}_${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`;
    const plainPrefix = `${sanitizeName(chat.title, 64)}_${stamp}`;
    const seen = globalThis.__ChatGPTObsidianSnapshotNames || (globalThis.__ChatGPTObsidianSnapshotNames = new Map());
    const occurrence = (seen.get(plainPrefix) || 0) + 1;
    seen.set(plainPrefix, occurrence);
    const prefix = occurrence === 1 ? plainPrefix : `${plainPrefix} (${occurrence})`;
    const usedNames = new Set();
    for (const asset of assetList) {
      const original = asset.name;
      const dot = original.lastIndexOf('.');
      const stem = dot > 0 ? original.slice(0, dot) : original;
      const ext = dot > 0 ? original.slice(dot) : '';
      let candidate = original;
      let duplicateNumber = 2;
      while (usedNames.has(candidate.toLocaleLowerCase())) {
        const suffix = ` (${duplicateNumber++})`;
        candidate = stem.slice(0, Math.max(1, 110 - ext.length - suffix.length)) + suffix + ext;
      }
      usedNames.add(candidate.toLocaleLowerCase());
      asset.path = `02_Артефакты/${candidate}`;
    }
    const url = /^https:\/\/chatgpt\.com\/|^https:\/\/chat\.openai\.com\//.test(options.sourceUrl || '')
      ? options.sourceUrl : `https://chatgpt.com/c/${encodeURIComponent(chat.id)}`;
    const steps = makeSteps(chat.messages, assetList);
    const files = [];
    const log = [];
    const parts = [];
    const links = new Map();
    const maxPartBytes = 200 * 1024;
    const partPrefix = 'Часть';
    let partNumber = 0;
    let current = [];
    let partSize = 0;
    const oversizedSteps = [];
    const renderer = globalThis.ChatGPTObsidianMarkdownRenderer;
    const renderStats = {code_blocks: 0, writing_blocks: 0, escaped_blocks: 0,
      headings_nested: 0, headings_clamped: 0, ui_messages: 0, ui_fallbacks: 0, ui_code_blocks_restored: 0,
      static_loops_found:0, static_loop_labels_restored:0, static_loops_unresolved:0,
      inline_svg_embeds:0, inline_svg_rejected:0,
      unresolved_components: 0, warnings: []};
    const rawUiFiles = [];
    const makePart = () => {
      if (!current.length) return;
      partNumber++;
      const name = `${partPrefix}-${pad3(partNumber)}`;
      const body = `# ${chat.title} — часть ${partNumber}\n\n[← Протокол](../00_Протокол.md)\n\n` + current.map(x => x.body).join('\n\n---\n\n');
      files.push({ path: `${prefix}/01_Переписка/${name}.md`, data: body + '\n' });
      for (const entry of current) links.set(entry.step.anchor, name);
      parts.push({ filename: name, steps: current.map(x => x.step.index), bytes: utf8Bytes(body) });
      current = []; partSize = 0;
    };
    for (const step of steps) {
      const num = pad3(step.index);
      const sections = [
        `## ${step.headingTitle}`, ''
      ];
      for (const [j, m] of step.messages.entries()) {
        const role = m.author?.role || m.role;
        const time = humanTime(m.create_time);
        const converted = renderer.renderMessage(m);
        const nested = renderer.nestHeadings(converted.markdown);
        const md = expandReferences(nested.text, assetList, m.id, prefix);
        renderStats.code_blocks += converted.codeBlocks;
        renderStats.writing_blocks += converted.writingBlocks;
        renderStats.escaped_blocks += converted.escapedBlocks;
        renderStats.headings_nested += nested.altered;
        renderStats.headings_clamped += nested.clamped;
        renderStats.unresolved_components += converted.unresolvedComponents;
        renderStats.ui_code_blocks_restored += converted.codeRestoredFromSource;
        renderStats.static_loops_found += converted.staticLoopsDetected || 0;
        renderStats.static_loop_labels_restored += converted.staticLoopLabelsRestored || 0;
        renderStats.static_loops_unresolved += converted.staticLoopsUnresolved || 0;
        renderStats.inline_svg_embeds += converted.svgEmbeds || 0;
        renderStats.inline_svg_rejected += converted.svgRejected || 0;
        if (converted.rawUi) {
          renderStats.ui_messages++;
          if (converted.fallbackAvailable) renderStats.ui_fallbacks++;
          const uiPath = `03_Исходники/DIL/${pad3(step.index)}-${stableId(m.id, `msg-${j}`)}.txt`;
          rawUiFiles.push({path: `${prefix}/${uiPath}`, data: converted.rawUi});
          if (converted.warnings.length) renderStats.warnings.push(...converted.warnings.map(w => `Шаг ${step.index}: ${w}`));
          converted.uiSourceLink = wikiLink(`${prefix}/${uiPath}`, 'оригинальная разметка Intelligent UI');
        }
        const present = step.assets.filter(a => a.messageIds.includes(m.id));
        const label = role === 'user' ? 'Запрос' : 'Ответ';
        sections.push(`### ${label}${role === 'assistant' && j > 1 ? ' ' + j : ''}${time ? ' · ' + time : ''}`, '');
        // A non-text user upload still gets a readable message section.
        if (md) sections.push(md, '');
        if (converted.uiSourceLink) {
          sections.push(`> [!info] Intelligent UI: ${converted.uiSourceLink}. Интерактивность не сохраняется.`, '');
        }
        if (present.length) {
          for (const a of present) {
            const link = mediaLink(a, true, prefix);
            // Link already appeared inline: do not repeat it under the answer.
            if (!md.includes(link)) sections.push(`${role === 'user' ? '📥' : '📤'} ${link}`, '');
          }
        }
      }
      // NEVER collapse newlines globally: code, examples and fenced text may
      // contain intentional consecutive empty lines.
      const entryBody = sections.join('\n');
      const size = utf8Bytes(entryBody);
      if (current.length && partSize + size + 7 > maxPartBytes) makePart();
      if (size > maxPartBytes) oversizedSteps.push({ step: step.index, bytes: size });
      current.push({ step, body: entryBody });
      partSize += size + 7;
    }
    makePart();
    files.push(...rawUiFiles);
    const header = [
      '---', `title: ${yamlString('Протокол — ' + chat.title)}`,
      `conversation_id: ${yamlString(chat.id)}`,
      `source: ${yamlString(url)}`, `exported: ${yamlString(humanTime(exported))}`,
      'tags: [chatgpt, protocol]', '---', '',
      `# Протокол — ${chat.title}`, '',
      `Источник: [открыть чат ChatGPT](${url})`, '',
      `Экспорт: ${humanTime(exported)} · Шагов: ${steps.length} · Файлов обнаружено: ${assetList.length}`, '',
      chat.source === 'dom' ? '> [!warning] Частичный экспорт из интерфейса: история может быть неполной, а идентификаторы сообщений — нестабильными.\n' : '',
      '## Хронология', ''
    ].filter(v => v !== '');
    for (const step of steps) {
      const part = links.get(step.anchor);
      const label = `${pad3(step.index)}. ${safeWikiLabel(step.title)}`;
      if (!part) throw Error('Не найдена часть переписки для шага ' + step.index);
      header.push(wikiLink(`${prefix}/01_Переписка/${part}#${step.headingTitle}`, label));
      const assetSegments = [];
      const emitted = new Set();
      for (const m of step.messages) {
        const icon = (m.author?.role || m.role) === 'user' ? '📥' : '📤';
        for (const a of step.assets.filter(a => a.messageIds.includes(m.id))) {
          const key = `${a.id}|${icon}`;
          if (emitted.has(key)) continue;
          emitted.add(key);
          const display = `${icon} ${mediaLink(a, false, prefix)}`;
          assetSegments.push(icon === '📥' ? `*${display}*` : `**${display}**`);
        }
      }
      if (assetSegments.length) header.push(assetSegments.join(' | '));
      header.push('');
    }
    const unattached = assetList.filter(a => !a.messageIds.some(mid => steps.some(s => s.messages.some(m => m.id === mid))));
    if (unattached.length) {
      header.push('## Дополнительные файлы без привязки к сообщению', '');
      for (const a of unattached) header.push(`- ${mediaLink(a, false, prefix)}`);
      header.push('');
    }
    files.push({ path: `${prefix}/00_Протокол.md`, data: header.join('\n').replace(/\n{3,}/g, '\n\n') + '\n' });
    for (const m of chat.messages) {
      const role = m.author?.role || m.role;
      const time = toISO(m.create_time) || 'время неизвестно';
      const attached = assetList.filter(a => a.messageIds.includes(m.id));
      const text = visibleText(m) || (attached.length ? '[Сообщение содержит вложение]' : '[Нет извлекаемого текста]');
      log.push(`[${time}] ${role.toUpperCase()} (id=${m.id || 'unknown'})`, text,
        ...attached.map(a => `${role === 'user' ? 'IN' : 'OUT'} ${a.name} (${a.id}), статус: ${a.status}`),
        '', '------------------------------------------------------------------------', '');
    }
    const logText = [
      'CHATGPT CONVERSATION LOG', `Title: ${chat.title}`,
      `Conversation ID: ${chat.id}`, `URL: ${url}`, `Exported: ${exported}`,
      `Source: ${chat.source}`, `Visible messages: ${chat.messages.length}`,
      `Protocol steps: ${steps.length}`, '', '========================================================================', '', ...log
    ].join('\n');
    files.push({ path: `${prefix}/03_Исходники/conversation.log`, data: logText });
    files.push({ path: `${prefix}/03_Исходники/conversation.json`, data: JSON.stringify(data, null, 2) + '\n' });
    const artifacts = assetList.map(a => ({
      id: a.id, kind: a.kind || 'file-id', name: a.name, path: a.status === 'downloaded' ? a.path : null,
      status: a.status, error: a.error || null,
      download_attempts: a.downloadAttempts || 0,
      download_history: a.downloadHistory || [],
      size_bytes: a.status === 'downloaded' ? (a.sizeBytes ?? fileBlobs.get(a.id)?.byteLength ?? null) : null,
      sha256: a.status === 'downloaded' ? (a.sha256 || null) : null,
      hash_error: a.hashError || null,
      message_ids: a.messageIds.slice(),
      directions: a.messageIds.map(messageId => ({ message_id: messageId,
        role: (chat.messages.find(m => m.id === messageId)?.author?.role || 'unknown') })),
      source_message_ids: a.sourceMessageIds || undefined,
      sandbox_path: a.sandboxPath || undefined,
      origin: a.origin || undefined, tool_message_id: a.toolMessageId || undefined,
      link_confidence: a.linkConfidence || undefined,
      generated_locally: a.generatedLocally || undefined
    }));
    files.push({ path: `${prefix}/03_Исходники/artifacts.json`, data: JSON.stringify(artifacts, null, 2) + '\n' });
    const stepIndex = steps.map(s => ({ id: s.sourceMessageId, anchor: s.anchor,
      step: s.index, generated_title: s.title, part: links.get(s.anchor), message_ids: s.messages.map(m => m.id),
      assets: s.assets.map(a => a.id) }));
    files.push({ path: `${prefix}/03_Исходники/steps.json`, data: JSON.stringify(stepIndex, null, 2) + '\n' });
    for (const a of assetList) {
      const blob = fileBlobs.get(a.id);
      if (a.status === 'downloaded' && blob) files.push({ path: `${prefix}/${a.path}`, data: blob });
    }
    const failures = artifacts.filter(a => a.status !== 'downloaded').map(a => ({ id: a.id, name: a.name, reason: a.error || a.status }));
    const paginationChecked = data._export_pagination_checked === true;
    const paginationStatus = data._export_pagination_status || 'unknown';
    const completeness = chat.source === 'dom' ? 'partial_dom' : (paginationChecked ? 'api_paginated_unverified' : 'api_unverified');
    const visibleWithoutExtractableContent = chat.messages.filter(m =>
      !visibleText(m) && !assetList.some(a => a.messageIds.includes(m.id))).length;
    const manifest = {
      exporter: `ChatGPT → Obsidian Export ${EXPORTER_VERSION}`, exporter_version: EXPORTER_VERSION, exported,
      markdown_renderer: renderStats,
      visible_messages_without_extractable_content: visibleWithoutExtractableContent,
      completeness, pagination_checked: paginationChecked,
      pagination_status: paginationStatus,
      pagination_exhausted: paginationStatus === 'exhausted',
      page_message_counts: data._export_page_message_counts || null,
      pagination_deduplicated_entries: data._export_deduplicated_messages || 0,
      pages_fetched: data._export_page_count || null,
      export_warning: data.export_warning || null,
      message_entries_unselected: Math.max(0, chat.rawMessagesCount - chat.messages.length),
      excluded_message_reasons: chat.excludedMessagesByReason,
      conversation_id: chat.id, title: chat.title, url, source: chat.source,
      visible_messages: chat.messages.length, steps: steps.length,
      raw_messages: chat.rawMessagesCount, transcript_parts: parts,
      oversized_steps: oversizedSteps,
      download_settings: {
        files: options.includeAttachments !== false,
        images: options.includeImages !== false,
        incoming: options.includeIncomingAttachments === true,
        pacing_enabled: options.paceDownloads !== false,
        delay_between_files_ms: options.paceDownloads === false ? 0 : (options.delayBetweenFilesMs ?? 1500),
        max_attempts_per_file: 3
      },
      tool_images: {found_in_json: options.toolImageDiagnostics?.raw_image_pointers ?? 0,
        candidates: assetList.filter(a => a.kind === 'tool-image').length,
        turn_proximity_links: assetList.filter(a => a.kind === 'tool-image' && a.linkConfidence === 'turn-proximity').length,
        downloaded: assetList.filter(a => a.kind === 'tool-image' && a.status === 'downloaded').length,
        failed: assetList.filter(a => a.kind === 'tool-image' && a.status === 'failed').length,
        skipped: assetList.filter(a => a.kind === 'tool-image' && a.status === 'skipped').length,
        without_turn: assetList.filter(a => a.kind === 'tool-image' && !a.messageIds.length).length},
      inline_svg: {detected:assetList.filter(a => a.kind === 'inline-svg').length,
        saved:assetList.filter(a => a.kind === 'inline-svg' && a.status === 'downloaded').length,
        rejected:renderStats.inline_svg_rejected},
      attachments_found: assetList.length,
      attachments_by_type: { uploaded_or_image: assetList.filter(a => a.kind !== 'sandbox').length,
        generated_sandbox_links: assetList.filter(a => a.kind === 'sandbox').length },
      attachments_downloaded: assetList.filter(a => a.status === 'downloaded' && a.kind !== 'inline-svg').length,
      attachments_saved_in_zip: assetList.filter(a => a.status === 'downloaded').length,
      attachments_created_locally: assetList.filter(a => a.status === 'downloaded' && a.kind === 'inline-svg').length,
      attachments_bytes_downloaded: assetList.reduce((s, a) => s + (a.status === 'downloaded' && a.kind !== 'inline-svg' ? a.sizeBytes || 0 : 0), 0),
      attachments_limited: assetList.filter(a => a.status === 'limited').length,
      attachments_skipped: assetList.filter(a => a.status === 'skipped').length,
      attachments_failed: assetList.filter(a => a.status === 'failed').length,
      attachments_deferred: assetList.filter(a => a.status === 'deferred').length,
      attachments_retried: assetList.filter(a => (a.downloadAttempts || 0) > 1).length,
      attachments_failed_or_skipped: failures,
      warning: chat.source === 'dom' ? 'DOM fallback is incomplete and message IDs may change' : null
    };
    files.push({ path: `${prefix}/03_Исходники/manifest.json`, data: JSON.stringify(manifest, null, 2) + '\n' });
    const report = [
      '# Отчёт экспорта', '',
      `- Сообщений (видимых): ${chat.messages.length}`,
      `- Записей протокола: ${steps.length}`,
      `- Частей переписки: ${parts.length}`,
      `- Markdown: обработано CodeBlock: ${renderStats.code_blocks}; WritingBlock: ${renderStats.writing_blocks}; escape: ${renderStats.escaped_blocks}.`,
      `- Markdown: вложено заголовков: ${renderStats.headings_nested}; ограничено шестым уровнем: ${renderStats.headings_clamped}.`,
      `- Intelligent UI: сообщений ${renderStats.ui_messages}; с fallbackMarkdown ${renderStats.ui_fallbacks}; оригинальных блоков кода восстановлено ${renderStats.ui_code_blocks_restored}; исходников DIL сохранено ${rawUiFiles.length}.`,
      `- Intelligent UI: статических циклов найдено ${renderStats.static_loops_found}; восстановлено подписей ${renderStats.static_loop_labels_restored}; сложных циклов без восстановления ${renderStats.static_loops_unresolved}.`,
      `- SVG из Intelligent UI: встроено ссылок ${renderStats.inline_svg_embeds}; отклонено небезопасных/неподдерживаемых ${renderStats.inline_svg_rejected}.`,
      `- Изображения инструментов: указателей в JSON ${options.toolImageDiagnostics?.raw_image_pointers ?? 0}; кандидатов ${assetList.filter(a => a.kind === 'tool-image').length}; скачано ${assetList.filter(a => a.kind === 'tool-image' && a.status === 'downloaded').length}; ошибок ${assetList.filter(a => a.kind === 'tool-image' && a.status === 'failed').length}.`,
      `- Не полностью разрешённых компонентов ChatGPT: ${renderStats.unresolved_components}.`,
      `- Вложений обнаружено: ${assetList.length}`,
      `- Вложений скачано с сервера: ${assetList.filter(a => a.status === 'downloaded' && a.kind !== 'inline-svg').length}`,
      `- SVG-схем создано локально: ${assetList.filter(a => a.status === 'downloaded' && a.kind === 'inline-svg').length}`,
      `- Всего файлов сохранено в ZIP (включая локальные SVG): ${assetList.filter(a => a.status === 'downloaded').length}`,
      `- Не скачано из-за лимитов размера: ${assetList.filter(a => a.status === 'limited').length}`,
      '- Предельный суммарный объём вложений в одном экспорте: 512 МиБ.',
      `- Оценка полноты истории: ${completeness} (не гарантия доступности всех веток и скрытых данных).`,
      `- Пагинация API: ${paginationStatus}; страниц получено: ${data._export_page_count || 'неизвестно'}; завершение по признаку API: ${paginationStatus === 'exhausted' ? 'да' : 'не подтверждено'}.`,
      `- Получено API-записей: ${chat.rawMessagesCount}; отобрано в читаемую переписку: ${chat.messages.length}; исключено по правилам отображения: ${Math.max(0, chat.rawMessagesCount - chat.messages.length)}.`,
      `- Причины исключения (записи сохраняются в исходном JSON): ${Object.entries(chat.excludedMessagesByReason).map(([key, count]) => key + '=' + count).join('; ')}.`,
      `- Видимых сообщений без извлекаемого текста/привязанного файла: ${visibleWithoutExtractableContent} (могут быть служебными или мультимодальными).`,
      `- Не скачано из-за ошибки: ${failures.filter(a => a.status === 'failed').length}`,
      `- Пропущено по настройкам: ${failures.filter(a => a.status === 'skipped').length}`,
      `- Отложено из-за ограничения сервера: ${failures.filter(a => a.status === 'deferred').length}`,
      `- Файлов с повторными попытками: ${assetList.filter(a => (a.downloadAttempts || 0) > 1).length}`,
      `- Пауза между файлами: ${options.paceDownloads !== false ? ((options.delayBetweenFilesMs ?? 1500) / 1000) + ' сек' : 'отключена'}`,
      '- Временные ошибки: максимум 3 попытки на файл, интервалы 3 и 6 секунд (с учётом Retry-After).',
      '',
      'Указатели изображений в tool-сообщениях — кандидаты: часть может относиться к промежуточным или отвергнутым генерациям. Привязка к шагу по близости сообщений является предположением, а не доказательством показа. Скачанными считаются только реально полученные байты.',
      '', '## Обнаруженные файлы', ''
    ];
    if (!assetList.length) report.push('В метаданных и сообщениях вложения не обнаружены.', '');
    for (const a of assetList) {
      const attemptsText = a.downloadAttempts ? `; попыток: ${a.downloadAttempts}` : '';
      report.push(`- ${a.status === 'downloaded' ? '✅' : a.status === 'skipped' ? '⏭️' : a.status === 'deferred' ? '⏸️' : '⚠️'} ${safeMdText(a.name)} — ${a.status}${attemptsText}${a.error ? '; ' + safeMdText(a.error) : ''}${a.status === 'downloaded' ? ` — ${mediaLink(a, false, prefix)}` : ''}`);
      for (const attempt of (a.downloadHistory || [])) {
        const outcome = attempt.local ? 'SVG создан локально, без скачивания' : attempt.outcome === 'success' ? 'успешно' : `ошибка: ${safeMdText(attempt.error || 'неизвестно')}`;
        const wait = attempt.wait_before_retry_ms ? `; ожидание перед повтором: ${attempt.wait_before_retry_ms / 1000} сек` : '';
        const blocked = attempt.retry_blocked ? `; ${safeMdText(attempt.retry_blocked)}` : '';
        report.push(`  - Попытка ${attempt.attempt}: ${outcome}${wait}${blocked}`);
      }
    }
    if (renderStats.warnings.length) {
      report.push('', '## Ограничения отображения сложных компонентов', '',
        ...renderStats.warnings.map(w => `- ${safeMdText(w)}`));
    }
    if (renderStats.unresolved_components > 0) {
      report.push('', '> [!note] Некоторые внутренние ссылки на источники/компоненты ChatGPT не имеют подтверждённого внешнего URL. Они сохранены в conversation.json; это **не ошибка скачивания вложений**.');
    }
    if (oversizedSteps.length) {
      report.push('', '## Очень большие шаги', '',
        'Некоторые пары запрос/ответ превышают 200 КБ и оставлены целиком, чтобы не повредить Markdown:', '');
      oversizedSteps.forEach(s => report.push(`- Шаг ${s.step}: ${(s.bytes / 1024).toFixed(1)} КБ`));
    }
    if (chat.source === 'dom') report.push('', '> [!warning] Использован резервный захват видимых элементов страницы; полнота архива не гарантирована.');
    else if (!paginationChecked) report.push('', '> [!warning] API-источник получен, но полный охват истории постраничной проверкой не подтверждён.');
    else report.push('', '> [!note] Получены все страницы, заявленные выбранным API. Это не доказывает полноту всех альтернативных веток, служебных и скрытых данных.');
    report.push('', 'Сырые данные включают только то, что доступно через API/интерфейс текущей сессии; скрытые серверные данные не извлекаются.', '');
    files.push({ path: `${prefix}/04_Отчёт экспорта.md`, data: report.join('\n') });
    files.push({ path: `${prefix}/README.md`, data:
`# Экспорт чата ChatGPT v${EXPORTER_VERSION}\n\n` +
`Начните с **00_Протокол.md**: каждая ссылка ведёт к началу пары «запрос → ответ(ы)» в 01_Переписка/.\n\n` +
`📥 *курсивом* обозначает файл, приложенный пользователем; 📤 **жирным** — созданный/предоставленный ассистентом.\n` +
`Настройки этого экспорта: исходящие файлы — ${options.includeAttachments !== false ? 'включены' : 'выключены'}, изображения — ${options.includeImages !== false ? 'включены' : 'выключены'}, входящие вложения — ${options.includeIncomingAttachments === true ? 'включены' : 'выключены'}. Файлы и изображения включаются независимо. Если файл не скачан, его имя выводится без неработающей ссылки.\n` +
`Между файлами по умолчанию пауза 1,5 секунды, а при временных ошибках выполняются до двух дополнительных попыток с увеличивающимся ожиданием. История попыток хранится в реестре и отчёте. Строк для отсутствующих вложений нет. Все файлы, включая пропущенные по настройкам, перечислены в **04_Отчёт экспорта.md**.\n\n` +
`**03_Исходники/conversation.json** хранит исходный ответ API; у сложных Intelligent UI их полные исходники дополнительно сохраняются в **03_Исходники/DIL/**. Динамические элементы не исполняются. **conversation.log** — читаемый текстовый лог, ` +
`**steps.json** и **artifacts.json** — машинно-читаемые индексы.\n\n` +
`Новый экспорт создаёт отдельную папку с датой и временем в имени, поэтому не затирает ручные правки предыдущего протокола.\n` +
`Заголовки формируются автоматически (первые ~70 символов вопроса или начало ответа для «продолжай»).\n` +
`Межчатовые связи устанавливаются вручную после финального экспорта.\n\n` +
`Распакуйте весь каталог экспорта внутрь Obsidian vault; не переименовывайте каталог и вложения, пока ссылки не обновлены Obsidian. Wikilinks содержат путь от уникальной папки экспорта, а файлы вложений находятся непосредственно в 02_Артефакты/ с исходными именами (повторы получают суффиксы).\n`  });
    // Validate only links generated by this exporter, not user-authored content.
    // Important: preserve the working Obsidian link format as-is.
    const byPath = new Map(files.map(item => [item.path, item]));
    if (byPath.size !== files.length) throw Error('В ZIP найдены повторяющиеся пути файлов.');
    let linksChecked = 0;
    const generatedDocs = [
      files.find(item => item.path === `${prefix}/00_Протокол.md`),
      files.find(item => item.path === `${prefix}/04_Отчёт экспорта.md`)
    ];
    for (const doc of generatedDocs) {
      for (const match of doc.data.matchAll(/!??\[\[([^\]\n]+?)\]\]/g)) {
        const target = match[1].split('|')[0];
        if (!target.startsWith(prefix + '/')) continue; // user-authored wiki syntax in the title isn't an exporter link
        const hash = target.indexOf('#');
        const filePart = hash < 0 ? target : target.slice(0, hash);
        const heading = hash < 0 ? null : target.slice(hash + 1);
        const targetFile = /\.[A-Za-z0-9]{1,10}$/.test(filePart) ? filePart : `${filePart}.md`;
        const found = byPath.get(targetFile);
        if (!found) throw Error(`Проверка ссылок: в ZIP отсутствует ${targetFile}`);
        if (heading && !String(found.data).split('\n').some(line => line === `## ${heading}`)) {
          throw Error(`Проверка ссылок: заголовок ${heading} отсутствует в ${targetFile}`);
        }
        linksChecked++;
      }
    }
    manifest.internal_links_checked = linksChecked;
    // Manifest has already been added to the list: synchronize verified metadata.
    byPath.get(`${prefix}/03_Исходники/manifest.json`).data = JSON.stringify(manifest, null, 2) + '\n';
    return { files, logText, prefix, manifest, steps };
  }
  globalThis.ChatGPTObsidianCore = { normalize, collectAssets, collectToolImages, createFiles, downloadDecision, sanitizeName, fileIdFrom, toISO, contentText, makeSteps, humanTime };
})();
