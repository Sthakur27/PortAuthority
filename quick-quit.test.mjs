import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('./public/processes.js',import.meta.url),'utf8');
const app=(name,extra={})=>({key:`/Applications/${name}.app`,name,kind:'App',token:name,identity:name,memory:1024**3,cpu:0,count:1,pids:[123],executable:name,protected:false,...extra});
function harness(storage=new Map(),storageFails=false) {
  const nodes=new Map(),calls=[],views=[{dataset:{view:'processes'}}];
  let groups=[app('Spotify'),app('Loom'),app('Codex',{protected:true})];
  function element(node={}) {return Object.assign(node,{textContent:'',innerHTML:'',value:'',listeners:{},addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);},setAttribute(){},contains(){return false;},matches(){return false;},async fire(type,event={}){for(const fn of this.listeners[type]||[])await fn(event);}});}
  views.forEach(element);
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  get('#processKind').value='all';get('#processSort').value='memory';
  vm.runInNewContext(source,{
    document:{querySelector:get,querySelectorAll:selector=>selector==='[data-view]'?views:[]},
    window:{addEventListener(){}},setInterval(){},
    localStorage:{getItem:key=>{if(storageFails)throw Error();return storage.get(key)||null;},setItem:(key,value)=>{if(storageFails)throw Error();storage.set(key,value);}},
    fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.endsWith('/stop')?{results:[{name:'Spotify',status:'requested'}]}:{groups,totalMemory:16*1024**3,scannedAt:new Date().toISOString()}};}
  });
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  return {get,calls,storage,setGroups(value){groups=value;},async open(){await views[0].fire('click');await settle();},async toggle(name,checked=true){await get('#processRows').fire('change',{target:{dataset:{quick:`/Applications/${name}.app`},checked}});},async free(){await get('#processFreeMemory').fire('click');await settle();}};
}

test('remembers apps across reloads and keeps closed apps removable',async()=>{
  const first=harness();await first.open();await first.toggle('Spotify');
  const second=harness(first.storage);second.setGroups([]);await second.open();
  assert.match(second.get('#quickQuitApps').innerHTML,/Spotify/);
  assert.match(second.get('#quickQuitApps').innerHTML,/Not running/);
  assert.equal(second.get('#processFreeMemory').disabled,true);
  await second.get('#quickQuitApps').fire('click',{target:{closest:()=>({dataset:{removeQuick:'/Applications/Spotify.app'}})}});
  assert.equal(second.get('#quickQuitApps').innerHTML,'');
  assert.equal([...first.storage.values()][0],'[]');
});

test('quick quit ignores filters and bulk selection, uses refreshed tokens, skips protected apps',async()=>{
  const h=harness();await h.open();await h.toggle('Spotify');await h.toggle('Loom');await h.toggle('Codex');
  h.get('#processSearch').value='no results';await h.get('#processSearch').fire('input');
  await h.get('#processRows').fire('change',{target:{dataset:{key:'/Applications/Loom.app'},checked:true}});
  h.setGroups([app('Spotify',{token:'fresh-spotify'}),app('Loom',{protected:true}),app('Codex',{protected:true})]);
  await h.free();
  const stops=h.calls.filter(c=>c.url.endsWith('/stop'));
  assert.equal(stops.length,1);
  assert.deepEqual(JSON.parse(stops[0].options.body),{tokens:['fresh-spotify'],mode:'quit'});
  assert.match(h.get('#quickQuitApps').innerHTML,/Spotify/);
  assert.match(h.get('#processStatus').textContent,/requested/);
});

test('does not send a stop request when marked app has closed',async()=>{
  const h=harness();await h.open();await h.toggle('Spotify');h.setGroups([]);await h.free();
  assert.equal(h.calls.filter(c=>c.url.endsWith('/stop')).length,0);
  assert.equal(h.get('#processFreeMemory').disabled,true);
});

test('storage failures keep session choices and show an honest warning',async()=>{
  const h=harness(new Map(),true);await h.open();await h.toggle('Spotify');
  assert.match(h.get('#quickQuitApps').innerHTML,/Spotify/);
  assert.match(h.get('#quickQuitStorageStatus').textContent,/only last for this session/);
});
