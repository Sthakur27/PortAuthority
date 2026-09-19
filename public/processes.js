(() => {
  const $=s=>document.querySelector(s);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bytes=n=>n>=1024**3?`${(n/1024**3).toFixed(2)} GB`:`${(n/1024**2).toFixed(0)} MB`;
  let data=null,active=false,busy=false,loading=false,selected=new Map();
  const storageKey='port-authority.quick-quit.v1';
  let saved=new Map();
  function loadSaved() {
    try {
      const entries=JSON.parse(localStorage.getItem(storageKey)||'[]');
      if(!Array.isArray(entries)||entries.some(e=>!e||typeof e.key!=='string'||typeof e.name!=='string'))throw new Error('Invalid saved apps');
      saved=new Map(entries.map(e=>[e.key,e.name]));
      $('#quickQuitStorageStatus').textContent='';
    } catch { $('#quickQuitStorageStatus').textContent='Saved choices could not be read. Changes will be kept for this session unless browser storage becomes available.'; }
  }
  function saveChoices() {
    try {localStorage.setItem(storageKey,JSON.stringify([...saved].map(([key,name])=>({key,name}))));$('#quickQuitStorageStatus').textContent='';}
    catch {$('#quickQuitStorageStatus').textContent='Browser storage is unavailable. These choices will only last for this session.';}
  }
  const quickGroups=()=> (data?.groups||[]).filter(g=>g.kind==='App'&&!g.protected&&saved.has(g.key));
  const chartColors=['#087fdb','#904bd8','#df6840','#008577','#b34683','#8b6500'];
  function renderMemory() {
    const m=data?.memory;
    if(!m){$('#memoryOverview').innerHTML='<h3>Memory overview unavailable</h3><p>Could not read system memory. App estimates remain available below.</p>';return;}
    const labels={normal:'Room to breathe',elevated:'RAM getting full',high:'RAM nearly full'};
    const parts=[['Apps & services',m.apps,'#087fdb'],['System / wired',m.system,'#244669'],['Compressed',m.compressed,'#904bd8'],['Cache / free',m.available,'#b8e4d6']];
    $('#memoryOverview').innerHTML=`<div class="memory-heading"><div><p class="section-number">MAC MEMORY · LIVE</p><strong class="memory-number">${Math.round(m.percent)}% <span>used</span></strong><p>${bytes(m.used)} used / ${bytes(m.total)} total RAM</p></div><div class="memory-signal ${m.level}"><span></span>${labels[m.level]}</div></div><div class="memory-bar" role="img" aria-label="${Math.round(m.percent)} percent RAM used. ${parts.map(([name,value])=>`${name}: ${bytes(value)}`).join('. ')}">${parts.map(([name,value])=>`<span title="${name}: ${bytes(value)}"></span>`).join('')}</div><div class="memory-legend">${parts.map(([name,value])=>`<span><i></i>${name}<b>${bytes(value)}</b></span>`).join('')}</div><p class="process-note">Estimated physical RAM breakdown from macOS. Apps & services = non-purgeable anonymous memory; wired includes system and app allocations. Cache / free is the remaining RAM. Usage indicator: amber ≥75%, red ≥90%; not macOS Memory Pressure.</p><p id="memoryFreshness" class="process-note">Updated ${new Date(data.scannedAt).toLocaleTimeString()}</p>`;
    // Set individual CSS properties from trusted data; keep the strict CSP intact.
    document.querySelectorAll('.memory-bar > span').forEach((el,i)=>{el.style.width=`${parts[i][1]/m.total*100}%`;el.style.backgroundColor=parts[i][2];});
    document.querySelectorAll('.memory-legend i').forEach((el,i)=>{el.style.backgroundColor=parts[i][2];});
  }
  function renderCrewChart(groups) {
    const sorted=[...groups].filter(g=>g.memory>0).sort((a,b)=>b.memory-a.memory);
    const total=sorted.reduce((sum,g)=>sum+g.memory,0);
    if(!total){$('#quickQuitChart').innerHTML='<div class="crew-donut empty" aria-hidden="true"><span>—</span></div><p class="process-note">Your crew’s memory breakdown will appear here once marked apps are running.</p>';return;}
    const slices=sorted.slice(0,5);
    if(sorted.length>5)slices.push({name:`Other marked apps (${sorted.length-5})`,memory:sorted.slice(5).reduce((sum,g)=>sum+g.memory,0)});
    let start=0;
    const stops=slices.map((g,i)=>{const end=start+g.memory/total*100;const stop=`${chartColors[i]} ${start}% ${end}%`;start=end;return stop;});
    $('#quickQuitChart').innerHTML=`<div class="crew-donut" role="img" aria-label="Quick quit crew: ${bytes(total)} estimated resident memory. ${slices.map(g=>`${escape(g.name)}: ${bytes(g.memory)}`).join('. ')}"><span><strong>${bytes(total)}</strong><small>crew total</small></span></div><div class="crew-legend">${slices.map(g=>`<div><i></i><span>${escape(g.name)}</span><b>${bytes(g.memory)}</b><small>${Math.round(g.memory/total*100)}%</small></div>`).join('')}<p class="process-note">Share of your running, quittable crew’s estimated memory—not a share of total RAM. Shared pages can be counted twice.</p></div>`;
    document.querySelectorAll('.crew-donut').forEach(el=>{el.style.backgroundImage=`conic-gradient(${stops.join(',')})`;});
    document.querySelectorAll('.crew-legend i').forEach((el,i)=>{el.style.backgroundColor=chartColors[i];});
  }
  function renderQuick() {
    const groups=quickGroups();
    renderCrewChart(groups);
    $('#processFreeMemory').disabled=busy||loading||!groups.length;
    $('#processFreeMemory').textContent=busy?'Working…':'Free up memory';
    $('#quickQuitSummary').textContent=groups.length?`${groups.length} marked ${groups.length===1?'app':'apps'} running · ${bytes(groups.reduce((s,g)=>s+g.memory,0))} estimated memory (not guaranteed recoverable)`:saved.size?'No marked apps are currently available to quit.':'Turn on Quick quit next to an app to add it here.';
    $('#quickQuitApps').innerHTML=[...saved].map(([key,name])=>{
      const group=data?.groups.find(g=>g.kind==='App'&&g.key===key);
      return `<span class="quick-quit-chip"><span><strong>${escape(name)}</strong><small>${group?(group.protected?'Protected':`${bytes(group.memory)} · running`):'Not running'}</small></span><button data-remove-quick="${escape(key)}" aria-label="Remove ${escape(name)} from Quick quit" ${busy?'disabled':''}>×</button></span>`;
    }).join('');
  }
  loadSaved();
  const visible=()=> (data?.groups||[]).filter(g=>($('#processKind').value==='all'||g.kind===$('#processKind').value)&&`${g.name} ${g.executable} ${g.pids.join(' ')}`.toLowerCase().includes($('#processSearch').value.toLowerCase())).sort((a,b)=>$('#processSort').value==='name'?a.name.localeCompare(b.name):b[$('#processSort').value]-a[$('#processSort').value]);
  function bulk() {
    const groups=[...selected.values()];
    $('#processSelected').textContent=groups.length?`${groups.length} selected · ${bytes(groups.reduce((s,g)=>s+g.memory,0))} estimated memory`:'Nothing selected';
    $('#processQuit').disabled=busy||!groups.length;$('#processForce').disabled=busy||!groups.length;
    const rows=visible().filter(g=>!g.protected);
    $('#processSelectAll').checked=rows.length>0&&rows.every(g=>selected.has(g.key));
    $('#processSelectAll').indeterminate=rows.some(g=>selected.has(g.key))&&!$('#processSelectAll').checked;
  }
  function render() {
    renderQuick();
    if(!data)return;
    renderMemory();
    $('#processSummary').textContent=`${bytes(data.totalMemory)} installed RAM · ${data.groups.length} app / developer groups · Updated ${new Date(data.scannedAt).toLocaleTimeString()}`;
    const rows=visible();
    $('#processRows').innerHTML=rows.length?rows.map(g=>`<tr><td><input type="checkbox" data-key="${escape(g.key)}" aria-label="Select ${escape(g.name)}" ${selected.has(g.key)?'checked':''} ${g.protected||busy?'disabled':''}></td><td><strong>${escape(g.name)}</strong><small>${escape(g.kind)} · ${escape(g.executable)}</small>${g.protected?`<small>${escape(g.reason)}</small>`:''}</td><td><b>${bytes(g.memory)}</b></td><td>${g.cpu.toFixed(1)}%</td><td><details><summary>${g.count} ${g.count===1?'process':'processes'}</summary><small>PID ${g.pids.join(', ')}</small></details></td><td>${g.kind==='App'?`<label class="quick-toggle"><input type="checkbox" role="switch" data-quick="${escape(g.key)}" aria-label="Quick quit ${escape(g.name)}" ${saved.has(g.key)?'checked':''} ${busy||g.protected?'disabled':''}><span aria-hidden="true"></span></label>`:'<small>Apps only</small>'}</td></tr>`).join(''):'<tr><td colspan="6">No matching apps or processes.</td></tr>';
    bulk();
  }
  async function refresh() {
    if(loading||busy)return;loading=true;renderQuick();
    try {const response=await fetch('/api/processes',{cache:'no-store'});if(!response.ok)throw new Error('Could not read processes');data=await response.json();
      // Keep selection only for the same process identities; newly spawned processes need a new selection.
      for(const [key,old] of selected){const fresh=data.groups.find(g=>g.key===key&&!g.protected&&g.identity===old.identity);if(fresh)selected.set(key,fresh);else selected.delete(key);}
      render();
      $('#processStatus').textContent='';
    } catch(e){$('#processStatus').textContent=`${e.message}. Last successful data may be stale.`;$('#memoryOverview').innerHTML='<h3>Memory reading unavailable</h3><p>Refresh to try again. Previous readings may be stale.</p>';}finally{loading=false;renderQuick();}
  }
  async function stop(mode,quick=false) {
    if(busy||(quick&&loading))return;
    let groups=[...selected.values()];busy=true;render();
    try{
      if(quick){
        // Resolve remembered app paths to fresh, protected-checked process tokens.
        const scan=await fetch('/api/processes',{cache:'no-store'});
        if(!scan.ok)throw new Error('Could not refresh apps; nothing was quit');
        data=await scan.json();groups=quickGroups();
      }
      if(!groups.length){$('#processStatus').textContent='No marked apps are currently available to quit.';return;}
      const tokens=groups.map(g=>g.token);
      const response=await fetch('/api/processes/stop',{method:'POST',headers:{'Content-Type':'application/json','X-Port-Authority':'1'},body:JSON.stringify({tokens,mode})});const result=await response.json();if(!response.ok)throw new Error(result.error);if(!quick)selected.clear();busy=false;await refresh();$('#processStatus').textContent=result.results.map(r=>`${r.name}: ${r.status}`).join(' · ');}
    catch(e){$('#processStatus').textContent=e.message;}finally{busy=false;render();}
  }
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
    active=button.dataset.view==='processes';$('#processView').hidden=!active;
    document.querySelectorAll('main > .hero, main > .stats, main > .board, main > .tunnel-yard').forEach(el=>el.hidden=active);
    document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
    if(active)refresh();
  }));
  $('#processRows').addEventListener('change',event=>{const key=event.target.dataset.key;if(!key)return;const g=data.groups.find(g=>g.key===key);if(event.target.checked&&g&&!g.protected)selected.set(key,g);else selected.delete(key);bulk();});
  $('#processRows').addEventListener('change',event=>{
    const key=event.target.dataset.quick;if(!key||busy)return;
    const group=data.groups.find(g=>g.key===key&&g.kind==='App'&&!g.protected);if(!group)return;
    if(event.target.checked)saved.set(key,group.name);else saved.delete(key);
    saveChoices();renderQuick();
  });
  $('#quickQuitApps').addEventListener('click',event=>{const button=event.target.closest('[data-remove-quick]');if(!button||busy)return;saved.delete(button.dataset.removeQuick);saveChoices();render();});
  $('#processFreeMemory').addEventListener('click',()=>stop('quit',true));
  window.addEventListener('storage',event=>{if(event.key===storageKey||event.key===null){loadSaved();render();}});
  $('#processSelectAll').addEventListener('change',event=>{visible().filter(g=>!g.protected).forEach(g=>event.target.checked?selected.set(g.key,g):selected.delete(g.key));render();});
  ['processSearch','processKind','processSort'].forEach(id=>$('#'+id).addEventListener('input',render));
  $('#processRefresh').addEventListener('click',refresh);$('#processQuit').addEventListener('click',()=>stop('quit'));
  $('#processForce').addEventListener('click',()=>{$('#forceNames').textContent=[...selected.values()].map(g=>g.name).join(', ');$('#forceDialog').showModal();});
  $('#forceCancel').addEventListener('click',()=>$('#forceDialog').close());$('#forceConfirm').addEventListener('click',()=>{$('#forceDialog').close();stop('force');});
  setInterval(()=>{if(active&&!document.hidden&&!$('#forceDialog').open&&!$('#processRows').contains(document.activeElement)&&!$('#processRows').matches(':hover'))refresh();},5000);
})();
