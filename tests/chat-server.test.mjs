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
      rpc: async (name,args) => { calls.push({ name,args }); return { data: rpcData, error: rpcError }; },
    }) },
  }, { process: { env }, console: { warn: (...args) => warnings.push(args) },
    fetch: async (url, init) => { publications.push({url,...init}); return publish(url,init); } });
  return { server, calls, env, claims, publications, warnings, setClaims(v) { claims=v; }, setAuthError(v) { authError=v; },
    setAnonymous(v) { anonymous=v; }, setError(v) { rpcError=v; }, setData(v) { rpcData=v; }, setPublish(v) { publish=v; } };
}
const request = (method="GET", body) => new Request("http://localhost/api/chat/messages", {
  method, headers: { authorization: "Bearer test" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test("only main is public; unknown rooms stop before RPC, upload and broadcast", async () => {
  const h = harness();
  const dependencies = { "@/lib/api-response": responses, "@/lib/chat/chat-server": h.server,
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
    assert.deepEqual(payload.channels, [`chat:${roomId}`]);
    assert.equal(connection.channel, `chat:${roomId}`);
    for (const event of [{ type: "message.created", message: { id: userId } },
      { type: "message.deleted", messageId: userId }, { type: "stamp.sent", id: userId }]) {
      await h.server.publishChatEvent(event, roomId);
      assert.equal(JSON.parse(h.publications.at(-1).body).channel, `chat:${roomId}`);
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
  const connection = await h.server.issueChatConnection({ userId,expiresAt });
  const { payload } = await jose.jwtVerify(connection.token,new TextEncoder().encode(h.env.CHAT_TOKEN_SECRET),{ issuer:"hhwx-chat",audience:"hhwx-chat" });
  assert.equal(payload.sub,userId); assert.equal(payload.exp,expiresAt);
  assert.deepEqual(payload.channels,["chat:main"]);
  assert.deepEqual(Object.keys(connection).sort(),["channel","token","url","viewer"]);
  assert.equal(connection.channel,"chat:main");
  assert.equal(h.calls.length,1);
  const long = await h.server.issueChatConnection({ userId, expiresAt: Math.floor(Date.now()/1000)+7200 });
  const longPayload = jose.decodeJwt(long.token);
  assert.equal(longPayload.exp - longPayload.iat,3600);
});

test("connection and history use the public JWT issuer even with an internal Supabase URL", async () => {
  const h = harness();
  const publicUrl = h.env.SUPABASE_URL;
  h.env.NEXT_PUBLIC_SUPABASE_URL = publicUrl;
  h.env.SUPABASE_URL = "http://internal-auth.test:8000";
  const dependencies = { "@/lib/api-response": responses, "@/lib/chat/chat-server": h.server };
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
  const h=harness(); const saved={messageId:userId,deleted:false,message:{id:userId,content:"hi"}}; h.setData(saved);
  const route=compile("../src/app/api/chat/messages/route.ts",{
    "@/lib/api-response":responses,"@/lib/chat/chat-server":h.server,
  });
  const result=await route.POST(request("POST",{clientRequestId:userId,content:" hi ",userId:"forged"}));
  assert.equal(result.status,200); assert.match(result.headers.get("cache-control"),/no-store/);
  assert.equal(h.calls.length,2);
  assert.equal(h.calls[1].args.p_actor,userId); assert.equal(h.calls[1].args.p_content,"hi");
  assert.equal(h.calls[1].args.p_room_id,"main");
  assert.equal(h.calls[1].name,"send_chat_message");
  assert.equal(h.publications.length,0,"saved response does not wait for publication");
  await route.runAfter();
  assert.equal(h.publications.length,1);
  assert.deepEqual(JSON.parse(h.publications[0].body),{channel:"chat:main",idempotency_key:`message.created:${userId}`,data:{type:"message.created",message:saved.message}});
  assert.equal(h.publications[0].headers["X-API-Key"],h.env.CHAT_PUBLISH_API_KEY);
  assert.equal(h.publications[0].redirect,"error");
  h.setError({message:"CHAT_MUTED"});
  assert.equal((await route.POST(request("POST",{clientRequestId:userId,content:"hi"}))).status,403);
  await route.runAfter();
  assert.equal(h.publications.length,1);
  h.setError(null); h.setData({...saved,message:null,deleted:true});
  assert.equal((await route.POST(request("POST",{clientRequestId:userId,content:"hi"}))).status,200);
  await route.runAfter();
  assert.equal(h.publications.length,1,"retry of deleted message must not publish its old body");
  const read=await route.GET(request()); assert.equal(read.status,200);
});

test("failed publication preserves successful send and delete responses; failures never log payloads or keys", async () => {
  const h=harness(), saved={messageId:userId,deleted:false,message:{id:userId,content:"private message"}};
  h.setData(saved);
  const route=compile("../src/app/api/chat/messages/route.ts",{"@/lib/api-response":responses,"@/lib/chat/chat-server":h.server});
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
  const remove=compile("../src/app/api/chat/messages/[messageId]/route.ts",{"@/lib/api-response":responses,"@/lib/chat/chat-server":h.server});
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
  assert.equal(h.publications.length,1); assert.equal(h.warnings.length,1);
  assert.equal(h.publications[0].signal.aborted,true);
});
