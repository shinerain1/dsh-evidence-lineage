/** Verify an installed tarball using the actual DSH profile resolver and native tools. */
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const checkout=process.env.DSH_CHECKOUT, profileDir=process.env.EVIDENCE_PROFILE
if(!checkout||!profileDir)throw new Error('Set DSH_CHECKOUT and EVIDENCE_PROFILE')
const load=p=>import(pathToFileURL(join(checkout,p)).href)
const {Context}=await load('vendor/cordis/lib/index.js')
const {createRuntimeResolution,loadProfileDirectory,PluginPackages}=await load('packages/boot/app-boot/lib/index.js')
const {mountAgentLoopTestDependencies,mountAgentLoopTestHarness}=await load('packages/test-support/agent-loop-testkit/lib/index.js')
const anchor=join(checkout,'apps/cli/package.json')
const profile=loadProfileDirectory('evidence-public-check',profileDir,anchor);assert.deepEqual(profile.skippedBundles,[])
const resolution=await createRuntimeResolution({installAnchor:anchor,profile,home:resolve(profileDir,'../..')})
const ctx=new Context();let calls=0
try{
  await ctx.plugin(PluginPackages,{resolution})
  const require=createRequire(pathToFileURL(join(profileDir,'package.json')))
  const pluginPath=require.resolve('dsh-evidence-lineage');const peers=createRequire(pluginPath)
  for(const peer of ['@deepseek-ai/cordis','@deepseek-ai/dsh-tools'])assert.ok(peers.resolve(peer).toLowerCase().startsWith(resolve(checkout).toLowerCase()))
  const Plugin=await import(pathToFileURL(pluginPath).href)
  await mountAgentLoopTestDependencies(ctx,{tools:{mode:'native'}})
  const harness=await mountAgentLoopTestHarness(ctx);const agent=await harness.create('installed-native-check')
  const mounted=ctx.plugin(Plugin,Plugin.Config({root:resolve(profileDir,'../../validation-store')}));await mounted
  assert.equal(ctx.tools.schemas(agent).filter(t=>t.name.startsWith('evidence_')).length,10)
  const call=async(name,args={})=>{const b=await ctx.tools.execute({agent,calls:[{type:'tool-call',id:'public-'+ ++calls,name,arguments:JSON.stringify(args)}],signal:AbortSignal.timeout(30000)});const r=b.results[0].result;assert.equal(r.isError,false,JSON.stringify(r));return r.value}
  const p=await call('evidence_case_create',{name:'Installed tarball'})
  const input=await call('evidence_ingest',{case_id:p.case_id,records:[{url:'https://one.example/',text:'A source observation.'},{url:'https://two.example/',text:'A source observation.'}]})
  const initial=await call('evidence_context',{case_id:p.case_id});assert.equal(initial.folded_count,0)
  const report=await call('evidence_report',{case_id:p.case_id,format:'dsh-evidence-report/v1',items:[{text:'A source observation.',refs:[input.result.ids[0]],novelty:'derived'}]})
  const current=await call('evidence_context',{case_id:p.case_id});assert.equal(current.folded_count,1);assert.equal(current.recorded_origin_count,2)
  const receipt=await call('evidence_export',{case_id:p.case_id});assert.equal(receipt.checked.valid,true)
  const bundle=JSON.parse(await readFile(receipt.path,'utf8'));assert.equal(bundle.case.nodes.length,3)
  await mounted.dispose();assert.equal(ctx.tools.schemas(agent).filter(t=>t.name.startsWith('evidence_')).length,0)
  const result={kind:'installed-tarball-actual-dsh-profile-native-tools',sdk_peers_from_host:true,tools:10,native_calls:calls,unknown_equal_text_preserved:true,report_folded_with_retrievable_origin:true,export_verified:true,unload:true,model_calls:0}
  if(process.env.EVIDENCE_VALIDATION_OUTPUT)await writeFile(process.env.EVIDENCE_VALIDATION_OUTPUT,JSON.stringify(result,null,2)+'\n')
  console.log(JSON.stringify(result))
}finally{await ctx.fiber.dispose()}
