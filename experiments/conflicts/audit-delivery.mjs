/** Verify full persisted DSH tool results, not the CLI's bounded display excerpts. */
import assert from 'node:assert/strict'
import {readFile,readdir,writeFile} from 'node:fs/promises'
import {resolve,dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {zstdDecompressSync} from 'node:zlib'
import {createHash} from 'node:crypto'
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const read=async p=>JSON.parse(await readFile(p,'utf8'))
const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}'
const hash=x=>createHash('sha256').update(x).digest('hex')
const publicDir=join(repo,'docs/results/conflicts')
const manifest=await read(join(publicDir,'manifest.json'));const {root}=await read(join(repo,'.verification/conflicts/location.json'))
const rows=[]
for(const plan of manifest.plans){
  const folder=join(root,plan.id,'home/sessions')
  const names=(await readdir(folder,{recursive:true})).filter(n=>n.endsWith('session.v4.jsonl.zstd'))
  assert.equal(names.length,1)
  const raw=await readFile(join(folder,names[0]));const frames=[];let offset=0
  while(offset<raw.length){const decoded=zstdDecompressSync(raw.subarray(offset),{info:true});assert.ok(decoded.engine.bytesWritten>0);offset+=decoded.engine.bytesWritten;frames.push(decoded.buffer)}
  const events=Buffer.concat(frames).toString('utf8').split('\n').filter(Boolean).map(JSON.parse)
  const calls=events.filter(e=>e.type==='tool/call'&&e.data.name==='conflict_packet').map(e=>e.data.callId)
  const returned=events.filter(e=>e.type==='tool/result'&&calls.includes(e.data.message.toolCallId))
  assert.equal(returned.length,1)
  const message=returned[0].data.message;assert.ok(!message.isError)
  const text=message.content.filter(x=>x.type==='text').map(x=>x.text).join('')
  const packet=JSON.parse(text)
  assert.equal(hash(canonical(packet)),manifest.packet_hashes[`${plan.arm}-${plan.seed}`].sha256)
  const cli=(await readFile(join(root,plan.id,'events.jsonl'),'utf8')).split('\n').filter(x=>x.startsWith('{')).map(JSON.parse)
  const final=cli.findLast(x=>x.type==='final')
  const assistant=events.filter(x=>x.type==='assistant/message').at(-1).data.message
  const fullFinal=assistant.content.filter(x=>x.type==='text').map(x=>x.text).join('')
  assert.equal(fullFinal.trim(),final.text.trim())
  rows.push({id:plan.id,persisted_tool_result_matches_packet:true,full_tool_result_bytes:Buffer.byteLength(text),all_cases:packet.cases.length,
    cli_tool_display_truncated:cli.some(x=>x.type==='tool_result'&&x.truncated===true),final_answer_matches_session:true,
    session_title_requests:events.filter(x=>x.type==='session/title-llm-request').length,session_log_sha256:hash(raw)})
}
const result={valid:true,checked_runs:rows.length,rows,usage_scope:'Reported usage in results.json is main Agent step_end usage. Background session-title requests are counted here but their usage is not included; totals are not a billing statement.',cli_note:'DSH headless bounds display strings to 8 KiB. Full tool-result payloads were independently checked in persisted Session events; no source material was lost there.'}
await writeFile(join(publicDir,'delivery-audit.json'),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({valid:true,runs:rows.length,all_full_tool_results_matched:true,all_final_answers_matched:true,background_title_requests:rows.reduce((s,r)=>s+r.session_title_requests,0)}))
