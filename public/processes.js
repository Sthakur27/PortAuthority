(() => {
  const $=s=>document.querySelector(s);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bytes=n=>n>=1024**3?`${(n/1024**3).toFixed(2)} GB`:`${(n/1024**2).toFixed(0)} MB`;
  let data=null,active=false,busy=false,loading=false,selected=new Map();
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
    if(!data)return;
    $('#processSummary').textContent=`${bytes(data.totalMemory)} installed RAM · ${data.groups.length} app / developer groups · Updated ${new Date(data.scannedAt).toLocaleTimeString()}`;
    const rows=visible();
    $('#processRows').innerHTML=rows.length?rows.map(g=>`<tr><td><input type="checkbox" data-key="${escape(g.key)}" aria-label="Select ${escape(g.name)}" ${selected.has(g.key)?'checked':''} ${g.protected||busy?'disabled':''}></td><td><strong>${escape(g.name)}</strong><small>${escape(g.kind)} · ${escape(g.executable)}</small>${g.protected?`<small>${escape(g.reason)}</small>`:''}</td><td><b>${bytes(g.memory)}</b></td><td>${g.cpu.toFixed(1)}%</td><td><details><summary>${g.count} ${g.count===1?'process':'processes'}</summary><small>PID ${g.pids.join(', ')}</small></details></td></tr>`).join(''):'<tr><td colspan="5">No matching apps or processes.</td></tr>';
    bulk();
  }
  async function refresh() {
    if(loading||busy)return;loading=true;
    try {const response=await fetch('/api/processes',{cache:'no-store'});if(!response.ok)throw new Error('Could not read processes');data=await response.json();
      // Keep selection only for the same process identities; newly spawned processes need a new selection.
      for(const [key,old] of selected){const fresh=data.groups.find(g=>g.key===key&&!g.protected&&g.identity===old.identity);if(fresh)selected.set(key,fresh);else selected.delete(key);}
      render();
      $('#processStatus').textContent='';
    } catch(e){$('#processStatus').textContent=`${e.message}. Last successful data may be stale.`;}finally{loading=false;}
  }
  async function stop(mode) {
    const tokens=[...selected.values()].map(g=>g.token);busy=true;render();
    try{const response=await fetch('/api/processes/stop',{method:'POST',headers:{'Content-Type':'application/json','X-Port-Authority':'1'},body:JSON.stringify({tokens,mode})});const result=await response.json();if(!response.ok)throw new Error(result.error);selected.clear();busy=false;await refresh();$('#processStatus').textContent=result.results.map(r=>`${r.name}: ${r.status}`).join(' · ');}
    catch(e){$('#processStatus').textContent=e.message;}finally{busy=false;render();}
  }
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
    active=button.dataset.view==='processes';$('#processView').hidden=!active;
    document.querySelectorAll('main > .hero, main > .stats, main > .board, main > .tunnel-yard').forEach(el=>el.hidden=active);
    document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
    if(active)refresh();
  }));
  $('#processRows').addEventListener('change',event=>{const key=event.target.dataset.key;if(!key)return;const g=data.groups.find(g=>g.key===key);if(event.target.checked&&g&&!g.protected)selected.set(key,g);else selected.delete(key);bulk();});
  $('#processSelectAll').addEventListener('change',event=>{visible().filter(g=>!g.protected).forEach(g=>event.target.checked?selected.set(g.key,g):selected.delete(g.key));render();});
  ['processSearch','processKind','processSort'].forEach(id=>$('#'+id).addEventListener('input',render));
  $('#processRefresh').addEventListener('click',refresh);$('#processQuit').addEventListener('click',()=>stop('quit'));
  $('#processForce').addEventListener('click',()=>{$('#forceNames').textContent=[...selected.values()].map(g=>g.name).join(', ');$('#forceDialog').showModal();});
  $('#forceCancel').addEventListener('click',()=>$('#forceDialog').close());$('#forceConfirm').addEventListener('click',()=>{$('#forceDialog').close();stop('force');});
  setInterval(()=>{if(active&&!document.hidden&&!$('#forceDialog').open&&!$('#processRows').contains(document.activeElement)&&!$('#processRows').matches(':hover'))refresh();},5000);
})();
