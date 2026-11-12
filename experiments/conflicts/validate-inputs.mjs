/** Independent checks on the public packets, without calling the model. */
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {resolve,dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const read=async p=>JSON.parse(await readFile(join(repo,p),'utf8'))
const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}'
const hash=x=>createHash('sha256').update(x).digest('hex')
const manifest=await read('docs/results/conflicts/manifest.json')
const corpus=(await read('experiments/conflicts/cases.json')).cases
function rejectLabels(x){if(!x||typeof x!=='object')return;for(const[k,v]of Object.entries(x)){assert.ok(!['gold','label','expected','answer','case_key'].includes(k),'Answer label leaked: '+k);rejectLabels(v)}}
let count=0
for(const seed of [17,29,43]){
 const raws=await read(`docs/results/conflicts/raw-${seed}-input.json`)
 for(const arm of ['raw','text-dedup','lineage']){
  const packet=await read(`docs/results/conflicts/${arm}-${seed}-input.json`);rejectLabels(packet)
  assert.equal(hash(canonical(packet)),manifest.packet_hashes[`${arm}-${seed}`].sha256)
  assert.deepEqual(packet.cases.map(c=>c.id),raws.cases.map(c=>c.id))
  for(const c of packet.cases){
   const index=Number(c.id.slice(1))-1;const expected=corpus[index]
   const raw=raws.cases.find(r=>r.id===c.id)
   assert.deepEqual(new Set(c.evidence.items.map(n=>n.text)),new Set([expected.a,expected.b]))
   const ids=c.evidence.items.flatMap(n=>[n.id,...(n.aliases??[]).map(a=>typeof a==='string'?a:a.id)])
   assert.equal(ids.length,10);assert.deepEqual(new Set(ids),new Set(raw.evidence.items.map(n=>n.id)))
   assert.deepEqual(c.evidence.links,raw.evidence.links)
   for(const item of c.evidence.items){
    assert.equal(item.text,raw.evidence.items.find(n=>n.id===item.id).text)
    for(const alias of item.aliases??[])assert.equal(item.text,raw.evidence.items.find(n=>n.id===(typeof alias==='string'?alias:alias.id)).text)
   }
  }
  count++
 }
}
for(const f of ['src/store.ts','lib/store.js','experiments/conflicts/cases.json','experiments/conflicts/PROTOCOL.md','experiments/conflicts/packet-plugin.mjs','scripts/conflict-eval.mjs'])assert.equal(hash(await readFile(join(repo,f),'utf8')),manifest.hashes[f],f+' changed after freeze')
console.log(JSON.stringify({valid:true,packets:count,cases_per_packet:12,all_assertion_texts_retained:true,all_material_ids_retained:true,identical_reference_facts:true,no_gold_fields_in_packets:true,frozen_files_unchanged:true}))
