import http from 'node:http';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, 'public');
const HOST = '127.0.0.1';
const DASHBOARD_PORT = Number(process.env.PORT_AUTHORITY_PORT || 4377);
const RANGE_START = 3000;
const RANGE_END = 3999;
const GIT_CACHE_TTL = 10_000;
const gitCache = new Map();
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

async function run(file, args) {
  try {
    const { stdout } = await execFileAsync(file, args, { maxBuffer: 1024 * 1024, timeout: 4000 });
    return stdout.trim();
  } catch (error) {
    return typeof error.stdout === 'string' ? error.stdout.trim() : '';
  }
}

function parseLsof(output) {
  const found = [];
  let pid = null;
  let command = '';
  for (const line of output.split('\n')) {
    const field = line[0];
    const value = line.slice(1);
    if (field === 'p') pid = Number(value);
    if (field === 'c') command = value;
    if (field === 'n' && pid) {
      const match = value.match(/:(\d+)(?:\s|$)/);
      if (match) found.push({ pid, command, port: Number(match[1]), endpoint: value });
    }
  }
  return [...new Map(found.map((item) => [`${item.pid}:${item.port}`, item])).values()];
}

function sourceFrom(commands) {
  const joined = commands.join(' ').toLowerCase();
  if (/claude(?:\.app)?|\.claude(?:\/|\s|$)/.test(joined)) return { source: 'Claude', sourceKey: 'claude' };
  if (/codex(?:\.app)?|\.codex(?:\/|\s|$)|openai.*codex/.test(joined)) return { source: 'Codex', sourceKey: 'codex' };
  if (/cursor(?:\.app)?|visual studio code|code helper|vscode/.test(joined)) return { source: 'Editor', sourceKey: 'editor' };
  if (/terminal(?:\.app)?|iterm|warp(?:\.app)?|ghostty|wezterm|alacritty|kitty|tmux/.test(joined)) return { source: 'Terminal', sourceKey: 'terminal' };
  return { source: 'Other', sourceKey: 'other' };
}

async function gitDetails(cwd) {
  if (!cwd) return null;
  const cached = gitCache.get(cwd);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value = null;
  const insideWorkTree = await run('/usr/bin/git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree']);
  if (insideWorkTree === 'true') {
    const root = await run('/usr/bin/git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
    const branch = await run('/usr/bin/git', ['-C', cwd, 'symbolic-ref', '--quiet', '--short', 'HEAD']);
    if (branch) {
      value = { branch, detached: false, root };
    } else {
      const commit = await run('/usr/bin/git', ['-C', cwd, 'rev-parse', '--short', 'HEAD']);
      if (commit) value = { branch: commit, detached: true, root };
    }
  }

  gitCache.set(cwd, { value, expiresAt: Date.now() + GIT_CACHE_TTL });
  return value;
}

async function processDetails(listener) {
  const ancestry = [];
  let currentPid = listener.pid;
  let first = null;
  for (let depth = 0; currentPid > 1 && depth < 12; depth += 1) {
    const row = await run('/bin/ps', ['-p', String(currentPid), '-o', 'ppid=,user=,etime=,command=']);
    if (!row) break;
    const match = row.match(/^\s*(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/s);
    if (!match) break;
    const details = { ppid: Number(match[1]), user: match[2], elapsed: match[3], command: match[4] };
    if (!first) first = details;
    ancestry.push(details.command);
    if (details.ppid === currentPid) break;
    currentPid = details.ppid;
  }
  const cwdOutput = await run('/usr/sbin/lsof', ['-a', '-p', String(listener.pid), '-d', 'cwd', '-Fn']);
  const cwd = cwdOutput.split('\n').find((line) => line.startsWith('n'))?.slice(1) || '';
  const git = await gitDetails(cwd);
  return { ...listener, ...sourceFrom(ancestry), user: first?.user || '', elapsed: first?.elapsed || '', fullCommand: first?.command || listener.command, cwd, git };
}

async function getPorts() {
  const output = await run('/usr/sbin/lsof', ['-nP', `-iTCP:${RANGE_START}-${RANGE_END}`, '-sTCP:LISTEN', '-Fpcn']);
  const listeners = parseLsof(output).filter(({ port }) => port >= RANGE_START && port <= RANGE_END);
  return Promise.all(listeners.map(processDetails)).then((items) => items.sort((a, b) => a.port - b.port));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new Error('Request too large');
  }
  return JSON.parse(body || '{}');
}

async function handleKill(req, res) {
  if (req.headers['x-port-authority'] !== '1') return sendJson(res, 403, { error: 'Request rejected' });
  const { pid, port } = await readJson(req);
  if (!Number.isInteger(pid) || !Number.isInteger(port) || pid <= 1 || pid === process.pid) return sendJson(res, 400, { error: 'Invalid process' });
  const live = await getPorts();
  if (!live.some((item) => item.pid === pid && item.port === port)) return sendJson(res, 409, { error: `Port ${port} is no longer owned by PID ${pid}` });
  try {
    process.kill(pid, 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 800));
    const stillListening = (await getPorts()).some((item) => item.pid === pid && item.port === port);
    if (stillListening) process.kill(pid, 'SIGKILL');
    return sendJson(res, 200, { ok: true, signal: stillListening ? 'SIGKILL' : 'SIGTERM' });
  } catch (error) {
    return sendJson(res, 500, { error: error?.code === 'EPERM' ? 'macOS denied permission to stop that process' : 'The process could not be stopped' });
  }
}

async function serveFile(pathname, res) {
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!/^[a-zA-Z0-9._/-]+$/.test(relative) || relative.includes('..')) { res.writeHead(404); return res.end('Not found'); }
  try {
    const file = await readFile(join(PUBLIC, relative));
    res.writeHead(200, {
      'Content-Type': types[extname(relative)] || 'application/octet-stream',
      'Cache-Control': relative === 'index.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
    });
    res.end(file);
  } catch { res.writeHead(404); res.end('Not found'); }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${DASHBOARD_PORT}`);
    if (req.method === 'GET' && url.pathname === '/api/ports') return sendJson(res, 200, { ports: await getPorts(), scannedAt: new Date().toISOString() });
    if (req.method === 'POST' && url.pathname === '/api/kill') return await handleKill(req, res);
    if (req.method === 'GET' || req.method === 'HEAD') return await serveFile(url.pathname, res);
    res.writeHead(405, { Allow: 'GET, HEAD, POST' }); res.end('Method not allowed');
  } catch (error) { sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unexpected error' }); }
});

server.listen(DASHBOARD_PORT, HOST, () => console.log(`Port Authority is running at http://${HOST}:${DASHBOARD_PORT}`));
