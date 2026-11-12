import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {digest} from '../lib/store.js'
const read=async p=>JSON.parse(await readFile(p,'utf8'))
const b=await read('docs/results/benchmark.json')
for(const [key,file]of Object.entries({cases:'examples/cases.json',script:'scripts/benchmark.mjs',core:'src/store.ts'}))assert.equal(b.hashes[key],digest(await readFile(file,'utf8')),`${file} changed since benchmark`)
const valid=b.rows.filter(r=>r.arm==='lineage'&&r.kind!=='faulty-provenance-sensitivity')
assert.equal(valid.length,6);assert.ok(valid.every(r=>r.origin_absolute_error===0&&r.valuable_units_lost===0))
const wrong=b.rows.filter(r=>r.arm==='lineage'&&r.kind==='faulty-provenance-sensitivity')
assert.equal(wrong.length,3);assert.ok(wrong.every(r=>r.origin_absolute_error===1))
const d=await read('docs/results/dsh-host.json');assert.equal(d.script_sha256,digest(await readFile('scripts/dsh-check.mjs','utf8')));assert.equal(d.model_calls,0)
const p=await read('docs/results/agent-pilot.json');assert.ok(p.results.every(r=>r.tool_calls===0&&!r.guard_load_warning));
for(const r of p.results){
  const input=await read(`docs/results/pilot/${r.arm}-input.json`);assert.equal(input.length,3)
  const final=await read(`docs/results/pilot/${r.arm}-final.json`);assert.deepEqual(final.map(x=>x.reason),r.final_reasons)
  if(final.at(-1).reason.kind==='completed')assert.equal(JSON.parse(final.at(-1).text).cases.length,3)
}
console.log(JSON.stringify({valid:true,deterministic_cases:9,main_pilot_arms:3,disclosed_bad_link_failures:3,main_pilot_incomplete:p.results.filter(r=>r.final_reasons.some(x=>x.kind!=='completed')).map(x=>x.arm)}))
