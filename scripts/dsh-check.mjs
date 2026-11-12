/** Real DSH host and PTC; deterministic web provider, no model/network calls. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import * as Plugin from '../lib/index.js'
import { verifyBundle, digest } from '../lib/store.js'
const checkout=process.env.DSH_CHECKOUT
if(!checkout) throw new Error('Set DSH_CHECKOUT to a built DSH checkout')
const load=p=>import(pathToFileURL(join(checkout,p)).href)
const {Context}=await load('vendor/cordis/lib/index.js')
const {mountAgentLoopTestDependencies,mountAgentLoopTestHarness}=await load('packages/test-support/agent-loop-testkit/lib/index.js')
const {WebRuntime}=await load('packages/web/web/lib/index.js')
const directory=await mkdtemp(join(tmpdir(),'dsh-evidence-host-'))
const ctx=new Context(); let searches=0; let nested=0
try {
  for(const name of ['subprocess','sandbox']) await ctx.plugin((await load(`packages/${name}/${name}-local/lib/index.js`)).default,{})
  const policy=ctx.plugin((await load('packages/sandbox/sandbox-policy/lib/index.js')).default,{mode:'workspace-write',workspaceRoot:directory})
  const runtime=ctx.plugin((await load('packages/ptc-runtime/ptc-runtime-node/lib/index.js')).default,{timeoutMs:30000,maxTimeoutMs:30000})
  await mountAgentLoopTestDependencies(ctx,{workingDirectory:true,tools:{mode:'ptc'}}); await policy; await runtime
  await ctx.plugin(WebRuntime,{})
  ctx.web.registerSearchProvider({id:'offline-fixture',available:()=>true,async search(req,signal){
    signal?.throwIfAborted(); searches++
    return {sources:[{url:'https://original.example/report',summary:'A controlled experiment observed an effect.'},{url:'https://mirror.example/report',summary:'A controlled experiment observed an effect.'}],truncated:false}
  }})
  const harness=await mountAgentLoopTestHarness(ctx)
  let plugin=ctx.plugin(Plugin,Plugin.Config({root:join(directory,'store')})); await plugin
  ctx.tools.guard(exec=>{if(exec.name.startsWith('evidence_'))nested++;return undefined})
  const agent=await harness.create('evidence-host-session',{}, {cwd:directory})
  const call=async(code,id)=>{
    const batch=await ctx.tools.execute({agent,calls:[{type:'tool-call',id,name:'run_code',arguments:JSON.stringify({code,description:'Verify evidence lineage workflow',timeoutMs:30000})}],signal:AbortSignal.timeout(45000)})
    const r=batch.results[0].result; assert.equal(r.isError,false,JSON.stringify(r)); return r.value.result
  }
  const first=await call(`
    const p=await tools.evidence_case_create({name:'DSH host integration',request_key:'create'});
    const a=await tools.evidence_search({case_id:p.case_id,query:'test',request_key:'search'});
    const b=await tools.evidence_search({case_id:p.case_id,query:'test',request_key:'second-observation'});
    const replay=await tools.evidence_search({case_id:p.case_id,query:'test',request_key:'search'});
    const ids=a.receipt.result.ids;
    let v=await tools.evidence_context({case_id:p.case_id});
    await tools.evidence_link({case_id:p.case_id,child:ids[1],parent:ids[0],relation:'derivation',note:'Fixture truth: second page is an exact reprint',expected_revision:v.revision});
    const report=await tools.evidence_report({case_id:p.case_id,format:'dsh-evidence-report/v1',items:[{text:'A controlled experiment observed an effect.',refs:[ids[1]],novelty:'derived'}]});
    const context=await tools.evidence_context({case_id:p.case_id});
    const exported=await tools.evidence_export({case_id:p.case_id});
    return {case_id:p.case_id,context,exported,report,repeat_materials:b.new_materials.length,replayed:replay.receipt.replayed};`, 'initial')
  assert.equal(first.context.recorded_origin_count,1); assert.equal(first.context.folded_count,2)
  assert.equal(first.repeat_materials,0); assert.equal(searches,2); assert.equal(first.replayed,true)
  const bundle=JSON.parse(await readFile(first.exported.path,'utf8')); assert.ok(verifyBundle(bundle).valid)
  assert.equal(bundle.case.nodes.find(n=>n.kind==='report').session,'evidence-host-session')
  const before=nested
  await plugin.dispose(); assert.equal(ctx.tools.schemas(agent).filter(t=>t.name.startsWith('evidence_')).length,0)
  plugin=ctx.plugin(Plugin,Plugin.Config({root:join(directory,'store')})); await plugin
  const resumed=await call('return await tools.evidence_resume({});','resume')
  assert.ok(resumed.cases.some(c=>c.case_id===first.case_id))
  const report={kind:'actual-dsh-host-ptc-offline-provider',model_calls:0,network_searches:0,provider_calls:searches,tools:10,workflow_nested_calls:before,total_nested_calls:nested,
    dsh_commit:execFileSync('git',['-c',`safe.directory=${checkout.replaceAll('\\','/')}`,'rev-parse','HEAD'],{cwd:checkout,encoding:'utf8'}).trim(),
    recorded_origins:1,folded_items:2,repeat_search_new_materials:0,retry_avoids_provider_call:true,host_session_identity_checked:true,remount_recovery:true,export_verified:true,
    script_sha256:digest(await readFile(new URL(import.meta.url),'utf8')),limitations:['Offline deterministic web provider; not a network search or model accuracy evaluation','Plugin remount within one host process; separate-process SQLite recovery is tested by npm test','No child LLM was spawned; report contract was called through real DSH tools']}
  await mkdir('docs/results',{recursive:true}); await writeFile('docs/results/dsh-host.json',JSON.stringify(report,null,2)+'\n')
  await mkdir('.verification',{recursive:true}); await writeFile('.verification/dsh-host-location.json',JSON.stringify({directory,bundle:first.exported.path}))
  console.log(JSON.stringify(report))
}finally{await ctx.fiber.dispose()}
