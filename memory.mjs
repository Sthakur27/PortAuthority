import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile);

export function parseMemory(text,total) {
  const pageSize=Number(text.match(/page size of (\d+) bytes/)?.[1]);
  const pages=name=>{
    const match=text.match(new RegExp(`^${name}:\\s+(\\d+)\\.`, 'm'));
    if(!match)throw new Error(`Missing memory counter: ${name}`);
    return Number(match[1])*pageSize;
  };
  if(!pageSize||!Number.isFinite(total)||total<=0)throw new Error('Invalid memory totals');
  const system=pages('Pages wired down');
  const compressed=pages('Pages occupied by compressor');
  const apps=Math.max(0,pages('Anonymous pages')-pages('Pages purgeable'));
  const used=system+compressed+apps;
  // Never fabricate a healthy reading from an incomplete or inconsistent sample.
  if(used>total)throw new Error('Inconsistent memory sample');
  const percent=used/total*100;
  return {total,used,apps,system,compressed,available:total-used,percent,
    level:percent>=90?'high':percent>=75?'elevated':'normal'};
}

export async function readMemory(total) {
  try {
    const {stdout}=await exec('/usr/bin/vm_stat',[],{timeout:3000});
    return parseMemory(stdout,total);
  } catch {return null;}
}
