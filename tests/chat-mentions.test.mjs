import assert from 'node:assert/strict';
import test from 'node:test';
import { chatMentionQuery, editChatMentions, insertChatMention } from '../src/lib/chat/chat-mentions.ts';
import { isChatMentions } from '../src/lib/chat/chat-contract.ts';
const user={userId:'10000000-0000-4000-8000-000000000001',username:'小明'};

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
