import assert from "node:assert/strict";
import test from "node:test";
import { ChatSession, ChatRequestError } from "../src/lib/chat/chat-session.ts";
import { parseChatEvent } from "../src/lib/chat/chat-contract.ts";

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const userId = uuid(1);
const messageBase = Date.now() - 20000;
const message = (n, content = "文字消息") => ({ id: uuid(n + 10), clientRequestId: uuid(n + 100), content,
  createdAt: new Date(messageBase + n).toISOString().replace("Z", "000Z"),
  author: { userId, username: "tester", publicUid: 1, avatarCardId: 1, avatarCardServer: null, avatarCardTrainType: "normal" } });
const created = (m) => ({ type: "message.created", message: m });
const deleted = (m) => ({ type: "message.deleted", messageId: m.id, deletedAt: new Date().toISOString() });
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

const recentUser = m => ({...m.author,lastMessageAt:m.createdAt});
test('empty mention suggestions load on demand, stay cached and follow existing message events',async()=>{
  const h=harness(),first=message(1),second={...message(2),author:{...message(2).author,userId:uuid(2),publicUid:2,username:'second'}};
  h.setRead(async path=>path==='/api/chat/users'?[first.author,second.author]:path==='/api/chat/mentions/users?q='?[recentUser(first)]:{messages:[],nextCursor:null});
  await h.start();await h.session.refreshDirectory();
  const reads=()=>h.calls.filter(c=>c.path==='/api/chat/mentions/users?q=').length;
  assert.equal(reads(),0);
  await Promise.all([h.session.refreshMentionSuggestions(),h.session.refreshMentionSuggestions()]);assert.equal(reads(),1);
  h.session.setOpen(false);
  h.handlers.activityPublication({type:'message.created',cursor:{id:second.id,createdAt:second.createdAt},userId:second.author.userId});
  assert.deepEqual(h.session.getSnapshot().recentMentionUsers.map(u=>u.userId),[uuid(2),userId]);
  h.session.setOpen(true);await h.session.refreshMentionSuggestions();assert.equal(reads(),1);
  h.handlers.activityPublication({type:'message.deleted',messageId:uuid(900)});assert.notEqual(h.session.getSnapshot().recentMentionUsers,null);
  h.handlers.activityPublication({type:'message.deleted',messageId:second.id});assert.equal(h.session.getSnapshot().recentMentionUsers.length,2);
  await h.session.refreshMentionSuggestions();assert.equal(reads(),1,'deletion never reloads account recommendations');
  h.handlers.activitySubscribed({recovered:true});assert.notEqual(h.session.getSnapshot().recentMentionUsers,null);
  h.handlers.activitySubscribed({recovered:false});assert.equal(h.session.getSnapshot().recentMentionUsers,null);assert.equal(reads(),1);
  h.session.dispose();
});

test('empty suggestion baseline merges activity, survives deletions and ignores disposed reads',async()=>{
  const h=harness(),first=message(1),newer=message(5);let gate=deferred();
  h.setRead(async path=>path==='/api/chat/users'?[first.author]:path==='/api/chat/mentions/users?q='?gate.promise:{messages:[],nextCursor:null});
  await h.start();await h.session.refreshDirectory();
  let loading=h.session.refreshMentionSuggestions();
  h.handlers.publication(created(newer));
  h.handlers.activityPublication({type:'message.created',cursor:{id:first.id,createdAt:first.createdAt},userId});
  h.handlers.activityPublication({type:'message.deleted',messageId:newer.id});
  assert.equal(h.calls.find(c=>c.path==='/api/chat/mentions/users?q=').signal.aborted,false);
  h.handlers.activityPublication({type:'message.deleted',messageId:first.id});gate.resolve([recentUser(first)]);await loading;
  assert.equal(h.session.getSnapshot().recentMentionUsers[0].lastMessageAt,newer.createdAt,'deleted messages do not remove account suggestions');
  h.handlers.activitySubscribed({recovered:false});
  gate=deferred();loading=h.session.refreshMentionSuggestions();h.session.dispose();gate.resolve([recentUser(first)]);await loading;
  assert.equal(h.session.getSnapshot().recentMentionUsers,null);
});

test('presence uses connection deltas, survives panel/focus changes and only rebaselines on reconnect',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=harness(),directory=[message(1).author];let reads=0;
  h.setRead(async path=>path==='/api/chat/users'?directory:path==='/api/chat/presence?connections=1'?(reads++,[{clientId:'self',user:message(1).author}]):{messages:[],nextCursor:null,latest:null,latestOther:null});
  await h.start();h.session.setMembersVisible(true);h.handlers.activitySubscribed({recovered:false});
  await tick();
  assert.equal(h.session.getSnapshot().directory.length,1);assert.equal(reads,1);
  h.session.setMembersVisible(false);assert.equal(h.session.getSnapshot().onlineUsers.length,1);
  h.session.setMembersVisible(true);await tick();assert.equal(reads,1);
  assert.equal(h.calls.filter(c=>c.path==='/api/chat/users').length,1);
  const friend={...message(1).author,userId:uuid(2),username:'friend',publicUid:2};
  const join=clientId=>h.handlers.presenceChanged({type:'join',connection:{clientId,user:friend}});
  const leave=clientId=>h.handlers.presenceChanged({type:'leave',clientId});
  join('friend-a');join('friend-a');join('friend-b');
  assert.equal(h.session.getSnapshot().onlineUsers.length,2,'duplicate events and tabs count once');
  leave('friend-a');leave('friend-a');assert.equal(h.session.getSnapshot().onlineUsers.length,2);
  h.session.setOpen(false);leave('friend-b');assert.equal(h.session.getSnapshot().onlineUsers.length,1);
  h.session.setOpen(true);h.session.setMembersVisible(true);
  t.mock.timers.tick(300_000);await tick();assert.equal(reads,1,'five healthy minutes produce no polling');
  h.handlers.connecting();assert.equal(h.session.getSnapshot().onlineUsers,null);
  h.handlers.activitySubscribed({recovered:true});await tick();assert.equal(reads,2,'join/leave events are not history-recovered');
  assert.equal(h.session.getSnapshot().directory.length,1);
  h.session.dispose();assert.equal(h.session.getSnapshot().directory,null);
});

test('unavailable and cancelled presence stays unknown, while directory failures leave remote search usable',async()=>{
  const h=harness(),gate=deferred();let fail=true;
  h.setRead(async path=>{
    if(path==='/api/chat/users')throw new Error('directory offline');
    if(path==='/api/chat/presence?connections=1'){if(fail)throw new Error('broker offline');return gate.promise;}
    if(path.startsWith('/api/chat/mentions/users'))return [message(1).author];
    return {messages:[],nextCursor:null,latest:null,latestOther:null};
  });
  await h.start();h.session.setMembersVisible(true);h.handlers.activitySubscribed({recovered:false});await tick();
  assert.equal(h.session.getSnapshot().onlineUsers,null);assert.equal(h.session.getSnapshot().presenceError,true);
  assert.equal((await h.session.searchMentionUsers('tester',new AbortController().signal)).length,1);
  fail=false;void h.session.refreshPresence();h.handlers.connecting();
  gate.resolve([{clientId:'self',user:message(1).author}]);await tick();assert.equal(h.session.getSnapshot().onlineUsers,null);
  h.session.dispose();
});

test('presence buffers joins and leaves over an in-flight snapshot without resurrecting departed clients',async()=>{
  const h=harness(),gate=deferred(),self=message(1).author,friend={...self,userId:uuid(2),publicUid:2};
  h.setRead(async path=>path.startsWith('/api/chat/presence')?gate.promise:{messages:[],nextCursor:null});
  await h.start();h.handlers.activitySubscribed({recovered:false});
  h.handlers.presenceChanged({type:'leave',clientId:'departed'});
  h.handlers.presenceChanged({type:'join',connection:{clientId:'new',user:friend}});
  h.handlers.presenceChanged({type:'join',connection:{clientId:'brief',user:friend}});
  h.handlers.presenceChanged({type:'leave',clientId:'brief'});
  await h.session.refreshPresence(); // An in-flight baseline is deduplicated.
  gate.resolve([{clientId:'self',user:self},{clientId:'departed',user:{...self,userId:uuid(3),publicUid:3}}]);await tick();
  assert.deepEqual(new Set(h.session.getSnapshot().onlineUsers.map(u=>u.userId)),new Set([self.userId,friend.userId]));
  h.handlers.presenceChanged({type:'leave',clientId:'new'});
  assert.deepEqual(h.session.getSnapshot().onlineUsers,[self]);
  assert.equal(h.calls.filter(c=>c.path.startsWith('/api/chat/presence')).length,1);
  h.session.dispose();
});
function harness(extraDeps = {}) {
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
    ...extraDeps,
  });
  return { session, calls, get handlers() { return handlers; }, get refresh() { return refresh; }, get connections() { return connections; },
    setRead(fn) { read = fn; }, setWrite(fn) { write = fn; }, setConnection(fn) { connect = fn; },
    async start() { session.setOpen(true); session.setReadingAllowed(true); await session.activate(); handlers.subscribed(); await tick(); } };
}

test('empty keyword responses do not replace the search directory or notify consumers again',async()=>{
 const h=harness();await h.start();h.setRead(async path=>path==='/api/chat/users'?[message(1).author]:[]);
 await h.session.refreshDirectory();const directory=h.session.getSnapshot().directory;let notifications=0;
 const unsubscribe=h.session.subscribe(()=>notifications++);
 assert.deepEqual(await h.session.searchMentionUsers('not found',new AbortController().signal),[]);
 assert.equal(h.session.getSnapshot().directory,directory);assert.equal(notifications,0);unsubscribe();h.session.dispose();
});

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

test('stamp delivery does not require reading focus and still stops when the panel closes', async () => {
  const h=harness(),seen=[];
  h.session.subscribeStamps(event=>seen.push(event));await h.start();
  h.session.setReadingAllowed(false);
  const event={type:'stamp.sent',id:crypto.randomUUID(),userId:uuid(2),publicUid:2,username:'other',
    stamp:{id:1,region:'cn',kind:'normal'}};
  h.handlers.publication(event);
  assert.deepEqual(seen,[event],'an unfocused open panel forwards stamps to the visibility-aware player');
  h.session.setOpen(false);h.handlers.publication({...event,id:crypto.randomUUID()});
  assert.equal(seen.length,1,'a closed panel does not receive effects');
  h.session.dispose();
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
  await tick();assert.deepEqual(h.calls.slice(count).map(c=>c.path),['/api/chat/presence?connections=1'],'only ephemeral presence needs a reconnect baseline');
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
  assert.equal(h.calls.length,count);assert.deepEqual(h.calls.map(c=>c.path),['/api/chat/connection?activity=1','/api/chat/presence?connections=1','/api/chat/activity']);h.session.dispose();
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


test('reply drafts survive closure, submit once, and explicit ordinary sends do not inherit references', async () => {
  const h=harness(), original=message(1);await h.start();h.session.setReply(original);h.session.setDraft('answer');
  h.session.setOpen(false);h.session.setOpen(true);h.handlers.subscribed({recovered:true});
  assert.equal(h.session.getSnapshot().reply.id,original.id);
  const bodies=[];h.setWrite(async(_path,init)=>{const b=JSON.parse(init.body);bodies.push(b);return {message:{...message(3+bodies.length,b.content),clientRequestId:b.clientRequestId},nextSendAt:null};});
  await h.session.send();assert.equal(bodies[0].replyToId,original.id);assert.equal(h.session.getSnapshot().reply,null);
  h.session.setDraft('continuation');await h.session.send();assert.equal(bodies[1].replyToId,undefined);h.session.dispose();
});

test('deleted reply keeps the draft and rejected pending sends can explicitly retry without a quote', async () => {
  const h=harness(), original=message(1);await h.start();h.session.setReply(original);h.session.setDraft('keep');
  h.handlers.publication(deleted(original));assert.equal(h.session.send(),null);assert.equal(h.session.getSnapshot().draft,'keep');
  h.session.setReply(message(2));let body;
  h.setWrite(async(_path,init)=>{body=JSON.parse(init.body);throw new ChatRequestError('CHAT_REPLY_DELETED');});await h.session.send();
  const id=body.clientRequestId;assert.equal(h.session.getSnapshot().pending[0].reply.id,message(2).id);
  h.setWrite(async(_path,init)=>{const retry=JSON.parse(init.body);assert.equal(retry.clientRequestId,id);assert.equal(retry.replyToId,undefined);return{message:{...message(3,retry.content),clientRequestId:id},nextSendAt:null};});
  await h.session.retryWithoutReply(id);assert.equal(h.session.getSnapshot().pending.length,0);h.session.dispose();
});

test('reactions reconcile out-of-order counts and personal selections without unread activity', async () => {
  const h=harness(),m={...message(1),reactions:[],reactionsVersion:0,reactionsViewerId:userId};h.setRead(async()=>({messages:[m],nextCursor:m}));await h.start();h.session.setFollowing(false);
  const reaction=(version,actor,keys,reactions)=>({type:'message.reactions',messageId:m.id,version,userId:actor,ownEmojiKeys:keys,reactions});
  h.handlers.publication(reaction(3,uuid(2),['KanonLove'],[{emojiKey:'KokoroYay',count:1},{emojiKey:'KanonLove',count:1}]));
  h.handlers.publication(reaction(2,userId,['KokoroYay'],[{emojiKey:'KokoroYay',count:1}]));
  let shown=h.session.getSnapshot().messages[0];assert.equal(shown.reactionsVersion,3);assert.equal(shown.reactions.find(r=>r.emojiKey==='KokoroYay').reactedByViewer,true);
  h.handlers.publication(reaction(1,userId,[],[]));
  await h.session.loadOlder();shown=h.session.getSnapshot().messages[0];assert.equal(shown.reactionsVersion,3);assert.equal(shown.reactions.find(r=>r.emojiKey==='KokoroYay').reactedByViewer,true);
  assert.equal(h.session.getSnapshot().newMessages,0);assert.equal(h.session.getSnapshot().unread,false);
  assert.equal(parseChatEvent({...reaction(4,userId,[],[]),version:-1}),null);h.session.dispose();
});

for (const context of [false, true]) test(`reactions received during ${context ? 'quote-context' : 'main'} pagination survive an older HTTP snapshot`, async () => {
  const h=harness(),latest=message(100),old={...message(1),reactions:[],reactionsVersion:0,reactionsViewerId:userId};
  h.setRead(async()=>({messages:[latest],nextCursor:latest}));await h.start();
  if(context){const target=message(50);h.setRead(async()=>({messages:[target],nextCursor:target}));await h.session.locate(target.id);}
  const gate=deferred();h.setRead(()=>gate.promise);const loading=h.session.loadOlder();
  const event=(version,actor,count,keys)=>({type:'message.reactions',messageId:old.id,version,userId:actor,ownEmojiKeys:keys,reactions:count?[{emojiKey:'Tae',count}]:[]});
  h.handlers.publication(event(3,uuid(2),2,['Tae']));
  h.handlers.publication(event(2,userId,1,['Tae']));
  h.handlers.publication(event(1,userId,0,[]));
  gate.resolve({messages:[old],nextCursor:null});await loading;
  const shown=(h.session.getSnapshot().context??h.session.getSnapshot()).messages.find(m=>m.id===old.id);
  assert.equal(shown.reactionsVersion,3);assert.equal(shown.viewerReactionsVersion,2);
  assert.deepEqual(shown.reactions,[{emojiKey:'Tae',count:2,reactedByViewer:true}]);
  h.session.dispose();
});

test('reactions can arrive before message creation, survive reopening and yield to newer snapshots', async () => {
  const h=harness(),m={...message(1),reactions:[],reactionsVersion:0,reactionsViewerId:userId};await h.start();
  const event={type:'message.reactions',messageId:m.id,version:1,userId:uuid(2),ownEmojiKeys:['Tae'],reactions:[{emojiKey:'Tae',count:1}]};
  h.handlers.publication(event);
  h.session.setOpen(false);h.session.setOpen(true);h.handlers.subscribed({recovered:true});
  h.handlers.publication(created(m));
  assert.deepEqual(h.session.getSnapshot().messages[0].reactions,[{emojiKey:'Tae',count:1,reactedByViewer:false}]);
  const fresh={...m,reactionsVersion:2};h.setRead(async()=>({messages:[fresh],nextCursor:null}));
  await h.session.syncLatest();h.handlers.publication(created(m));
  assert.equal(h.session.getSnapshot().messages[0].reactionsVersion,2);
  assert.deepEqual(h.session.getSnapshot().messages[0].reactions,[]);
  h.handlers.publication(event);h.handlers.publication(deleted(m));h.handlers.publication(event);h.handlers.publication(created(m));
  assert.equal(h.session.getSnapshot().messages.length,0);h.session.dispose();
});

test('many deferred reaction updates preserve pagination without a full reset', async () => {
  const h=harness(),latest=message(2000),old=message(1);
  h.setRead(async()=>({messages:[latest],nextCursor:latest}));await h.start();
  const gate=deferred();h.setRead(()=>gate.promise);const loading=h.session.loadOlder();
  for(let i=0;i<1001;i++)h.handlers.publication({type:'message.reactions',messageId:message(i).id,version:1,userId:uuid(2),ownEmojiKeys:['Tae'],reactions:[{emojiKey:'Tae',count:1}]});
  assert.equal(h.session.getSnapshot().error,null);
  gate.resolve({messages:[old],nextCursor:null});await loading;
  assert.deepEqual(h.session.getSnapshot().messages.map(m=>m.id),[old.id,latest.id]);
  assert.deepEqual(h.session.getSnapshot().messages[0].reactions,[{emojiKey:'Tae',count:1,reactedByViewer:false}]);
  assert.equal(h.calls.filter(c=>c.path==='/api/chat/messages?activity=1').length,1,'only the initial snapshot');
  h.session.dispose();
});

test('many loaded reaction updates preserve retained history and reading position',async()=>{
 const h=harness(),rows=Array.from({length:1001},(_,i)=>message(i));
 h.setRead(async()=>({messages:rows,nextCursor:null}));await h.start();h.session.setFollowing(false);
 const before=h.calls.length;
 for(const m of rows)h.handlers.publication({type:'message.reactions',messageId:m.id,version:1,userId:uuid(2),ownEmojiKeys:[],reactions:[{emojiKey:'Tae',count:1}]});
 assert.equal(h.session.getSnapshot().messages.length,1001);assert.equal(h.session.getSnapshot().following,false);
 assert.equal(h.calls.length,before);assert.ok(h.session.getSnapshot().messages.every(m=>m.reactionsVersion===1));h.session.dispose();
});

test('quick reactions restore valid distinct names and fill defaults in order', () => {
  const h=harness();
  assert.deepEqual(h.session.getSnapshot().quickReactions,['Tae','KokoroYay','LisaMelt']);
  h.session.restoreQuickReactions(['LisaMelt','LisaMelt','missing-emoji',null,42,'KanonLove']);
  assert.deepEqual(h.session.getSnapshot().quickReactions,['LisaMelt','KanonLove','Tae']);
  h.session.restoreQuickReactions(['KanonLove','HinaAAA','Tae','LisaMelt']);
  assert.deepEqual(h.session.getSnapshot().quickReactions,['KanonLove','HinaAAA','Tae']);
  h.session.restoreQuickReactions({keys:['KanonLove']});
  assert.deepEqual(h.session.getSnapshot().quickReactions,['Tae','KokoroYay','LisaMelt']);
  h.session.dispose();
});

test('only explicitly selected successful reactions reorder quick choices; joining chips does not', async () => {
  const saved=[],h=harness({saveQuickReactions:keys=>saved.push([...keys])}),m=message(1);let version=0;
  h.setRead(async()=>({messages:[m],nextCursor:null}));await h.start();
  h.setWrite(async(_path,init)=>{const {emojiKey,active}=JSON.parse(init.body);return{type:'message.reactions',messageId:m.id,version:++version,userId,ownEmojiKeys:active?[emojiKey]:[],reactions:active?[{emojiKey,count:1}]:[]};});
  for(const key of ['KanonLove','HinaAAA','LisaMelt','KanonLove'])await h.session.react(m.id,key,true,{remember:true});
  const expected=['KanonLove','LisaMelt','HinaAAA'];
  assert.deepEqual(h.session.getSnapshot().quickReactions,expected);assert.equal(saved.length,4);assert.deepEqual(saved.at(-1),expected);
  await h.session.react(m.id,'Tae',true);
  assert.equal(h.session.getSnapshot().messages[0].reactions.find(r=>r.emojiKey==='Tae').reactedByViewer,true);
  assert.deepEqual(h.session.getSnapshot().quickReactions,expected);assert.equal(saved.length,4);
  await h.session.react(m.id,'HinaAAA',false,{remember:true});
  h.setWrite(async()=>{throw new ChatRequestError('CHAT_UNAVAILABLE');});
  await assert.rejects(h.session.react(m.id,'Tae',true,{remember:true}));
  h.handlers.publication({type:'message.reactions',messageId:m.id,version:++version,userId:uuid(2),ownEmojiKeys:['Tae'],reactions:[{emojiKey:'Tae',count:1}]});
  assert.deepEqual(h.session.getSnapshot().quickReactions,expected);assert.equal(saved.length,4);
  h.session.setOpen(false);h.session.setOpen(true);assert.deepEqual(h.session.getSnapshot().quickReactions,expected);
  h.session.dispose();
});

test('quick reactions reload saved preferences while independent sessions keep their own defaults', async () => {
  const stored=['LisaMelt','HinaAAA','Tae'],h=harness({readQuickReactions:()=>stored}),other=harness();
  h.setRead(async()=>({latest:null,latestOther:null}));const unmount=h.session.mount();await tick();
  assert.deepEqual(h.session.getSnapshot().quickReactions,stored);
  assert.deepEqual(other.session.getSnapshot().quickReactions,['Tae','KokoroYay','LisaMelt']);
  unmount();await tick();other.session.dispose();
});

test('an in-flight reaction cannot change quick choices or storage after disposal', async () => {
  const saved=[],h=harness({saveQuickReactions:keys=>saved.push(keys)}),gate=deferred(),m=message(1);
  await h.start();h.setWrite(()=>gate.promise);const adding=h.session.react(m.id,'KanonLove',true,{remember:true});
  assert.deepEqual(h.session.getSnapshot().quickReactions,['Tae','KokoroYay','LisaMelt']);
  h.session.dispose();gate.resolve({type:'message.reactions',messageId:m.id,version:1,userId,ownEmojiKeys:['KanonLove'],reactions:[{emojiKey:'KanonLove',count:1}]});await adding;
  assert.equal(saved.length,0);assert.deepEqual(h.session.getSnapshot().quickReactions,['Tae','KokoroYay','LisaMelt']);
});

test('quote navigation fetches a bounded context, reconciles deletion, and jumps back to the main timeline', async () => {
  const h=harness(),original=message(1),latest=message(100);h.setRead(async()=>({messages:[latest],nextCursor:latest}));await h.start();
  h.session.scrollAnchors=[{id:latest.id,top:12}];h.setRead(async path=>{assert.ok(path.endsWith('/context'));return{messages:[original],nextCursor:null};});
  assert.equal(await h.session.locate(original.id),true);assert.equal(h.session.getSnapshot().context.messages[0].id,original.id);
  h.handlers.publication(created(message(101)));assert.equal(h.session.getSnapshot().context.messages.length,1);
  await h.session.jumpLatest();assert.equal(h.session.getSnapshot().context,null);assert.equal(h.session.getSnapshot().following,true);
  const gate=deferred();h.setRead(()=>gate.promise);const locating=h.session.locate(original.id);h.handlers.publication(deleted(original));gate.resolve({messages:[original],nextCursor:null});
  assert.equal(await locating,false);assert.equal(h.session.getSnapshot().context,null);h.session.dispose();
});

test('switching into quote context cancels an older-page read and later navigation wins', async () => {
  const h=harness(),latest=message(100),old=message(1);h.setRead(async()=>({messages:[latest],nextCursor:latest}));await h.start();const gate=deferred();
  h.setRead(path=>path.includes('before=')?gate.promise:Promise.resolve({messages:[old],nextCursor:null}));const older=h.session.loadOlder();
  await h.session.locate(old.id);gate.resolve({messages:[message(80)],nextCursor:null});await older;
  assert.deepEqual(h.session.getSnapshot().messages.map(m=>m.id),[latest.id]);assert.equal(h.session.getSnapshot().context.messages[0].id,old.id);
  await h.session.jumpLatest();assert.equal(h.session.getSnapshot().context,null);h.session.dispose();
});


test('mention draft survives closure, trims offsets and belongs only to the text item in an image batch', async () => {
 const h=harness();await h.start();const sent=[];
 h.setWrite(async(path,init)=>{sent.push({path,body:JSON.parse(init.body)});throw new ChatRequestError('CHAT_UNAVAILABLE');});
 h.session.setDraft('  😀 @小明  ',[{userId:uuid(2),start:4,end:7}]);
 h.session.setOpen(false);h.session.setOpen(true);assert.equal(h.session.getSnapshot().draftMentions.length,1);
 await h.session.send();assert.deepEqual(sent[0].body.mentions,[{userId:uuid(2),start:2,end:5}]);
 assert.equal(sent[0].body.content,'😀 @小明');assert.equal(h.session.getSnapshot().draftMentions.length,0);
 await h.session.retry(h.session.getSnapshot().pending[0].clientRequestId);assert.deepEqual(sent[1].body.mentions,sent[0].body.mentions);
 h.session.setDraft('@小明',[{userId:uuid(2),start:0,end:3}]);
 const image={blob:new Blob(['x']),width:1,height:1,bytes:1,contentType:'image/png',hash:'a'.repeat(64)};
 await h.session.send([image,image]);const pending=h.session.getSnapshot().pending.slice(1);
 assert.ok(pending.filter(p=>p.image).every(p=>!p.mentions));assert.equal(pending.find(p=>!p.image).mentions.length,1);h.session.dispose();
});

test('mentions remain independently unread and acknowledge only the selected item',async()=>{
 const h=harness();await h.start();const items=[{...message(1),username:'A'},{...message(2),username:'B'}].map(({id,createdAt,username})=>({id,createdAt,username}));
 let inbox={items,total:2};h.setRead(async()=>inbox);await h.session.refreshMentions();
 h.session.setReadingAllowed(true);h.session.markRead();assert.equal(h.session.getSnapshot().mentions.total,2);assert.equal(h.session.getSnapshot().unread,true);
 h.setWrite(async(path,init)=>{assert.equal(path,'/api/chat/mentions');assert.deepEqual(JSON.parse(init.body).messageIds,[items[0].id]);inbox={items:[items[1]],total:1};return{acknowledged:true};});
 await h.session.acknowledgeMentions([items[0].id]);assert.equal(h.session.getSnapshot().mentions.items[0].id,items[1].id);
 h.session.setReadingAllowed(false);await h.session.acknowledgeMentions([items[1].id],true);assert.equal(h.session.getSnapshot().mentions.total,1);
 h.setWrite(async()=>{throw Error('offline');});await h.session.acknowledgeMentions([items[1].id]);assert.equal(h.session.getSnapshot().mentions.total,1);assert.equal(h.session.getSnapshot().mentionError,true);h.session.dispose();
});

test('a mention change during an inbox read triggers a fresh read and cannot restore stale data',async()=>{
 const h=harness();await h.start();const gate=deferred();let reads=0;
 const item={id:uuid(42),createdAt:message(1).createdAt,username:'A'};
 h.setRead(async()=>++reads===1?gate.promise:{items:[item],total:1});
 const loading=h.session.refreshMentions();h.handlers.mentionChanged();gate.resolve({items:[],total:0});await loading;
 assert.equal(reads,2);assert.equal(h.session.getSnapshot().mentions.items[0].id,item.id);
 const late=deferred();h.setRead(()=>late.promise);const loadingLate=h.session.refreshMentions();h.session.dispose();late.resolve({items:[item],total:1});await loadingLate;assert.equal(h.session.getSnapshot().mentions.total,0);
});

test('a complete mention inbox acknowledges locally and ignores its socket echo in either order',async()=>{
 for(const socketFirst of [false,true]){
  const h=harness();await h.start();
  const items=[1,2].map(n=>({id:message(n).id,createdAt:message(n).createdAt,username:'A'}));
  let reads=0,writes=0;h.setRead(async()=>{reads++;return{items,total:2};});await h.session.refreshMentions();
  const echo={type:'mentions.changed',roomId:'main',acknowledgedMessageIds:[items[0].id]};
  h.setWrite(async()=>{writes++;if(socketFirst)h.handlers.mentionChanged(echo);return{acknowledged:true};});
  await h.session.acknowledgeMentions([items[0].id]);h.handlers.mentionChanged(echo);await tick();
  assert.equal(writes,1);assert.equal(reads,1,'known confirmations and duplicate echoes do not read the inbox');
  assert.deepEqual(h.session.getSnapshot().mentions,{items:[items[1]],total:1});
  h.handlers.mentionChanged({...echo,roomId:'another-room',acknowledgedMessageIds:[items[1].id]});await tick();
  assert.equal(h.session.getSnapshot().mentions.total,1);assert.equal(reads,1);
  h.handlers.mentionChanged({...echo,acknowledgedMessageIds:[items[1].id]});await tick();
  assert.equal(h.session.getSnapshot().mentions.total,0);assert.equal(reads,1,'another device can confirm a known item without a fetch');h.session.dispose();
 }
});

test('deleting a known mention from a complete inbox needs no readback in either channel',async()=>{
 for(const activity of [false,true]){
  const h=harness();
  h.setRead(async()=>({messages:[],nextCursor:null,activity:{latest:null,latestOther:null}}));await h.start();
  const item={id:uuid(42),createdAt:message(1).createdAt,username:'A'};
  h.setRead(async()=>({items:[item],total:1}));await h.session.refreshMentions();
  const reads=h.calls.filter(c=>c.path==='/api/chat/mentions').length;
  h.setRead(async()=>({items:[],total:0}));
  const event={type:'message.deleted',messageId:item.id,deletedAt:new Date().toISOString()};
  if(activity)h.handlers.activityPublication(event);else h.handlers.publication(event);
  await tick();
  assert.deepEqual(h.session.getSnapshot().mentions,{items:[],total:0});
  assert.equal(h.calls.filter(c=>c.path==='/api/chat/mentions').length,reads);
  h.session.dispose();
 }
});

test('deleting a known mention still refills an incomplete inbox',async()=>{
 const h=harness();await h.start();
 const items=Array.from({length:50},(_,i)=>({id:uuid(i+500),createdAt:message(i).createdAt,username:'A'}));
 h.setRead(async()=>({items,total:51}));await h.session.refreshMentions();
 const remaining=[...items.slice(1),{id:uuid(999),createdAt:message(51).createdAt,username:'B'}];let reads=0;
 h.setRead(async()=>{reads++;return{items:remaining,total:50};});
 h.handlers.publication({type:'message.deleted',messageId:items[0].id,deletedAt:new Date().toISOString()});await tick();
 assert.equal(reads,1);assert.deepEqual(h.session.getSnapshot().mentions,{items:remaining,total:50});h.session.dispose();
});

test('a deletion during an inbox read cannot restore the deleted reminder',async()=>{
 const h=harness();await h.start();
 const item={id:uuid(42),createdAt:message(1).createdAt,username:'A'};
 h.setRead(async()=>({items:[item],total:1}));await h.session.refreshMentions();
 const gate=deferred();let reads=0;
 h.setRead(async()=>++reads===1?gate.promise:{items:[],total:0});
 const loading=h.session.refreshMentions();
 h.handlers.publication({type:'message.deleted',messageId:item.id,deletedAt:new Date().toISOString()});
 gate.resolve({items:[item],total:1});await loading;
 assert.equal(reads,2);assert.deepEqual(h.session.getSnapshot().mentions,{items:[],total:0});h.session.dispose();
});

test('visible historical mentions do not write when a complete inbox already excludes them',async()=>{
 const h=harness(),old={...message(1),author:{...message(1).author,userId:uuid(2)},mentions:[{userId,start:0,end:1}]};
 h.setRead(async()=>({messages:[old],nextCursor:null}));await h.start();
 h.setRead(async()=>({items:[],total:0}));await h.session.refreshMentions();
 await h.session.acknowledgeMentions([old.id],true);
 assert.equal(h.calls.filter(c=>c.method==='PUT').length,0);h.session.dispose();
});

test('acknowledgement during an inbox fetch discards its stale response and coalesces the echo',async()=>{
 const h=harness();await h.start();const item={id:message(1).id,createdAt:message(1).createdAt,username:'A'};
 h.setRead(async()=>({items:[item],total:1}));await h.session.refreshMentions();
 const gate=deferred();let reads=0;h.setRead(async()=>++reads===1?gate.promise:{items:[],total:0});
 const loading=h.session.refreshMentions();h.setWrite(async()=>({acknowledged:true}));await h.session.acknowledgeMentions([item.id]);
 h.handlers.mentionChanged({type:'mentions.changed',roomId:'main',acknowledgedMessageIds:[item.id]});
 gate.resolve({items:[item],total:1});await loading;
 assert.equal(reads,2,'one pre-acknowledgement read and one replacement, with no extra echo fetch');
 assert.deepEqual(h.session.getSnapshot().mentions,{items:[],total:0});h.session.dispose();
});

test('an incomplete inbox refills once after acknowledgement and shares that refill with its echo',async()=>{
 const h=harness();await h.start();const items=Array.from({length:50},(_,i)=>({id:message(i).id,createdAt:message(i).createdAt,username:'A'}));
 h.setRead(async()=>({items,total:51}));await h.session.refreshMentions();
 const gate=deferred();let reads=0;h.setRead(async()=>{reads++;return gate.promise;});h.setWrite(async()=>({acknowledged:true}));
 const confirming=h.session.acknowledgeMentions([items[0].id]);await tick();
 h.handlers.mentionChanged({type:'mentions.changed',roomId:'main',acknowledgedMessageIds:[items[0].id]});
 const remaining=[...items.slice(1),{id:uuid(999),createdAt:message(51).createdAt,username:'B'}];
 gate.resolve({items:remaining,total:50});await confirming;await tick();
 assert.equal(reads,1);assert.deepEqual(h.session.getSnapshot().mentions,{items:remaining,total:50});h.session.dispose();
});

test('reopening refreshes durable mentions and a missing target drops only its alert',async()=>{
 const h=harness();h.setConnection(async()=>({token:'test',url:'ws://local',mentionChannel:'chat_mentions:'+userId,viewer:{userId,canModerate:false,mutedUntil:null,nextSendAt:null}}));
 await h.start();const items=[{id:uuid(42),createdAt:message(1).createdAt,username:'A'},{id:uuid(43),createdAt:message(2).createdAt,username:'B'}];let inbox={items,total:2};
 h.setRead(async path=>{
  if(path==='/api/chat/mentions')return inbox;
  if(path.endsWith('/context')){inbox={items:[items[1]],total:1};throw new ChatRequestError('CHAT_NOT_FOUND');}
  return {messages:[],nextCursor:null};
 });
 h.session.setOpen(false);h.session.setOpen(true);await tick();assert.equal(h.session.getSnapshot().mentions.total,2);
 assert.equal(await h.session.locate(items[0].id),false);await tick();assert.deepEqual(h.session.getSnapshot().mentions,inbox);
 h.setRead(async()=>{throw new ChatRequestError('CHAT_UNAVAILABLE');});
 await assert.rejects(h.session.locate(items[1].id));assert.equal(h.session.getSnapshot().mentions.total,1);h.session.dispose();
});

test('reading a newer mention outside the inbox page acknowledges it without clearing older alerts',async()=>{
 const h=harness(),newer={...message(100,'@tester'),author:{...message(100).author,userId:uuid(2)},mentions:[{userId,start:0,end:7}]};
 h.setRead(async()=>({messages:[newer],nextCursor:null}));await h.start();
 const older=Array.from({length:50},(_,i)=>({id:uuid(i+500),createdAt:message(i).createdAt,username:'A'}));let total=51;
 h.setRead(async()=>({items:older,total}));await h.session.refreshMentions();let writes=0;
 h.setWrite(async(_path,init)=>{writes++;assert.deepEqual(JSON.parse(init.body).messageIds,[newer.id]);total--;return{acknowledged:true};});
 await h.session.acknowledgeMentions([newer.id],true);assert.equal(h.session.getSnapshot().mentions.total,50);assert.equal(h.session.getSnapshot().mentions.items.length,50);
 await h.session.acknowledgeMentions([newer.id],true);assert.equal(writes,1);h.session.dispose();
});
