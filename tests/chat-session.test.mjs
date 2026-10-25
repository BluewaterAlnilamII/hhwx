import assert from "node:assert/strict";
import test from "node:test";
import { ChatSession, ChatRequestError } from "../src/lib/chat/chat-session.ts";
import { parseChatEvent } from "../src/lib/chat/chat-contract.ts";

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const userId = uuid(1);
const message = (n, content = "文字消息") => ({ id: uuid(n + 10), clientRequestId: uuid(n + 100), content,
  createdAt: new Date(Date.now() - 20000 + n).toISOString().replace("Z", "000Z"),
  author: { userId, username: "tester", publicUid: 1, avatarCardId: 1, avatarCardServer: null, avatarCardTrainType: "normal" } });
const created = (m) => ({ type: "message.created", message: m });
const deleted = (m) => ({ type: "message.deleted", messageId: m.id, deletedAt: new Date().toISOString() });
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function harness() {
  let handlers, refresh;
  let read = async () => ({ messages: [], nextCursor: null });
  let write = async () => { throw new Error("unexpected write"); };
  const calls = [];
  let connections = 0;
  let connect = async () => ({ token: "test", url: "ws://local", viewer: {
    userId, canModerate: false, mutedUntil: null, nextSendAt: null } });
  const session = new ChatSession(userId, {
    request: async (path, init = {}) => {
      calls.push({ path, ...init });
      if (path.endsWith("connection")) return connect();
      return init.method ? write(path, init) : read(path, init);
    },
    transport: (_connection, _refresh, events) => {
      handlers = events; refresh = _refresh;
      return { connect() { connections++; events.connecting(); }, disconnect() { events.disconnected(); } };
    },
  });
  return { session, calls, get handlers() { return handlers; }, get refresh() { return refresh; }, get connections() { return connections; },
    setRead(fn) { read = fn; }, setWrite(fn) { write = fn; }, setConnection(fn) { connect = fn; },
    async start() { await session.activate(); handlers.subscribed(); await tick(); } };
}

test('stamps are ephemeral during sync, suppress own echoes, preserve drafts and have an independent quota', async () => {
  const h=harness(),seen=[],gate=deferred();h.setRead(()=>gate.promise);
  h.session.subscribeStamps(e=>seen.push(e));
  await h.start();h.session.setDraft('keep this');
  const quota=new Date(Date.now()+60000).toISOString();
  h.setWrite(async(path)=>{assert.equal(path,'/api/chat/stamps');return {nextStampAt:quota};});
  const stamp={id:1,region:'cn',kind:'normal'};
  const id=h.session.sendStamp(stamp);
  const event={type:'stamp.sent',id,userId,publicUid:1,username:'me',stamp};
  h.handlers.publication(event);assert.equal(seen.length,0);
  h.handlers.publication({...event,id:crypto.randomUUID()});assert.equal(seen.length,1);
  assert.equal(h.session.getSnapshot().draft,'keep this');
  gate.resolve({messages:[],nextCursor:null});await tick();
  assert.equal(h.session.getSnapshot().messages.length,0);assert.equal(seen.length,1);
  assert.equal(h.session.getSnapshot().nextStampAt,quota);assert.equal(h.session.getSnapshot().viewer.nextSendAt,null);
  assert.equal(h.session.sendStamp(stamp),null);
  h.session.pause();h.handlers.publication({...event,id:crypto.randomUUID()});assert.equal(seen.length,1);
  h.session.dispose();
});

test('stamp HTTP sending remains usable while the receive connection is disconnected', async () => {
  const h=harness();await h.start();h.handlers.disconnected();
  h.setWrite(async(path)=>{assert.equal(path,'/api/chat/stamps');return{nextStampAt:null};});
  assert.ok(h.session.sendStamp({id:1,region:'cn',kind:'normal'}));await tick();
  assert.equal(h.calls.filter(c=>c.path==='/api/chat/stamps').length,1);
  h.session.dispose();assert.equal(h.session.sendStamp({id:1,region:'cn',kind:'normal'}),null);
});

test("initial snapshot merges buffered events and deletes before rendering; events never fetch profiles/history", async () => {
  const h = harness(), gate = deferred(), a = message(1), b = message(2);
  h.setRead(() => gate.promise);
  await h.start();
  h.handlers.publication(created(b)); h.handlers.publication(deleted(a)); h.handlers.publication(created(a));
  gate.resolve({ messages: [a, b], nextCursor: null }); await tick();
  assert.deepEqual(h.session.getSnapshot().messages.map((m) => m.id), [b.id]);
  for (let i = 0; i < 1000; i++) h.handlers.publication(created(message(i + 5)));
  assert.equal(h.session.getSnapshot().messages.length, 1001);
  assert.equal(h.calls.length, 2);
  h.session.dispose();
});

test("every reconnect reads one authoritative page including unpublished database writes", async () => {
  const h = harness(), a = message(1);
  h.setRead(async () => ({ messages: [a], nextCursor: null })); await h.start();
  const missed=message(2);
  h.setRead(async () => ({ messages: [a,missed], nextCursor: null }));
  h.session.pause(); await h.session.activate(); h.handlers.subscribed(); await tick();
  assert.equal(h.calls.length, 3);
  assert.deepEqual(h.session.getSnapshot().messages, [a, missed], "overlapping recovery merges without changing reading intent");
  assert.equal(h.session.getSnapshot().newMessages, 1);
  await h.session.jumpLatest();
  assert.equal(h.session.getSnapshot().messages.length, 2, "navigation keeps the merged history");
  const gate = deferred(); h.setRead(() => gate.promise);
  h.handlers.connecting(); h.handlers.subscribed();
  h.handlers.publication(deleted(a));
  gate.resolve({ messages: [a], nextCursor: null }); await tick();
  assert.deepEqual(h.session.getSnapshot().messages, [missed]);
  assert.equal(h.calls.length, 4);
  h.session.pause(true); await h.session.activate(); h.handlers.subscribed(); await tick();
  assert.equal(h.calls.length, 6, "reopening refreshes permissions and loads a new baseline");
  h.session.dispose();
});

test("token refresh does not reconnect or reread history", async () => {
  const h=harness(); await h.start();
  const connections=h.connections;
  await h.refresh();
  assert.equal(h.connections,connections);
  assert.equal(h.calls.filter((c)=>c.path==="/api/chat/messages").length,1);
  assert.equal(h.calls.filter((c)=>c.path==="/api/chat/connection").length,2);
  h.session.dispose();
});

test("closing keeps the latest 50 records including the tail; reopening displays them until one fresh page replaces them", async () => {
  const h = harness(); await h.start();
  const rows = Array.from({ length: 360 }, (_, i) => message(i));
  rows.slice(0, 300).forEach((m) => h.handlers.publication(created(m)));
  h.session.setFollowing(false);
  rows.slice(300).forEach((m) => h.handlers.publication(created(m)));
  h.session.setDraft("failed send"); await h.session.send(); h.session.setDraft("keep draft");
  const calls = h.calls.length;
  h.session.pause(true);
  assert.deepEqual(h.session.getSnapshot().messages.map((m) => m.id), rows.slice(-50).map((m) => m.id));
  assert.equal(h.session.getSnapshot().newMessages, 0);
  assert.equal(h.session.getSnapshot().hasNewerMessages, false);
  assert.equal(h.session.getSnapshot().nextCursor, null);
  assert.equal(h.session.getSnapshot().draft, "keep draft");
  assert.equal(h.session.getSnapshot().pending.length, 1);
  assert.equal(h.calls.length, calls, "closing does not query history");
  h.handlers.publication(created(message(400)));
  assert.equal(h.session.getSnapshot().messages.length, 50, "closed sessions ignore publications");
  const gate = deferred(); h.setRead(() => gate.promise);
  await h.session.activate(); h.handlers.subscribed();
  assert.equal(h.session.getSnapshot().messages.length, 50, "cached records remain during connection and history loading");
  const latest = message(401);
  gate.resolve({ messages: [latest], nextCursor: null }); await tick();
  assert.deepEqual(h.session.getSnapshot().messages, [latest], "the authoritative page removes stale/deleted cached records");
  assert.equal(h.calls.length, calls + 2, "reopen still uses just one credential request and one history read");
  h.session.dispose();
  assert.equal(h.session.getSnapshot().messages.length, 0, "account disposal clears retained records");
});

test("closing during a send keeps its late confirmation inside the 50-record limit and rejects a stale history read", async () => {
  const h = harness(); await h.start();
  for (let i = 0; i < 60; i++) h.handlers.publication(created(message(i)));
  const reply = deferred(), history = deferred(); h.setWrite(() => reply.promise); h.setRead(() => history.promise);
  const syncing = h.session.syncLatest();
  h.session.setDraft("late send"); const sending = h.session.send();
  const requestId = h.session.getSnapshot().pending[0].clientRequestId;
  h.session.pause(true);
  const saved = { ...message(61), clientRequestId: requestId };
  reply.resolve({ message: saved, messageId: saved.id, clientRequestId: requestId, deleted: false, nextSendAt: null });
  await sending;
  history.resolve({ messages: [message(0)], nextCursor: null }); await syncing;
  assert.equal(h.session.getSnapshot().messages.length, 50);
  assert.equal(h.session.getSnapshot().messages.at(-1).id, saved.id);
  assert.equal(h.session.getSnapshot().pending.length, 0);
  h.session.dispose();
});

test("failed bootstrap and history recover automatically without polling a healthy connection", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness();
  h.setConnection(async () => { throw new Error("offline"); });
  await h.session.activate();
  assert.equal(h.session.getSnapshot().status, "error");
  h.setConnection(async () => ({ token: "test", url: "ws://local", viewer: { userId, canModerate: false, mutedUntil: null, nextSendAt: null } }));
  t.mock.timers.tick(1200); await tick();
  assert.equal(h.connections, 1);
  h.setRead(async () => { throw new Error("temporary database outage"); });
  h.handlers.subscribed(); await tick();
  assert.equal(h.session.getSnapshot().status, "error");
  h.setRead(async () => ({ messages: [message(1)], nextCursor: null }));
  t.mock.timers.tick(2400); await tick();
  assert.equal(h.connections, 2);
  h.handlers.subscribed(); await tick();
  assert.equal(h.session.getSnapshot().status, "live");
  const requests = h.calls.length;
  t.mock.timers.tick(120000); await tick();
  assert.equal(h.calls.length, requests, "a healthy subscription makes no periodic history requests");
  h.session.dispose();
});

test("closing cancels recovery and an authorization rejection never retries", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness();
  h.setConnection(async () => { throw new Error("offline"); });
  await h.session.activate(); h.session.pause(true);
  t.mock.timers.tick(60000); await tick();
  assert.equal(h.calls.length, 1);
  h.setConnection(async () => { throw new ChatRequestError("AUTHENTICATION_FAILED"); });
  await h.session.activate();
  t.mock.timers.tick(60000); await tick();
  assert.equal(h.calls.length, 2);
  h.session.dispose();
});

test("terminal transport rejection stops retries and preserves drafts and pending sends", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness(); await h.start();
  h.session.setDraft("failed message"); await h.session.send();
  h.session.setDraft("new draft");
  const calls = h.calls.length, connections = h.connections;
  h.handlers.disconnected();
  t.mock.timers.tick(120000); await tick();
  assert.equal(h.calls.length, calls, "terminal disconnection makes no credential or history requests");
  assert.equal(h.connections, connections, "the application must not restart a terminal SDK connection");
  assert.equal(h.session.getSnapshot().status, "error");
  assert.equal(h.session.getSnapshot().draft, "new draft");
  assert.equal(h.session.getSnapshot().pending.length, 1);
  h.session.pause(true); await h.start();
  assert.equal(h.session.getSnapshot().status, "live", "explicit reopen can establish a fresh session");
  h.session.dispose();
});

test("delete and moderation expose failure to their own controls without removing a saved message", async () => {
  const h = harness(), saved = message(1);
  h.setRead(async () => ({ messages: [saved], nextCursor: null }));
  await h.start();
  h.setWrite(async () => { throw new ChatRequestError("CHAT_UNAVAILABLE"); });
  assert.equal(await h.session.remove(saved.id), false);
  assert.equal(await h.session.mute(userId, 60), false);
  assert.equal(h.session.getSnapshot().messages.length, 1);
  h.setWrite(async () => deleted(saved));
  assert.equal(await h.session.remove(saved.id), true);
  assert.equal(h.session.getSnapshot().messages.length, 0);
  h.session.dispose();
});

test("deletion window compacts in batches, rejects stale reads and does not reload for every later delete", async () => {
  const h=harness(), old=message(0), pending=deferred();
  h.setRead(async()=>({messages:[old],nextCursor:{createdAt:old.createdAt,id:old.id}})); await h.start();
  h.setRead(()=>pending.promise); const older=h.session.loadOlder();
  h.setRead(async()=>({messages:[old],nextCursor:null}));
  for(let i=0;i<=1000;i++) h.handlers.publication(deleted(message(i)));
  await tick();
  assert.equal(h.session.getSnapshot().messages.length,0,"filter known deletes before compacting markers");
  const reads=h.calls.filter((c)=>!c.method).length;
  for(let i=1001;i<1500;i++){ h.handlers.publication(deleted(message(i))); await tick(); }
  assert.equal(h.calls.filter((c)=>!c.method).length,reads);
  pending.resolve({messages:[old],nextCursor:null}); await older;
  assert.equal(h.session.getSnapshot().messages.length,0,"compaction cancelled the old page response");
  h.session.dispose();
});

test("a cancelled first snapshot cannot become the baseline on reconnect", async () => {
  const h = harness(), stale = deferred(); h.setRead(() => stale.promise); await h.start();
  h.session.pause();
  h.setRead(async () => ({ messages: [message(2)], nextCursor: null }));
  await h.session.activate(); h.handlers.subscribed(); await tick();
  stale.resolve({ messages: [message(1)], nextCursor: null }); await tick();
  assert.equal(h.session.getSnapshot().messages[0].id, message(2).id);
  assert.equal(h.calls.length, 3); h.session.dispose();
});

test("HTTP and WS converge, unknown-result retry keeps request ID, deletion prevents late response resurrection", async () => {
  const h = harness(); await h.start(); h.session.setDraft(" hello ");
  h.setWrite(async () => { throw new ChatRequestError("CHAT_UNAVAILABLE"); });
  await h.session.send(); const first = JSON.parse(h.calls.at(-1).body);
  assert.equal(h.session.getSnapshot().draft, "");
  assert.equal(h.session.getSnapshot().pending[0].content, "hello");
  const gate = deferred(); h.setWrite(() => gate.promise);
  const sending = h.session.retry(first.clientRequestId), sent = { ...message(3, "hello"), clientRequestId: first.clientRequestId };
  assert.equal(JSON.parse(h.calls.at(-1).body).clientRequestId, first.clientRequestId);
  h.handlers.publication(created(sent)); h.handlers.publication(deleted(sent));
  gate.resolve({ message: sent, messageId: sent.id, clientRequestId: sent.clientRequestId, deleted: false, nextSendAt: null }); await sending;
  assert.equal(h.session.getSnapshot().messages.length, 0);
  assert.equal(h.session.getSnapshot().draft, "");
  assert.deepEqual(h.session.getSnapshot().pending, []);
  assert.equal(h.calls.filter((c) => !c.method).length, 1); h.session.dispose();
});

test("delete response racing a snapshot and a late older page cannot restore deleted messages", async () => {
  const h = harness(), a = message(1), gate = deferred();
  h.setRead(() => gate.promise); await h.start(); h.setWrite(async () => deleted(a));
  await h.session.remove(a.id);
  gate.resolve({ messages: [a], nextCursor: { createdAt: a.createdAt, id: a.id } }); await tick();
  assert.equal(h.session.getSnapshot().messages.length, 0);
  h.setRead(async () => ({ messages: [a], nextCursor: null })); await h.session.loadOlder();
  assert.equal(h.session.getSnapshot().messages.length, 0); h.session.dispose();
});

test("reading old messages appends every new publication without following or querying on jump", async () => {
  const h = harness(); await h.start(); h.session.setFollowing(false);
  const rows = Array.from({length: 1200}, (_, i) => message(i));
  for (const row of rows) h.handlers.publication(created(row));
  assert.deepEqual(h.session.getSnapshot().messages, rows);
  assert.equal(h.session.getSnapshot().following, false);
  assert.equal(h.session.getSnapshot().newMessages, rows.length);
  await h.session.jumpLatest();
  assert.deepEqual(h.session.getSnapshot().messages, rows);
  assert.equal(h.calls.length, 2); h.session.dispose();
});

test("loading older history retains the newest rows without creating a forward gap", async () => {
  const h = harness();
  const latest = Array.from({ length: 600 }, (_, index) => message(index + 100));
  const older = message(1);
  h.setRead(async () => ({ messages: latest, nextCursor: { createdAt: latest[0].createdAt, id: latest[0].id } }));
  await h.start();
  h.setRead(async () => ({ messages: [older], nextCursor: null }));
  await h.session.loadOlder();
  assert.deepEqual(h.session.getSnapshot().messages, [older, ...latest]);
  assert.equal(h.session.getSnapshot().nextCursor, null);
  assert.equal(h.session.getSnapshot().newMessages, 0);
  assert.equal(h.session.getSnapshot().hasNewerMessages, false);
  h.session.dispose();
});

test("live and buffered arrivals preserve loaded history and its older-page cursor", async () => {
  for (const initialHasOlder of [false, true]) for (const tail of [false, true]) {
    const h = harness(), all = Array.from({ length: 950 }, (_, i) => message(i));
    const cursor = (m) => ({ id: m.id, createdAt: m.createdAt });
    h.setRead(async () => ({ messages: all.slice(350, 400), nextCursor: initialHasOlder ? cursor(all[350]) : null }));
    await h.start();
    if (tail) h.session.setFollowing(false);
    const end = tail ? 900 : 950;
    for (const m of all.slice(400, end)) h.handlers.publication(created(m));
    if (tail) await h.session.jumpLatest();
    assert.deepEqual(h.session.getSnapshot().messages, all.slice(350, end));
    assert.deepEqual(h.session.getSnapshot().nextCursor, initialHasOlder ? cursor(all[350]) : null);
    assert.equal(h.calls.length, 2);
    h.setRead(async (path) => {
      assert.equal(new URL(path, "http://local").searchParams.get("before"), `${all[350].createdAt}|${all[350].id}`);
      return { messages: all.slice(300, 350), nextCursor: cursor(all[300]) };
    });
    await h.session.loadOlder();
    assert.deepEqual(h.session.getSnapshot().messages, all.slice(initialHasOlder ? 300 : 350, end));
    assert.equal(h.calls.length, initialHasOlder ? 3 : 2);
    h.session.dispose();
  }
});

test("an own live echo confirms the pending row and merges the message once", async () => {
  const h = harness(), gate = deferred(); await h.start();
  h.setWrite(() => gate.promise); h.session.setDraft("echo"); const sending = h.session.send();
  const id = h.session.getSnapshot().pending[0].clientRequestId;
  const saved = { ...message(1, "echo"), clientRequestId: id };
  let replacements = 0, previous = h.session.getSnapshot().messages;
  const unsubscribe = h.session.subscribe(() => {
    const next = h.session.getSnapshot().messages;
    if (next !== previous) replacements++;
    previous = next;
  });
  h.handlers.publication(created(saved));
  assert.equal(replacements, 1); assert.equal(h.session.getSnapshot().pending.length, 0);
  unsubscribe();
  gate.resolve({ messageId: saved.id, clientRequestId: id, message: saved, deleted: false, nextSendAt: null });
  await sending; h.session.dispose();
});

test("logout/disposal ignores late callbacks and expired or malformed publications", async () => {
  const h = harness(); await h.start();
  h.handlers.publication(created({ ...message(1), createdAt: "2020-01-01T00:00:00.000000Z" }));
  assert.equal(h.session.getSnapshot().messages.length, 0);
  assert.equal(parseChatEvent(created({ ...message(2), content: "a".repeat(1001) })), null);
  h.session.setDraft("private"); h.session.dispose(); const before = h.session.getSnapshot();
  h.handlers.publication(created(message(3))); await h.session.activate();
  assert.equal(h.session.getSnapshot(), before); assert.equal(h.calls.length, 2);
});

test("Strict Mode effect replay preserves the one session, real unmount clears account state", async () => {
  const h = harness(); const firstCleanup = h.session.mount(); firstCleanup();
  const cleanup = h.session.mount(); await tick(); await h.start();
  assert.equal(h.calls.length, 2); assert.equal(h.connections, 1);
  h.session.setDraft("private draft"); cleanup(); await tick();
  assert.equal(h.session.getSnapshot().draft, "");
  assert.equal(h.session.getSnapshot().viewer, null);
  await h.session.activate(); assert.equal(h.calls.length, 2);
});


test("consecutive sends clear drafts immediately and serialize HTTP without waiting for WebSocket", async () => {
  const h=harness(), gate=deferred();
  const bodies=[];
  h.setWrite(async (_path,init)=>{
    const body=JSON.parse(init.body); bodies.push(body);
    if(bodies.length===1) await gate.promise;
    const saved={...message(bodies.length,body.content),clientRequestId:body.clientRequestId};
    return {message:saved,messageId:saved.id,clientRequestId:body.clientRequestId,deleted:false,nextSendAt:null};
  });
  h.session.setDraft("first"); const sending=h.session.send();
  assert.equal(h.session.getSnapshot().draft,"");
  h.session.setDraft("second"); await h.session.send();
  assert.deepEqual(h.session.getSnapshot().pending.map(p=>p.status),["sending","queued"]);
  assert.equal(bodies.length,1);
  h.session.setDraft("third draft"); gate.resolve(); await sending;
  assert.deepEqual(bodies.map(b=>b.content),["first","second"]);
  assert.notEqual(bodies[0].clientRequestId,bodies[1].clientRequestId);
  assert.equal(h.session.getSnapshot().draft,"third draft");
  assert.deepEqual(h.session.getSnapshot().messages.map(m=>m.content),["first","second"]);
  assert.equal(h.calls.filter(c=>!c.method).length,0);
  h.session.dispose();
});

test("HTTP confirmation during initial history survives the older snapshot", async () => {
  const h=harness(), history=deferred(); h.setRead(()=>history.promise); await h.start();
  h.setWrite(async (_path,init)=>{
    const body=JSON.parse(init.body),saved={...message(4,body.content),clientRequestId:body.clientRequestId};
    return {message:saved,messageId:saved.id,clientRequestId:body.clientRequestId,deleted:false,nextSendAt:null};
  });
  h.session.setDraft("while syncing"); await h.session.send();
  assert.equal(h.session.getSnapshot().messages[0].content,"while syncing");
  history.resolve({messages:[],nextCursor:null});await tick();
  assert.equal(h.session.getSnapshot().messages[0].content,"while syncing");
  h.session.dispose();
});

test("known quota stops queued requests without polling and preserves retryable messages", async () => {
  const h=harness(),gate=deferred();
  h.setWrite(async (_path,init)=>{await gate.promise;const b=JSON.parse(init.body),saved={...message(5),clientRequestId:b.clientRequestId};
    return {message:saved,messageId:saved.id,clientRequestId:b.clientRequestId,deleted:false,nextSendAt:new Date(Date.now()+60000).toISOString()};});
  h.session.setDraft("twentieth");const sending=h.session.send();
  h.session.setDraft("queued twenty-first");await h.session.send();gate.resolve();await sending;
  assert.equal(h.calls.length,1);
  assert.equal(h.session.getSnapshot().pending[0].status,"failed");
  assert.equal(h.session.getSnapshot().pending[0].error,"CHAT_COOLDOWN");
  h.session.setDraft("keep editing");await h.session.send();
  assert.equal(h.session.getSnapshot().draft,"keep editing");assert.equal(h.calls.length,1);
  h.session.dispose();
});

test("drafts follow comment Unicode/whitespace rules and logout stops queued sends", async () => {
  const h=harness(),gate=deferred();h.setWrite(()=>gate.promise);
  h.session.setDraft("  ");await h.session.send();assert.equal(h.calls.length,0);assert.equal(h.session.getSnapshot().draft.length,2);
  h.session.setDraft("🌟".repeat(1001));assert.equal([...h.session.getSnapshot().draft].length,1000);
  const sending=h.session.send();h.session.setDraft("private queued");await h.session.send();h.session.dispose();
  gate.reject(new Error("offline"));await sending;
  assert.equal(h.calls.length,1);assert.deepEqual(h.session.getSnapshot().pending,[]);assert.equal(h.session.getSnapshot().draft,"");
});


test("late connection metadata cannot clear quota received from an independent send", async () => {
  const h=harness(),connection=deferred(),deadline=new Date(Date.now()+60000).toISOString();
  h.setConnection(()=>connection.promise);const opening=h.session.activate();
  h.setWrite(async (_path,init)=>{const b=JSON.parse(init.body),saved={...message(9),clientRequestId:b.clientRequestId};
    return {message:saved,messageId:saved.id,clientRequestId:b.clientRequestId,deleted:false,nextSendAt:deadline};});
  h.session.setDraft("twentieth while connecting");await h.session.send();
  connection.resolve({token:"test",url:"ws://local",viewer:{userId,canModerate:false,mutedUntil:null,nextSendAt:null}});await opening;
  assert.equal(h.session.getSnapshot().viewer.nextSendAt,deadline);
  h.session.setDraft("blocked");await h.session.send();assert.equal(h.calls.filter(c=>c.method==="POST"&&c.path.endsWith("messages")).length,1);
  h.session.dispose();
});

test('recovery preserves the reading segment and pages forward without gaps', async () => {
  const h = harness(), rows = Array.from({length: 780}, (_, i) => message(i));
  let available = rows.slice(0, 50), afterCalls = 0;
  h.setRead(async (path) => {
    const after = new URL(path, 'http://local').searchParams.get('after');
    if (after) {
      afterCalls++;
      const id = after.split('|')[1], index = available.findIndex(m => m.id === id);
      return {messages: available.slice(index + 1, index + 51), hasMore: available.length > index + 51};
    }
    return {messages: available.slice(-50), nextCursor: available.length > 50 ? available.at(-50) : null};
  });
  await h.start();
  h.session.pause(); available = rows; await h.session.activate(); h.handlers.subscribed(); await tick();
  assert.deepEqual(h.session.getSnapshot().messages, rows.slice(0, 50));
  assert.equal(h.session.getSnapshot().following, false);
  assert.ok(h.session.getSnapshot().newMessages);
  const seen = new Set(rows.slice(0, 50).map(m => m.id));
  while (h.session.getSnapshot().hasNewerMessages) {
    await Promise.all([h.session.loadNewer(), h.session.loadNewer()]);
    h.session.getSnapshot().messages.forEach(m => seen.add(m.id));
    assert.equal(h.session.getSnapshot().messages.length, seen.size);
    assert.ok(h.session.getSnapshot().newMessages, 'loading is not reading the bottom');
  }
  assert.equal(afterCalls, 14); assert.equal(seen.size, 780);
  assert.equal(h.session.getSnapshot().following, false);
  h.session.setFollowing(true);
  assert.equal(h.session.getSnapshot().newMessages, 0);
  h.handlers.publication(created(message(800)));
  assert.equal(h.session.getSnapshot().messages.at(-1).id, message(800).id);
  h.session.dispose();
});

test('recovery reads one latest page regardless of retained history and leaves offline deletes until reload', async () => {
  const h = harness(), rows = Array.from({length: 2501}, (_, i) => message(i));
  h.setRead(async () => ({messages: rows.slice(0, 50), nextCursor: null})); await h.start();
  for (const row of rows.slice(50, 2500)) h.handlers.publication(created(row));
  const before = h.calls.length;
  h.setRead(async (path, init) => {
    assert.equal(path, '/api/chat/messages'); assert.equal(init.method, undefined); assert.equal(init.body, undefined);
    h.handlers.publication(deleted(rows[200]));
    return {messages: rows.slice(-50), nextCursor: rows.at(-50)};
  });
  h.session.pause(); await h.session.activate(); h.handlers.subscribed(); await tick();
  assert.equal(h.calls.length, before + 1);
  assert.deepEqual(h.session.getSnapshot().messages, rows.filter(m => m.id !== rows[200].id));
  assert.ok(h.session.getSnapshot().messages.some(m => m.id === rows[2].id), 'unqueried old rows remain cached');
  assert.equal(h.session.getSnapshot().following, false);
  await h.session.jumpLatest();
  assert.equal(h.session.getSnapshot().messages.length, 2500, 'jumping a continuous list does not replace it');
  assert.equal(h.calls.length, before + 1);
  h.session.pause(true); await h.start();
  assert.deepEqual(h.session.getSnapshot().messages, rows.slice(-50), 'reopening starts with fresh history');
  h.session.dispose();
});

test('pausing recovery discards the late result', async () => {
  const h = harness(), rows = Array.from({length: 80}, (_, i) => message(i)), gate = deferred();
  h.setRead(async () => ({messages: rows.slice(0, 50), nextCursor: null})); await h.start();
  h.setRead(() => gate.promise);
  const reading = h.session.syncLatest(); h.session.pause();
  gate.resolve({messages: rows.slice(-50), nextCursor: rows.at(-50)}); await reading;
  assert.deepEqual(h.session.getSnapshot().messages, rows.slice(0, 50));
  h.session.dispose();
});

test('publications buffered during overlapping recovery append without creating a gap', async () => {
  const h = harness(), rows = Array.from({length: 80}, (_, i) => message(i)), gate = deferred();
  h.setRead(async () => ({messages: rows.slice(0, 50), nextCursor: null})); await h.start();
  h.setRead(() => gate.promise);
  h.session.pause(); await h.session.activate(); h.handlers.subscribed();
  for (const row of rows.slice(60)) h.handlers.publication(created(row));
  gate.resolve({messages: rows.slice(10, 60), nextCursor: rows[10]}); await tick();
  assert.deepEqual(h.session.getSnapshot().messages, rows);
  assert.equal(h.session.getSnapshot().hasNewerMessages, false);
  assert.equal(h.session.getSnapshot().following, false);
  h.session.dispose();
});

test('an out-of-order publication inside a gap does not skip the remaining forward pages', async () => {
  const h = harness(), rows = Array.from({length: 200}, (_, i) => message(i));
  h.setRead(async () => ({messages: rows.slice(0, 50), nextCursor: null})); await h.start();
  h.setRead(async () => ({messages: rows.slice(150), nextCursor: rows[150]}));
  h.session.pause(); await h.session.activate(); h.handlers.subscribed(); await tick();
  h.handlers.publication(created(rows[75]));
  h.setRead(async path => {
    const id = new URL(path, 'http://local').searchParams.get('after').split('|')[1];
    const index = rows.findIndex(m => m.id === id) + 1;
    return {messages: rows.slice(index, index + 50), hasMore: index + 50 < rows.length};
  });
  await h.session.loadNewer();
  assert.deepEqual(h.session.getSnapshot().messages, rows.slice(0, 100));
  assert.equal(h.session.getSnapshot().hasNewerMessages, true);
  while (h.session.getSnapshot().hasNewerMessages) await h.session.loadNewer();
  assert.deepEqual(h.session.getSnapshot().messages, rows);
  h.session.dispose();
});

test('no-news recovery stays continuous; deleting the latest row makes its predecessor the bottom', async () => {
  const h = harness(), rows = Array.from({length: 90}, (_, i) => message(i));
  h.setRead(async () => ({messages: rows.slice(0, 50), nextCursor: null})); await h.start();
  h.session.pause(); await h.session.activate(); h.handlers.subscribed(); await tick();
  assert.equal(h.session.getSnapshot().newMessages, 0);
  h.setRead(async () => ({messages: rows.slice(-50), nextCursor: rows[40]}));
  h.handlers.connecting(); h.handlers.subscribed(); await tick();
  assert.deepEqual(h.session.getSnapshot().messages, rows);
  assert.equal(h.session.getSnapshot().hasNewerMessages, false);
  h.handlers.publication(deleted(rows.at(-1)));
  await h.session.jumpLatest();
  assert.deepEqual(h.session.getSnapshot().messages, rows.slice(0, -1));
  assert.equal(h.calls.length, 4);
  h.session.dispose();
});

test('deleting a disconnected latest segment cannot replace the reading list with an empty cache', async () => {
  const h = harness(), rows = Array.from({length: 200}, (_, i) => message(i));
  h.setRead(async () => ({messages: rows.slice(0, 50), nextCursor: null})); await h.start();
  h.setRead(async () => ({messages: rows.slice(-50), nextCursor: rows[150]}));
  h.session.pause(); await h.session.activate(); h.handlers.subscribed(); await tick();
  for (const row of rows.slice(-50)) h.handlers.publication(deleted(row));
  assert.deepEqual(h.session.getSnapshot().messages, rows.slice(0, 50));
  h.setRead(async () => ({messages: rows.slice(100, 150), nextCursor: rows[100]}));
  await h.session.jumpLatest();
  assert.deepEqual(h.session.getSnapshot().messages, rows.slice(100, 150));
  assert.equal(h.session.getSnapshot().following, true);
  h.session.dispose();
});

test('failed forward page retries at the same cursor; explicit latest cancels a stale page', async () => {
  const h = harness(), rows = Array.from({length: 170}, (_, i) => message(i));
  h.setRead(async () => ({messages: rows.slice(0, 50), nextCursor: null})); await h.start();
  h.setRead(async () => ({messages: rows.slice(-50), nextCursor: rows[120]}));
  h.session.pause(); await h.session.activate(); h.handlers.subscribed(); await tick();
  h.setRead(async () => {throw new Error('offline');}); await h.session.loadNewer();
  assert.equal(h.session.getSnapshot().newerError, true);
  const cursorPath = h.calls.at(-1).path, gate = deferred(); h.setRead(() => gate.promise);
  const loading = h.session.loadNewer(); assert.equal(h.calls.at(-1).path, cursorPath);
  await h.session.jumpLatest();
  gate.resolve({messages: rows.slice(50, 100), hasMore: true}); await loading;
  assert.deepEqual(h.session.getSnapshot().messages, rows.slice(-50));
  assert.equal(h.session.getSnapshot().following, true); assert.equal(h.session.getSnapshot().loadingNewer, false);
  h.session.dispose();
});

test('cancelling navigation during recovery preserves the original reading segment', async () => {
  const h = harness(), rows = Array.from({length: 60}, (_, i) => message(i));
  h.setRead(async () => ({messages: rows.slice(0, 10), nextCursor: null})); await h.start();
  const gate = deferred(); h.setRead(() => gate.promise);
  h.session.pause(); await h.session.activate(); h.handlers.subscribed();
  await h.session.jumpLatest(); h.session.setFollowing(false);
  gate.resolve({messages: rows.slice(-50), nextCursor: rows[10]}); await tick();
  assert.deepEqual(h.session.getSnapshot().messages, rows.slice(0, 10));
  assert.equal(h.session.getSnapshot().following, false);
  h.setRead(async path => {
    assert.ok(decodeURIComponent(path).includes(rows[9].id));
    return {messages: rows.slice(10), hasMore: false};
  });
  await h.session.loadNewer(); assert.deepEqual(h.session.getSnapshot().messages, rows);
  h.session.setFollowing(true); assert.equal(h.session.getSnapshot().following, true);
  h.session.dispose();
});

test('forward reads merge live arrivals, suppress late deleted rows and advance past an empty filtered page', async () => {
  const h = harness(), rows = Array.from({length:170}, (_,i)=>message(i));
  h.setRead(async()=>({messages:rows.slice(0,50),nextCursor:null})); await h.start();
  h.setRead(async()=>({messages:rows.slice(-50),nextCursor:rows[120]}));
  h.session.pause();await h.session.activate();h.handlers.subscribed();await tick();
  const gate=deferred();h.setRead(()=>gate.promise);const load=h.session.loadNewer();
  rows.slice(50,100).forEach(m=>h.handlers.publication(deleted(m)));
  const fresh=message(175);h.handlers.publication(created(fresh));
  gate.resolve({messages:rows.slice(50,100),hasMore:true});await load;
  assert.deepEqual(h.session.getSnapshot().messages,rows.slice(0,50));
  h.setRead(async path=>{assert.ok(decodeURIComponent(path).includes(rows[99].id));return {messages:rows.slice(100,150),hasMore:true};});
  await h.session.loadNewer();
  assert.equal(h.session.getSnapshot().messages.at(-1).id,fresh.id);
  assert.equal(new Set(h.session.getSnapshot().messages.map(m=>m.id)).size,121);
  h.session.dispose();
});

test('an initially empty board merges its first recovered messages without a gap', async () => {
  const h=harness();await h.start();const row=message(1);
  h.setRead(async()=>({messages:[row],nextCursor:null}));
  h.session.pause();await h.session.activate();h.handlers.subscribed();await tick();
  assert.deepEqual(h.session.getSnapshot().messages,[row]);
  assert.equal(h.session.getSnapshot().hasNewerMessages,false);
  await h.session.loadNewer();assert.deepEqual(h.session.getSnapshot().messages,[row]);
  h.session.dispose();
});

test('sending during connecting or syncing preserves the gap and defers navigation until recovery completes', async () => {
  for (const phase of ['connecting', 'syncing']) for (const keepReading of [false, true]) {
    const h = harness(), rows = Array.from({length: 200}, (_, i) => message(i));
    let available = rows.slice(0, 50);
    const page = () => ({messages: available.slice(-50), nextCursor: available.at(-50)});
    h.setRead(async () => page()); await h.start();
    h.session.pause(); available = [...rows]; await h.session.activate();
    const gate = deferred();
    if (phase === 'syncing') { h.setRead(() => gate.promise); h.handlers.subscribed(); }
    h.setWrite(async (_path, init) => {
      const body = JSON.parse(init.body), saved = {...message(201, body.content), clientRequestId: body.clientRequestId};
      available.push(saved);
      return {message: saved, messageId: saved.id, clientRequestId: body.clientRequestId, deleted: false, nextSendAt: null};
    });
    h.session.setDraft('send during recovery'); const sending = h.session.send();
    await h.session.jumpLatest(); await sending;
    assert.deepEqual(h.session.getSnapshot().messages, rows.slice(0, 50));
    assert.equal(h.session.getSnapshot().pending.length, 0, 'HTTP sending completes independently');
    if (keepReading) h.session.setFollowing(false);
    if (phase === 'connecting') h.handlers.subscribed(); else gate.resolve(page());
    await tick();
    if (keepReading) {
      assert.deepEqual(h.session.getSnapshot().messages, rows.slice(0, 50));
      h.setRead(async path => {
        const id = new URL(path, 'http://local').searchParams.get('after').split('|')[1];
        const start = available.findIndex(m => m.id === id) + 1;
        return {messages: available.slice(start, start + 50), hasMore: start + 50 < available.length};
      });
      while (h.session.getSnapshot().hasNewerMessages) await h.session.loadNewer();
      assert.deepEqual(h.session.getSnapshot().messages, available, 'all intervening messages remain reachable');
    } else {
      assert.deepEqual(h.session.getSnapshot().messages, available.slice(-50));
      assert.equal(h.session.getSnapshot().following, true);
    }
    h.session.dispose();
  }
});

test('pagination is exclusive and appends in either direction without discarding loaded rows', async () => {
  for (const direction of ['older', 'newer']) {
    const h = harness(), rows = Array.from({length: 600}, (_, i) => message(i));
    const original = rows.slice(50, 550), before = original[0];
    h.setRead(async () => ({messages: original, nextCursor: before})); await h.start();
    h.setRead(async () => ({messages: rows.slice(-50), nextCursor: rows[550]}));
    h.session.pause(); await h.session.activate(); h.handlers.subscribed(); await tick();
    const gate = deferred(); h.setRead(() => gate.promise);
    const method = direction === 'older' ? 'loadOlder' : 'loadNewer';
    const response = direction === 'older' ? {messages: rows.slice(0, 50), nextCursor: null}
      : {messages: rows.slice(550), hasMore: false};
    const reading = h.session[method](), calls = h.calls.length;
    assert.deepEqual(h.session.getSnapshot().messages, original, 'request start removes nothing');
    await Promise.all([h.session.loadOlder(), h.session.loadNewer()]);
    assert.equal(h.calls.length, calls, 'neither direction can start while a page is in flight');
    h.session.setFollowing(true);
    assert.equal(h.session.getSnapshot().following, false);
    gate.resolve(response); await reading;
    assert.deepEqual(h.session.getSnapshot().messages, direction === 'older' ? rows.slice(0, 550) : rows.slice(50));
    assert.deepEqual(h.session.getSnapshot().nextCursor, direction === 'older' ? null : before);
    assert.equal(h.session.getSnapshot().hasNewerMessages, direction === 'older');
    assert.equal(h.calls.length, calls, 'one completed page needs no retry');
    h.session.dispose();
  }
});
