const state = { ports: [], query: '', killing: new Set(), ngrok: null, ngrokBusy: new Set() };
const $ = (selector) => document.querySelector(selector);
const list = $('#portList');
const refreshButton = $('#refreshButton');

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function shortPath(path) {
  if (!path) return 'Location unavailable';
  const home = `/Users/${path.split('/')[2]}`;
  return path.startsWith(home) ? path.replace(home, '~') : path;
}

function projectName(path, command) {
  return path ? path.split('/').filter(Boolean).at(-1) : command || 'Unknown project';
}

function commandLabel(command) {
  const clean = command.replace(/^.*?\/(node|python\d*|ruby|bun|deno)\s+/, '$1 ');
  return clean.length > 72 ? `${clean.slice(0, 69)}…` : clean;
}

function iconFor(source) {
  if (source === 'codex') return '<span class="source-glyph">✣</span>';
  if (source === 'claude') return '<span class="source-glyph">AI</span>';
  if (source === 'terminal') return '<span class="source-glyph">›_</span>';
  if (source === 'editor') return '<span class="source-glyph">◇</span>';
  return '<span class="source-glyph">●</span>';
}

function vesselFor(source) {
  return `<span class="row-vessel vessel-${source}"><i></i><b></b><em></em></span>`;
}

function rowTemplate(item) {
  const key = `${item.pid}:${item.port}`;
  const isKilling = state.killing.has(key);
  const project = projectName(item.cwd, item.command);
  const branchLabel = item.git?.detached ? `Detached at ${item.git.branch}` : item.git?.branch;
  const gitBadge = item.git
    ? `<span class="branch-badge ${item.git.detached ? 'is-detached' : ''}" tabindex="0" data-tooltip="${escapeHtml(branchLabel)}" aria-label="Git branch: ${escapeHtml(branchLabel)}"><i>⑂</i><span class="branch-name">${escapeHtml(item.git.branch)}</span></span>`
    : '';
  return `<article class="port-row ${isKilling ? 'is-killing' : ''}">
    <div class="port-cell">${vesselFor(item.sourceKey)}<small>BERTH</small><strong>${item.port}</strong><span class="owner-badge owner-${item.sourceKey}">${iconFor(item.sourceKey)} ${escapeHtml(item.source)}</span></div>
    <div class="process-cell"><div class="process-title"><span class="pulse-dot"></span>${escapeHtml(item.command)}</div><code title="${escapeHtml(item.fullCommand)}">${escapeHtml(commandLabel(item.fullCommand))}</code><span class="metadata">PID ${item.pid} <i></i> ${escapeHtml(item.elapsed || '—')} <i></i> ${escapeHtml(item.user || '—')}</span></div>
    <div class="project-cell"><div class="project-heading"><strong>${escapeHtml(project)}</strong>${gitBadge}</div><span title="${escapeHtml(item.cwd)}">${escapeHtml(shortPath(item.cwd))}</span></div>
    <div class="action-cell"><a class="open-button" href="http://localhost:${item.port}" target="_blank" rel="noreferrer" aria-label="Board server on port ${item.port}">Board ↗</a><button class="kill-button" type="button" data-pid="${item.pid}" data-port="${item.port}" ${isKilling ? 'disabled' : ''} aria-label="Clear ${escapeHtml(project)} from port ${item.port}"><span>${isKilling ? 'Casting off…' : 'Clear berth'}</span><b>×</b></button></div>
  </article>`;
}

function render() {
  const query = state.query.trim().toLowerCase();
  const visible = state.ports.filter((item) => !query || `${item.port} ${item.source} ${item.cwd} ${item.fullCommand} ${item.git?.branch || ''}`.toLowerCase().includes(query));
  $('#usedCount').textContent = String(state.ports.length).padStart(2, '0');
  $('#stampCount').textContent = String(state.ports.length).padStart(2, '0');
  $('#codexCount').textContent = String(state.ports.filter((item) => item.sourceKey === 'codex').length).padStart(2, '0');
  $('#claudeCount').textContent = String(state.ports.filter((item) => item.sourceKey === 'claude').length).padStart(2, '0');
  list.innerHTML = visible.length ? visible.map(rowTemplate).join('') : `<div class="empty-state"><span>${query ? '⌕' : '⚓'}</span><h3>${query ? 'No vessel answers that signal' : 'The harbor is calm'}</h3><p>${query ? 'Try another berth, crew, or project name.' : 'No vessels are docked on ports 3000–3999 right now.'}</p></div>`;
  list.setAttribute('aria-busy', 'false');
  $('#activePorts').innerHTML = state.ports.map((item) => `<option value="${item.port}">${escapeHtml(projectName(item.cwd, item.command))}</option>`).join('');
}

function tunnelTemplate(tunnel) {
  const busy = state.ngrokBusy.has(tunnel.name);
  return `<article class="tunnel-row ${busy ? 'is-busy' : ''}">
    <div class="public-passage"><div class="tunnel-icon"><i></i><b></b></div><div><span class="tunnel-name">${escapeHtml(tunnel.name)}</span><a href="${escapeHtml(tunnel.publicUrl)}" target="_blank" rel="noreferrer">${escapeHtml(tunnel.publicUrl)} ↗</a></div></div>
    <label class="tunnel-target"><span>FORWARDS TO</span><div><b>localhost:</b><input type="number" min="3000" max="3999" value="${tunnel.port || ''}" data-tunnel-port="${escapeHtml(tunnel.name)}" aria-label="Target port for ${escapeHtml(tunnel.name)}"></div></label>
    <div class="tunnel-traffic"><strong>${tunnel.connections}</strong><span>TOTAL CALLS</span><small>${tunnel.activeConnections} active now</small></div>
    <div class="tunnel-actions">
      <button type="button" class="copy-tunnel" data-url="${escapeHtml(tunnel.publicUrl)}" aria-label="Copy public URL for ${escapeHtml(tunnel.name)}">Copy</button>
      <button type="button" class="retarget-tunnel" data-name="${escapeHtml(tunnel.name)}" ${busy ? 'disabled' : ''}>Retarget</button>
      <button type="button" class="close-tunnel" data-name="${escapeHtml(tunnel.name)}" ${busy ? 'disabled' : ''} aria-label="Close tunnel ${escapeHtml(tunnel.name)}">×</button>
    </div>
  </article>`;
}

function renderNgrok() {
  const status = $('#ngrokStatus');
  const ngrokList = $('#ngrokList');
  const data = state.ngrok;
  if (!data) return;

  status.className = `agent-status ${data.online ? 'is-online' : 'is-offline'}`;
  status.innerHTML = `<span></span><div><strong>${data.online ? 'Agent online' : data.installed ? 'Agent sleeping' : 'ngrok missing'}</strong><small>${data.version ? `ngrok ${escapeHtml(data.version)}` : data.installed ? 'Launch a tunnel to wake it' : 'Install ngrok to continue'}</small></div>`;
  $('#tunnelForm').querySelectorAll('input,button').forEach((element) => { element.disabled = !data.installed; });

  if (!data.tunnels.length) {
    ngrokList.innerHTML = `<div class="ngrok-empty"><span>🌊</span><h3>No tunnels at sea</h3><p>${data.installed ? 'Choose an occupied berth above and launch its first public passage.' : 'Install and configure ngrok, then return to launch a tunnel.'}</p></div>`;
  } else {
    ngrokList.innerHTML = data.tunnels.map(tunnelTemplate).join('');
  }
  ngrokList.setAttribute('aria-busy', 'false');
}

function toast(message, type = 'success') {
  const element = document.createElement('div');
  element.className = `toast toast-${type}`;
  element.innerHTML = `<span>${type === 'success' ? '✓' : '!'}</span><p>${escapeHtml(message)}</p>`;
  $('#toastRegion').append(element);
  setTimeout(() => element.remove(), 3600);
}

async function refresh({ quiet = false } = {}) {
  if (!quiet) refreshButton.classList.add('is-spinning');
  try {
    const response = await fetch('/api/ports', { cache: 'no-store' });
    if (!response.ok) throw new Error('Scan failed');
    const data = await response.json();
    state.ports = data.ports;
    $('#lastScan').textContent = new Date(data.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    render();
  } catch {
    if (!quiet) toast('Harbor patrol could not complete its sweep', 'error');
  } finally {
    refreshButton.classList.remove('is-spinning');
  }
}

async function refreshNgrok({ quiet = false } = {}) {
  try {
    const response = await fetch('/api/ngrok', { cache: 'no-store' });
    if (!response.ok) throw new Error('ngrok status failed');
    state.ngrok = await response.json();
    renderNgrok();
  } catch {
    if (!quiet) toast('Could not reach the ngrok harbor office', 'error');
  }
}

async function ngrokAction(name, action) {
  state.ngrokBusy.add(name);
  renderNgrok();
  try {
    await action();
    await refreshNgrok({ quiet: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.ngrokBusy.delete(name);
    renderNgrok();
  }
}

async function killProcess(pid, port) {
  const key = `${pid}:${port}`;
  state.killing.add(key);
  render();
  try {
    const response = await fetch('/api/kill', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Port-Authority': '1' }, body: JSON.stringify({ pid, port }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not stop process');
    state.ports = state.ports.filter((item) => !(item.pid === pid && item.port === port));
    toast(`Berth ${port} cleared — PID ${pid} departed`);
    setTimeout(() => refresh({ quiet: true }), 500);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.killing.delete(key);
    render();
  }
}

list.addEventListener('click', (event) => {
  const button = event.target.closest('.kill-button');
  if (button) killProcess(Number(button.dataset.pid), Number(button.dataset.port));
});

$('#tunnelForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const port = Number(new FormData(form).get('port'));
  const name = String(new FormData(form).get('name') || '').trim() || `port-authority-${port}`;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.querySelector('span').textContent = 'Launching…';
  try {
    const response = await fetch('/api/ngrok/tunnels', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Port-Authority': '1' }, body: JSON.stringify({ port, name }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not launch tunnel');
    toast(`Public passage opened for berth ${port}`);
    form.reset();
    await refreshNgrok({ quiet: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    submit.disabled = false;
    submit.querySelector('span').textContent = 'Launch tunnel';
  }
});

$('#ngrokList').addEventListener('click', async (event) => {
  const copy = event.target.closest('.copy-tunnel');
  if (copy) {
    try { await navigator.clipboard.writeText(copy.dataset.url); toast('Public URL copied to clipboard'); }
    catch { toast('Could not copy the public URL', 'error'); }
    return;
  }

  const close = event.target.closest('.close-tunnel');
  if (close) {
    const name = close.dataset.name;
    await ngrokAction(name, async () => {
      const response = await fetch(`/api/ngrok/tunnels/${encodeURIComponent(name)}`, { method: 'DELETE', headers: { 'X-Port-Authority': '1' } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not close tunnel');
      toast(`${name} returned to harbor`);
    });
    return;
  }

  const retarget = event.target.closest('.retarget-tunnel');
  if (retarget) {
    const name = retarget.dataset.name;
    const input = document.querySelector(`[data-tunnel-port="${CSS.escape(name)}"]`);
    const port = Number(input.value);
    await ngrokAction(name, async () => {
      const response = await fetch(`/api/ngrok/tunnels/${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Port-Authority': '1' }, body: JSON.stringify({ port }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not retarget tunnel');
      toast(`${name} now sails to berth ${port}`);
    });
  }
});
$('#searchInput').addEventListener('input', (event) => { state.query = event.target.value; render(); });
refreshButton.addEventListener('click', () => refresh());
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh({ quiet: true }); });
refresh();
refreshNgrok();
setInterval(() => { if (!document.hidden && !state.killing.size) refresh({ quiet: true }); }, 3000);
setInterval(() => { if (!document.hidden && !state.ngrokBusy.size) refreshNgrok({ quiet: true }); }, 5000);
