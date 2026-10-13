/* Readable Markdown export from structured ChatGPT messages.
   This is a SOURCE TRANSFORM, not a DIL runtime. It never evaluates UI code. */
(() => {
  'use strict';
  const cache = new WeakMap();
  const UI_TAG = /<\/?(?:box|row|column|columns|grid|stack|container|card|chart|datatable|appblock|asyncimage|asyncimagegroup|svg|slider|progress|form|toggle|select|tabs|tab|metric|stat|button|image|followup|learningviz|table|listitem)\b/i;
  const DYNAMIC = /\{#(?:each|if|await)\b|\{@body\b|DIL\.use(?:State|Memo|Effect)\s*\(/;
  const CODE_TAG = /<CodeBlock\b([^>]*)>([\s\S]*?)<\/CodeBlock>/gi;
  const FENCE = /^ {0,3}(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?^ {0,3}\1[ \t]*(?=\r?\n|$)/gm;
  function attributes(raw) {
    const out = {};
    for (const m of String(raw || '').matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = m[2] ?? m[3];
    return out;
  }
  function fenceFor(body, language = '') {
    const text = String(body ?? '').replace(/\r\n/g, '\n');
    let maxTick = 0;
    for (const match of text.matchAll(/`+/g)) if (match[0].length > maxTick) maxTick = match[0].length;
    const ticks = '`'.repeat(Math.max(3, maxTick + 1));
    const lang = /^[\w+.#-]{1,30}$/.test(language) ? language : '';
    // Keep EVERY byte of the code text apart from normalizing CRLF in Markdown.
    return `\n\n${ticks}${lang}\n${text}${text.endsWith('\n') ? '' : '\n'}${ticks}\n\n`;
  }
  function literalEscape(body) {
    const value = String(body || '');
    const trimmed = value.trim();
    // ChatGPT sometimes wraps the entire Markdown fence with <escape>.
    if (/^(`{3,}|~{3,})[^\n]*\n[\s\S]*\n\1\s*$/.test(trimmed)) return '\n\n' + trimmed + '\n\n';
    if (/\n/.test(value)) return fenceFor(value, 'text');
    return value.replace(/\\/g, '\\\\').replace(/([`*_{}\[\]()#+.!|>~-])/g, '\\$1');
  }
  function shieldFences(source, shields) {
    return source.replace(FENCE, match => {
      const i = shields.length;
      shields.push(match);
      return `\n\nEXPORTSAFE${String(i).padStart(7, '0')}END\n\n`;
    });
  }
  function restoreShields(source, shields) {
    return source.replace(/EXPORTSAFE(\d{7})END/g, (token, n) => shields[Number(n)] ?? token);
  }
  function compactSafeText(value) { return String(value || '').replace(/[\r\n]+/g, ' ').trim(); }
  function transformRaw(source, diagnostics) {
    let raw = String(source || '').replace(/\r\n/g, '\n');
    const shields = [];
    raw = shieldFences(raw, shields);
    // Ordinary inline code may contain literal component-looking strings.
    raw = raw.replace(/(?<!`)(`+)(?!`)([^`\n]*?)\1(?!`)/g, match => {
      const i = shields.length;
      shields.push(match);
      return `EXPORTSAFE${String(i).padStart(7, '0')}END`;
    });
    // The first protected construct wins. A literal <CodeBlock> inside
    // <escape> must not be parsed as an actual CodeBlock, and vice versa.
    const protectiveStart = /<(CodeBlock|escape)\b([^>]*)>/gi;
    let protectedRaw = '', cursor = 0, opener;
    while ((opener = protectiveStart.exec(raw))) {
      const kind = opener[1].toLowerCase();
      const endTag = `</${kind}>`;
      const closeAt = raw.toLowerCase().indexOf(endTag, protectiveStart.lastIndex);
      if (closeAt < 0) {diagnostics.unresolvedComponents++;continue;}
      protectedRaw += raw.slice(cursor, opener.index);
      const body = raw.slice(protectiveStart.lastIndex, closeAt);
      let generated;
      if (kind === 'codeblock') {
        diagnostics.codeBlocks++;
        generated = fenceFor(body, attributes(opener[2]).language || '');
      } else {
        diagnostics.escapedBlocks++;
        generated = literalEscape(body);
      }
      const i = shields.length;
      shields.push(generated);
      protectedRaw += `EXPORTSAFE${String(i).padStart(7, '0')}END`;
      cursor = closeAt + endTag.length;
      protectiveStart.lastIndex = cursor;
    }
    raw = protectedRaw + raw.slice(cursor);
    raw = raw.replace(/<WritingBlock\b[^>]*>([\s\S]*?)<\/WritingBlock>/gi, (full, body) => {
      diagnostics.writingBlocks++;
      // WritingBlock contains real Markdown, not literal code.
      return '\n\n' + body.replace(/\r\n/g, '\n') + '\n\n';
    });
    raw = raw.replace(/<escape(?:\s[^>]*)?>([\s\S]*?)<\/escape>/gi, (full, body) => {
      diagnostics.escapedBlocks++;
      return literalEscape(body);
    });
    raw = raw.replace(/<Link\b([^>]*?)>([\s\S]*?)<\/Link>/gi, (full, attrs, label) => {
      const a = attributes(attrs);
      const title = compactSafeText(label || a.title || a.value || 'Ссылка').replace(/[\]\[]/g, '\\$&');
      const url = a.url || '';
      if (/^(?:https?:\/\/|sandbox:\/mnt\/data\/)[^\s<>]+$/i.test(url)) return `[${title}](${url})`;
      diagnostics.unresolvedComponents++;
      return title;
    });
    raw = raw.replace(/<(?:Cite|CodeCite|Entity|FollowUp|FileCite|FileNavList|MemoryCite)\b([^>]*?)\/?\s*>/gi, (full, attrs) => {
      const a = attributes(attrs);
      diagnostics.unresolvedComponents++;
      return a.value ? `〔${compactSafeText(a.value)}〕` : '〔ссылка/компонент ChatGPT — см. исходный JSON〕';
    });
    // Some DIL blocks in newer sessions have self-closing tags.
    raw = raw.replace(/<Link\b([^>]*?)\/>/gi, (full, attrs) => {
      const a = attributes(attrs);
      if (/^(?:https?:\/\/|sandbox:\/mnt\/data\/)[^\s<>]+$/i.test(a.url || '')) return `[${a.title || a.value || 'Ссылка'}](${a.url})`;
      diagnostics.unresolvedComponents++;
      return a.title || a.value || '〔Ссылка: данные доступны в JSON〕';
    });
    return restoreShields(raw, shields);
  }
  // ChatGPT's fallbackMarkdown may contain typed private-use markers:
  //   \uE200url\uE202label\uE202https://...\uE201
  // Removing the delimiters (the old behavior) concatenated "url" + label + URL,
  // silently destroying otherwise perfectly valid external links.
  function fallbackMarkerToMarkdown(marker, diagnostics) {
    const fields = marker.split('\uE202');
    const type = String(fields.shift() || '').trim().toLowerCase();
    const plain = value => String(value || '').replace(/[\r\n]+/g, ' ').trim();
    if (type === 'url' || type === 'link') {
      const address = plain(fields.at(-1));
      const label = plain(fields.slice(0, -1).join(' '));
      if (/^(?:https?:\/\/|sandbox:\/mnt\/data\/)[^\s<>]+$/i.test(address)) {
        if (diagnostics) diagnostics.fallbackUrlLinks = (diagnostics.fallbackUrlLinks || 0) + 1;
        // The full, clickable URL remains visible, as requested. Preserve
        // the human label separately, without merging it into the URL.
        const visible = address.replace(/([\[\]\\])/g, '\\$1');
        const destination = address.replace(/\(/g, '%28').replace(/\)/g, '%29');
        return (label && label !== address ? label + ' — ' : '') + `[${visible}](${destination})`;
      }
      if (diagnostics) diagnostics.unresolvedComponents++;
      return label || '〔недоступная ссылка ChatGPT — см. исходный JSON〕';
    }
    if (type === 'cite' || type === 'citation') {
      if (diagnostics) {
        diagnostics.unresolvedComponents++;
        diagnostics.fallbackCitationMarkers = (diagnostics.fallbackCitationMarkers || 0) + 1;
      }
      const ids = fields.map(plain).filter(Boolean).join(', ');
      return ids ? `〔источники ChatGPT: ${ids}〕` : '〔цитата ChatGPT — см. исходный JSON〕';
    }
    if (type === 'entity') {
      const data = fields.join('\uE202');
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && typeof parsed[1] === 'string' && parsed[1].trim()) {
          return plain(parsed[1]);
        }
      } catch { /* Keep an explicit fallback for a malformed entity. */ }
      if (diagnostics) diagnostics.unresolvedComponents++;
      return '〔сущность ChatGPT — см. исходный JSON〕';
    }
    if (diagnostics) diagnostics.unresolvedComponents++;
    return `〔компонент ChatGPT: ${type.slice(0, 40) || 'неизвестный'} — см. исходный JSON〕`;
  }
  function resolveCitationMarkers(markdown, metadata, diagnostics = null) {
    const shields = [];
    let result = shieldFences(String(markdown || ''), shields);
    // Preserve inline code too: its marker-looking strings are literal data.
    result = result.replace(/(?<!`)(`+)(?!`)([^`\n]*?)\1(?!`)/g, match => {
      const i = shields.length;
      shields.push(match);
      return `EXPORTSAFE${String(i).padStart(7, '0')}END`;
    });
    const references = Array.isArray(metadata?.content_references) ? metadata.content_references : [];
    for (const item of references) {
      if (typeof item?.matched_text !== 'string' || !/[\uE000-\uF8FF]/u.test(item.matched_text)) continue;
      result = result.split(item.matched_text).join(typeof item.alt === 'string' ? item.alt : '');
    }
    result = result.replace(/\uE200([^\uE201]*?)\uE201/g,
      (whole, marker) => fallbackMarkerToMarkdown(marker, diagnostics));
    // Do not turn incomplete private-use markers into silently concatenated text.
    result = result.replace(/[\uE200-\uE203]/g, () => {
      if (diagnostics) diagnostics.unresolvedComponents++;
      return '〔неполный маркер ChatGPT〕';
    });
    return restoreShields(result, shields);
  }
  function normalizeFenceSpacing(markdown) {
    // Only adjust EMPTY LINES OUTSIDE complete Markdown code/Mermaid fences.
    // The body, opening and closing fences stay byte-for-byte unchanged.
    const lines = String(markdown || '').split('\n');
    const out = [];
    let fence = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!fence) {
        const opening = line.match(/^ {0,3}(`{3,}|~{3,})[^\n]*$/);
        if (opening) {
          while (out.length && !out[out.length - 1].trim()) out.pop();
          if (out.length) out.push('');
          out.push(line);
          fence = {char: opening[1][0], length: opening[1].length};
          continue;
        }
      } else {
        out.push(line);
        const ending = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
        if (ending && ending[1][0] === fence.char && ending[1].length >= fence.length) {
          fence = null;
          let j = i + 1;
          while (j < lines.length && !lines[j].trim()) j++;
          if (j > i + 1 && j < lines.length) out.push('');
          i = j - 1;
        }
        continue;
      }
      out.push(line);
    }
    return out.join('\n');
  }
  // Bounded, non-executing reader of a small static DIL template subset.
  // We read literal labels only; arbitrary JS, state, nested expressions and
  // unknown directives are never evaluated or silently represented as complete.
  function staticArray(source) {
    if (source.length > 16000) return null;
    try {
      const json = source.replace(/([\{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":');
      const result = JSON.parse(json);
      return Array.isArray(result) && result.length <= 80 ? result : null;
    } catch { return null; }
  }
  function extractStaticLoops(raw, diagnostics) {
    const result = [];
    const startRE = /\{#each\s+/g;
    let found;
    while ((found = startRE.exec(raw))) {
      let i = startRE.lastIndex, quote = '', escaped = false, depth = 0, startArray = i;
      while (i < raw.length && /\s/.test(raw[i])) i++;
      startArray = i;
      if (raw[i] !== '[') {diagnostics.staticLoopsUnresolved++;continue;}
      let endArray = -1;
      for (; i < raw.length && i - startArray <= 16000; i++) {
        const ch = raw[i];
        if (quote) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === quote) quote = '';
        } else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '[') depth++;
        else if (ch === ']' && --depth === 0) {endArray = i + 1;break;}
      }
      if (endArray < 0) {diagnostics.staticLoopsUnresolved++;continue;}
      const rest = raw.slice(endArray).match(/^\s+as\s+([A-Za-z_$][\w$]*)(?:\s*,\s*([A-Za-z_$][\w$]*))?\s*\}/);
      if (!rest) {diagnostics.staticLoopsUnresolved++;continue;}
      const bodyStart = endArray + rest[0].length;
      const end = raw.indexOf('{/each}', bodyStart);
      if (end < 0 || raw.slice(bodyStart, end).includes('{#each')) {diagnostics.staticLoopsUnresolved++;continue;}
      const array = staticArray(raw.slice(startArray, endArray));
      if (!array) {diagnostics.staticLoopsUnresolved++;startRE.lastIndex = end+7;continue;}
      const variable = rest[1];
      const body = raw.slice(bodyStart, end);
      // Only preserve static, explicitly rendered text fields, never arbitrary
      // object data that might be internal identifiers or executable code.
      const references = [...body.matchAll(new RegExp('\\{' + variable + '\\.([A-Za-z_$][\\w$]*)\\}', 'g'))].map(x => x[1]);
      const ordered = [...new Set(references.filter(x => /^(?:t|label|title|name|caption|text|value)$/.test(x)))];
      const hasVisibleString = new RegExp('>\\s*\\{' + variable + '\\}\\s*<').test(body);
      if (!ordered.length && !hasVisibleString) {
        // A loop that changes only colors/styles has no textual content to
        // restore. Record its visual limitation rather than inventing labels.
        diagnostics.staticLoopsUnresolved++;
        startRE.lastIndex = end + '{/each}'.length;
        continue;
      }
      const labels = [];
      for (const entry of array) {
        let val;
        if (typeof entry === 'string') val = entry;
        else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          const key = ordered.find(k => typeof entry[k] === 'string') ||
            ['t', 'label', 'title', 'name'].find(k => typeof entry[k] === 'string' && references.includes(k));
          val = key ? entry[key] : null;
        }
        if (typeof val !== 'string' || !val.trim() || val.length > 400) continue;
        labels.push(val.trim());
      }
      if (!labels.length) {diagnostics.staticLoopsUnresolved++;startRE.lastIndex=end+7;continue;}
      // Closest text/title/caption preceding the loop is a location hint for
      // inserting missing labels in fallbackMarkdown.
      const prefix = raw.slice(Math.max(0, found.index - 3000), found.index);
      const before = [...prefix.matchAll(/<(?:text|title|caption)\b[^>]*>([^<>]{1,450})<\/(?:text|title|caption)>|\*\*([^*\n]{2,200})\*\*/gi)]
        .map(m => (m[1] || m[2] || '').trim()).filter(Boolean).slice(-20);
      result.push({labels, before, position:found.index});
      diagnostics.staticLoopsDetected++;
      startRE.lastIndex = end + '{/each}'.length;
    }
    return result;
  }
  function escapeListLabel(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/([`*_{}\[\]<>|])/g, '\\$1').replace(/\n/g, ' ');
  }
  function restoreStaticLabels(markdown, loops, diagnostics) {
    let result = markdown;
    for (const loop of loops) {
      let anchor = -1, anchorLength = 0;
      // The nearest matching predecessor is more reliable than positional
      // offsets: fallback often changes the length of the DIL source.
      for (let i = loop.before.length - 1; i >= 0; i--) {
        const phrase = loop.before[i];
        const at = result.lastIndexOf(phrase);
        if (at >= 0) {anchor = at;anchorLength = phrase.length;break;}
      }
      let insertion = result.length;
      if (anchor >= 0) {
        insertion = result.indexOf('\n', anchor + anchorLength);
        if (insertion < 0) insertion = result.length;
      }
      const window = result.slice(insertion, insertion + 1200);
      const missing = loop.labels.filter(x => !window.includes(x));
      if (!missing.length) continue;
      const list = '\n\n' + missing.map(x => '- ' + escapeListLabel(x)).join('\n') + '\n';
      result = result.slice(0, insertion) + list + result.slice(insertion);
      diagnostics.staticLoopLabelsRestored += missing.length;
      if (anchor < 0) diagnostics.warnings.push('Статический DIL-список добавлен в конце сообщения: точка вставки не определена.');
    }
    return result;
  }
  // Parse SVG as data (never HTML or executable content) and emit only a
  // conservative allowlist of static shapes/geometry. No remote resources,
  // foreignObject, scripts, events, styles, animation, href or url(...).
  function sanitizeInlineSvg(source) {
    if (source.length > 120000 || /<!\s*(?:doctype|entity)/i.test(source) || typeof DOMParser === 'undefined') return null;
    let xml;
    try { xml = new DOMParser().parseFromString(source, 'image/svg+xml'); }
    catch { return null; }
    const root = xml.documentElement;
    if (!root || root.localName.toLowerCase() !== 'svg' || xml.querySelector('parsererror')) return null;
    const tags = new Set(['svg', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'tspan', 'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath']);
    const allowed = new Set(['viewbox', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform', 'stroke', 'stroke-width', 'strokewidth', 'stroke-linecap', 'strokelinecap', 'stroke-linejoin', 'strokelinejoin', 'stroke-dasharray', 'stroke-dashoffset', 'fill', 'fill-opacity', 'fillopacity', 'stroke-opacity', 'strokeopacity', 'opacity', 'font-size', 'fontsize', 'font-family', 'fontfamily', 'font-weight', 'fontweight', 'text-anchor', 'textanchor', 'dominant-baseline', 'dominantbaseline', 'vector-effect', 'offset', 'stop-color', 'stop-opacity', 'id', 'gradientunits', 'gradienttransform']);
    const camel = {viewbox:'viewBox', fontsize:'font-size', textanchor:'text-anchor', strokewidth:'stroke-width', fontweight:'font-weight', fontfamily:'font-family', dominantbaseline:'dominant-baseline', strokelinecap:'stroke-linecap', strokelinejoin:'stroke-linejoin', strokeopacity:'stroke-opacity', fillopacity:'fill-opacity'};
    const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let nodes = 0;
    function emit(node, isRoot = false) {
      if (++nodes > 1000) throw Error('SVG содержит слишком много элементов');
      if (node.nodeType === 3) return xmlEsc(node.nodeValue || '');
      if (node.nodeType !== 1) throw Error('SVG содержит неподдерживаемый узел');
      const tag = node.localName.toLowerCase();
      if (!tags.has(tag)) throw Error('SVG содержит неподдерживаемый тег: ' + tag);
      let attrs = isRoot ? ' xmlns="http://www.w3.org/2000/svg"' : '';
      for (const a of node.attributes) {
        const k = a.name.toLowerCase();
        if (k === 'xmlns' && isRoot) continue;
        if (k.startsWith('on') || k.includes(':') || ['href','style','class','src'].includes(k)) throw Error('SVG содержит небезопасный атрибут');
        if (!allowed.has(k)) continue;
        const v = a.value.trim();
        if (v.length > 8000 || /(?:url\s*\(|@import|javascript:|data:|https?:|[<>])/i.test(v)) throw Error('SVG содержит внешнюю ссылку или небезопасное значение');
        attrs += ' ' + (camel[k] || a.name) + '="' + xmlEsc(v) + '"';
      }
      const contents = Array.from(node.childNodes).map(n => emit(n)).join('');
      return '<' + (tag === 'lineargradient' ? 'linearGradient' : tag === 'radialgradient' ? 'radialGradient' : tag === 'clippath' ? 'clipPath' : tag) + attrs + '>' + contents + '</' + (tag === 'lineargradient' ? 'linearGradient' : tag === 'radialgradient' ? 'radialGradient' : tag === 'clippath' ? 'clipPath' : tag) + '>';
    }
    try {return emit(root, true);}catch{return null;}
  }
  function inlineSvgsOf(message, raw, diagnostics) {
    const results = [];
    if (!raw || !UI_TAG.test(raw)) return results;
    // Code examples must remain code even in a mixed UI response.
    const visibleSource = raw.replace(CODE_TAG, '').replace(FENCE, '');
    for (const match of visibleSource.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi)) {
      if (results.length >= 20) {diagnostics.svgRejected++;break;}
      const svg = sanitizeInlineSvg(match[0]);
      if (!svg) {diagnostics.svgRejected++; diagnostics.warnings.push('SVG не удалось безопасно преобразовать: оригинал остался в DIL.');continue;}
      results.push({id:`inline-svg:${message.id || 'unknown'}:${results.length + 1}`, name:`inline-svg-${String(message.id || 'unknown').slice(0,8)}-${results.length+1}.svg`, xml:svg});
    }
    return results;
  }
  function restoreSvgReferences(markdown, images, diagnostics) {
    if (!images.length) return markdown;
    let used = 0;
    let result = markdown.replace(/^ {0,3}(`{3,}|~{3,})svg[^\n]*\n\s*<svg\b[\s\S]*?<\/svg>\s*\n {0,3}\1[ \t]*$/gmi,
      (whole) => {
        if (!images[used]) return whole;
        diagnostics.svgEmbeds++;
        return `@@SVGREF:${images[used++].id}@@`;
      });
    // Collapse blank lines adjoining generated SVG embed markers only; never
    // touch ordinary fenced code or significant whitespace inside code bodies.
    result = result.replace(/\n{3,}(?=@@SVGREF:)/g, '\n\n')
      .replace(/(@@SVGREF:inline-svg:[^\n]+@@)\n{3,}/g, '$1\n\n');
    // Some Markdown fallbacks omit the visual completely. Retain at least an
    // explicit local embed instead of silently losing a valid SVG diagram.
    for (; used < images.length; used++) {
      result += `\n\nSVG-схема из Intelligent UI:\n\n@@SVGREF:${images[used].id}@@\n`;
      diagnostics.svgEmbeds++;
    }
    return result;
  }
  function fallbackOf(message) {
    const meta = message.metadata || {};
    const content = message.content || {};
    const compiled = meta.model_dil_v2 || {};
    for (const entry of [compiled, meta, content]) {
      if (!entry || typeof entry !== 'object') continue;
      for (const key of ['fallbackMarkdown', 'fallback_markdown', 'markdownFallback', 'markdown_fallback', 'fallback_text']) {
        if (typeof entry[key] === 'string' && entry[key].trim()) return entry[key];
      }
    }
    return '';
  }
  function restoreCodeInFallback(fallback, raw, diagnostics) {
    // A language-and-position match alone can corrupt multi-code messages.
    // Only replace if all DIL code blocks match compatible fenced code, in order.
    const sourceCodes = Array.from(raw.matchAll(CODE_TAG), m => ({language: attributes(m[1]).language || '', body: m[2].replace(/\r\n/g, '\n')}));
    if (!sourceCodes.length) return {text: fallback, exact: true};
    const fences = Array.from(fallback.matchAll(FENCE));
    if (fences.length < sourceCodes.length) return {text: fallback, exact: false};
    const replacements = [];
    let next = 0;
    function similarity(a, b) {
      const aa = a.replace(/\s+/g, ''), bb = b.replace(/\s+/g, '');
      return aa === bb || (aa.length > 40 && bb.length > 40 && (aa.includes(bb) || bb.includes(aa)));
    }
    for (const block of sourceCodes) {
      let match = null;
      for (let i = next; i < fences.length; i++) {
        const whole = fences[i][0];
        const lines = whole.split('\n');
        const language = (lines[0].trim().match(/^`{3,}([^\s`]*)/) || [,''])[1];
        const candidate = lines.slice(1, -1).join('\n').replace(/\n$/, '');
        if (block.language && language && block.language.toLowerCase() !== language.toLowerCase()) continue;
        if (!similarity(block.body, candidate)) continue;
        match = {original: whole, index: fences[i].index, replacement: fenceFor(block.body, block.language).trim()};
        next = i + 1; break;
      }
      if (!match) return {text: fallback, exact: false};
      replacements.push(match);
    }
    let result = fallback;
    for (let i = replacements.length - 1; i >= 0; i--) {
      const r = replacements[i];
      result = result.slice(0, r.index) + r.replacement + result.slice(r.index + r.original.length);
    }
    diagnostics.codeRestoredFromSource += replacements.length;
    return {text: result, exact: true};
  }
  function contentParts(message) {
    const c = message.content || {};
    const parts = Array.isArray(c.parts) ? c.parts : [c.text || c.content || c.summary || c.result].filter(x => x != null);
    return parts.map(part => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      const ptr = String(part.asset_pointer || part.file_id || part.fileId || '');
      const match = ptr.match(/file[-_][A-Za-z0-9_-]+/);
      if (match) return `@@ATTACH:${match[0]}@@`;
      for (const key of ['raw_dil','dil','text','transcript','transcription','caption','description','code']) {
        if (typeof part[key] === 'string') return part[key];
      }
      return '';
    }).filter(Boolean);
  }
  function renderMessage(message) {
    if (cache.has(message)) return cache.get(message);
    const raw = contentParts(message).join('\n\n');
    const fallback = fallbackOf(message);
    // DIL-like strings inside documented code examples are not live UI.
    const uiProbe = raw.replace(FENCE, '').replace(CODE_TAG, '').replace(/<escape\b[^>]*>[\s\S]*?<\/escape>/gi, '');
    const richUI = UI_TAG.test(uiProbe) || DYNAMIC.test(uiProbe);
    const diagnostics = {codeBlocks: 0, codeRestoredFromSource: 0, writingBlocks: 0,
      escapedBlocks: 0, unresolvedComponents: 0, rawUi: richUI ? raw : '', mode: 'source', warnings: [],
      staticLoopsDetected:0, staticLoopsUnresolved:0, staticLoopLabelsRestored:0, svgRejected:0, svgEmbeds:0};
    let markdown = transformRaw(raw, diagnostics);
    if (richUI) {
      if (fallback) {
        const fallbackDiag = {codeBlocks:0, codeRestoredFromSource:0, writingBlocks:0, escapedBlocks:0, unresolvedComponents:0};
        const cleanedFallback = transformRaw(fallback, fallbackDiag);
        diagnostics.unresolvedComponents += fallbackDiag.unresolvedComponents;
        const restored = restoreCodeInFallback(cleanedFallback, raw, diagnostics);
        if (restored.exact) {
          markdown = restored.text; diagnostics.mode = 'fallback';
        } else {
          // Preserve original code; if the UI cannot be reproduced, do not claim exact fidelity.
          markdown = cleanedFallback + '\n\n> [!warning] Исходные блоки кода этого Intelligent UI не удалось однозначно сопоставить с упрощённой версией. Ниже приведён оригинал кода.\n';
          for (const block of Array.from(raw.matchAll(CODE_TAG))) markdown += fenceFor(block[2], attributes(block[1]).language || '');
          diagnostics.mode = 'fallback_with_original_code';
          diagnostics.warnings.push('Код в fallbackMarkdown не подтверждён: оригинальные блоки приложены отдельно.');
        }
      } else {
        diagnostics.mode = 'ui_source_only';
        diagnostics.warnings.push('Для Intelligent UI нет fallbackMarkdown. Динамическое представление не восстановлено.');
        const stripped = markdown
          .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '\n\n*[SVG: см. исходную разметку]*\n\n')
          .replace(/<\/?(?:box|row|column|columns|grid|stack|container|card|chart|datatable|appblock|tabs|tab|metric|stat|text|title|caption|badge|divider|icon|list|listitem|table|thead|tbody|tr|th|td|form|button|toggle|select|slider|progress)[^>]*>/gi, '\n');
        markdown = '> [!warning] Сложный Intelligent UI не может быть точно воспроизведён в Markdown; сохранена доступная текстовая часть и исходный DIL.\n\n' + stripped;
      }
    }
    const svgImages = richUI ? inlineSvgsOf(message, raw, diagnostics) : [];
    if (richUI) {
      const templateSource = raw.replace(CODE_TAG, '').replace(FENCE, '');
      markdown = restoreStaticLabels(markdown, extractStaticLoops(templateSource, diagnostics), diagnostics);
      markdown = restoreSvgReferences(markdown, svgImages, diagnostics);
      if (diagnostics.staticLoopsUnresolved) diagnostics.warnings.push(`${diagnostics.staticLoopsUnresolved} сложных DIL-шаблонов нельзя раскрыть статически; оригинал сохранён.`);
    }
    markdown = normalizeFenceSpacing(normalizeMath(resolveCitationMarkers(markdown, message.metadata, diagnostics)));
    // Retain warnings for the report; leave the raw original untouched in conversation.json.
    const result = {markdown: markdown.trim(), inlineSvgs: svgImages, fallbackAvailable: Boolean(fallback), ...diagnostics};
    cache.set(message, result);
    return result;
  }
  function normalizeMath(input) {
    // Obsidian's display-math syntax is $$; transform the complete standalone
    // \[ ... \] delimiters, never lines inside code fences.
    const lines = String(input || '').split('\n');
    let fence = null, math = false;
    const out = [];
    for (let line of lines) {
      const fm = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (fm) {
        const marker = fm[1];
        if (!fence) fence = {chr:marker[0], length:marker.length};
        else if (marker[0] === fence.chr && marker.length >= fence.length && /^ {0,3}(?:`+|~+)\s*$/.test(line)) fence = null;
        out.push(line); continue;
      }
      if (fence) {out.push(line);continue;}
      if (line.trim() === '\\[') {math = true;out.push('$$');continue;}
      if (math && line.trim() === '\\]') {math = false;out.push('$$');continue;}
      if (math) {out.push(line);continue;}
      // Inline code is protected: do not touch literal \( ... \) examples.
      line = line.replace(/(`+[^`\n]*`+)|\\\((.+?)\\\)/g, (whole, code, tex) => code || `$${tex}$`);
      out.push(line);
    }
    return out.join('\n');
  }
  function nestHeadings(input, offset = 3) {
    // Never edit heading-like text inside fenced code or display math.
    const lines = String(input || '').split('\n');
    let fence = null, math = null, altered = 0, clamped = 0;
    const output = [];
    for (const line of lines) {
      const fm = line.match(/^ {0,3}(`{3,}|~{3,})(?:[^\n]*)$/);
      if (fm) {
        const marker = fm[1], chr = marker[0];
        if (!fence) fence = {chr, length: marker.length};
        else if (fence.chr === chr && marker.length >= fence.length && RegExp(`^ {0,3}${chr === '`' ? '`' : '~'}{${fence.length},}\\s*$`).test(line)) fence = null;
        output.push(line); continue;
      }
      if (fence) {output.push(line);continue;}
      const trimmed = line.trim();
      if (math) {if (trimmed === math) math = null;output.push(line);continue;}
      if (trimmed === '$$' || trimmed === '\\[') {math = trimmed === '$$' ? '$$' : '\\]'; output.push(line);continue;}
      const hm = line.match(/^( {0,3})(#{1,6})([ \t]+)(.*)$/);
      if (hm) {
        const old = hm[2].length, depth = Math.min(6, old + offset);
        altered++;
        if (old + offset > 6) clamped++;
        output.push(hm[1] + '#'.repeat(depth) + hm[3] + hm[4]);
      } else output.push(line);
    }
    return {text: output.join('\n'), altered, clamped};
  }
  globalThis.ChatGPTObsidianMarkdownRenderer = {renderMessage, nestHeadings, normalizeMath, normalizeFenceSpacing, fallbackOf, transformRaw, fenceFor, resolveCitationMarkers, extractStaticLoops, sanitizeInlineSvg};
})();
