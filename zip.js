/* Pure-JS ZIP writer: uncompressed STORE entries, UTF-8 file names, ZIP32. No remote library. */
(() => {
  'use strict';
  const te = new TextEncoder();
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (const b of bytes) crc = (crc >>> 8) ^ table[(crc ^ b) & 255];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  const u16 = (v, offset, n) => v.setUint16(offset, n, true);
  const u32 = (v, offset, n) => v.setUint32(offset, n >>> 0, true);
  const dateToDos = (when) => {
    const d = new Date(when);
    const year = Math.max(1980, Math.min(2107, d.getFullYear()));
    return {
      date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
    };
  };
  async function make(entries) {
    if (!Array.isArray(entries) || entries.length > 65535) throw Error('Превышен лимит ZIP32: 65535 файлов.');
    const parts = [], central = [];
    let offset = 0, centralSize = 0;
    const { date, time } = dateToDos(new Date());
    for (const item of entries) {
      const pathname = String(item.path).replace(/\\/g, '/').replace(/^\/+/, '');
      if (!pathname || pathname.split('/').some(s => !s || s === '.' || s === '..')) throw Error(`Небезопасный путь в ZIP: ${pathname}`);
      const name = te.encode(pathname);
      const bytes = item.data instanceof Uint8Array ? item.data : item.data instanceof ArrayBuffer ? new Uint8Array(item.data) : te.encode(String(item.data));
      if (bytes.length > 0xFFFFFFFF) throw Error('Вложение слишком велико для ZIP32.');
      const size = bytes.byteLength;
      const crc = crc32(bytes);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); // UTF-8 flag
      u16(lv, 8, 0); u16(lv, 10, time); u16(lv, 12, date);
      u32(lv, 14, crc); u32(lv, 18, size); u32(lv, 22, size);
      u16(lv, 26, name.length); u16(lv, 28, 0); local.set(name, 30);
      parts.push(local, bytes);
      const c = new Uint8Array(46 + name.length);
      const cv = new DataView(c.buffer);
      u32(cv, 0, 0x02014b50); u16(cv, 4, 0x0314); u16(cv, 6, 20);
      u16(cv, 8, 0x0800); u16(cv, 10, 0); u16(cv, 12, time); u16(cv, 14, date);
      u32(cv, 16, crc); u32(cv, 20, size); u32(cv, 24, size);
      u16(cv, 28, name.length); u16(cv, 30, 0); u16(cv, 32, 0);
      u16(cv, 34, 0); u16(cv, 36, 0); u32(cv, 38, 0); u32(cv, 42, offset);
      c.set(name, 46); central.push(c);
      offset += local.byteLength + size;
      centralSize += c.byteLength;
      if (offset + centralSize > 0xFFFFFFFF) throw Error('Размер архива превышает лимит ZIP32 (4 ГБ).');
    }
    const end = new Uint8Array(22); const ev = new DataView(end.buffer);
    u32(ev, 0, 0x06054b50); u16(ev, 4, 0); u16(ev, 6, 0);
    u16(ev, 8, entries.length); u16(ev, 10, entries.length);
    u32(ev, 12, centralSize); u32(ev, 16, offset); u16(ev, 20, 0);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }
  globalThis.ObsidianZip = { make, crc32 };
})();
