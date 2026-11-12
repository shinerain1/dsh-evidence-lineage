import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {Store,trace,project,canonical} from '../lib/store.js'
function fixture(t){const s=new Store(mkdtempSync(join(tmpdir(),'trace-test-')));t.after(()=>s.close());let n=0;const who=()=>({session:'trace-host',call:String(++n)});const id=s.create({name:'trace'},who()).case_id;const add=records=>s.ingest({case_id:id,records},who()).result.ids;const report=(body,refs,novelty='derived')=>s.report({case_id:id,format:'dsh-evidence-report/v1',items:[{text:body,refs,novelty}]},who()).result.ids[0];return{s,id,who,add,report}}
test('trace follows multi-parent reports, keeps new observations and does not mutate',t=>{
  const {s,id,add,report}=fixture(t),[a,b]=add([{url:'https://a.example',text:'A'},{url:'https://b.example',text:'B'}]);const merged=report('A+B',[a,b]),relay=report('relay',[merged]),fresh=report('new',[relay],'new');const before=canonical(s.read(id))
  const v=trace(s.read(id),{evidence_ids:[relay,fresh,relay]});assert.equal(v.recorded_origin_count,3);assert.deepEqual(v.query_ids,[relay,fresh]);assert.equal(v.independence,'unknown');assert.equal(v.complete,true)
  for(const ev of [relay,fresh])assert.deepEqual(v.entries.filter(x=>x.evidence_id===ev).map(x=>x.source_id),s.get({case_id:id,evidence_id:ev}).origins)
  assert.equal(canonical(s.read(id)),before);assert.ok(!JSON.stringify(v).includes('A+B'));assert.equal(v.entries.length,3)
})
test('trace pages origin pairs without silently dropping wide ancestry',t=>{
  const {s,id,add,report}=fixture(t);const ids=add(Array.from({length:21},(_,i)=>({url:`https://source.example/${i}`,text:'Observed'}))),r=report('wide summary',ids)
  const pages=[];let offset=0;do{const page=trace(s.read(id),{evidence_ids:[r],offset,limit:5});pages.push(page);offset=page.next_offset}while(offset!==null)
  assert.equal(pages.length,5);assert.equal(pages[0].complete,false);assert.equal(pages.at(-1).complete,false);assert.equal(pages.at(-1).next_offset,null)
  const entries=pages.flatMap(p=>p.entries);assert.equal(entries.length,21);assert.equal(new Set(entries.map(x=>x.source_id)).size,21);assert.equal(pages[0].total_origin_pairs,21)
})
test('trace recomputes after revocation and rejects foreign IDs and invalid pages',t=>{
  const {s,id,who,add}=fixture(t),[a,b]=add([{url:'https://a.example',text:'same'},{url:'https://b.example',text:'same'}]);const link=s.link({case_id:id,child:b,parent:a,relation:'derivation',note:'asserted copy',expected_revision:s.read(id).revision},who())
  assert.equal(trace(s.read(id),{evidence_ids:[b]}).recorded_origin_count,1)
  s.revoke({case_id:id,edge_id:link.result.edge_id,reason:'unsubstantiated',expected_revision:s.read(id).revision},who())
  assert.equal(trace(s.read(id),{evidence_ids:[b]}).recorded_origin_count,2)
  assert.throws(()=>trace(s.read(id),{evidence_ids:['foreign']}),/UNKNOWN_EVIDENCE/);assert.throws(()=>trace(s.read(id),{evidence_ids:[]}),/LIST_REQUIRED/);assert.throws(()=>trace(s.read(id),{evidence_ids:[b],limit:0}),/LIMIT_MUST/)
})
test('trace agrees with full context across generated acyclic graphs',t=>{
  const {s,id,add,report}=fixture(t),roots=add(Array.from({length:8},(_,i)=>({url:`https://roots.example/${i}`,text:`Root ${i}`}))),ids=[...roots]
  for(let i=0;i<40;i++)ids.push(report('report '+i,[ids[(i*7+3)%ids.length],ids[(i*13+5)%ids.length]],i%9===0?'new':'derived'))
  const full=project(s.read(id),{limit:200})
  for(let i=0;i<ids.length;i+=20){const selected=ids.slice(i,i+20);let offset=0;const entries=[];do{const p=trace(s.read(id),{evidence_ids:selected,offset,limit:7});assert.equal(p.recorded_origin_count,full.recorded_origin_count);entries.push(...p.entries);offset=p.next_offset}while(offset!==null)
    for(const ev of selected){const group=full.items.find(x=>x.id===ev||x.aliases.includes(ev));assert.deepEqual(entries.filter(x=>x.evidence_id===ev).map(x=>x.source_id),group.origins)}}
})
