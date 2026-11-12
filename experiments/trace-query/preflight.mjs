import assert from 'node:assert/strict'
import {readFile,mkdtemp,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve,dirname} from 'node:path'
import {pathToFileURL,fileURLToPath} from 'node:url'
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),checkout=process.env.DSH_CHECKOUT
if(!checkout)throw new Error('Set DSH_CHECKOUT')
const load=p=>import(pathToFileURL(join(checkout,p)).href)
const {Context}=await load('vendor/cordis/lib/index.js')
const {mountAgentLoopTestDependencies,mountAgentLoopTestHarness}=await load('packages/test-support/agent-loop-testkit/lib/index.js')
const Packet=await import('./packet-plugin.mjs')
const {canonical,digest}=await import('../../lib/store.js')
const manifest=JSON.parse(await readFile(join(repo,'docs/results/trace-query/manifest.json'),'utf8'))
const {root}=JSON.parse(await readFile(join(repo,'.verification/trace-query/location.json'),'utf8'))
const records=[]
for(const mode of ['native','ptc'])for(const arm of ['raw','lineage','trace']){
  const ctx=new Context(),directory=await mkdtemp(join(tmpdir(),'dsh-origin-host-'))
  try{
    if(mode==='ptc'){
      for(const name of ['subprocess','sandbox'])await ctx.plugin((await load(`packages/${name}/${name}-local/lib/index.js`)).default,{})
      const policy=ctx.plugin((await load('packages/sandbox/sandbox-policy/lib/index.js')).default,{mode:'workspace-write',workspaceRoot:directory})
      const runtime=ctx.plugin((await load('packages/ptc-runtime/ptc-runtime-node/lib/index.js')).default,{timeoutMs:30000,maxTimeoutMs:30000})
      await mountAgentLoopTestDependencies(ctx,{workingDirectory:true,tools:{mode}});await policy;await runtime
    }else await mountAgentLoopTestDependencies(ctx,{tools:{mode}})
    const harness=await mountAgentLoopTestHarness(ctx);await ctx.plugin(Packet,{packetPath:join(root,`${mode}-107-${arm}`,'packet.json')})
    const agent=await harness.create(`preflight-${mode}-${arm}`,{}, {cwd:directory})
    const packet=JSON.parse(await readFile(join(root,`${mode}-107-${arm}`,'packet.json'),'utf8'))
    for(const c of packet.cases){
      const call=mode==='native'?{type:'tool-call',id:'read-'+c.id,name:'origin_packet',arguments:JSON.stringify({case_id:c.id})}:{type:'tool-call',id:'read-'+c.id,name:'run_code',arguments:JSON.stringify({code:`return await tools.origin_packet({case_id:'${c.id}'});`,description:'Verify source-tracing transport',timeoutMs:30000})}
      const batch=await ctx.tools.execute({agent,calls:[call],signal:AbortSignal.timeout(45000)}),r=batch.results[0].result
      assert.equal(r.isError,false,JSON.stringify(r));const value=mode==='native'?r.value:r.value.result
      assert.equal(digest(canonical(value)),digest(canonical({format:packet.format,cases:[c]})))
    }
    records.push({mode,arm,lossless:true,pages:6,actual_dsh_pipeline:true,model_calls:0})
  }finally{await ctx.fiber.dispose()}
}
await writeFile(join(repo,'docs/results/trace-query/preflight.json'),JSON.stringify({records},null,2)+'\n')
console.log(JSON.stringify(records))
