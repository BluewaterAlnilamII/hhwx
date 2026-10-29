// Only accepts disposable local Supabase verification containers; never reads app credentials.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Centrifuge } from "centrifuge";
import * as jose from "jose";
import * as contracts from "../src/lib/api-contracts.ts";
import * as cache from "../src/lib/api-cache.ts";
import * as responses from "../src/lib/api-response.ts";
import * as chatContract from "../src/lib/chat/chat-contract.ts";
import { ChatSession } from "../src/lib/chat/chat-session.ts";

const container=process.env.CHAT_TEST_DB_CONTAINER, binary=process.env.CHAT_TEST_CENTRIFUGO;
assert.match(container??"",/^supabase_db_hhwx-chat-verify-[a-z0-9-]+$/);
assert.ok(binary,"Set CHAT_TEST_CENTRIFUGO to the pinned local executable");
assert.match(execFileSync(binary,["version"],{encoding:"utf8",windowsHide:true}),/Centrifugo v6\.9\.7\b/);
const sql=(query)=>new Promise((resolve,reject)=>{
  const p=spawn("docker",["exec","-i",container,"psql","-U","postgres","-d","postgres","-X","-Atq","-v","ON_ERROR_STOP=1"],{windowsHide:true});
  let out="",err="";
  p.stdout.on("data",(b)=>{out+=b;});p.stderr.on("data",(b)=>{err+=b;});
  p.on("error",reject);p.on("close",(code)=>code===0?resolve(out.trim()):reject(new Error(err.trim())));p.stdin.end(query);
});
assert.equal(await sql("select count(*) from chat_private.messages;"),"0","Use a fresh isolated database");
const until=async(predicate,ms=15000)=>{
  const end=Date.now()+ms;
  while(!await predicate()){assert.ok(Date.now()<end,"Timed out waiting for chat integration test");await delay(50);}
};
const freePort=()=>new Promise((resolve,reject)=>{
  const s=createServer();s.on("error",reject);s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});
});
const port=await freePort(),internal=await freePort();
const directory=await mkdtemp(join(tmpdir(),"hhwx-chat-postgres-"));
const secret=randomBytes(32).toString("hex"),key=randomBytes(24).toString("hex");
const actor=randomUUID(),moderator=randomUUID();
const config=JSON.parse(await readFile(new URL("../deploy/chat/centrifugo.json",import.meta.url),"utf8"));
config.http_server.port=String(port);config.http_server.internal_port=String(internal);
config.usage_stats={disabled:true};config.client.token.hmac_secret_key=secret;
config.client.allowed_origins=["http://localhost:3000"];config.http_api.key=key;
await writeFile(join(directory,"config.json"),JSON.stringify(config));
const env={CHAT_ENABLED:"true",SUPABASE_URL:"https://local.example",CHAT_TOKEN_SECRET:secret,
  CHAT_WEBSOCKET_URL:`ws://127.0.0.1:${port}/connection/websocket`,
  CHAT_PUBLISH_URL:`http://127.0.0.1:${internal}/api/publish`,CHAT_PUBLISH_API_KEY:key};
const warnings=[];
let rpcReads=0,publishAttempts=0;
const compile=async(file,dependencies,globals={})=>{
  const exports={};
  const {outputText}=ts.transpileModule(await readFile(new URL(file,import.meta.url),"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  runInNewContext(outputText,{exports,Request,URL,Buffer,TextEncoder,Date,AbortSignal,
    require(id){assert.ok(Object.hasOwn(dependencies,id),`Unexpected dependency ${id}`);return dependencies[id];},...globals});
  return exports;
};
// Auth supplies a synthetic identity; RPCs execute production SQL under service_role.
const server=await compile("../src/lib/chat/chat-server.ts",{
  "server-only":{},jose,"@/lib/api-contracts":contracts,"@/lib/api-cache":cache,"./chat-contract":chatContract,
  "@/lib/supabase-server":{createServerSupabaseClient:()=>({
    auth:{getUser:async()=>({data:{user:{id:actor,is_anonymous:false}},error:null}),
      getClaims:async()=>({data:{claims:{sub:actor,iss:"https://local.example/auth/v1",aud:"authenticated",role:"authenticated",exp:Math.floor(Date.now()/1000)+7200}},error:null})},
    rpc:async(name,args)=>{
      assert.ok(["send_chat_message","delete_chat_message","read_chat_messages","read_chat_viewer","read_newer_chat_messages","read_chat_activity","read_chat_snapshot","read_chat_online_users","read_chat_mentions"].includes(name));
      if(["read_chat_messages","read_newer_chat_messages","read_chat_activity","read_chat_snapshot"].includes(name))rpcReads++;
      const parameters=Object.entries(args).map(([k,v])=>{
        assert.match(k,/^p_[a-z_]+$/);return `${k} => ${v==null?"null":"'"+(k==="p_mentions"?JSON.stringify(v):Array.isArray(v)?"{"+v.join(",")+"}":String(v)).replaceAll("'","''")+"'"}`;
      }).join(",");
      try{return{data:JSON.parse(await sql(`set role service_role; select public.${name}(${parameters});`)),error:null};}
      catch(error){return{data:null,error:{message:error.message.match(/ERROR:\s+(CHAT_[A-Z_]+)/)?.[1]??"database failure"}};}
    },
  })},
},{process:{env},console:{warn:(...args)=>warnings.push(args)},fetch:(...args)=>{publishAttempts++;return fetch(...args);}});
const scheduled = new Set();
const dependencies={"@/lib/api-contracts":contracts,"@/lib/chat/chat-contract":chatContract,"@/lib/api-response":responses,"@/lib/chat/chat-server":server,
  "next/server":{after(callback){
    const task = new Promise((resolve) => setImmediate(resolve)).then(callback);
    scheduled.add(task);void task.finally(() => scheduled.delete(task));
  }}};
const finishPublications = () => Promise.all([...scheduled]);
const messages=await compile("../src/app/api/chat/messages/route.ts",dependencies);
const deletion=await compile("../src/app/api/chat/messages/[messageId]/route.ts",dependencies);
const connection=await compile("../src/app/api/chat/connection/route.ts",dependencies);
const mentions=await compile("../src/app/api/chat/mentions/route.ts",dependencies);
const presence=await compile("../src/app/api/chat/presence/route.ts",dependencies);
const api=async(path,init={})=>{
  const request=new Request(`http://localhost${path}`,{...init,headers:{...init.headers,authorization:"Bearer fixture"}});
  if(path.startsWith("/api/chat/connection"))return connection.POST(request);
  if(path==="/api/chat/mentions")return mentions.GET(request);
  if(path.startsWith("/api/chat/presence"))return presence.GET(request);
  if(init.method==="DELETE")return deletion.DELETE(request,{params:Promise.resolve({messageId:path.split("/").at(-1)})});
  return init.method==="POST"?messages.POST(request):messages.GET(request);
};
const send=async(clientRequestId=randomUUID(),content="local integration")=>{
  const result=await(await api("/api/chat/messages",{method:"POST",body:JSON.stringify({clientRequestId,content})})).json();
  if(!result.success)throw new Error(result.error.code);return result.data;
};
const resetCooldown=()=>sql(`update chat_private.user_state set send_window_started_at=null, send_count=0 where user_id='${actor}';`);
let child,client,otherClient,session,log="",subscriptions=0,lastRecovered=false;
const publications=[];
const seen=(id,type="message.created")=>publications.filter((p)=>p.type===type&&(p.message?.id??p.messageId)===id).length;
const report={postgres:await sql("show server_version;"),server:"6.9.7",tls:false,auth:"synthetic identity; real production handlers, RPC SQL and publisher"};
const start=async()=>{
  child=spawn(binary,["--config",join(directory,"config.json")],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{SystemRoot:process.env.SystemRoot??"",PATH:process.env.PATH??""}});
  child.stdout.on("data",(b)=>{log=(log+b).slice(-16000);});child.stderr.on("data",(b)=>{log=(log+b).slice(-16000);});
  await until(async()=>{try{return(await fetch(`http://127.0.0.1:${internal}/health`)).ok;}catch{return false;}});
};
const stop=async()=>{if(!child||child.exitCode!==null)return;child.kill();await new Promise((resolve)=>child.once("exit",resolve));};
try{
  await sql(`insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    select id,'authenticated','authenticated',id::text || '@example.invalid','{"provider":"email","providers":["email"]}',jsonb_build_object('username','chat_' || left(id::text,8)),now(),now() from unnest(array['${actor}'::uuid,'${moderator}'::uuid]) id;
    insert into public.user_roles(user_id,role) values ('${moderator}','chat_moderator');`);
  await start();
  assert.equal((await fetch(env.CHAT_PUBLISH_URL,{method:"POST",body:"{}"})).status,401);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/publish`,{method:"POST",body:"{}"})).status,404);
  session=new ChatSession(actor,{
    request:async(path,init)=>{const result=await(await api(path,init)).json();if(!result.success)throw new Error(result.error.code);return result.data;},
    transport:(auth,refresh,handlers)=>{
      client=new Centrifuge(auth.url,{token:auth.token,getToken:async()=>(await refresh()).token,websocket:WebSocket});
      const sub=client.newSubscription(auth.channel,{token:auth.subscriptionToken,getToken:async()=>(await refresh()).subscriptionToken});
      sub.on("subscribing",handlers.subscribing);sub.on("unsubscribed",handlers.unsubscribed);
      sub.on("publication",ctx=>{publications.push(ctx.data);handlers.publication(ctx.data);});
      sub.on("subscribed",ctx=>{subscriptions++;lastRecovered=ctx.recovered;handlers.subscribed(ctx);});
      client.on("publication",ctx=>{if(ctx.channel===auth.activityChannel)handlers.activityPublication(ctx.data);});
      client.on("subscribed",ctx=>{if(ctx.channel===auth.activityChannel)handlers.activitySubscribed(ctx);});
      client.on("join",ctx=>{if(ctx.channel===auth.activityChannel&&chatContract.isChatMentionUser(ctx.info.chanInfo))handlers.presenceChanged({type:'join',connection:{clientId:ctx.info.client,user:ctx.info.chanInfo}});});
      client.on("leave",ctx=>{if(ctx.channel===auth.activityChannel)handlers.presenceChanged({type:'leave',clientId:ctx.info.client});});
      client.on("connecting",handlers.connecting);client.on("disconnected",handlers.disconnected);
      return {connect:()=>client.connect(),disconnect:()=>client.disconnect(),subscribeMessages:()=>sub.subscribe(),unsubscribeMessages:()=>sub.unsubscribe()};
    },
  });
  session.setOpen(true);await session.activate();await until(()=>session.getSnapshot().status==="live");
  const presenceConnection=await server.issueChatConnection({userId:actor,expiresAt:Math.floor(Date.now()/1000)+3600});
  otherClient=new Centrifuge(presenceConnection.url,{token:presenceConnection.token,websocket:WebSocket});
  let duplicateSubscribed=false;otherClient.on('subscribed',ctx=>{if(ctx.channel===presenceConnection.activityChannel)duplicateSubscribed=true;});
  otherClient.connect();await until(()=>duplicateSubscribed);
  assert.equal((await server.readChatPresence(actor,'main')).length,1,'two tabs count as one account');
  await assert.rejects(otherClient.presence(presenceConnection.activityChannel),e=>e.code===103,'raw presence must be private');
  await assert.rejects(otherClient.presenceStats(presenceConnection.activityChannel),e=>e.code===103,'raw counts must not expose invisible connections');
  await sql(`set role service_role; select public.set_chat_presence_visibility('${actor}',false);`);
  assert.equal((await server.readChatPresence(actor,'main')).length,0,'already-connected hidden sessions disappear from the public list');
  await sql(`set role service_role; select public.set_chat_presence_visibility('${actor}',true);`);
  otherClient.disconnect();
  session.setOpen(false);
  assert.equal((await server.readChatPresence(actor,'main')).length,1,'closing the panel keeps the account online');
  session.setOpen(true);await until(()=>session.getSnapshot().status==='live');
  report.presenceDeduplicationAndPrivacy=true;
  const otherConnection=await server.issueChatConnection({userId:actor,expiresAt:Math.floor(Date.now()/1000)+3600},"other");
  const otherPublications=[];let otherSubscribed=false;
  otherClient=new Centrifuge(otherConnection.url,{token:otherConnection.token,websocket:WebSocket});
  const otherSub=otherClient.newSubscription(otherConnection.channel,{token:otherConnection.subscriptionToken});
  otherSub.on("subscribed",()=>{otherSubscribed=true;});
  otherSub.on("publication",ctx=>otherPublications.push(ctx.data));otherSub.subscribe();otherClient.connect();
  await until(()=>otherSubscribed);
  const otherEvent={type:"stamp.sent",id:randomUUID()};
  await server.publishChatEvent(otherEvent,"other");await until(()=>otherPublications.length===1);
  const mainEvent={type:"stamp.sent",id:randomUUID()};
  await server.publishChatEvent(mainEvent);await until(()=>publications.some(p=>p.id===mainEvent.id));
  assert.ok(!publications.some(p=>p.id===otherEvent.id));
  assert.ok(!otherPublications.some(p=>p.id===mainEvent.id));
  otherClient.disconnect();report.roomChannelIsolation=true;
  const started=performance.now(),request=randomUUID(),saved=await send(request);
  await until(()=>seen(saved.messageId)===1);report.commitAndPublishMs=Math.round(performance.now()-started);
  assert.equal((await send(request)).messageId,saved.messageId);await delay(100);assert.equal(seen(saved.messageId),1);
  assert.equal((await api(`/api/chat/messages/${saved.messageId}`,{method:"DELETE"})).status,200);
  await until(()=>seen(saved.messageId,"message.deleted")===1);report.createDeleteAndRetry=true;
  await resetCooldown();const concurrentId=randomUUID();
  const duplicates=await Promise.all(Array.from({length:4},()=>send(concurrentId)));
  assert.equal(new Set(duplicates.map((x)=>x.messageId)).size,1);await until(()=>seen(duplicates[0].messageId)===1);
  await resetCooldown();const beforeRejected=publishAttempts;
  const distinct=await Promise.allSettled(Array.from({length:24},()=>send()));
  await finishPublications();
  assert.equal(distinct.filter((x)=>x.status==="fulfilled").length,20);
  assert.ok(distinct.filter((x)=>x.status==="rejected").every((x)=>/CHAT_COOLDOWN/.test(x.reason.message)));
  assert.equal(publishAttempts-beforeRejected,40);report.concurrentIdempotencyAndQuota=true;
  assert.equal(await sql(`select send_count from chat_private.user_state where user_id='${actor}';`),"20");
  await resetCooldown();
  const mute=sql(`begin; set role service_role; select public.set_chat_mute('${moderator}','${actor}',now()+interval '1 hour'); select pg_sleep(1); commit;`);
  await until(async()=>Number(await sql("select count(*) from pg_stat_activity where wait_event='PgSleep';"))===1);
  const beforeMuted=publishAttempts;await assert.rejects(send(),/CHAT_MUTED/);await mute;assert.equal(publishAttempts,beforeMuted);
  await sql(`set role service_role; select public.set_chat_mute('${moderator}','${actor}',null);`);
  const rolledBack=randomUUID();
  await sql(`begin; set role service_role; select public.send_chat_message('${actor}','${rolledBack}','rolled back'); rollback;`);
  assert.equal(await sql(`select count(*) from chat_private.messages where client_request_id='${rolledBack}';`),"0");report.concurrentMuteAndRollback=true;
  // Broker stays healthy: its stream has no gap for a publication rejected by the API.
  await resetCooldown();env.CHAT_PUBLISH_API_KEY="intentionally-wrong";
  const missed=await send();await finishPublications();env.CHAT_PUBLISH_API_KEY=key;
  assert.equal(seen(missed.messageId),0);assert.ok(!session.getSnapshot().messages.some((m)=>m.id===missed.messageId));
  const beforeReads=rpcReads;session.pause();await session.activate();
  await until(()=>session.getSnapshot().status==="live");
  assert.equal(lastRecovered,true);assert.equal(rpcReads,beforeReads,"native recovery makes no database read");
  assert.ok(!session.getSnapshot().messages.some(m=>m.id===missed.messageId),"an unpublished commit is outside the broker's recovery guarantee");
  await session.syncLatest();
  assert.ok(session.getSnapshot().messages.some(m=>m.id===missed.messageId));report.failedPublishWaitsForFreshSnapshot=true;
  session.pause();await resetCooldown();const offline=await send();await finishPublications();
  const readsBeforeRecovery=rpcReads;await session.activate();await until(()=>session.getSnapshot().status==="live");
  await until(()=>session.getSnapshot().messages.some(m=>m.id===offline.messageId));
  assert.equal(lastRecovered,true);assert.equal(rpcReads,readsBeforeRecovery);report.offlinePublicationRecovered=true;
  session.setOpen(false);const beforeClosed=rpcReads;
  await resetCooldown();const closed=await send();await finishPublications();
  assert.ok(!session.getSnapshot().messages.some(m=>m.id===closed.messageId));
  session.setOpen(true);await until(()=>session.getSnapshot().messages.some(m=>m.id===closed.messageId));
  assert.equal(rpcReads,beforeClosed);report.reopenWithoutSnapshot=true;
  const beforeRestart=subscriptions,beforeRestartReads=rpcReads;await stop();await start();
  await until(()=>subscriptions>beforeRestart&&session.getSnapshot().status==="live");
  assert.equal(rpcReads,beforeRestartReads+1);assert.equal(lastRecovered,false);report.restartSnapshot=true;report.privatePublishApi=true;
  console.log(JSON.stringify(report,null,2));
}catch(error){console.error(log.replaceAll(key,"[redacted]").replaceAll(secret,"[redacted]"));throw error;}
finally{
  session?.dispose();client?.disconnect();otherClient?.disconnect();await finishPublications();await stop();
  await sql(`delete from auth.users where id in ('${actor}','${moderator}');`);
  assert.ok(directory.startsWith(join(tmpdir(),"hhwx-chat-postgres-")));await rm(directory,{recursive:true,force:true});
}
