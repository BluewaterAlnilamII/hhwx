import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as jose from "jose";
import * as contracts from "../src/lib/api-contracts.ts";
import * as cache from "../src/lib/api-cache.ts";
import * as chatContract from "../src/lib/chat/chat-contract.ts";
import * as responses from "../src/lib/api-response.ts";
import { execFileSync } from "node:child_process";

const userId = "10000000-0000-4000-8000-000000000001";
function compile(file, dependencies, globals = {}) {
  const exports = {};
  const scheduled = [];
  const { outputText } = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  runInNewContext(outputText, { exports, Request, URL, Buffer, TextEncoder, Date, AbortSignal, ...globals, require(id) {
    if (id === "next/server") return { after: (callback) => scheduled.push(callback) };
    assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency ${id}`); return dependencies[id];
  } });
  return { ...exports, runAfter: async () => { for (const callback of scheduled.splice(0)) await callback(); } };
}
function harness() {
  const env = { CHAT_ENABLED: "true", SUPABASE_URL: "https://project.example", CHAT_TOKEN_SECRET: "x".repeat(40), CHAT_WEBSOCKET_URL: "wss://chat.example/connection/websocket",
    CHAT_PUBLISH_URL: "http://127.0.0.1:9000/api/publish", CHAT_PUBLISH_API_KEY: "private-publish-key" };
  let claims = { iss: "https://project.example/auth/v1", aud: "authenticated", role: "authenticated", sub: userId, exp: Math.floor(Date.now()/1000)+90 };
  let anonymous = false, authError = null, rpcError = null;
  let publish = async () => Response.json({ result: {} });
  let rpcData = { userId, canModerate: false, mutedUntil: null, nextSendAt: null };
  const calls = [], publications = [], warnings = [];
  const server = compile("../src/lib/chat/chat-server.ts", {
    "server-only": {}, jose, "@/lib/api-contracts": contracts, "@/lib/api-cache": cache, "./chat-contract": chatContract,
    "@/lib/supabase-server": { createServerSupabaseClient: () => ({
      auth: {
        getClaims: async () => { calls.push("claims"); return { data: { claims }, error: null }; },
        getUser: async (token) => { assert.equal(token,"test"); calls.push("user"); return { data: { user: { id: userId, is_anonymous: anonymous } }, error: authError }; },
      },
      rpc: async (name,args) => { calls.push({ name,args }); return { data: typeof rpcData === 'function' ? rpcData(name) : rpcData, error: rpcError }; },
    }) },
  }, { process: { env }, console: { warn: (...args) => warnings.push(args) },
    fetch: async (url, init) => { publications.push({url,...init}); return publish(url,init); } });
  return { server, calls, env, claims, publications, warnings, setClaims(v) { claims=v; }, setAuthError(v) { authError=v; },
    setAnonymous(v) { anonymous=v; }, setError(v) { rpcError=v; }, setData(v) { rpcData=v; }, setPublish(v) { publish=v; } };
}
const request = (method="GET", body) => new Request("http://localhost/api/chat/messages", {
  method, headers: { authorization: "Bearer test" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test('presence reads only the private broker API, deduplicates accounts and returns only the database-filtered public list',async()=>{
  const h=harness(),other='10000000-0000-4000-8000-000000000002';
  h.setPublish(async()=>Response.json({result:{presence:{a:{user:userId,info:{secret:'private'}},b:{user:userId},c:{user:other}}}}));
  h.setData([{userId:other,username:'visible'}]);
  const dependencies={'@/lib/api-contracts':contracts,'@/lib/api-response':responses,'@/lib/chat/chat-server':h.server};
  const route=compile('../src/app/api/chat/presence/route.ts',dependencies);
  const response=await route.GET(request());assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.deepEqual((await response.json()).data,[{userId:other,username:'visible'}]);
  assert.equal(new URL(h.publications[0].url).pathname,'/api/presence');
  assert.equal(JSON.parse(h.publications[0].body).channel,'chat_activity:main');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.at(-1))),{name:'read_chat_online_users',args:{p_actor:userId,p_user_ids:[userId,other]}});
  const calls=h.publications.length;
  assert.equal((await route.GET(new Request('http://localhost/api/chat/presence'))).status,401);
  assert.equal((await route.GET(new Request('http://localhost/api/chat/presence?roomId=other',{headers:{authorization:'Bearer test'}}))).status,404);
  assert.equal(h.publications.length,calls);
  const connections=await route.GET(new Request('http://localhost/api/chat/presence?connections=1',{headers:{authorization:'Bearer test'}}));
  assert.deepEqual((await connections.json()).data,[{clientId:'c',user:{userId:other,username:'visible'}}],'hidden accounts and private broker metadata never escape');
  h.setPublish(async()=>Response.json({error:{message:'private broker failure'}}));
  const bad=await route.GET(request());assert.equal(bad.status,503);assert.doesNotMatch(JSON.stringify(await bad.json()),/private broker failure/);
});

test('directory is authenticated and unbounded; visibility writes are strictly typed and bound to the verified actor',async()=>{
  const h=harness(),dependencies={'@/lib/api-contracts':contracts,'@/lib/api-response':responses,'@/lib/chat/chat-server':h.server};
  const directory=compile('../src/app/api/chat/users/route.ts',dependencies),presence=compile('../src/app/api/chat/presence/route.ts',dependencies);
  h.setData(Array.from({length:1200},(_,i)=>({userId:String(i)})));
  const all=await directory.GET(request());assert.equal((await all.json()).data.length,1200);
  assert.equal(h.calls.at(-1).name,'read_chat_user_directory');
  assert.equal((await directory.GET(new Request('http://localhost/api/chat/users'))).status,401);
  for(const visible of [null,'false',0,{}])assert.equal((await presence.PATCH(request('PATCH',{visible}))).status,400);
  h.calls.length=0;h.setData(null);
  assert.equal((await presence.PATCH(request('PATCH',{visible:false,userId:'someone-else'}))).status,200);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)),['user',{name:'set_chat_presence_visibility',args:{p_actor:userId,p_visible:false}}]);
  assert.equal(new URL(h.publications.at(-1).url).pathname,'/api/disconnect');
  assert.deepEqual(JSON.parse(h.publications.at(-1).body),{user:userId,disconnect:{code:3001,reason:'presence changed'}});
  h.setPublish(async()=>Response.json({error:{message:'private failure'}}));
  assert.equal((await presence.PATCH(request('PATCH',{visible:false}))).status,503,'a failed visibility reconnect is not reported as success');
});

test("only main is public; unknown rooms stop before RPC, upload and broadcast", async () => {
  const h = harness();
  const dependencies = { "@/lib/api-contracts": contracts, "@/lib/chat/chat-contract": chatContract, "@/lib/api-response": responses, "@/lib/chat/chat-server": h.server,
    "@/lib/chat/chat-image-server": { issueChatImageUpload() { assert.fail("unexpected upload"); }, verifyChatImageUpload() { assert.fail("unexpected HEAD"); } },
    "@/lib/chat/chat-stamp-server": { requireChatStamp() { assert.fail("unexpected catalog read"); }, publishChatStamp() { assert.fail("unexpected stamp"); } } };
  assert.equal(h.server.requireChatRoom(request()), "main");
  assert.equal(h.server.requireChatRoom(new Request("http://localhost/?roomId=main")), "main");
  for (const [path, method] of [["connection", "POST"], ["messages", "GET"], ["messages", "POST"],
    ["images", "POST"], ["images/upload", "POST"], ["stamps", "POST"], ["messages/[messageId]", "DELETE"]]) {
    const route = compile(`../src/app/api/chat/${path}/route.ts`, dependencies);
    const response = await route[method](new Request(`http://localhost/api/chat/${path}?roomId=other`, {
      method, headers: { authorization: "Bearer test" },
    }), { params: Promise.resolve({ messageId: userId }) });
    assert.equal(response.status, 404, path);
    assert.equal((await response.json()).error.code, "CHAT_ROOM_NOT_FOUND");
    await route.runAfter();
  }
  assert.ok(h.calls.every(c => typeof c === "string"));
  assert.equal(h.publications.length, 0);
});

test("trusted room context scopes connection tokens and all event publications", async () => {
  const h = harness();
  for (const roomId of ["main", "other"]) {
    const connection = await h.server.issueChatConnection({ userId, expiresAt: Math.floor(Date.now()/1000)+60 }, roomId);
    const { payload } = await jose.jwtVerify(connection.token, new TextEncoder().encode(h.env.CHAT_TOKEN_SECRET));
    assert.deepEqual(Object.keys(payload.subs), [`chat_activity:${roomId}`,`chat_mentions:${userId}`]);
    assert.equal(connection.channel, `chat:${roomId}`);
    for (const event of [{ type: "message.created", message: { id: userId, createdAt: "2026-10-26T00:00:00.000000Z", author: { userId } } },
      { type: "message.deleted", messageId: userId }, { type: "stamp.sent", id: userId }]) {
      await h.server.publishChatEvent(event, roomId);
      assert.equal(JSON.parse(h.publications.at(-1).body).channel, `${event.type === "stamp.sent" ? "chat" : "chat_activity"}:${roomId}`);
    }
  }
});

test("CSP adds only the configured chat WebSocket origin when the launcher is enabled", () => {
  const script = `import config from './next.config.mjs'; console.log(JSON.stringify(await config.headers()));`;
  const headers = (enabled) => execFileSync(process.execPath,["--input-type=module","-e",script],{
    cwd:new URL("../",import.meta.url),encoding:"utf8",env:{...process.env,NEXT_PUBLIC_CHAT_ENABLED:enabled,CHAT_WEBSOCKET_URL:"wss://chat.example/connection/websocket?privatePath=value"},
  });
  assert.match(headers("true"),/wss:\/\/chat.example/);
  assert.doesNotMatch(headers("true"),/privatePath/);
  assert.doesNotMatch(headers("false"),/chat.example/);
});

test("activity reads and combined snapshots preserve authentication, room scope and no-store", async () => {
  const h=harness();h.setData({latest:null,latestOther:null});
  const dependencies={"@/lib/api-contracts":contracts,"@/lib/api-response":responses,"@/lib/chat/chat-server":h.server};
  const activity=compile("../src/app/api/chat/activity/route.ts",dependencies);
  const response=await activity.GET(request());assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(h.calls.at(-1).name,'read_chat_activity');assert.equal(h.calls.at(-1).args.p_actor,userId);
  const reads=h.calls.filter(c=>c.name).length;
  assert.equal((await activity.GET(new Request('http://localhost/api/chat/activity'))).status,401);
  assert.equal((await activity.GET(new Request('http://localhost/api/chat/activity?roomId=other',{headers:{authorization:'Bearer test'}}))).status,404);
  assert.equal(h.calls.filter(c=>c.name).length,reads);
  const messages=compile("../src/app/api/chat/messages/route.ts",dependencies);
  await messages.GET(new Request('http://localhost/api/chat/messages?activity=1',{headers:{authorization:'Bearer test'}}));
  assert.equal(h.calls.at(-1).name,'read_chat_snapshot');assert.equal(h.calls.at(-1).args.p_room_id,'main');
});

test("registered claims only; sends check the authenticated Auth user once without separate email queries", async () => {
  const h = harness();
  await assert.rejects(h.server.requireChatIdentity(new Request("http://localhost")), { status: 401 });
  const valid = { ...h.claims };
  for (const bad of [{ exp: 0 }, { is_anonymous: true }, { role: "service_role" }, { aud: "other" }, { iss: "https://other/auth/v1" }, { sub: "invalid" }]) {
    h.setClaims({ ...valid, ...bad }); await assert.rejects(h.server.requireChatIdentity(request()), { status: 401 });
  }
  h.setClaims(valid); assert.equal((await h.server.requireChatIdentity(request())).userId, userId);
  h.calls.length=0; await h.server.requireChatIdentity(request("POST",{}),true);
  assert.deepEqual(h.calls,["user"]);
  h.setAnonymous(true); await assert.rejects(h.server.requireChatIdentity(request(),true), { status: 401 });
  h.setAnonymous(false); h.setAuthError({message:"invalid session"}); await assert.rejects(h.server.requireChatIdentity(request(),true), { status: 401 });
  h.env.CHAT_ENABLED="false"; await assert.rejects(h.server.requireChatIdentity(request()), { code: "CHAT_DISABLED" });
});

test("JWT has fixed room and never outlives the authorizing session; no private fields returned", async () => {
  const h = harness(); const expiresAt = Math.floor(Date.now()/1000)+60;
  const profile={userId,username:'visible',publicUid:1,avatarCardId:1,avatarCardServer:null,avatarCardTrainType:'normal'};
  h.setData(name=>name==='read_chat_online_users'?[profile]:{userId,canModerate:false,mutedUntil:null,nextSendAt:null});
  const connection = await h.server.issueChatConnection({ userId,expiresAt });
  const { payload } = await jose.jwtVerify(connection.token,new TextEncoder().encode(h.env.CHAT_TOKEN_SECRET),{ issuer:"hhwx-chat",audience:"hhwx-chat" });
  assert.equal(payload.sub,userId); assert.equal(payload.exp,expiresAt);
  assert.deepEqual(Object.keys(payload.subs),["chat_activity:main",`chat_mentions:${userId}`]);
  assert.deepEqual(payload.subs['chat_activity:main'],{info:profile,override:{presence:{value:true},join_leave:{value:true}}});
  assert.deepEqual(Object.keys(connection).sort(),["activityChannel","channel","mentionChannel","subscriptionToken","token","url","viewer"]);
  assert.equal(connection.channel,"chat:main");
  const subscription = (await jose.jwtVerify(connection.subscriptionToken,new TextEncoder().encode(h.env.CHAT_TOKEN_SECRET),
    {issuer:"hhwx-chat",audience:"hhwx-chat"})).payload;
  assert.equal(subscription.sub,userId);assert.equal(subscription.channel,"chat:main");assert.equal(subscription.exp,expiresAt);
  const legacy = await h.server.issueChatConnection({userId,expiresAt},"main",false);
  assert.deepEqual(Object.keys(jose.decodeJwt(legacy.token).subs),["chat:main",`chat_mentions:${userId}`]);
  assert.equal(h.calls.length,3, "activity credentials also check current presence visibility");
  const long = await h.server.issueChatConnection({ userId, expiresAt: Math.floor(Date.now()/1000)+7200 });
  const longPayload = jose.decodeJwt(long.token);
  assert.equal(longPayload.exp - longPayload.iat,3600);
  h.setData(name=>name==='read_chat_online_users'?[]:{userId,canModerate:false,mutedUntil:null,nextSendAt:null});
  const hidden=await h.server.issueChatConnection({userId,expiresAt});
  assert.deepEqual(jose.decodeJwt(hidden.token).subs['chat_activity:main'],{override:{presence:{value:false},join_leave:{value:false}}},'invisible users do not enter the public presence store or emit join/leave');
});

test("connection and history use the public JWT issuer even with an internal Supabase URL", async () => {
  const h = harness();
  const publicUrl = h.env.SUPABASE_URL;
  h.env.NEXT_PUBLIC_SUPABASE_URL = publicUrl;
  h.env.SUPABASE_URL = "http://internal-auth.test:8000";
  const dependencies = { "@/lib/api-contracts": contracts, "@/lib/chat/chat-contract": chatContract, "@/lib/api-response": responses, "@/lib/chat/chat-server": h.server };
  const connection = compile("../src/app/api/chat/connection/route.ts", dependencies);
  const messages = compile("../src/app/api/chat/messages/route.ts", dependencies);
  for (const [handler, method, rpc] of [[connection.POST, "POST", "read_chat_viewer"], [messages.GET, "GET", "read_chat_messages"]]) {
    h.calls.length = 0;
    assert.equal((await handler(request(method))).status, 200);
    assert.deepEqual(h.calls.map(call => typeof call === "string" ? call : call.name), ["claims", rpc]);
    assert.equal(h.calls[1].args.p_actor, userId);
  }
  for (const issuer of [h.env.SUPABASE_URL, "https://other.example"]) {
    h.setClaims({ ...h.claims, iss: `${issuer}/auth/v1` });
    h.calls.length = 0;
    assert.equal((await connection.POST(request("POST"))).status, 401);
    assert.equal((await messages.GET(request())).status, 401);
    assert.deepEqual(h.calls, ["claims", "claims"], "rejected issuers must not reach the database");
  }
  delete h.env.NEXT_PUBLIC_SUPABASE_URL;
  h.env.SUPABASE_URL = publicUrl;
  h.setClaims(h.claims);
  assert.equal((await connection.POST(request("POST"))).status, 200, "server URL remains the fallback when no public URL is configured");
});

test("content, microsecond cursors and body byte limit reject bad input; DB internals stay private", async () => {
  const { server:s,...h }=harness();
  assert.equal(s.parseChatContent(" 🌟 "),"🌟");
  assert.equal(s.parseChatContent("🌟".repeat(1000)).length,2000);
  for(const bad of [" ",null,"a\0b","🌟".repeat(1001)]) assert.throws(()=>s.parseChatContent(bad),{status:400});
  assert.equal(s.parseChatCursor(`2026-01-01T00:00:00.123456Z|${userId}`).createdAt,"2026-01-01T00:00:00.123456Z");
  assert.throws(()=>s.parseChatCursor(`2026-01-01T00:00:00.123Z|${userId}`),{status:400});
  await assert.rejects(s.readChatBody(request("POST",{ content:"a".repeat(17000) })),{status:413});
  h.setError({ message:"private database error",details:"private body" });
  await assert.rejects(s.chatRpc("send_chat_message",{}),(e)=>e.code==="CHAT_UNAVAILABLE" && !e.details);
  h.setError({message:"CHAT_COOLDOWN",details:JSON.stringify({retryAt:"2026-01-01T00:00:00Z",secret:"private"})});
  await assert.rejects(s.chatRpc("send_chat_message",{}),(e)=>e.status===429 && Object.keys(e.details).join() === "retryAt");
});

test("message routes publish committed results once without readback and never publish rejected writes", async () => {
  const h=harness(); const saved={messageId:userId,deleted:false,message:{id:userId,content:"hi",createdAt:"2026-10-26T00:00:00.000000Z",author:{userId}}}; h.setData(saved);
  const route=compile("../src/app/api/chat/messages/route.ts",{
    "@/lib/api-contracts":contracts,"@/lib/api-response":responses,"@/lib/chat/chat-server":h.server,
  });
  const result=await route.POST(request("POST",{clientRequestId:userId,content:" hi ",userId:"forged"}));
  assert.equal(result.status,200); assert.match(result.headers.get("cache-control"),/no-store/);
  assert.equal(h.calls.length,2);
  assert.equal(h.calls[1].args.p_actor,userId); assert.equal(h.calls[1].args.p_content,"hi");
  assert.equal(h.calls[1].args.p_room_id,"main");
  assert.equal(h.calls[1].name,"send_chat_message");
  assert.equal(h.publications.length,0,"saved response does not wait for publication");
  await route.runAfter();
  assert.equal(h.publications.length,2);
  assert.deepEqual(JSON.parse(h.publications[0].body),{channel:"chat:main",skip_history:false,idempotency_key:`message.created:${userId}`,data:{type:"message.created",message:saved.message}});
  assert.equal(h.publications[0].headers["X-API-Key"],h.env.CHAT_PUBLISH_API_KEY);
  assert.equal(h.publications[0].redirect,"error");
  h.setError({message:"CHAT_MUTED"});
  assert.equal((await route.POST(request("POST",{clientRequestId:userId,content:"hi"}))).status,403);
  await route.runAfter();
  assert.equal(h.publications.length,2);
  h.setError(null); h.setData({...saved,message:null,deleted:true});
  assert.equal((await route.POST(request("POST",{clientRequestId:userId,content:"hi"}))).status,200);
  await route.runAfter();
  assert.equal(h.publications.length,2,"retry of deleted message must not publish its old body");
  const read=await route.GET(request()); assert.equal(read.status,200);
});

test("failed publication preserves successful send and delete responses; failures never log payloads or keys", async () => {
  const h=harness(), saved={messageId:userId,deleted:false,message:{id:userId,content:"private message"}};
  h.setData(saved);
  const route=compile("../src/app/api/chat/messages/route.ts",{"@/lib/api-contracts":contracts,"@/lib/api-response":responses,"@/lib/chat/chat-server":h.server});
  for(const response of [() => Response.json({error:{code:102,message:"private upstream details"}}),
    () => new Response("private upstream details",{status:503}), () => new Response("not JSON"),
    () => { throw new Error("private connection details"); }]) {
    h.setPublish(response);
    const result=await route.POST(request("POST",{clientRequestId:userId,content:"private message"}));
    assert.equal(result.status,200); assert.deepEqual((await result.json()).data,saved);
    await route.runAfter();
  }
  const deletion={type:"message.deleted",messageId:userId,deletedAt:new Date().toISOString()};
  h.setData(deletion);
  const remove=compile("../src/app/api/chat/messages/[messageId]/route.ts",{"@/lib/api-contracts":contracts,"@/lib/api-response":responses,"@/lib/chat/chat-server":h.server});
  const deleted=await remove.DELETE(request("DELETE"),{params:Promise.resolve({messageId:userId})});
  assert.equal(deleted.status,200); assert.deepEqual((await deleted.json()).data,deletion);
  await remove.runAfter();
  assert.equal(JSON.parse(h.publications.at(-1).body).data.type,"message.deleted");
  h.setError({message:"CHAT_FORBIDDEN"}); const before=h.publications.length;
  assert.equal((await remove.DELETE(request("DELETE"),{params:Promise.resolve({messageId:userId})})).status,403);
  await remove.runAfter();
  assert.equal(h.publications.length,before);
  assert.equal(h.warnings.length,5);
  assert.doesNotMatch(JSON.stringify(h.warnings),/private/);
});

test("publish timeout aborts the single attempt without rejecting a saved mutation", async () => {
  const h=harness();
  h.setPublish((_url,{signal})=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>resolve(Response.json({result:{}})),4000);
    signal.addEventListener("abort",()=>{ clearTimeout(timer); reject(signal.reason); },{once:true});
  }));
  const start=performance.now();
  await h.server.publishChatEvent({type:"message.deleted",messageId:userId,deletedAt:new Date().toISOString()});
  assert.ok(performance.now()-start<3500);
  assert.equal(h.publications.length,2); assert.equal(h.warnings.length,1);
  assert.equal(h.publications[0].signal.aborted,true);
});

test('forward reads validate cursors and authorization before invoking RPC', async () => {
  const h = harness(), deps = {'@/lib/api-contracts':contracts,'@/lib/api-response':responses,
    '@/lib/chat/chat-contract':chatContract,'@/lib/chat/chat-server':h.server};
  const history = compile('../src/app/api/chat/messages/route.ts',deps);
  const cursor = `2026-10-25T00:00:00.123456Z|${userId}`;
  const get = query => history.GET(new Request(`http://localhost/api/chat/messages?${query}`,{headers:{authorization:'Bearer test'}}));
  for(const query of ['after=', 'after=invalid', `before=${cursor}&after=${cursor}`]) assert.equal((await get(query)).status,400);
  assert.equal((await get(`after=${cursor}`)).status,200);
  assert.equal(h.calls.at(-1).name,'read_newer_chat_messages');
  assert.equal(h.calls.at(-1).args.p_after_at,'2026-10-25T00:00:00.123456Z');
  assert.equal((await history.GET(new Request('http://localhost/api/chat/messages?after='+cursor))).status,401);
});


test('reply and reaction routes validate targets, actor and room; reaction events never publish activity',async()=>{
 const h=harness(), deps={'@/lib/api-contracts':contracts,'@/lib/api-response':responses,'@/lib/chat/chat-server':h.server,
 '@/lib/comments/emoji':{COMMENT_EMOJI_NAME_SET:new Set(['KokoroYay'])}};
 const reactions=compile('../src/app/api/chat/messages/[messageId]/reactions/route.ts',deps);
 const context=compile('../src/app/api/chat/messages/[messageId]/context/route.ts',deps);
 const target={params:Promise.resolve({messageId:userId})};
 for(const body of [{emojiKey:'bogus',active:true},{emojiKey:'KokoroYay',active:1}]){
  assert.equal((await reactions.PUT(request('PUT',body),target)).status,400);
 }
 assert.ok(h.calls.every(c=>typeof c==='string'));
 const event={type:'message.reactions',messageId:userId,userId,ownEmojiKeys:['KokoroYay'],reactions:[{emojiKey:'KokoroYay',count:1}],version:1};h.setData(event);
 let response=await reactions.PUT(request('PUT',{emojiKey:'KokoroYay',active:true}),target);assert.equal(response.status,200);
 assert.equal(h.calls.at(-1).name,'set_chat_reaction');assert.equal(h.calls.at(-1).args.p_actor,userId);await reactions.runAfter();
 assert.equal(h.publications.length,1);let publication=JSON.parse(h.publications[0].body);assert.equal(publication.channel,'chat:main');assert.equal(publication.idempotency_key,`message.reactions:${userId}:1`);
 h.setData({...event,version:2});await reactions.PUT(request('PUT',{emojiKey:'KokoroYay',active:false}),target);await reactions.runAfter();assert.notEqual(JSON.parse(h.publications[1].body).idempotency_key,publication.idempotency_key);
 response=await reactions.GET(new Request('http://localhost/?emojiKey=KokoroYay',{headers:{authorization:'Bearer test'}}),target);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 response=await context.GET(request(),target);assert.equal(response.status,200);assert.equal(h.calls.at(-1).name,'read_chat_context');
 const calls=h.calls.filter(c=>typeof c!=='string').length;
 response=await context.GET(new Request('http://localhost/?roomId=other',{headers:{authorization:'Bearer test'}}),target);assert.equal(response.status,404);assert.equal(h.calls.filter(c=>typeof c!=='string').length,calls);
 h.setAnonymous(true);assert.equal((await reactions.PUT(request('PUT',{emojiKey:'KokoroYay',active:true}),target)).status,401);
 const messages=compile('../src/app/api/chat/messages/route.ts',{...deps,'@/lib/chat/chat-contract':chatContract});h.setAnonymous(false);
 assert.equal((await messages.POST(request('POST',{clientRequestId:userId,content:'answer',replyToId:'bad'}))).status,400);
 h.setData({deleted:false,message:{id:userId},nextSendAt:null});await messages.POST(request('POST',{clientRequestId:userId,content:'answer',replyToId:userId}));assert.equal(h.calls.at(-1).args.p_reply_to_id,userId);
 h.setError({message:'CHAT_REPLY_DELETED'});assert.equal((await messages.POST(request('POST',{clientRequestId:userId,content:'answer',replyToId:userId}))).status,409);
});


test('mention routes enforce identity, scope and payload bounds and target only the current recipient',async()=>{
 const h=harness(),deps={'@/lib/api-contracts':contracts,'@/lib/api-response':responses,'@/lib/chat/chat-server':h.server};
 const inbox=compile('../src/app/api/chat/mentions/route.ts',deps),users=compile('../src/app/api/chat/mentions/users/route.ts',deps);
 h.setData({items:[],total:0});assert.equal((await inbox.GET(request())).status,200);assert.equal(h.calls.at(-1).args.p_actor,userId);
 assert.equal((await inbox.GET(new Request('http://localhost/api/chat/mentions'))).status,401);
 assert.equal((await inbox.PUT(request('PUT',{messageIds:[]}))).status,400);
 assert.equal((await inbox.PUT(request('PUT',{messageIds:Array(51).fill(userId)}))).status,400);
 assert.equal((await inbox.PUT(request('PUT',{messageIds:['bad']}))).status,400);
 assert.equal((await inbox.PUT(request('PUT',{messageIds:[userId,userId],userId:'someone-else'}))).status,200);
 assert.equal(h.calls.at(-1).args.p_actor,userId);assert.deepEqual(Array.from(h.calls.at(-1).args.p_message_ids),[userId]);
 await inbox.runAfter();const confirmation=JSON.parse(h.publications.at(-1).body);assert.equal(confirmation.channel,`chat_mentions:${userId}`);
 assert.deepEqual(confirmation.data,{type:'mentions.changed',roomId:'main',acknowledgedMessageIds:[userId]});
 h.setData([]);assert.equal((await users.GET(new Request('http://localhost/?q=小明',{headers:{authorization:'Bearer test'}}))).status,200);
 assert.equal(h.calls.at(-1).args.p_query,'小明');
 assert.equal((await users.GET(new Request('http://localhost/?q='+ 'x'.repeat(97),{headers:{authorization:'Bearer test'}}))).status,400);
});

test('mention sends reject malformed ranges and publish one private invalidation per unique non-self target',async()=>{
 const h=harness(),other='10000000-0000-4000-8000-000000000002';
 const m={userId:other,start:0,end:2};assert.throws(()=>h.server.parseChatMentions([{...m,start:1}],'@A'));
 assert.throws(()=>h.server.parseChatMentions([m,m],'@A'));assert.deepEqual(Array.from(h.server.parseChatMentions(undefined,'@A')),[]);
 await h.server.publishChatEvent({type:'message.created',message:{id:userId,createdAt:'2026-10-27T00:00:00.000000Z',author:{userId},mentions:[m,{...m,start:3,end:5},{userId,start:6,end:8}]}});
 const publications=h.publications.map(p=>JSON.parse(p.body));assert.equal(publications.length,3);
 assert.equal(publications[2].channel,`chat_mentions:${other}`);assert.deepEqual(publications[2].data,{type:'mentions.changed'});
 assert.equal(JSON.stringify(publications[1].data).includes(other),false,'Room activity must not expose private inbox state');
});
