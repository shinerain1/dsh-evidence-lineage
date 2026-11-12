import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync, spawn } from 'node:child_process'
import { Store, project, verifyBundle, canonical, digest, url } from '../lib/store.js'
function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'lineage-test-')); const s = new Store(root)
  t.after(() => s.close())
  let seq = 0
  const who = () => ({ session: 'host-session', call: 'call-' + ++seq })
  const id = s.create({ name: 'research' }, who()).case_id
  const add = records => s.ingest({ case_id: id, records }, who()).result.ids
  const report = (text, refs, novelty = 'derived', stance = 'context') => s.report({ case_id: id, format: 'dsh-evidence-report/v1', items: [{ text, refs, novelty, stance }] }, who()).result.ids[0]
  const link = (child, parent, relation = 'derivation', extra = {}) => s.link({ case_id: id, child, parent, relation, note: 'Reviewed reference', expected_revision: s.read(id).revision, ...extra }, who())
  return { s, id, root, who, add, report, link }
}
const item = (host, text, rest = {}) => ({ url: `https://${host}.example/article`, text, ...rest })
test('exact text on unrelated URLs stays distinct and unknown', t => {
  const { s, id, add } = setup(t); add([item('a', 'Same measured value.'), item('b', 'Same measured value.')])
  const view = project(s.read(id)); assert.equal(view.folded_count, 0); assert.equal(view.same_text_unresolved.length, 1); assert.equal(view.independence, 'unknown')
})
test('same URL repeated input is idempotent, changed content is a new snapshot', t => {
  const { s, id, add } = setup(t); const [first] = add([item('a', 'Version one')]); const [again] = add([item('a', 'Version one')]); add([item('a', 'Version two')])
  assert.equal(first, again); assert.equal(s.read(id).nodes.length, 2); assert.equal(project(s.read(id)).recorded_origin_count, 1)
})
test('signed URLs, query values, fragments and numbers are not fuzzy-normalized', () => {
  assert.notEqual(url('https://a.example/?id=1'), url('https://a.example/?id=2'))
  assert.notEqual(url('https://a.example/#one'), url('https://a.example/#two'))
  assert.throws(() => url('https://user:secret@a.example/'))
  assert.throws(() => url('file:///secret'))
})
test('explicitly linked identical copies fold and remain retrievable', t => {
  const { s, id, add, link } = setup(t); const [a, b] = add([item('a', 'Body'), item('b', 'Body')]); link(b, a)
  const v = project(s.read(id)); assert.equal(v.folded_count, 1); assert.equal(v.recorded_origin_count, 1)
  assert.equal(s.get({ case_id: id, evidence_id: b }).material.text, 'Body'); assert.equal(v.items[0].aliases[0], b)
})
test('citation is not a whole-document derivation; new information remains', t => {
  const { s, id, add, link } = setup(t); const [a, b] = add([item('a', 'Primary result'), item('b', 'Primary result. We also measured an independent effect.')]); link(b, a, 'citation')
  assert.equal(project(s.read(id)).recorded_origin_count, 2); assert.equal(project(s.read(id)).retained_groups, 2)
})
test('different paraphrases and one-word contradictions survive even when linked', t => {
  const { s, id, add, report } = setup(t); const [a] = add([item('a', 'The product is safe.')])
  report('The product is not safe.', [a], 'derived', 'oppose'); report('The trial reports safety.', [a])
  const v = project(s.read(id)); assert.equal(v.retained_groups, 3); assert.ok(v.items.some(n => n.stance === 'oppose'))
})
test('same text with different stance or claim never folds', t => {
  const { s, id, add } = setup(t); add([item('a', 'Repeated', { stance: 'support', claim: 'C1' }), item('a', 'Repeated', { stance: 'oppose', claim: 'C1' }), item('a', 'Repeated', { stance: 'support', claim: 'C2' })])
  assert.equal(project(s.read(id)).retained_groups, 3)
})
test('changed headline or publication timestamp remains separate evidence', t => {
  const {s,id,add}=setup(t)
  add([item('a','Result',{title:'Correction',published_at:'2026-01-01'}),item('a','Result',{title:'Original',published_at:'2026-01-01'}),item('a','Result',{title:'Correction',published_at:'2026-02-01'})])
  assert.equal(project(s.read(id)).retained_groups,3)
})
test('report chain resolves transitive origins; multi-parent summary adds no independent measurement', t => {
  const { s, id, add, report } = setup(t); const [a, b] = add([item('a', 'A'), item('b', 'B')]); const r = report('Summary', [a, b]); report('Another summary', [r])
  assert.equal(project(s.read(id)).recorded_origin_count, 2)
})
test('new report adds unresolved origin even when same text and refs already derived', t => {
  const { s, id, add, report } = setup(t); const [a] = add([item('a', 'A')]); const d = report('A', [a]); const n = report('A', [a], 'new')
  assert.notEqual(d, n); assert.equal(project(s.read(id)).recorded_origin_count, 2)
})
test('foreign and missing references roll back the entire report batch', t => {
  const { s, id, add, who } = setup(t); const [a] = add([item('a', 'A')]); const before = canonical(s.read(id))
  assert.throws(() => s.report({ case_id: id, format: 'dsh-evidence-report/v1', items: [{ text: 'OK', refs: [a], novelty: 'derived' }, { text: 'Bad', refs: ['unknown'], novelty: 'derived' }] }, who()), /UNKNOWN_EVIDENCE/)
  assert.equal(canonical(s.read(id)), before)
})
test('direct and transitive cycles are rejected without partial state', t => {
  const { s, id, add, link } = setup(t); const [a, b, c] = add(['a','b','c'].map(h => item(h, h))); link(b,a); link(c,b)
  const rev = s.read(id).revision; assert.throws(() => link(a,c), /LINEAGE_CYCLE/); assert.equal(s.read(id).revision, rev); assert.throws(() => link(a,a), /SELF_REFERENCE/)
})
test('literal citation proof must actually occur in captured text and contain parent URL', t => {
  const { add, link } = setup(t); const [a, b] = add([item('a', 'A'), item('b', 'According to https://a.example/article')])
  assert.equal(link(b,a,'citation',{ reference_excerpt: 'According to https://a.example/article' }).result.basis, 'literal_reference')
  assert.throws(() => link(b,a,'derivation',{ reference_excerpt: 'Invented https://a.example/article' }), /REFERENCE_NOT/)
})
test('revocation restores origins; stale revision is rejected; history survives', t => {
  const { s, id, add, link, who } = setup(t); const [a,b] = add([item('a','X'),item('b','X')]); const edge = link(b,a)
  assert.throws(() => s.revoke({ case_id:id, edge_id:edge.result.edge_id, expected_revision:1, reason:'wrong' },who()), /REVISION_CONFLICT/)
  s.revoke({ case_id:id, edge_id:edge.result.edge_id, expected_revision:s.read(id).revision, reason:'wrong source attribution' },who())
  assert.equal(project(s.read(id)).folded_count,0); assert.equal(s.read(id).edges[0].active,false); assert.ok(verifyBundle(s.bundle(id)).valid)
})
test('mutation replay is historical, conflicting key is rejected', t => {
  const { s, id, who } = setup(t); const args = { case_id:id, records:[item('a','A')],request_key:'stable' }; const first = s.ingest(args,who()); s.ingest({ case_id:id,records:[item('b','B')] },who())
  const replay=s.ingest(args,who()); assert.equal(replay.replayed,true); assert.equal(replay.revision,first.revision); assert.equal(s.read(id).nodes.length,2)
  assert.throws(() => s.ingest({...args,records:[item('c','C')]},who()),/IDEMPOTENCY_CONFLICT/)
})
test('empty text cannot be used as a universal duplicate', t => {
  const { add }=setup(t); assert.throws(()=>add([item('a','   ')]),/INVALID_TEXT/)
})
test('pagination is explicit and no content is silently truncated', t => {
  const { s,id,add }=setup(t); add(['a','b','c'].map(h=>item(h,h.repeat(10000))))
  const a=project(s.read(id),{limit:2}); assert.equal(a.complete,false); assert.equal(a.next_offset,2); assert.equal(a.items[0].text.length,10000)
  const b=project(s.read(id),{offset:2,limit:2}); assert.equal(b.items.length,1); assert.equal(b.next_offset,null)
})
test('search replay and URL-only hits; provider synthesis never creates false confirmed lineage', t=>{
  const {s,id,who}=setup(t); const args={case_id:id,query:'test',request_key:'q'}; const snapshot={sources:[{url:'https://a.example/'},{url:'https://b.example/',summary:'B',snippet:'Extra'}],content:'Provider says B',truncated:true}
  const a=s.captureSearch(args,snapshot,who()); assert.equal(a.result.new_ids.length,3); assert.equal(a.result.truncated,true)
  assert.equal(s.receipt('search',args,who()).replayed,true)
  const b=s.captureSearch({...args,request_key:'q2'},snapshot,who()); assert.equal(b.result.new_ids.length,0); assert.equal(b.result.seen_ids.length,3)
  assert.equal(project(s.read(id)).recorded_origin_count,3)
})
test('durable state recovers in a separate Node process', t=>{
  const {s,id,root,add}=setup(t); add([item('a','Persistent')])
  const module=new URL('../lib/store.js',import.meta.url).href
  const output=execFileSync(process.execPath,['--input-type=module','-e',`import {Store} from ${JSON.stringify(module)}; const s=new Store(process.argv[1]); console.log(JSON.stringify(s.resume({session:'host-session',call:'restart'}))); s.close()`,root],{encoding:'utf8'})
  assert.equal(JSON.parse(output).cases[0].case_id,id); assert.equal(s.read(id).nodes.length,1)
})
test('export validates all revisions and detects content or event tampering',t=>{
  const {s,id,add}=setup(t); add([item('a','Original')]); const bundle=s.bundle(id); assert.equal(verifyBundle(bundle).valid,true)
  const tampered=structuredClone(bundle); tampered.case.nodes[0].text='Altered'; assert.throws(()=>verifyBundle(tampered),/HASH_MISMATCH/)
  const changed=structuredClone(bundle); changed.audit[0].event.operation='pretend'; const {sha256,...payload}=changed; changed.sha256=digest(canonical(payload)); assert.throws(()=>verifyBundle(changed),/AUDIT_CHAIN/)
})
test('four processes commit without losing observations or audit revisions',async t=>{
  const {s,id,root}=setup(t); const module=new URL('../lib/store.js',import.meta.url).href
  await Promise.all([0,1,2,3].map(worker=>new Promise((resolve,reject)=>{
    const code=`import {Store} from ${JSON.stringify(module)}; const s=new Store(process.argv[1]); for(let i=0;i<10;i++)s.ingest({case_id:process.argv[2],records:[{url:'https://worker'+process.argv[3]+'.example/'+i,text:'Observation '+i}]},{session:'worker'+process.argv[3],call:String(i)});s.close()`
    const child=spawn(process.execPath,['--input-type=module','-e',code,root,id,String(worker)],{stdio:['ignore','ignore','pipe'],windowsHide:true});let error='';child.stderr.on('data',x=>error+=x)
    child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(error)))
  })))
  assert.equal(s.read(id).nodes.length,40);assert.equal(s.read(id).revision,41);assert.ok(verifyBundle(s.bundle(id)).valid)
})
