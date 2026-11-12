/** Deterministic representation evaluation, not an LLM superiority benchmark. */
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Store, project, canonical, digest, verifyBundle } from '../lib/store.js'
export const baseCases=JSON.parse(await readFile(new URL('../examples/cases.json',import.meta.url),'utf8'))
export async function materialize(fixture) {
  const root=await mkdtemp(join(tmpdir(),'evidence-bench-')); const store=new Store(root)
  let seq=0; const who=()=>({session:'fixture-session',call:'fixture-'+ ++seq})
  const id=store.create({name:fixture.id},who()).case_id
  const mapping={}
  for(const n of fixture.nodes){
    if(n.kind==='report') mapping[n.key]=store.report({case_id:id,format:'dsh-evidence-report/v1',items:[{text:n.text,refs:n.refs.map(k=>mapping[k]),novelty:'derived',stance:n.stance??'context'}]},who()).result.ids[0]
    else mapping[n.key]=store.ingest({case_id:id,records:[{url:n.url,text:n.text,stance:n.stance??'context'}]},who()).result.ids[0]
  }
  for(const e of fixture.links) store.link({case_id:id,child:mapping[e.child],parent:mapping[e.parent],relation:e.relation,note:e.note,expected_revision:store.read(id).revision},who())
  const doc=store.read(id); const view=project(doc,{limit:200}); const bundle=store.bundle(id); verifyBundle(bundle); store.close()
  return {doc,view,bundle,mapping}
}
function echoCase(seed, faulty=false){
  const detail=`Synthetic trial ${seed}: one institution tested 20 samples under a fixed protocol. The observed effect was positive, but this report alone cannot establish independent replication. `
  const body=detail + Array.from({length:15},(_,i)=>`Measurement note ${i+1} records calibration, sample handling, instrument settings, and the fact that all measurements belong to this same trial.`).join(' ')
  const nodes=[{key:'root',url:`https://origin-${seed}.example/trial`,text:body,origin:'a',valuable:'trial-a',stance:'support'}]
  const links=[]
  for(let i=0;i<12;i++){
    nodes.push({key:`copy${i}`,url:`https://mirror-${seed}-${i}.example/reprint`,text:i%3===0?`Rewritten summary ${i}: The one institution reports a positive effect in trial ${seed}. This is a paraphrase of the original, not a new experiment.`:body,origin:'a',valuable:i%3===0?`paraphrase${i}`:'trial-a',stance:'support'})
    links.push({child:`copy${i}`,parent:'root',relation:'derivation',note:'Fixture explicitly declares this item a reprint/paraphrase of the same trial'})
  }
  nodes.push({key:'opposition',url:`https://other-${seed}.example/trial`,text:'A separate controlled trial found no effect. Its different result must not be discarded.',origin:'b',valuable:'trial-b',stance:'oppose'})
  nodes.push({key:'child',kind:'report',text:body,refs:['copy1'],origin:'a',valuable:'trial-a',stance:'support'})
  if(faulty) links.push({child:'opposition',parent:'root',relation:'derivation',note:'Intentionally incorrect input provenance assertion for sensitivity testing'})
  return {id:`echo-${seed}${faulty?'-bad-link':''}`,kind:faulty?'faulty-provenance-sensitivity':'controlled-echo-fixture',nodes,links,expected_origins:2,expected_consensus:false,expected_independence:'unknown'}
}
export function rawView(f){return {materials:f.nodes.map(({key,url,text,refs,stance})=>({id:key,...url?{url}:{},text,...refs?{refs}:{},stance:stance??'context'})),links:f.links}}
export function textDedup(f){
  const seen=new Set(); return f.nodes.filter(n=>{const h=digest(n.text);if(seen.has(h))return false;seen.add(h);return true})
}
async function main(){
  const cases=[...baseCases,...[7,11,19].map(s=>echoCase(s)),...[7,11,19].map(s=>echoCase(s,true))]
  const rows=[]
  for(const f of cases){
    const {view,mapping}=await materialize(f); const dedup=textDedup(f)
    const byId=Object.fromEntries(f.nodes.map(n=>[mapping[n.key],n]))
    for(const arm of ['raw-material-count','exact-text-dedup','lineage']){
      const retained=arm==='raw-material-count'?f.nodes:arm==='exact-text-dedup'?dedup:view.items.map(i=>byId[i.id])
      const predicted=arm==='lineage'?view.recorded_origin_count:retained.length
      const goldUnits=new Set(f.nodes.map(n=>n.valuable)); const kept=new Set(retained.map(n=>n.valuable))
      const context=arm==='raw-material-count'?rawView(f):arm==='exact-text-dedup'?{materials:dedup,links:f.links}:view
      rows.push({case:f.id,kind:f.kind,arm,expected_origins:f.expected_origins,predicted_origin_candidates:predicted,origin_absolute_error:Math.abs(predicted-f.expected_origins),
        valuable_units:goldUnits.size,valuable_units_lost:[...goldUnits].filter(x=>!kept.has(x)).length,retained_texts:retained.length,context_utf8_bytes:Buffer.byteLength(JSON.stringify(context)),
        // Deliberately naive decision rule; NOT an observed model answer.
        count_based_false_consensus:predicted>=3&&!f.expected_consensus,
        explicit_unknown_independence:arm==='lineage'&&view.independence==='unknown'})
    }
  }
  const output={kind:'deterministic-representation-and-counting-proxy',date:'2026-11-12',model_calls:0,source_case_count:1,synthetic_case_count:8,
    definitions:{origin_error:'Absolute difference from manually specified fixture provenance; NOT statistical independence or measured raw DSH reasoning error',false_consensus:'Naive >=3 origin-candidate threshold; a diagnostic proxy, NOT LLM conclusion error',valuable_loss:'Missing distinct fixture valuable-unit key after rendering; preserving aliases does not count as displaying a different independent observation',size:'UTF-8 bytes including metadata, not tokens; actual model token usage is reported separately'},
    limitations:['Oracle provenance links are supplied to every arm; plugin does not discover them from text','Ordinary dedup baseline keeps first identical body and drops later source metadata; a provenance-preserving baseline could avoid this loss','Bad-link cases intentionally show plugin failure when derivation assertions are wrong','A single real source case and controlled repetitions are not a representative web corpus'],rows,
    hashes:{cases:digest(await readFile(new URL('../examples/cases.json',import.meta.url),'utf8')),script:digest(await readFile(new URL(import.meta.url),'utf8')),core:digest(await readFile(new URL('../src/store.ts',import.meta.url),'utf8'))}}
  await mkdir('docs/results',{recursive:true}); await writeFile('docs/results/benchmark.json',JSON.stringify(output,null,2)+'\n')
  console.log(JSON.stringify(output))
}
if(process.argv[1]&&new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll('\\','/').split('/').at(-1))) await main()
