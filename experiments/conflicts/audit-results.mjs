/** Re-score published final answers independently from the runner's scorer. */
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {resolve,dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const read=async p=>JSON.parse(await readFile(join(root,p),'utf8'))
const manifest=await read('docs/results/conflicts/manifest.json')
const corpus=(await read('experiments/conflicts/cases.json')).cases
const report=await read('docs/results/conflicts/results.json')
let scored=0;const gains=[]
for(const plan of manifest.plans){
  const final=await read(`docs/results/conflicts/${plan.id}-final.json`)
  assert.equal(final.reason.kind,'completed')
  assert.deepEqual(final.observed_tool_calls,['conflict_packet'])
  const answers=JSON.parse(final.text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')).cases
  assert.equal(answers.length,12);assert.equal(new Set(answers.map(x=>x.id)).size,12)
  const observed=report.runs.find(r=>r.id===plan.id)
  assert.deepEqual(observed.protocol_errors,[])
  for(const a of answers){
    const idx=Number(a.id.slice(1))-1;assert.ok(Number.isInteger(idx)&&idx>=0&&idx<12)
    const c=corpus[idx]
    const packet=await read(`docs/results/conflicts/raw-${plan.seed}-input.json`)
    const material=new Map(packet.cases.find(x=>x.id===a.id).evidence.items.map(n=>[n.id,n.text]))
    const labelsMatch=a.status===c.label
    const validPairs=a.pairs.every(pair=>pair.length===2&&material.has(pair[0])&&material.has(pair[1])&&material.get(pair[0])!==material.get(pair[1]))
    const correct=labelsMatch&&(c.label==='conflict'?a.pairs.length>0&&validPairs:a.pairs.length===0)
    assert.equal(observed.rows.find(r=>r.case_id===a.id).correct,correct)
    assert.equal(correct,true,plan.id+' '+a.id)
    scored++
  }
}
for(const pair of report.paired){assert.equal(pair.both_completed,true);assert.equal(pair.raw_missed_plugin_detected,false);assert.equal(pair.raw_detected_plugin_missed,false)}
console.log(JSON.stringify({valid:true,independently_scored_answers:scored,unique_cases:12,paired_gains:0,paired_regressions:0,all_cited_pairs_use_opposing_assertions:true}))
