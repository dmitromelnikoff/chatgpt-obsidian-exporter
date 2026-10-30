/* Local, synthetic smoke checks. No ChatGPT network access or personal fixtures. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({
  console, TextEncoder, Uint8Array, Uint32Array, DataView, Blob,
  setTimeout, clearTimeout,
});
for (const file of ['zip.js', 'renderer.js', 'core.js', 'reliability.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, {filename:file});
}
const r = context.ChatGPTObsidianMarkdownRenderer;
const core = context.ChatGPTObsidianCore;
const retry = context.ChatGPTObsidianReliability;
const zip = context.ObsidianZip;
assert(r && core && retry && zip, 'Modules not exposed');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json')));
assert.equal(manifest.version, '0.3.9.1');
assert.equal(manifest.content_scripts.length, 1);
assert.deepEqual(manifest.content_scripts[0].js, ['zip.js','renderer.js','core.js','reliability.js','page.js','dom-button.js']);
assert.deepEqual(manifest.content_scripts[0].matches, ['https://chatgpt.com/*','https://chat.openai.com/*']);
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions.sort(), ['activeTab', 'scripting'].sort());
const d = {codeBlocks:0,escapedBlocks:0,writingBlocks:0,unresolvedComponents:0};
const c = r.transformRaw('<CodeBlock language="python">print("ok")</CodeBlock>',d);
assert.match(c, /```python\nprint\("ok"\)\n```/);
assert.equal(d.codeBlocks, 1);
const nested = r.nestHeadings('# Title\n\n```python\n# comment\n```',3).text;
assert.match(nested,/^#### Title/m);
assert.match(nested,/```python\n# comment\n```/);
const data = {title:'Synthetic example',conversation_id:'test-id',messages:[
  {id:'a',author:{role:'user'},content:{content_type:'text',parts:['Explain the test']},create_time:1},
  {id:'x',author:{role:'assistant'},content:{content_type:'thoughts',parts:['hidden']},create_time:2},
  {id:'b',author:{role:'assistant'},content:{content_type:'text',parts:['Answer']},create_time:3},
]};
const normalized = core.normalize(data);
assert.equal(normalized.messages.length,2);
assert.equal(normalized.rawMessagesCount,3);
assert.equal(normalized.excludedMessagesByReason.non_readable_content_type,1);
assert.equal(Object.values(normalized.excludedMessagesByReason).reduce((a,b)=>a+b,0),1);
const syntheticArchive = core.createFiles(data, [], new Map(), {
  sourceUrl:'https://chatgpt.com/c/synthetic-id',
  includeAttachments:true, includeImages:true, includeIncomingAttachments:true,
  paceDownloads:true, delayBetweenFilesMs:1500, maxFileMB:100
});
const syntheticManifest = JSON.parse(syntheticArchive.files.find(f=>f.path.endsWith('/03_Исходники/manifest.json')).data);
assert.equal(syntheticManifest.exporter_version, manifest.version);
assert.equal(syntheticManifest.raw_messages,3);
assert.equal(syntheticManifest.visible_messages,2);
assert.equal(syntheticManifest.excluded_message_reasons.non_readable_content_type,1);
assert.equal(syntheticManifest.pagination_exhausted,false);
assert.equal(syntheticManifest.pagination_status,'unknown');
assert.match(syntheticArchive.files.find(f=>f.path.endsWith('/README.md')).data, new RegExp('v'+manifest.version.replaceAll('.', '\\.')));
const bytes = new Uint8Array([1,2,3]);
assert.equal(zip.crc32(bytes), 0x55bc801d);
(async()=>{
  const blob = await zip.make([{path:'example/file.txt',data:'text'}]);
  assert.equal(blob.type,'application/zip');
  const arr = new Uint8Array(await blob.arrayBuffer());
  assert.equal(new DataView(arr.buffer).getUint32(0,true),0x04034b50);
  const result = await retry.withRetries(()=>Promise.resolve('ok'));
  assert.equal(result.attempts,1);
  console.log('PASS synthetic smoke: manifest, Markdown, headings, normalization, ZIP, retries');
})().catch(e=>{console.error(e);process.exitCode=1});
