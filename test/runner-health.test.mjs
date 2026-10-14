import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { assessEvalHealth, reconcileEvalHealth } from "../lib/runner-health.mjs";
import { appendEvent, observationProjection, readEvents } from "../lib/runner-events.mjs";

const now = "2026-10-13T12:00:00.000Z";
const event = {type:"dev.dd.eval.subject.progress",time:"2026-10-13T10:00:00.000Z",data:{sequence:1}};
test("quiet live owners warn without inventing failure; heartbeat is not progress", () => {
  const events = [event,{type:"dev.dd.eval.observer.heartbeat",time:now,data:{sequence:2}}];
  const result = assessEvalHealth({state:"awaiting_provider",events,owners:[{state:"alive"}],now,noProgressMs:60_000});
  assert.equal(result.state,"no_progress"); assert.equal(result.last_progress_at,event.time); assert.equal(result.last_heartbeat_at,now);
});
test("death, unknown ownership, child activity and HITL stay distinct", () => {
  const input = {state:"awaiting_provider",events:[],now,noProgressMs:60_000};
  assert.equal(assessEvalHealth({...input,owners:[{state:"absent"}]}).state,"owner_lost");
  assert.equal(assessEvalHealth({...input,owners:[]}).state,"unknown");
  assert.equal(assessEvalHealth({...input,owners:[{state:"absent"}],flowHealth:[{complete:true,health:{state:"active"}}]}).reason,"native_execution_still_active");
  assert.equal(assessEvalHealth({...input,owners:[{state:"absent",phase:"waiting_for_user"}]}).state,"waiting");
  assert.equal(assessEvalHealth({...input,state:"completed_with_failures",owners:[]}).state,"settled");
});
test("historical repair is journalled, idempotent, and new progress invalidates health", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(),"dd-eval-health-")); t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(path.join(root,"manifest.json"),JSON.stringify({run_id:"EVAL-test",executions:[{id:"one"}]}));
  const file = path.join(root,"events.jsonl");
  await appendEvent(file,{source:"test",runId:"EVAL-test",type:"dev.dd.eval.planned",data:{state:"planned"}});
  await appendEvent(file,{source:"test",runId:"EVAL-test",executionId:"one",type:"dev.dd.eval.operation.started",data:{operation_id:"EVAL-test:one:launch",operation:"launch"}});
  const original = await readFile(file,"utf8");
  const dry = await reconcileEvalHealth({evalRoot:root}); assert.equal(dry.changed,false); assert.equal(await readFile(file,"utf8"),original);
  const first = await reconcileEvalHealth({evalRoot:root,apply:true}); assert.equal(first.state,"unconfirmed"); assert.equal(first.changed,true);
  const second = await reconcileEvalHealth({evalRoot:root,apply:true}); assert.equal(second.changed,false);
  let observation = JSON.parse(await readFile(path.join(root,"observation.json"),"utf8")); assert.equal(observation.health.state,"unknown");
  await appendEvent(file,{source:"test",runId:"EVAL-test",executionId:"one",type:"dev.dd.eval.subject.progress",data:{stage:"specify"}});
  observation = JSON.parse(await readFile(path.join(root,"observation.json"),"utf8")); assert.equal(observation.health,null);
});
test("terminal result survives a late health observation", () => {
  const events = [{runid:"EVAL",type:"dev.dd.eval.completed",time:now,data:{state:"completed",sequence:1}}];
  assert.equal(observationProjection(events).state,"completed");
});
test("legacy sequence enrichment is repaired without changing retained raw journal bytes",async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'dd-eval-legacy-sequence-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const file=path.join(root,'events.jsonl');await writeFile(path.join(root,'manifest.json'),JSON.stringify({run_id:'EVAL-legacy',executions:[{id:'one'}]}));
 await appendEvent(file,{source:'test',runId:'EVAL-legacy',type:'dev.dd.eval.planned',data:{state:'planned'}});
 await appendEvent(file,{source:'test',runId:'EVAL-legacy',executionId:'one',type:'dev.dd.eval.execution.failed',data:{state:'failed',code:'failure'}});
 const records=(await readFile(file,'utf8')).trim().split('\n').map(JSON.parse);records[1].data.sequence=1;
 const original=records.map(JSON.stringify).join('\n')+'\n';await writeFile(file,original);
 await assert.rejects(readEvents(file),{code:'journal_conflict'});
 const dry=await reconcileEvalHealth({evalRoot:root});assert.equal(dry.sequence_repair.corrections,1);assert.equal(await readFile(file,'utf8'),original);
 const fixed=await reconcileEvalHealth({evalRoot:root,apply:true});assert.equal(fixed.sequence_repair.changed,true);
 assert.equal((await readFile(file,'utf8')).slice(0,original.length),original);assert.equal((await readEvents(file))[1].data.sequence,2);
 await writeFile(file,original.replace('failure','changed'));await assert.rejects(readEvents(file),{code:'journal_conflict'});
});
test("contradicting terminal outcomes stay unconfirmed with retained evidence",async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'dd-eval-conflict-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,'manifest.json'),JSON.stringify({run_id:'EVAL-conflict',executions:[{id:'one'}]}));
 const events=[{type:'dev.dd.eval.operation.started',data:{operation_id:'EVAL-conflict:one:launch',operation:'launch'}},{type:'dev.dd.eval.operation.completed',data:{operation_id:'EVAL-conflict:one:launch',result:{state:'candidate_ready',execution:'one',candidate:{manifest_sha256:'first'}}}},{type:'dev.dd.eval.operation.completed',data:{operation_id:'EVAL-conflict:one:launch',result:{state:'candidate_ready',execution:'one',candidate:{manifest_sha256:'second'}}}}].map((event,index)=>({specversion:'1.0',id:`id-${index}`,runid:'EVAL-conflict',executionid:'one',source:'test',time:now,...event,data:{...event.data,sequence:index+1}}));
 await writeFile(path.join(root,'events.jsonl'),events.map(JSON.stringify).join('\n')+'\n');
 const fixed=await reconcileEvalHealth({evalRoot:root,apply:true});assert.equal(fixed.state,'unconfirmed');assert.equal(fixed.health.reason,'journal_conflict');
 const saved=JSON.parse(await readFile(path.join(root,'observation.json'),'utf8'));assert.equal(saved.journal_complete,false);assert.equal(saved.state,'unconfirmed');
 assert.equal((await reconcileEvalHealth({evalRoot:root,apply:true})).changed,false);
});
test("health checks preserve a frozen operator journal and keep their audit separate",async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'dd-eval-controlled-health-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,'manifest.json'),JSON.stringify({run_id:'EVAL-controlled',executions:[]}));
 const file=path.join(root,'events.jsonl');await appendEvent(file,{source:'test',runId:'EVAL-controlled',type:'dev.dd.eval.control.requested',data:{mode:'pause',request_id:'operator-pause'}});
 const original=await readFile(file,'utf8');
 const result=await reconcileEvalHealth({evalRoot:root,apply:true});assert.equal(result.state,'pause_requested');assert.equal(await readFile(file,'utf8'),original);
 assert.equal(JSON.parse(await readFile(path.join(root,'health.json'),'utf8')).basis_sequence,1);
 assert.equal((await reconcileEvalHealth({evalRoot:root,apply:true})).changed,false);assert.equal(await readFile(file,'utf8'),original);
});

test('a recovered Subject cannot borrow the previous generation report before finalization',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'dd-eval-health-generation-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const runId='EVAL-recovered',file=path.join(root,'events.jsonl'),first=`${runId}:one:launch`,next=`${first}:recover:next`;
 await writeFile(path.join(root,'manifest.json'),JSON.stringify({run_id:runId,executions:[{id:'one'}]}));
 for(const [type,id,data] of [['started',first,{}],['failed',first,{error:{code:'preflight_failed'}}]])await appendEvent(file,{source:'test',runId,executionId:'one',type:`dev.dd.eval.operation.${type}`,data:{operation_id:id,operation:'launch',...data}});
 await appendEvent(file,{source:'test',runId,type:'dev.dd.eval.completed',data:{state:'completed_with_failures'}});
 const {mkdir}=await import('node:fs/promises');await mkdir(path.join(root,'reports'));
 await writeFile(path.join(root,'reports/report.json'),JSON.stringify({run_id:runId,state:'completed_with_failures',cleanup_state:'settled',judge_status:'not_requested'}));
 for(const [type,data] of [['requested',{}],['started',{}],['completed',{result:{state:'candidate_ready',execution:'one'}}]])await appendEvent(file,{source:'test',runId,executionId:'one',type:`dev.dd.eval.operation.${type}`,data:{operation_id:next,operation:'launch',...data}});
 const observation=await reconcileEvalHealth({evalRoot:root});assert.equal(observation.state,'unconfirmed');assert.equal(observation.health.state,'unknown');
});
