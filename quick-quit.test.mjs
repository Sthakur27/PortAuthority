import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('./public/processes.js',import.meta.url),'utf8');
const app=(name,extra={})=>({key:`/Applications/${name}.app`,name,kind:'App',token:name,identity:name,memory:1024**3,cpu:0,count:1,pids:[123],executable:name,protected:false,...extra});
function harness(storage=new Map(),storageFails=false,path='/') {
  const nodes=new Map(),calls=[],views=[{dataset:{view:'processes'}},{dataset:{view:'ports'}}];
  const windowEvents={},location={pathname:path},history=[];
  let groups=[app('Spotify'),app('Loom'),app('Codex',{protected:true})];
  function element(node={}) {return Object.assign(node,{textContent:'',innerHTML:'',value:'',listeners:{},addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);},setAttribute(){},removeAttribute(){},getAttribute(){return '/'+this.dataset.view;},contains(){return false;},matches(){return false;},async fire(type,event={button:0,preventDefault(){}}){for(const fn of this.listeners[type]||[])await fn(event);}});}
  views.forEach(element);
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  get('#processKind').value='all';get('#processSort').value='memory';
  vm.runInNewContext(source,{
    document:{querySelector:get,querySelectorAll:selector=>selector==='[data-view]'?views:[]},
    window:{location,history:{pushState(_state,_title,url){history.push(url);location.pathname=url;}},addEventListener(name,fn){windowEvents[name]=fn;}},setInterval(){},
    localStorage:{getItem:key=>{if(storageFails)throw Error();return storage.get(key)||null;},setItem:(key,value)=>{if(storageFails)throw Error();storage.set(key,value);}},
    fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.endsWith('/stop')?{results:[{name:'Spotify',status:'requested'}]}:{groups,totalMemory:16*1024**3,scannedAt:new Date().toISOString()}};}
  });
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  return {get,calls,storage,location,history,views,async pop(path){location.pathname=path;windowEvents.popstate();await settle();},setGroups(value){groups=value;},async open(){await views[0].fire('click');await settle();},async toggle(name,checked=true){await get('#processRows').fire('change',{target:{dataset:{quick:`/Applications/${name}.app`},checked}});},async free(){await get('#processFreeMemory').fire('click');await settle();}};
}

test('routes support direct entry, navigation and back/forward without duplicate history',async()=>{
  const h=harness(new Map(),false,'/processes/');
  assert.equal(h.get('#processView').hidden,false);
  await h.views[1].fire('click');assert.equal(h.location.pathname,'/ports');assert.equal(h.get('#processView').hidden,true);
  await h.open();assert.equal(h.location.pathname,'/processes');
  await h.open();assert.equal(h.history.length,2);
  await h.pop('/ports');assert.equal(h.get('#processView').hidden,true);
  await h.pop('/processes');assert.equal(h.get('#processView').hidden,false);
  await h.views[1].fire('click',{button:0,metaKey:true,preventDefault(){throw Error('Must preserve modifier clicks');}});
  assert.equal(h.location.pathname,'/processes');
});

test('remembers apps across reloads, hides closed apps, and shows them again when running',async()=>{
  const first=harness();await first.open();await first.toggle('Spotify');
  const second=harness(first.storage);second.setGroups([]);await second.open();
  assert.equal(second.get('#quickQuitApps').innerHTML,'');
  assert.match(second.get('#quickQuitSummary').textContent,/No marked apps/);
  assert.equal(second.get('#processFreeMemory').disabled,true);
  assert.match([...first.storage.values()][0],/Spotify/);
  second.setGroups([app('Spotify'),app('Loom')]);
  await second.get('#processRefresh').fire('click');
  assert.match(second.get('#quickQuitApps').innerHTML,/Spotify/);
  assert.doesNotMatch(second.get('#quickQuitApps').innerHTML,/Loom|Not running/);
  assert.equal(second.get('#processFreeMemory').disabled,false);
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
  assert.doesNotMatch(h.get('#quickQuitApps').innerHTML,/Loom|Codex|Protected/);
  assert.match(h.get('#processStatus').textContent,/requested/);
  assert.match(h.get('#quickQuitChart').innerHTML,/crew total/);
  assert.match(h.get('#quickQuitChart').innerHTML,/Spotify/);
  assert.doesNotMatch(h.get('#quickQuitChart').innerHTML,/Loom/);
});

test('does not send a stop request when marked app has closed',async()=>{
  const h=harness();await h.open();await h.toggle('Spotify');h.setGroups([]);await h.free();
  assert.equal(h.calls.filter(c=>c.url.endsWith('/stop')).length,0);
  assert.equal(h.get('#processFreeMemory').disabled,true);
  assert.match(h.get('#quickQuitChart').innerHTML,/breakdown will appear/);
});

test('storage failures keep session choices and show an honest warning',async()=>{
  const h=harness(new Map(),true);await h.open();await h.toggle('Spotify');
  assert.match(h.get('#quickQuitApps').innerHTML,/Spotify/);
  assert.match(h.get('#quickQuitStorageStatus').textContent,/only last for this session/);
});

test('top CPU users rank independently of filters and quit only the clicked process',async()=>{
  const h=harness();h.setGroups([app('Spotify',{cpu:150}),app('Loom',{cpu:20}),app('Codex',{cpu:200,protected:true}),app('Idle',{cpu:0}),app('New',{cpu:null})]);await h.open();
  h.get('#processSearch').value='nothing';await h.get('#processSearch').fire('input');
  const html=h.get('#cpuUsers').innerHTML;
  assert.ok(html.indexOf('Codex')<html.indexOf('Spotify'));
  assert.match(html,/150.0%/);assert.match(html,/disabled>Protected/);
  assert.doesNotMatch(html,/Idle|>New</);
  await h.get('#processRows').fire('change',{target:{dataset:{key:'/Applications/Loom.app'},checked:true}});
  await h.get('#cpuUsers').fire('click',{target:{closest:()=>({dataset:{cpuQuit:'/Applications/Spotify.app'}})}});
  const stops=h.calls.filter(c=>c.url.endsWith('/stop'));
  assert.deepEqual(JSON.parse(stops[0].options.body),{tokens:['Spotify'],mode:'quit'});
  assert.match(h.get('#processSelected').textContent,/1 selected/);
  await h.get('#cpuUsers').fire('click',{target:{closest:()=>({dataset:{cpuQuit:'/Applications/Codex.app'}})}});
  assert.equal(h.calls.filter(c=>c.url.endsWith('/stop')).length,1);
});
