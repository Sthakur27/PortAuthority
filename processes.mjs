import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { totalmem } from 'node:os';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readMemory } from './memory.mjs';
const exec = promisify(execFile);
const tickets = new Map();

export function parseProcesses(text) {
  return text.split('\n').flatMap(line => {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/);
    return m ? [{ pid:+m[1], ppid:+m[2], uid:+m[3], memory:+m[4]*1024, cpu:+m[5], started:m[6].replace(/\s+/g,' '), executable:m[7] }] : [];
  });
}
async function scan() {
  const { stdout } = await exec('/bin/ps', ['-axo','pid=,ppid=,uid=,rss=,pcpu=,lstart=,comm='], { env:{...process.env,LC_ALL:'C'}, maxBuffer:8*1024*1024, timeout:5000 });
  return parseProcesses(stdout);
}
export function groupProcesses(rows, uid, selfPid) {
  const byPid = new Map(rows.map(p=>[p.pid,p]));
  const protectedPids = new Set([1,selfPid]);
  let ancestor = byPid.get(selfPid);
  while(ancestor && !protectedPids.has(ancestor.ppid)) { protectedPids.add(ancestor.ppid); ancestor=byPid.get(ancestor.ppid); }
  const groups = new Map();
  for(const p of rows) {
    if(p.uid!==uid || p.pid<=1) continue;
    // Only user-facing app bundles and known development runtimes are actionable.
    const app = p.executable.match(/^((?:\/Applications\/|\/Users\/[^/]+\/|\/System\/Applications\/).*?\.app)\//)?.[1];
    const dev = /^(node|bun|deno|python[\d.]*|ruby|java|ngrok|claude|codex|next-server.*)$/.test(basename(p.executable)) && !p.executable.startsWith('/System/');
    if(!app && !dev) continue;
    const key = app || `pid:${p.pid}`;
    if(!groups.has(key)) groups.set(key,{ key, name:app?basename(app,'.app'):basename(p.executable), kind:app?'App':'Developer', app, members:[], memory:0,cpu:0 });
    const g=groups.get(key); g.members.push(p); g.memory+=p.memory; g.cpu+=p.cpu;
  }
  return [...groups.values()].map(g=>({ ...g, protected:g.members.some(p=>protectedPids.has(p.pid)), root:g.app?g.members.find(p=>p.executable.startsWith(g.app+'/Contents/MacOS/')):g.members[0] })).sort((a,b)=>b.memory-a.memory);
}
export async function getProcesses() {
  const total=totalmem();
  const [rows,memory]=await Promise.all([scan(),readMemory(total)]);
  const groups=groupProcesses(rows,process.getuid(),process.pid);
  const now=Date.now();
  for(const [id,t] of tickets) if(t.expires<now) tickets.delete(id);
  return { totalMemory:total, memory, scannedAt:new Date().toISOString(), groups:groups.map(g=>{
    const token=randomUUID(); tickets.set(token,{group:g,expires:now+120000});
    return { key:g.key, token, identity:g.members.map(p=>`${p.pid}:${p.started}`).join('|'), name:g.name, kind:g.kind, memory:g.memory,cpu:g.cpu, count:g.members.length, pids:g.members.map(p=>p.pid), executable:g.app||g.members[0].executable, protected:g.protected||!g.root, reason:g.protected?'Keeps Port Authority running':!g.root?'App owner unavailable':null };
  }) };
}
const quitScript = `ObjC.import('AppKit'); function run(argv) { var app=$.NSRunningApplication.runningApplicationWithProcessIdentifier(Number(argv[0])); if(!app) return 'gone'; return app.terminate ? 'requested' : 'declined'; }`;
export async function stopProcesses(input) {
  if(!Array.isArray(input.tokens)||!input.tokens.length||input.tokens.length>100||!['quit','force'].includes(input.mode)) throw Object.assign(new Error('Select apps and choose Quit or Force Quit'),{status:400});
  const results=[];
  for(const token of new Set(input.tokens)) {
    const ticket=tickets.get(token); const g=ticket?.group;
    if(!g||ticket.expires<Date.now()) { results.push({name:g?.name||'Selection',status:'Skipped: selection expired; refresh and retry'}); continue; }
    const live=await scan(); const groups=groupProcesses(live,process.getuid(),process.pid);
    const current=groups.find(item=>item.key===g.key);
    const matches=p=>live.find(q=>q.pid===p.pid&&q.uid===p.uid&&q.started===p.started&&q.executable===p.executable);
    if(!current||current.protected||!g.root||!matches(g.root)) {results.push({name:g.name,status:'Skipped: process changed or is protected'});continue;}
    try {
      if(input.mode==='quit'&&g.app) {
        const {stdout}=await exec('/usr/bin/osascript',['-l','JavaScript','-e',quitScript,String(g.root.pid)],{timeout:5000});
        results.push({name:g.name,status:stdout.trim()==='requested'?'Quit requested; save prompts may need attention':'App declined quit or has exited'});
      } else {
        let sent=0;
        for(const member of [...g.members].reverse()) if(matches(member)) {
          // Refresh identity immediately before each signal; never expand the selected set.
          const fresh=(await scan()).find(p=>p.pid===member.pid);
          if(fresh&&fresh.uid===member.uid&&fresh.started===member.started&&fresh.executable===member.executable) {
            try {process.kill(member.pid,input.mode==='force'?'SIGKILL':'SIGTERM');sent++;} catch(e) {if(e.code!=='ESRCH')throw e;}
          }
        }
        results.push({name:g.name,status:`${input.mode==='force'?'Force quit':'Quit'} requested for ${sent} process(es)`});
      }
    } catch(e) {results.push({name:g.name,status:`Could not quit: ${e.message}`});}
  }
  return {results};
}
