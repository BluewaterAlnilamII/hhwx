import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';
import * as contract from '../src/lib/chat/chat-stamp-contract.ts';
import * as chatContract from '../src/lib/chat/chat-contract.ts';
import { ApiRouteError } from '../src/lib/api-contracts.ts';
import * as responses from '../src/lib/api-response.ts';

function compile(path, deps, globals={}) {
  const exports={};
  const {outputText}=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  runInNewContext(outputText,{exports,require(id){assert.ok(id in deps,id);return deps[id];},...globals});
  return exports;
}
test('stamp validation accepts only owned master identities; the single publisher drops over five in a rolling second',async()=>{
  let now=0;const sent=[];
  const server=compile('../src/lib/chat/chat-stamp-server.ts',{
    'server-only':{},'@/lib/api-contracts':{ApiRouteError},'./chat-stamp-contract':contract,'./chat-contract':chatContract,
    '@/lib/bandori-stamps-api-server':{readBandoriStampsApiDataset:async()=>({'1':{imageName:['one','','','one'],changedStamps:[[],[],[],[{imageName:'changed'}]]}})},
    './chat-server':{publishChatEvent:async (e,roomId)=>{sent.push({e,roomId});}},
  },{Date:{now:()=>now}});
  assert.deepEqual(await server.requireChatStamp({id:1,region:'cn',kind:'normal',imageUrl:'https://untrusted'}),{id:1,region:'cn',kind:'normal'});
  for(const value of [{id:2,region:'cn',kind:'normal'},{id:1,region:'en',kind:'normal'},{id:1,region:'jp',kind:'changed'},{id:NaN,region:'cn',kind:'normal'}])
    await assert.rejects(server.requireChatStamp(value),{code:'CHAT_INVALID_STAMP'});
  await Promise.all(Array.from({length:50},()=>server.publishChatStamp({id:randomUUID()})));
  assert.equal(sent.length,5);now=999;await server.publishChatStamp({},'other');assert.equal(sent.length,5);
  now=1000;await server.publishChatStamp({},'other');assert.equal(sent.length,6);
  assert.equal(sent[0].roomId,'main');assert.equal(sent[5].roomId,'other');
});
test('real stamp route authorizes once and schedules an ephemeral publication after the response',async()=>{
  const actor=randomUUID(),id=randomUUID(),calls=[],scheduled=[],published=[];
  let denied=false;
  const route=compile('../src/app/api/chat/stamps/route.ts',{
    'next/server':{after:fn=>scheduled.push(fn)},'@/lib/api-response':responses,
    '@/lib/chat/chat-server':{
      chatHeaders:()=>({'Cache-Control':'no-store'}),readChatBody:r=>r.json(),parseChatId:v=>v,requireChatRoom:()=> 'main',
      requireChatIdentity:async(_r,verify)=>{assert.equal(verify,true);if(denied)throw new ApiRouteError(401,'UNAUTHENTICATED','login');return{userId:actor};},
      chatRpc:async(name,args)=>{calls.push({name,args});return{username:'User',publicUid:3,nextStampAt:null};},
    },
    '@/lib/chat/chat-stamp-server':{requireChatStamp:async s=>contract.parseChatStampReference(s),publishChatStamp:async e=>published.push(e)},
  });
  const request=()=>new Request('http://localhost/api/chat/stamps',{method:'POST',body:JSON.stringify({clientRequestId:id,stamp:{id:1,region:'cn',kind:'normal'}})});
  const response=await route.POST(request());assert.equal(response.status,200);
  assert.equal(calls.length,1);assert.equal(calls[0].name,'authorize_chat_stamp');assert.equal(published.length,0);
  await scheduled[0]();assert.equal(published[0].type,'stamp.sent');assert.equal(published[0].userId,actor);
  assert.equal((await response.json()).data.nextStampAt,null);
  denied=true;assert.equal((await route.POST(request())).status,401);assert.equal(calls.length,1);
});
