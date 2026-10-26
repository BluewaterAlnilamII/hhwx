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
      if (path.includes("/connection")) return connect();
      return init.method ? write(path, init) : read(path, init);
    },
    transport: (_connection, _refresh, events) => {
      handlers = events; refresh = _refresh;
      return { connect() { connections++; events.connecting(); }, disconnect() { events.disconnected(); }, subscribeMessages() {}, unsubscribeMessages() {} };
    },
  });
  return { session, calls, get handlers() { return handlers; }, get refresh() { return refresh; }, get connections() { return connections; },
    setRead(fn) { read = fn; }, setWrite(fn) { write = fn; }, setConnection(fn) { connect = fn; },
    async start() { session.setOpen(true); session.setReadingAllowed(true); await session.activate(); handlers.subscribed(); await tick(); } };
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

test("token refresh does not reconnect or reread history", async () => {
  const h=harness(); await h.start();
  const connections=h.connections;
  await h.refresh();
  assert.equal(h.connections,connections);
  assert.equal(h.calls.filter((c)=>c.path==="/api/chat/messages?activity=1").length,1);
  assert.equal(h.calls.filter((c)=>c.path==="/api/chat/connection?activity=1").length,2);
  h.session.dispose();
});

test("native recovery and reopening preserve all loaded records, reading intent and make zero snapshot requests", async () => {
  const h=harness(), rows=Array.from({length:120},(_,i)=>message(i));
  h.setRead(async()=>({messages:rows,nextCursor:rows[0]})); await h.start();
  h.session.setFollowing(false); h.session.scrollAnchors=[{id:rows[30].id,top:12}];
  h.session.setDraft('draft'); const calls=h.calls.length;
  h.session.setOpen(false);
  assert.equal(h.session.getSnapshot().messages.length,120);
  h.session.setOpen(true); h.handlers.subscribed({recovered:true});
  h.handlers.publication(deleted(rows[0])); h.handlers.publication(created(message(121)));
  assert.equal(h.calls.length,calls); assert.equal(h.connections,1);
  assert.equal(h.session.getSnapshot().messages.length,120);
  assert.equal(h.session.getSnapshot().following,false);
  assert.equal(h.session.scrollAnchors[0].id,rows[30].id);
  assert.equal(h.session.getSnapshot().draft,'draft');
  h.handlers.connecting(); h.handlers.subscribed({recovered:true});
  assert.equal(h.calls.length,calls);
  h.session.dispose();
});

test("unrecoverable history starts a fresh latest page once and keeps draft and failed sends", async () => {
  const h=harness(),old=Array.from({length:100},(_,i)=>message(i));
  h.setRead(async()=>({messages:old,nextCursor:old[0]})); await h.start();
  h.session.setDraft('unsent'); await h.session.send(); h.session.setDraft('draft');
  h.session.setFollowing(false); const gate=deferred();h.setRead(()=>gate.promise);
  h.handlers.connecting(); h.handlers.subscribed({recovered:false}); h.handlers.subscribed({recovered:false});
  h.handlers.publication(created(message(201)));
  const latest=Array.from({length:50},(_,i)=>message(i+150));
  gate.resolve({messages:latest,nextCursor:latest[0]});await tick();
  assert.deepEqual(h.session.getSnapshot().messages.map(m=>m.id),[...latest,message(201)].map(m=>m.id));
  assert.equal(h.calls.filter(c=>!c.method).length,2);
  assert.equal(h.session.getSnapshot().draft,'draft');assert.equal(h.session.getSnapshot().pending.length,1);
  assert.equal(h.session.getSnapshot().following,true);h.session.dispose();
});

test("a successful send is immediately visible while connecting and snapshot loading", async () => {
  const h=harness();await h.start();h.handlers.connecting();
  const gate=deferred();h.setRead(()=>gate.promise);h.handlers.subscribed({recovered:false});
  h.setWrite(async(_path,init)=>{const m={...message(12),clientRequestId:JSON.parse(init.body).clientRequestId};return {message:m,messageId:m.id,deleted:false,nextSendAt:null};});
  h.session.setDraft('saved');await h.session.send();
  assert.equal(h.session.getSnapshot().messages.length,1);assert.equal(h.session.getSnapshot().pending.length,0);
  gate.resolve({messages:[],nextCursor:null});await tick();
  assert.equal(h.session.getSnapshot().messages.length,1);h.session.dispose();
});

test("closed activity subscription initializes silently, excludes self, syncs local read cursors and never loads messages", async () => {
  const h=harness(),a=message(1),b=message(2),other=uuid(2);
  const cursor=m=>({id:m.id,createdAt:m.createdAt});
  h.setRead(async()=>({latest:cursor(a),latestOther:cursor(a)}));
  await h.session.activate();h.handlers.activitySubscribed({recovered:false});await new Promise(r=>setTimeout(r,5));
  assert.equal(h.session.getSnapshot().unread,false);
  h.handlers.activityPublication({type:'message.created',cursor:cursor(b),userId});
  assert.equal(h.session.getSnapshot().unread,false);
  h.handlers.activityPublication({type:'message.created',cursor:cursor(b),userId:other});
  assert.equal(h.session.getSnapshot().unread,true);
  const count=h.calls.length;h.handlers.connecting();h.handlers.activitySubscribed({recovered:true});
  await tick();assert.equal(h.calls.length,count);
  h.session.restoreReadCursor(cursor(b));assert.equal(h.session.getSnapshot().unread,false);
  h.session.restoreReadCursor(cursor(a));assert.equal(h.session.getSnapshot().unread,false);
  assert.equal(h.calls.filter(c=>c.path.includes('/messages')).length,0);h.session.dispose();
});

test("activity deletions suppress late creates while closed and during initial summary loading", async () => {
  for (const buffered of [false, true]) {
    const h=harness(),gate=deferred(),m=message(2),cursor={id:m.id,createdAt:m.createdAt};
    h.setRead(()=>gate.promise);
    await h.session.activate();h.handlers.activitySubscribed({recovered:false});await new Promise(r=>setTimeout(r,5));
    if (!buffered) { gate.resolve({latest:null,latestOther:null});await tick(); }
    h.handlers.activityPublication({type:'message.deleted',messageId:m.id});
    h.handlers.activityPublication({type:'message.created',cursor,userId:uuid(2)});
    if (buffered) { gate.resolve({latest:null,latestOther:null});await tick(); }
    assert.equal(h.session.getSnapshot().unread,false);
    assert.equal(h.calls.filter(c=>c.path==='/api/chat/activity').length,1);
    assert.equal(h.calls.filter(c=>c.path.includes('/messages')).length,0);
    h.session.dispose();
  }
});

test("full-message and activity channels share deletion markers for unread state", async () => {
  const h=harness(),m={...message(2),author:{...message(2).author,userId:uuid(2)}};
  h.setRead(async()=>({messages:[],nextCursor:null,activity:{latest:null,latestOther:null}}));await h.start();
  h.handlers.publication(deleted(m));
  h.handlers.activityPublication({type:'message.created',cursor:{id:m.id,createdAt:m.createdAt},userId:m.author.userId});
  h.handlers.publication(created(m));
  assert.equal(h.session.getSnapshot().unread,false);
  assert.deepEqual(h.session.getSnapshot().messages,[]);
  h.session.dispose();
});

test("reading requires visible focused rendered latest content; summary arriving ahead of detail cannot be marked read", async () => {
  const h=harness(),a=message(1),b={...message(2),author:{...message(2).author,userId:uuid(2)}};
  const cursor=m=>({id:m.id,createdAt:m.createdAt});
  h.setRead(async()=>({messages:[a],nextCursor:null,activity:{latest:cursor(a),latestOther:null}}));await h.start();
  h.handlers.activityPublication({type:'message.created',cursor:cursor(b),userId:b.author.userId});
  h.session.markRead();assert.equal(h.session.getSnapshot().unread,true);
  h.session.setReadingAllowed(false);h.handlers.publication(created(b));h.session.markRead();
  assert.equal(h.session.getSnapshot().unread,true);
  h.session.setFollowing(false);h.session.setReadingAllowed(true);h.session.markRead();
  assert.equal(h.session.getSnapshot().unread,true);
  h.session.setFollowing(true);h.session.markRead();assert.equal(h.session.getSnapshot().unread,false);h.session.dispose();
});

test("closing during a snapshot retains buffered activity and ignores the cancelled list response", async () => {
  const h=harness(),a=message(1),b=message(2),cursor=m=>({id:m.id,createdAt:m.createdAt});
  h.setRead(async()=>({messages:[a],nextCursor:null,activity:{latest:cursor(a),latestOther:null}}));await h.start();
  const gate=deferred();h.setRead(()=>gate.promise);void h.session.syncLatest();
  h.handlers.activityPublication({type:'message.created',cursor:cursor(b),userId:uuid(2)});
  h.session.setOpen(false);assert.equal(h.session.getSnapshot().unread,true);
  gate.resolve({messages:[b],nextCursor:null,activity:{latest:cursor(a),latestOther:null}});await tick();
  assert.deepEqual(h.session.getSnapshot().messages,[a]);assert.equal(h.session.getSnapshot().unread,true);h.session.dispose();
});

test("a permanent activity authorization failure does not retry in the background", async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const h=harness();h.setRead(async()=>{throw new ChatRequestError('CHAT_ACCOUNT_REQUIRED');});
  await h.session.activate();h.handlers.activitySubscribed({recovered:false});t.mock.timers.tick(1);await tick();
  const count=h.calls.length;t.mock.timers.tick(120000);await tick();
  assert.equal(h.calls.length,count);assert.equal(count,2);h.session.dispose();
});

test("a full subscription rejection preserves activity and cached reading but cannot acknowledge unseen messages", async () => {
  const h=harness(),a=message(1),b=message(2),cursor=m=>({id:m.id,createdAt:m.createdAt});
  h.setRead(async()=>({messages:[a],nextCursor:null,activity:{latest:cursor(a),latestOther:null}}));await h.start();
  h.handlers.subscribing();h.handlers.unsubscribed();
  h.handlers.activityPublication({type:'message.created',cursor:cursor(b),userId:uuid(2)});
  h.session.markRead();assert.equal(h.session.getSnapshot().unread,true);
  assert.deepEqual(h.session.getSnapshot().messages,[a]);assert.equal(h.connections,1);
  h.handlers.subscribed({recovered:true});h.handlers.publication(created(b));h.session.markRead();
  assert.equal(h.session.getSnapshot().unread,false);h.session.dispose();
});

test("failed bootstrap and history recover automatically without polling a healthy connection", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness();
  h.setConnection(async () => { throw new Error("offline"); });
  h.session.setOpen(true); await h.session.activate();
  assert.equal(h.session.getSnapshot().status, "error");
  h.setConnection(async () => ({ token: "test", url: "ws://local", viewer: { userId, canModerate: false, mutedUntil: null, nextSendAt: null } }));
  t.mock.timers.tick(1200); await tick();
  assert.equal(h.connections, 1);
  h.setRead(async () => { throw new Error("temporary database outage"); });
  h.handlers.subscribed(); await tick();
  assert.equal(h.session.getSnapshot().status, "error");
  h.setRead(async () => ({ messages: [message(1)], nextCursor: null }));
  t.mock.timers.tick(2400); await tick();
  assert.equal(h.connections, 1, "history retry keeps the healthy socket");
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

test("deletions suppress stale page results without reloading history", async () => {
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
  assert.equal(h.session.getSnapshot().messages.length,0,"known deletes filter the old page response");
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


test('older pagination is exclusive and does not discard loaded rows', async () => {
  const h=harness(),rows=Array.from({length:600},(_,i)=>message(i)),original=rows.slice(50);
  h.setRead(async()=>({messages:original,nextCursor:original[0]}));await h.start();
  const gate=deferred();h.setRead(()=>gate.promise);const reading=h.session.loadOlder(),count=h.calls.length;
  assert.deepEqual(h.session.getSnapshot().messages,original);
  await h.session.loadOlder();assert.equal(h.calls.length,count);
  gate.resolve({messages:rows.slice(0,50),nextCursor:null});await reading;
  assert.deepEqual(h.session.getSnapshot().messages,rows);assert.equal(h.session.getSnapshot().nextCursor,null);h.session.dispose();
});
