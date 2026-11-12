/** Inspect complete persisted Session tool events, not bounded CLI display excerpts. */
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
const publicDir=join(repo,'docs/results/origins'), manifest=await read(join(publicDir,'manifest.json')), {root}=await read(join(repo,'.verification/origins/location.json'))
const rows=[]
for(const plan of manifest.plans){
  let timing;try{timing=await read(join(root,plan.id,'timing.json'))}catch(e){if(e.code==='ENOENT')continue;throw e}
  const folder=join(root,plan.id,'home/sessions'),names=(await readdir(folder,{recursive:true})).filter(n=>n.endsWith('session.v4.jsonl.zstd'))
  assert.equal(names.length,1)
  const raw=await readFile(join(folder,names[0])),frames=[];let offset=0
  while(offset<raw.length){const d=zstdDecompressSync(raw.subarray(offset),{info:true});assert.ok(d.engine.bytesWritten>0);offset+=d.engine.bytesWritten;frames.push(d.buffer)}
  const events=Buffer.concat(frames).toString('utf8').split('\n').filter(Boolean).map(JSON.parse)
  const cli=(await readFile(join(root,plan.id,'events.jsonl'),'utf8')).split('\n').filter(x=>x.startsWith('{')).map(JSON.parse),final=cli.findLast(x=>x.type==='final')
  const fullFinal=events.filter(x=>x.type==='assistant/message').at(-1)?.data.message.content.filter(x=>x.type==='text').map(x=>x.text).join('')??''
  if(final?.reason?.kind==='completed')assert.equal(fullFinal.trim(),final.text.trim())
  const directCalls=events.filter(e=>e.type==='tool/call'&&e.data.name==='origin_packet').map(e=>e.data.callId)
  const returned=events.filter(e=>e.type==='tool/result'&&directCalls.includes(e.data.message.toolCallId))
  const expectedPacket=await read(join(root,plan.id,'packet.json'))
  const pageHashes=new Map(expectedPacket.cases.map(c=>[c.id,hash(canonical({format:expectedPacket.format,cases:[c]}))]))
  let checkedNative=0;const seen=new Set()
  for(const r of returned){if(r.data.message.isError)continue;const text=r.data.message.content.filter(x=>x.type==='text').map(x=>x.text).join('');let page;try{page=JSON.parse(text)}catch{throw new Error(`Non-JSON/truncated page in ${plan.id}: ${text.length} characters`)}assert.equal(page.cases.length,1);const caseId=page.cases[0].id;assert.equal(hash(canonical(page)),pageHashes.get(caseId));seen.add(caseId);checkedNative++}
  if(plan.mode==='native'&&final?.reason?.kind==='completed')assert.equal(seen.size,6)
  let audits=[];try{audits=(await readFile(join(root,plan.id,'tool-audit.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)}catch{}
  const expected=new Map(expectedPacket.cases.map(c=>[c.id,hash(JSON.stringify({format:expectedPacket.format,cases:[c]}))]));assert.ok(audits.length>0);assert.ok(audits.every(a=>a.packet_sha256===expected.get(a.case_id)));if(final?.reason?.kind==='completed')assert.equal(new Set(audits.map(a=>a.case_id)).size,6)
  // Publish only model-authored program text and tool outputs, never private thinking or request credentials.
  const codeCalls=cli.filter(x=>x.type==='tool_call'&&x.tool==='run_code')
  await writeFile(join(publicDir,plan.id+'-tool-trace.json'),JSON.stringify({calls:codeCalls,note:'Public run_code programs from CLI events; no chain of thought or credentials. Full packet integrity is checked separately.'},null,2)+'\n')
  rows.push({id:plan.id,mode:plan.mode,completed:final?.reason?.kind==='completed',native_full_packet_checks:checkedNative,packet_dispatch_hashes_checked:audits.length,final_matches_session:final?.reason?.kind==='completed'?true:null,session_title_requests:events.filter(x=>x.type==='session/title-llm-request').length,session_log_sha256:hash(raw),event_types:[...new Set(events.map(x=>x.type))]})
}
const result={valid:true,checked_runs:rows.length,rows,usage_scope:'results.json counts main Agent step_end usage, including cache and all attempts. Background session-title requests are counted here but their usage is not included. Not a billing statement.',ptc_note:'PTC receives the full packet from the tool; its model-authored program may deliberately return only computed answers. Native full tool payloads were checked in Session events. PTC dispatch hash verifies the exact input returned to the program; it is not a claim that the full packet was shown to the LLM.'}
await writeFile(join(publicDir,'delivery-audit.json'),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({valid:true,runs:rows.length,completed:rows.filter(x=>x.completed).length,background_title_requests:rows.reduce((s,r)=>s+r.session_title_requests,0)}))
