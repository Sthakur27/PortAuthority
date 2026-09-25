import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { parseProcesses, groupProcesses, getProcesses, stopProcesses } from './processes.mjs';

test('parses spaced app paths and groups helpers, excludes system and other users',()=>{
  const rows=parseProcesses(` 11 1 501 1024 2.5 0:01.00 Sat Sep 19 10:02:03 2026 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
 12 11 501 2048 1.0 0:01.00 Sat Sep 19 10:02:04 2026 /Applications/Google Chrome.app/Contents/Frameworks/Helper.app/Contents/MacOS/Helper
 13 1 501 900 0.0 0:01.00 Sat Sep 19 10:02:04 2026 /System/Library/CoreServices/Dock.app/Contents/MacOS/Dock
 14 1 0 900 0.0 0:01.00 Sat Sep 19 10:02:04 2026 /Applications/Other.app/Contents/MacOS/Other`);
  const groups=groupProcesses(rows,501,99);
  assert.equal(groups.length,1);assert.equal(groups[0].members.length,2);assert.equal(groups[0].memory,3072*1024);
  assert.equal(groupProcesses(rows,501,12)[0].protected,true);
});
test('rejects unknown action tickets without signaling',async()=>{
  const result=await stopProcesses({tokens:['unknown'],mode:'force'});
  assert.match(result.results[0].status,/expired/);
});
test('quits only disposable node process, refuses protected current process',async()=>{
  const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
  await once(child,'spawn');
  try {
    const data=await getProcesses();
    const self=data.groups.find(g=>g.pids.includes(process.pid));assert.equal(self.protected,true);
    const blocked=await stopProcesses({tokens:[self.token],mode:'force'});assert.match(blocked.results[0].status,/protected/);
    const target=data.groups.find(g=>g.pids.includes(child.pid));assert.ok(target);assert.equal(target.protected,false);
    const exited=once(child,'exit');
    const result=await stopProcesses({tokens:[target.token],mode:'quit'});
    assert.match(result.results[0].status,/requested/);
    const [,signal]=await exited;assert.equal(signal,'SIGTERM');
    const stale=await stopProcesses({tokens:[target.token],mode:'force'});assert.match(stale.results[0].status,/changed/);
  } finally {if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
});
test('force quit handles a disposable process that ignores SIGTERM',async()=>{
  const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"],{stdio:['ignore','pipe','ignore']});
  await once(child.stdout,'data');
  try {
    const data=await getProcesses();const target=data.groups.find(g=>g.pids.includes(child.pid));assert.ok(target);
    const exited=once(child,'exit');await stopProcesses({tokens:[target.token],mode:'force'});
    const [,signal]=await exited;assert.equal(signal,'SIGKILL');
  }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
});

test('CPU intervals measure recent work, preserve multicore usage and reject reused PIDs', async()=>{
  const {cpuTime,intervalCPU,systemCPU}=await import('./processes.mjs');
  assert.equal(cpuTime('123:45.67'),7425670);
  assert.equal(cpuTime('1:02:03.50'),3723500);
  const old={pid:77,started:'start',executable:'node',cpuTime:1000};
  assert.equal(intervalCPU([old],[{...old,cpuTime:3500}],1000)[0].cpu,250);
  assert.equal(intervalCPU([old],[{...old,cpuTime:1000}],1000)[0].cpu,0);
  assert.equal(intervalCPU([old],[{...old,started:'new',cpuTime:5000}],1000)[0].cpu,null);
  assert.equal(intervalCPU([],[old],1000)[0].cpu,null);
  const core=(user,idle)=>({times:{user,idle,nice:0,sys:0,irq:0}});
  assert.deepEqual(systemCPU([core(100,100),core(100,100)],[core(175,125),core(125,175)]),{percent:50,cores:2});
  assert.equal(systemCPU([],[]),null);
  assert.equal(systemCPU([core(100,100)],[core(100,100)]),null);
});
