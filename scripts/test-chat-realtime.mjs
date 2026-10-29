// Local-only Centrifugo smoke/load test; never uses application or database credentials.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { Centrifuge } from "centrifuge";
import { SignJWT } from "jose";

const binary = process.env.CHAT_TEST_CENTRIFUGO;
if (!binary) throw new Error("Set CHAT_TEST_CENTRIFUGO to a local Centrifugo v6.9.7 executable");
assert.match(execFileSync(binary,["version"],{encoding:"utf8",windowsHide:true}),/Centrifugo v6\.9\.7\b/);
const freePort = () => new Promise((resolve,reject) => {
  const s=createServer(); s.on("error",reject); s.listen(0,"127.0.0.1",()=>{ const p=s.address().port; s.close(()=>resolve(p)); });
});
const port=await freePort(), internal=await freePort();
const directory=await mkdtemp(join(tmpdir(),"hhwx-chat-smoke-"));
const secret=randomBytes(32).toString("hex"), key=randomBytes(32).toString("hex");
const config=JSON.parse(await readFile(new URL("../deploy/chat/centrifugo.json",import.meta.url),"utf8"));
config.http_server.port=String(port); config.http_server.internal_port=String(internal);
config.http_api.key=key; config.usage_stats={disabled:true};
config.client.token.hmac_secret_key=secret; config.client.allowed_origins=["http://localhost:3000"];
await writeFile(join(directory,"config.json"),JSON.stringify(config));
const child=spawn(binary,["--config",join(directory,"config.json")],{
  windowsHide:true,stdio:["ignore","pipe","pipe"],env:{SystemRoot:process.env.SystemRoot??"",PATH:process.env.PATH??""},
});
let log=""; child.stderr.on("data",(b)=>{log=(log+b).slice(-4000);});
child.stdout.on("data",(b)=>{log=(log+b).slice(-4000);});
const clients=[];
const until=async(predicate,ms=15000)=>{ const end=Date.now()+ms; while(!predicate()){if(Date.now()>end)throw new Error("Timed out waiting for local realtime test");await delay(20);} };
try {
  let healthy=false;
  for(let i=0;i<100;i++) { try { healthy=(await fetch(`http://127.0.0.1:${internal}/health`)).ok; } catch {} if(healthy)break; await delay(50); }
  assert.ok(healthy,`Local server did not start: ${log.replaceAll(secret,"[redacted]").replaceAll(key,"[redacted]")}`);
  const actor=randomUUID();
  const tokenFor=(channels)=>new SignJWT({channels}).setProtectedHeader({alg:"HS256"}).setSubject(actor)
    .setIssuer("hhwx-chat").setAudience("hhwx-chat").setExpirationTime("10m").sign(new TextEncoder().encode(secret));
  const token=await tokenFor(["chat_activity:main"]);
  const subscriptionToken=await new SignJWT({channel:"chat:main"}).setProtectedHeader({alg:"HS256"}).setSubject(actor).setIssuer("hhwx-chat").setAudience("hhwx-chat").setExpirationTime("10m").sign(new TextEncoder().encode(secret));
  const subscriptions=[];
  let subscribed=0,received=0; const durations=[],started=new Map();
  const publish=async(data,id,skip_history=false,channel="chat:main")=>{
    const response=await fetch(`http://127.0.0.1:${internal}/api/publish`,{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":key},
      body:JSON.stringify({channel,data,idempotency_key:id,skip_history})});
    const body=await response.json(); assert.equal(body.error,undefined); return body;
  };
  for(let i=0;i<200;i++) {
    const c=new Centrifuge(`ws://127.0.0.1:${port}/connection/websocket`,{token,websocket:WebSocket});
    const sub=c.newSubscription("chat:main",{token:subscriptionToken}); subscriptions.push(sub);
    sub.on("subscribed",()=>{subscribed++;}); sub.subscribe();
    sub.on("publication",(ctx)=>{ received++; const at=started.get(ctx.data.message?.id); if(at)durations.push(performance.now()-at); });
    clients.push(c); c.connect();
  }
  await until(()=>subscribed===200);
  const makeMessage=()=>({type:"message.created",message:{id:randomUUID(),clientRequestId:randomUUID(),content:"这是一条用于本地性能验证的纯文字消息，验证广播与重连行为。".repeat(2).slice(0,50),createdAt:new Date().toISOString().replace("Z","000Z"),author:{userId:randomUUID(),username:"local_test",publicUid:12345,avatarCardId:1,avatarCardServer:null,avatarCardTrainType:"normal"}}});
  const sample=makeMessage(); started.set(sample.message.id,performance.now());
  await publish(sample,"same-command"); await publish(sample,"same-command");
  await until(()=>received>=200); await delay(100); assert.equal(received,200,"idempotent publication must not fan out twice");
  const baseline=received;
  for(let i=0;i<100;i++){const event=makeMessage();started.set(event.message.id,performance.now());await publish(event,randomUUID());}
  await until(()=>received===baseline+20000);
  const one=clients[0],sub=subscriptions[0]; let recovered=false;
  sub.on("subscribed",ctx=>{recovered=ctx.recovered;});
  one.disconnect(); await delay(50);
  const before=received; await publish(makeMessage(),randomUUID()); await until(()=>received===before+199);
  one.connect(); await until(()=>recovered); await until(()=>received===before+200);
  let activity=0;one.on("publication",ctx=>{if(ctx.channel==="chat_activity:main")activity++;});
  sub.unsubscribe();await delay(50);
  const closed=received;
  await publish({type:"stamp.sent",id:randomUUID()},randomUUID(),true);
  await publish(makeMessage(),randomUUID());
  await publish({type:"activity"},randomUUID(),false,"chat_activity:main");
  await until(()=>received===closed+398&&activity===1);
  recovered=false;sub.subscribe();await until(()=>recovered);await until(()=>received===closed+399);
  assert.equal(received,closed+399,"reopening replays the saved message, never the ephemeral stamp");
  const fanoutDeliveries=received;
  const maxMessage=makeMessage();maxMessage.message.content="🌟".repeat(1000);
  await publish(maxMessage,randomUUID());await until(()=>received===fanoutDeliveries+200);
  await assert.rejects(one.publish("chat:main",{forged:true}),(error)=>error.code===103);
  const permissionProbe=new Centrifuge(`ws://127.0.0.1:${port}/connection/websocket`,{token:await tokenFor([]),websocket:WebSocket});
  clients.push(permissionProbe); permissionProbe.connect(); await permissionProbe.ready(2000);
  const denied=permissionProbe.newSubscription("chat:main"); let denialCode=null;
  denied.on("unsubscribed",(ctx)=>{denialCode=ctx.code;}); denied.subscribe();
  await assert.rejects(denied.ready(1000),(error)=>error.code===7);
  assert.equal(denialCode,103,"server must reject the subscription with permission denied");
  permissionProbe.removeSubscription(denied); permissionProbe.disconnect();
  const presenceActor=randomUUID(),joins=[],leaves=[];
  one.on('join',ctx=>{if(ctx.info.user===presenceActor)joins.push(ctx.info.client);});
  one.on('leave',ctx=>{if(ctx.info.user===presenceActor)leaves.push(ctx.info.client);});
  const presenceClient=async(visible)=>{
    const token=await new SignJWT({subs:{'chat_activity:main':{
      ...(visible?{info:{userId:presenceActor,username:'presence_test',publicUid:1,avatarCardId:1,avatarCardServer:null,avatarCardTrainType:'normal'}}:{}),
      override:{presence:{value:visible},join_leave:{value:visible}},
    }}}).setProtectedHeader({alg:'HS256'}).setSubject(presenceActor).setIssuer('hhwx-chat').setAudience('hhwx-chat').setExpirationTime('10m').sign(new TextEncoder().encode(secret));
    const client=new Centrifuge(`ws://127.0.0.1:${port}/connection/websocket`,{token,websocket:WebSocket});clients.push(client);client.connect();await client.ready(2000);return client;
  };
  const visibleA=await presenceClient(true),visibleB=await presenceClient(true);
  await until(()=>joins.length===2);assert.equal(new Set(joins).size,2,'same account keeps distinct connection IDs');
  visibleA.disconnect();await until(()=>leaves.length===1);
  const invisible=await presenceClient(false);
  const presenceResponse=await fetch(`http://127.0.0.1:${internal}/api/presence`,{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':key},body:JSON.stringify({channel:'chat_activity:main'})});
  const presence=(await presenceResponse.json()).result.presence;
  assert.equal(Object.values(presence).filter(c=>c.user===presenceActor).length,1,'hidden connection is absent from broker presence itself');
  await assert.rejects(invisible.presence('chat_activity:main'),e=>e.code===103);
  visibleB.disconnect();await until(()=>leaves.length===2);
  invisible.disconnect();await delay(150);
  assert.equal(joins.length,2);assert.equal(leaves.length,2,'hidden connections emit neither join nor leave');
  const recipient=randomUUID(),otherRecipient=randomUUID(),inboxes=[[],[],[]];
  for(const [index,userId] of [recipient,recipient,otherRecipient].entries()){
    const channel='chat_mentions:'+userId;
    const inboxToken=await new SignJWT({subs:{[channel]:{}}}).setProtectedHeader({alg:'HS256'}).setSubject(userId)
      .setIssuer('hhwx-chat').setAudience('hhwx-chat').setExpirationTime('10m').sign(new TextEncoder().encode(secret));
    const client=new Centrifuge(`ws://127.0.0.1:${port}/connection/websocket`,{token:inboxToken,websocket:WebSocket});
    client.on('publication',ctx=>inboxes[index].push(ctx.data));clients.push(client);client.connect();await client.ready(2000);
  }
  const confirmation={type:'mentions.changed',roomId:'main',acknowledgedMessageIds:[randomUUID()]};
  await publish(confirmation,randomUUID(),false,'chat_mentions:'+recipient);
  await until(()=>inboxes[0].length===1&&inboxes[1].length===1);await delay(100);
  assert.deepEqual(inboxes,[[confirmation],[confirmation],[]],'Acknowledged IDs reach both owner devices and no other account');
  const foreignInbox=clients.at(-1).newSubscription('chat_mentions:'+recipient);foreignInbox.subscribe();
  await assert.rejects(foreignInbox.ready(1000),error=>error.code===7);clients.at(-1).removeSubscription(foreignInbox);
  durations.sort((a,b)=>a-b);
  console.log(JSON.stringify({server:"6.9.7",sdk:"5.7.4",clients:200,fanoutPublications:102,fanoutDeliveries,
    sampleEventBytes:Buffer.byteLength(JSON.stringify(sample)),p95LocalMs:Math.round(durations[Math.floor(durations.length*.95)]),
    idempotency:true,nativeRecovery:true,reopenRecovery:true,closedActivity:true,stampsNotReplayed:true,maxLengthLiveFanout:true,clientPublishDenied:true,presenceJoinLeave:true,invisiblePresenceAndEventsSuppressed:true,mentionConfirmationDelivery:true,mentionAccountIsolation:true,databaseIntegration:"not exercised",compression:false,tls:false},null,2));
} finally {
  clients.forEach((c)=>c.disconnect()); child.kill();
  await new Promise((resolve)=>{if(child.exitCode!==null)resolve();else child.once("exit",resolve);});
  await rm(directory,{recursive:true,force:true});
}
