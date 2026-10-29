import assert from 'node:assert/strict';
import test from 'node:test';
import { chatMentionQuery, editChatMentions, insertChatMention, searchChatUsers, recentChatUsers } from '../src/lib/chat/chat-mentions.ts';
import { isChatMentions } from '../src/lib/chat/chat-contract.ts';
const user={userId:'10000000-0000-4000-8000-000000000001',username:'小明'};

test('local directory search covers every account, including self/offline, before limiting display to eight',()=>{
  const users=Array.from({length:1200},(_,i)=>({...user,userId:String(i),username:'用户'+i,publicUid:10000+i,lastMessageAt:'2026-10-28T00:00:00Z'}));
  assert.equal(searchChatUsers(users,'用户').length,8);
  assert.equal(searchChatUsers(users,'用户1199')[0].userId,'1199');
  assert.equal(searchChatUsers(users,'11199')[0].userId,'1199');
  assert.equal(searchChatUsers(users,'1119').some(u=>u.userId==='1199'),false,'UIDs match completely');
  assert.equal(searchChatUsers([{...users[0],username:'Mary Jane'}],'mary JANE')[0].userId,'0');
  assert.equal(searchChatUsers([{...users[0],lastMessageAt:null}],'用户0')[0].userId,'0');
});

test('keyword matching never uses recency; only empty suggestions rank recent participants',()=>{
  const now=Date.now();
  const users=[{...user,publicUid:1,lastMessageAt:new Date(now-2000).toISOString()},
    {...user,userId:'2',username:'小明同学',publicUid:2,lastMessageAt:new Date(now-1000).toISOString()},
    {...user,userId:'3',username:'在线新人',publicUid:3}];
  const online=new Set(['2','3']);
  assert.equal(searchChatUsers(users,'小明',online)[0].userId,user.userId);
  assert.deepEqual(recentChatUsers(users.slice(0,2)).map(u=>u.userId),['2',user.userId]);
  assert.deepEqual(searchChatUsers(users,'',online),[]);
  const sameRank=Array.from({length:12},(_,i)=>({...user,userId:String(i),username:'Same'+i,publicUid:i+1,lastMessageAt:new Date(now+i).toISOString()}));
  const expected=searchChatUsers(sameRank,'same').map(u=>u.userId);
  assert.deepEqual(searchChatUsers(sameRank,'same',new Set(['11'])).map(u=>u.userId),expected,'presence never changes matching order');
  assert.deepEqual(searchChatUsers(sameRank.map((u,i)=>({...u,lastMessageAt:i%2?null:new Date(now+100-i).toISOString()})).reverse(),'same').map(u=>u.userId),expected);
  assert.deepEqual(recentChatUsers([{...users[0],lastMessageAt:new Date(now-31*86400000).toISOString()}]),[]);
});

test('mention query follows the caret, accepts names with spaces, and ignores email addresses and confirmed mentions',()=>{
  assert.deepEqual(chatMentionQuery('你好 @小',5,[]),{query:'小',start:3,end:5});
  assert.equal(chatMentionQuery('test@example.com',16,[]),null);
  assert.equal(chatMentionQuery('@Mary Jane',10,[]).query,'Mary Jane');
  assert.equal(chatMentionQuery('@小明',3,[{userId:user.userId,start:0,end:3}]),null);
});
test('selection replaces only the active query and stores Unicode code-point offsets',()=>{
  const result=insertChatMention('😀 @小 后面',{start:3,end:5},user,[]);
  assert.equal(result.text,'😀 @小明  后面');assert.equal(result.cursor,7);
  assert.deepEqual(result.mentions,[{userId:user.userId,start:2,end:5}]);assert.ok(isChatMentions(result.mentions,result.text));
});

test('typing after a selected person never reopens their mention query, but a fresh @ can',()=>{
  for(const [prefix,username] of [['','chat_preview'],['😀 ','小明'],['Hello ','Mary Jane']]){
    const draft=prefix+'@',selected=insertChatMention(draft,{start:prefix.length,end:draft.length},{...user,username},[]);
    for(const suffix of ['', '0', '你好 😀', 'normal words']){
      const content=selected.text+suffix,mentions=editChatMentions(selected.text,content,selected.mentions);
      assert.deepEqual(mentions,selected.mentions);
      assert.equal(chatMentionQuery(content,content.length,mentions),null);
      assert.equal(chatMentionQuery(content,selected.cursor,mentions),null);
    }
    const content=selected.text+'hello @小';
    assert.deepEqual(chatMentionQuery(content,content.length,selected.mentions),{query:'小',start:content.length-2,end:content.length});
  }
});
test('edits move intact references, remove edited references and never discover references from pasted text',()=>{
  const m=[{userId:user.userId,start:0,end:3}];
  assert.deepEqual(editChatMentions('@小明 hi','😀 @小明 hi',m),[{...m[0],start:2,end:5}]);
  assert.deepEqual(editChatMentions('@小明 hi','@小红 hi',m),[]);
  assert.deepEqual(editChatMentions('@小明 hi','@小明! hi',m),m);
  assert.deepEqual(editChatMentions('','@小明',[]),[]);
});
test('mention validation rejects overlaps, invalid IDs, unbounded offsets and hidden recipients',()=>{
  const m={userId:user.userId,start:0,end:3};
  assert.ok(isChatMentions([m],'@小明'));
  for(const value of [null,[{...m,userId:'bad'}],[{...m,start:1}],[{...m,end:9}],[m,m],[{...m,end:1.5}]])assert.equal(isChatMentions(value,'@小明'),false);
});
