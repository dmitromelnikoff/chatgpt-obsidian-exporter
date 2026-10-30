/* Synthetic MV3 DOM and Popup toggle regression test.
   No ChatGPT network access or private conversation fixtures. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'dom-button.js'), 'utf8');
const POPUP = fs.readFileSync(path.join(ROOT, 'popup.js'), 'utf8');
const KEY = 'chatgpt-obsidian-exporter-show-dom-button';
const BUTTON_ID = 'chatgpt-obsidian-export-zip-button';
const PANEL_ID = 'chatgpt-obsidian-export-panel';
const tick = () => new Promise(resolve => setImmediate(resolve));

function makePageFixture(hostname = 'chatgpt.com') {
  const buttonEvents = {};
  const listeners = [];
  let initialGetResolve;
  let button = null;
  let panel = null;
  let observer = null;
  const location = { protocol:'https:', hostname, pathname:'/c/1234567890abcdef' };
  const body = {append(el) { button = el; el.isConnected = true; }};
  const document = {
    body, documentElement:{},
    getElementById(id) {
      if (id === BUTTON_ID && button?.isConnected) return button;
      if (id === PANEL_ID) return panel;
      return null;
    },
    createElement(tag) {
      assert.equal(tag,'button');
      return {
        dataset:{},style:{},isConnected:false,
        setAttribute(){},
        addEventListener(type,fn){buttonEvents[type] = fn;},
        remove(){this.isConnected = false;if(button===this)button=null;}
      };
    }
  };
  const chrome = {storage:{
    local:{get(){return new Promise(resolve=>{initialGetResolve=resolve;});}},
    onChanged:{addListener(fn){listeners.push(fn);}}
  }};
  const context = vm.createContext({
    document, location, chrome, queueMicrotask,
    MutationObserver:class {constructor(cb){observer=cb;}observe(){}},
    window:{addEventListener(){}}
  });
  vm.runInContext(SOURCE,context,{filename:'dom-button.js'});
  return {
    context, location, button:()=>button, panel:(value)=>{panel=value;},
    resolveGet:(value)=>initialGetResolve({[KEY]:value}),
    change(value){for(const fn of listeners)fn({[KEY]:{newValue:value}},'local');},
    mutation(){observer();},
    click(){return buttonEvents.click();}
  };
}
async function checkDomToggle() {
  const f = makePageFixture();
  assert.equal(f.button(),null,'No flash before preference has loaded');
  f.resolveGet(false);
  await tick();
  assert.equal(f.button(),null,'Saved off: button absent');
  f.change(true);
  assert.equal(f.button()?.id,BUTTON_ID,'Enabling shows button immediately');
  assert.equal(f.button().dataset.exportStatus,'idle');
  f.change(false);
  assert.equal(f.button(),null,'Disabling hides button immediately');
  f.change(true);
  assert.ok(f.button(),'Re-enable restores button');

  let finish;
  let options;
  let calls = 0;
  f.context.__ChatGPTObsidianExporter = {start(opts) {
    calls++;
    options=opts;
    f.panel({dataset:{exportStatus:'running'}});
    return new Promise(resolve=>{finish=resolve;});
  }};
  const running = f.click();
  assert.equal(f.button().dataset.exportStatus,'running');
  assert.equal(f.button().disabled,true);
  f.change(false);
  assert.equal(f.button(),null,'Hiding during export leaves no button');
  assert.equal(calls,1,'Hiding does not restart export');
  f.panel({dataset:{exportStatus:'ready'}});
  finish();
  await running;
  assert.equal(calls,1,'Export finishes while button stays hidden');
  assert.equal(options.includeIncomingAttachments,true);
  assert.equal(options.includeAttachments,true);
  assert.equal(options.includeImages,true);
  f.change(true);
  assert.equal(f.button().dataset.exportStatus,'idle');
  f.location.pathname = '/';
  f.mutation();
  await tick();
  assert.equal(f.button(),null,'No button outside conversation route');
  f.location.pathname = '/c/1234567890abcdef';
  f.mutation();
  await tick();
  assert.ok(f.button(),'SPA route change restores button');
  f.location.hostname = 'example.com';
  f.mutation();
  await tick();
  assert.equal(f.button(),null,'Never visible on another site');

  const g = makePageFixture();
  g.resolveGet(true);
  await tick();
  assert.ok(g.button(),'Default-on preference shows button');
  const h = makePageFixture('example.com');
  h.resolveGet(true);
  await tick();
  assert.equal(h.button(),null,'Different origin never shows button');

  const race=makePageFixture();
  race.change(false);
  race.resolveGet(true);
  await tick();
  assert.equal(race.button(),null,'Late storage read cannot overwrite newer setting');
}

function makePopupFixture(preference) {
  const elements=new Map();
  const ids=['export','status','attachments','images','incoming','pace','paceSeconds','log','limit','showExportButton'];
  for(const id of ids)elements.set(id,{
    id, checked:['attachments','images','pace','showExportButton'].includes(id),
    value:id==='paceSeconds'?'1.5':'100',
    disabled:false, textContent:'',
    events:{},addEventListener(name,fn){this.events[name]=fn;}
  });
  const writes=[];
  const scripts=[];
  const chrome={
    storage:{local:{
      get:async()=>({[KEY]:preference}),
      set:async value=>{writes.push(value);}
    }},
    tabs:{query:async()=>[{id:42,url:'https://chatgpt.com/c/1234567890abcdef'}]},
    scripting:{executeScript:async args=>{scripts.push(args);}}
  };
  const context=vm.createContext({
    chrome,document:{getElementById(id){return elements.get(id);}},
    localStorage:{getItem(){return null;},setItem(){}},
    console
  });
  vm.runInContext(POPUP,context,{filename:'popup.js'});
  return {elements,writes,scripts};
}
async function checkPopupToggle() {
  const f=makePopupFixture(false);
  const toggle=f.elements.get('showExportButton');
  assert.equal(toggle.disabled,true,'Prevent toggling before stored preference is loaded');
  await tick();
  assert.equal(toggle.checked,false,'Popup reflects saved off state');
  assert.equal(toggle.disabled,false);
  toggle.checked=true;
  await toggle.events.change();
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0][KEY],true,'Toggle persists via Chrome storage');
  toggle.checked=false;
  await toggle.events.change();
  assert.equal(f.writes.at(-1)[KEY],false);
  await f.elements.get('export').events.click();
  assert.equal(f.scripts.length,2,'Manual Popup export remains available with DOM button hidden');
}
(async()=>{
  await checkDomToggle();
  await checkPopupToggle();
  console.log('PASS DOM/Popup toggle: default-on, no flash, hide/show, persistence, SPA, concurrent export');
})().catch(e=>{console.error(e);process.exitCode=1;});
