import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMemory} from './memory.mjs';
const fixture=(size=16384,apps=40)=>`Mach Virtual Memory Statistics: (page size of ${size} bytes)
Pages wired down: 20.
Pages occupied by compressor: 10.
Anonymous pages: ${apps}.
Pages purgeable: 5.`;
test('memory categories partition RAM with correct page size and purgeable subtraction',()=>{
  for(const size of [4096,16384]){
    const m=parseMemory(fixture(size),100*size);
    assert.equal(m.apps,35*size);assert.equal(m.system,20*size);assert.equal(m.compressed,10*size);
    assert.equal(m.used,65*size);assert.equal(m.available,35*size);
    assert.equal(m.used+m.available,m.total);assert.equal(m.level,'normal');
  }
});
test('occupancy thresholds are amber at 75% and red at 90%',()=>{
  assert.equal(parseMemory(fixture(4096,50),409600).level,'elevated');
  assert.equal(parseMemory(fixture(4096,65),409600).level,'high');
});
test('missing or impossible memory samples are not presented as healthy',()=>{
  assert.throws(()=>parseMemory('unknown output',409600));
  assert.throws(()=>parseMemory(fixture(),0));
  assert.throws(()=>parseMemory(fixture(4096,200),409600));
});
