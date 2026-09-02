const state = { ports: [], query: '', killing: new Set() };
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
  return `<article class="port-row ${isKilling ? 'is-killing' : ''}">
    <div class="port-cell">${vesselFor(item.sourceKey)}<small>BERTH</small><strong>${item.port}</strong><span class="owner-badge owner-${item.sourceKey}">${iconFor(item.sourceKey)} ${escapeHtml(item.source)}</span></div>
    <div class="process-cell"><div class="process-title"><span class="pulse-dot"></span>${escapeHtml(item.command)}</div><code title="${escapeHtml(item.fullCommand)}">${escapeHtml(commandLabel(item.fullCommand))}</code><span class="metadata">PID ${item.pid} <i></i> ${escapeHtml(item.elapsed || '—')} <i></i> ${escapeHtml(item.user || '—')}</span></div>
    <div class="project-cell"><strong>${escapeHtml(project)}</strong><span title="${escapeHtml(item.cwd)}">${escapeHtml(shortPath(item.cwd))}</span></div>
    <div class="action-cell"><a class="open-button" href="http://localhost:${item.port}" target="_blank" rel="noreferrer" aria-label="Board server on port ${item.port}">Board ↗</a><button class="kill-button" type="button" data-pid="${item.pid}" data-port="${item.port}" ${isKilling ? 'disabled' : ''} aria-label="Clear ${escapeHtml(project)} from port ${item.port}"><span>${isKilling ? 'Casting off…' : 'Clear berth'}</span><b>×</b></button></div>
  </article>`;
}

function render() {
  const query = state.query.trim().toLowerCase();
  const visible = state.ports.filter((item) => !query || `${item.port} ${item.source} ${item.cwd} ${item.fullCommand}`.toLowerCase().includes(query));
  $('#usedCount').textContent = String(state.ports.length).padStart(2, '0');
  $('#stampCount').textContent = String(state.ports.length).padStart(2, '0');
  $('#codexCount').textContent = String(state.ports.filter((item) => item.sourceKey === 'codex').length).padStart(2, '0');
  $('#claudeCount').textContent = String(state.ports.filter((item) => item.sourceKey === 'claude').length).padStart(2, '0');
  list.innerHTML = visible.length ? visible.map(rowTemplate).join('') : `<div class="empty-state"><span>${query ? '⌕' : '⚓'}</span><h3>${query ? 'No vessel answers that signal' : 'The harbor is calm'}</h3><p>${query ? 'Try another berth, crew, or project name.' : 'No vessels are docked on ports 3000–3999 right now.'}</p></div>`;
  list.setAttribute('aria-busy', 'false');
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
$('#searchInput').addEventListener('input', (event) => { state.query = event.target.value; render(); });
refreshButton.addEventListener('click', () => refresh());
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh({ quiet: true }); });
refresh();
setInterval(() => { if (!document.hidden && !state.killing.size) refresh({ quiet: true }); }, 3000);
