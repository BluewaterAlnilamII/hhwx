// Focused local fixture: real dialog, session and theme; synthetic auth/messages and lightweight composer/media.
// PLAYWRIGHT_MODULE may point to an existing installation. No account or network service is used.
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.cwd();
const locales = Object.fromEntries(await Promise.all(['en','zh-CN'].map(async locale => [locale, {chat: JSON.parse(await readFile(`messages/${locale}/chat.json`,'utf8'))}])));
const mocks = {
  '@/store/useGameStore': 'export const useGameStore = selector => selector({userId:window.actor}); useGameStore.getState=()=>({userId:window.actor});',
  '@/store/useAccountProfileStore': 'export const useAccountProfileStore = selector => selector({userId:window.actor,profile:null});',
  '@/lib/supabase': 'export const getSafeSession=async()=>({user:{id:window.actor},access_token:"fixture"});',
  '@/hooks/useChatSession': `import {useChatSession as real} from './src/hooks/useChatSession';
    export function useChatSession(id,open){const chat=real(id,open);window.session=chat.session;return chat;}`,
  'centrifuge': `export class UnauthorizedError extends Error {}
    export class Centrifuge {
      handlers={};connected=false;disconnects=0;
      constructor(){window.client=this;}
      on(event,fn){this.handlers[event]=fn;}
      newSubscription(){
        const c=this;this.sub={handlers:{},wanted:false,hasPosition:false,
          on(event,fn){this.handlers[event]=fn;},
          subscribe(){this.wanted=true;this.handlers.subscribing?.();if(c.connected)queueMicrotask(()=>c.deliver(this.hasPosition));},
          unsubscribe(){this.wanted=false;this.handlers.unsubscribed?.();}};return this.sub;
      }
      deliver(recovered){if(!this.sub.wanted)return;this.sub.handlers.subscribed({recovered});this.sub.hasPosition=true;
        if(recovered)window.pending.splice(0).forEach(data=>this.sub.handlers.publication({data}));else window.pending=[];}
      connect(){this.connected=true;this.handlers.connecting();queueMicrotask(()=>{
        this.handlers.subscribed({channel:'chat_activity:main',recovered:false});this.deliver(false);});}
      disconnect(){this.connected=false;this.disconnects++;}
    }`,
  'next/dynamic': `import ChatDialog from './src/components/chat/ChatDialog';
    export default function dynamic(loader){return loader.toString().includes('ChatDialog')?ChatDialog:()=>null;}`,
  './ChatStampLayer': 'export const ChatStampLayer=()=>null;',
  '@/lib/sound-effect-audio': 'export const resumeSoundEffectAudio = async()=>{};',
  '@/components/account/AccountCardAvatar': 'export default ()=>null;',
  '@/components/comments/CommentPublicUid': 'export const CommentPublicUid=()=>null;',
  '@/lib/account-avatar-card': 'export const resolveStoredAccountAvatarCardIdentity=()=>({cardId:1,entityServer:0});',
  './ChatComposer': `import {createElement} from 'react'; export const useChatAttachments=()=>({});
    export const ChatComposer=({draft,onChange,onSend})=>createElement('div',null,createElement('textarea',{value:draft,onChange:e=>onChange(e.target.value),'aria-label':'Message text',style:{height:60,width:'100%'}}),createElement('button',{onClick:()=>onSend([])},'Send fixture'));`,
  './ChatMessageRow': `import {createElement} from 'react'; export const ChatMessageRow=({message})=>createElement('div',{'data-bubble':message.id,style:{minHeight:40,padding:8,borderRadius:12,background:'var(--theme-color-control-background)'}},message.content);`,
  './ChatPendingMessage': 'export const ChatPendingMessage=()=>null;',
  '@/components/ImageViewer': 'export default ()=>null;',
};
const bundle = await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',
  define:{'process.env':'{"NODE_ENV":"development"}'},
  stdin:{resolveDir:root,loader:'tsx',contents:`
    import {useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {NextIntlClientProvider} from 'next-intl'; import ChatLauncher from './src/components/chat/ChatLauncher';
    import {prepareChatImage} from './src/lib/chat/chat-image-processing';
    window.prepareChatImage=prepareChatImage;
    const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
    window.actor=uuid(1); let available=Number(new URLSearchParams(location.search).get('initial')||50),removed=new Set();window.pending=[];
    const rows=Array.from({length:2200},(_,i)=>({id:uuid(i+100),clientRequestId:uuid(i+1000),
      createdAt:new Date(Date.now()-60000+i).toISOString().replace('Z','000Z'), content:'Message '+i,
      author:{userId:uuid(2),username:'Fixture',publicUid:1,avatarCardId:1,avatarCardServer:null,avatarCardTrainType:'normal'}}));
    window.reads=[]; window.failNext=false;
    window.fetch=async(path,init={})=>{
      if(path.startsWith('/api/chat/connection'))return Response.json({success:true,data:{token:'fixture',subscriptionToken:'sub',url:'ws://fixture',channel:'chat:main',activityChannel:'chat_activity:main',viewer:{userId:window.actor,nextSendAt:null,mutedUntil:null,canModerate:false}}});
      if(init.method==='POST'&&path==='/api/chat/messages'){
        const body=JSON.parse(init.body),saved=rows[available++];saved.content=body.content;saved.clientRequestId=body.clientRequestId;saved.author={...saved.author,userId:window.actor};
        return Response.json({success:true,data:{message:saved,messageId:saved.id,deleted:false,nextSendAt:null}});}
      window.reads.push(path);
      const live=rows.slice(0,available).filter(m=>!removed.has(m.id)),cursor=m=>m?{createdAt:m.createdAt,id:m.id}:null;
      const activity={latest:cursor(live.at(-1)),latestOther:cursor(live.findLast(m=>m.author.userId!==window.actor))};
      if(path==='/api/chat/activity')return Response.json({success:true,data:activity});
      const before=new URL(path,location.origin).searchParams.get('before');
      const visible=before?live.filter(m=>m.createdAt<before.split('|')[0]||(m.createdAt===before.split('|')[0]&&m.id<before.split('|')[1])):live;
      const data={messages:visible.slice(-50),nextCursor:visible.length>50?cursor(visible.at(-50)):null,activity};
      if(window.holdRead){window.holdRead=false;await new Promise(resolve=>{window.releaseRead=resolve;});}
      return Response.json({success:true,data});
    };
    window.reconnect=(count=available,recovered=true)=>{
      window.pending.push(...rows.slice(available,count).map(message=>({type:'message.created',message})));available=count;
      window.client.handlers.connecting();window.client.handlers.subscribed({channel:'chat_activity:main',recovered});window.client.deliver(recovered);
    };
    window.arrive=()=>{const message=rows[available++];
      window.client.handlers.publication({channel:'chat_activity:main',data:{type:'message.created',cursor:{id:message.id,createdAt:message.createdAt},userId:message.author.userId}});
      const data={type:'message.created',message};if(window.client.sub.wanted)window.client.sub.handlers.publication({data});else window.pending.push(data);
    };
    window.deleteMessage=id=>{removed.add(id);window.client.sub.handlers.publication({data:{type:'message.deleted',messageId:id,deletedAt:new Date().toISOString()}});};
    const locale=new URLSearchParams(location.search).get('locale')||'en';
    function App(){const [actor,setActor]=useState(window.actor);window.changeAccount=id=>{window.actor=id;setActor(id);};return <NextIntlClientProvider locale={locale} messages={${JSON.stringify(locales)}[locale]}>
      <div style={{padding:24}}><ChatLauncher key={actor} userId={actor} onOpen={()=>{}}/></div></NextIntlClientProvider>;}
    createRoot(document.getElementById('root')).render(<App/>);
  `},plugins:[{name:'fixtures',setup(builder){builder.onResolve({filter:/.*/},({path})=>Object.hasOwn(mocks,path)?{path,namespace:'fixture'}:undefined);
    builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:mocks[path],resolveDir:root}));}}]});
const css=(await postcss([tailwind()]).process(await readFile('src/app/globals.css','utf8'),{from:resolve('src/app/globals.css')})).css;
const server=createServer((request,response)=>{
  if(request.url==='/app.js'){response.setHeader('Content-Type','text/javascript');response.end(bundle.outputFiles[0].text);}
  else if(request.url==='/app.css'){response.setHeader('Content-Type','text/css');response.end(css);}
  else{response.setHeader('Content-Type','text/html');response.end('<!doctype html><html data-visual-theme="smile-patrol"><title>Chat reading regression</title><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>');}
});
await new Promise(done=>server.listen(0,'localhost',done));
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
const output=process.env.CHAT_BROWSER_OUTPUT;
if(output)await mkdir(output,{recursive:true});
try{
  const report=[];
  for(const [width,height,locale,dark] of [[1280,900,'en',false],[390,844,'zh-CN',true],[390,844,'en',false],[1280,900,'zh-CN',true]]){
    const page=await browser.newPage({viewport:{width,height},colorScheme:dark?'dark':'light'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('http://localhost:'+server.address().port+'/?locale='+locale);
    const labels=locales[locale].chat;
    await page.waitForFunction(()=>window.reads?.includes('/api/chat/activity')).catch(error=>{throw new Error(`${error.message}\nBrowser errors: ${errors.join('\n')}`);});
    assert.equal(await page.evaluate(()=>window.reads.filter(p=>p.includes('/messages')).length),0);
    await page.evaluate(()=>window.arrive());await page.locator('[data-chat-unread]').waitFor();
    assert.match(await page.getByRole('button').getAttribute('aria-label'),new RegExp(labels.newMessages));
    if(output)await page.screenshot({path:resolve(output,`chat-${width}-${locale}-unread.png`)});
    await page.getByRole('button').click();
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    await page.locator('[data-chat-unread]').waitFor({state:'detached'});
    const scroll=page.getByLabel(labels.messages,{exact:true});
    await scroll.evaluate(el=>{el.scrollTop=400;});await page.waitForFunction(()=>!window.session.getSnapshot().following);
    const anchor=await scroll.evaluate(el=>{const top=el.getBoundingClientRect().top,row=[...el.querySelectorAll('[data-message-id]')].find(r=>r.getBoundingClientRect().bottom>top);return {id:row.dataset.messageId,offset:row.getBoundingClientRect().top-top};});
    const reads=await page.evaluate(()=>window.reads.length);
    await page.evaluate(()=>window.reconnect(60,true));
    await page.waitForFunction(()=>window.session.getSnapshot().messages.length===59);
    assert.equal(await page.evaluate(()=>window.reads.length),reads);
    const offset=await scroll.evaluate((el,id)=>el.querySelector('[data-message-id="'+id+'"]').getBoundingClientRect().top-el.getBoundingClientRect().top,anchor.id);
    assert.ok(Math.abs(offset-anchor.offset)<=2);
    const savedAnchor=await page.evaluate(()=>window.session.scrollAnchors[0]);
    await page.getByRole('button',{name:labels.close,exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.session.scrollAnchors[0]),savedAnchor,'closing must not replace the visible anchor with hidden geometry');
    assert.equal(await page.evaluate(()=>window.client.disconnects),0);
    await page.evaluate(()=>window.arrive());await page.locator('[data-chat-unread]').waitFor();
    await page.getByRole('button').click();await page.waitForFunction(()=>window.session.getSnapshot().messages.length===60);
    assert.equal(await page.evaluate(()=>window.reads.length),reads);
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().following),false);
    const reopenedOffset=await scroll.evaluate((el,id)=>el.querySelector('[data-message-id="'+id+'"]').getBoundingClientRect().top-el.getBoundingClientRect().top,anchor.id);
    assert.ok(Math.abs(reopenedOffset-anchor.offset)<=2,`reopening shifted the reading anchor by ${reopenedOffset-anchor.offset}px`);
    assert.equal(await page.locator('[data-chat-unread]').count(),1,'opening old reading position is not reading the latest');
    await page.keyboard.press('Escape');await page.getByRole('button').click();
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    const repeatedOffset=await scroll.evaluate((el,id)=>el.querySelector('[data-message-id="'+id+'"]').getBoundingClientRect().top-el.getBoundingClientRect().top,anchor.id);
    assert.ok(Math.abs(repeatedOffset-anchor.offset)<=2,'repeated keyboard close/reopen keeps the reading position');
    await scroll.evaluate(async el=>{el.scrollTop=el.scrollHeight-el.clientHeight-48;await new Promise(requestAnimationFrame);});
    await page.waitForFunction(()=>!window.session.getSnapshot().following);
    await page.getByRole('button',{name:labels.close,exact:true}).click();await page.getByRole('button').click();
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    assert.ok(Math.abs(await scroll.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight)-48)<=2,'near-bottom reading stays above the latest messages');
    assert.equal(await page.locator('[data-chat-unread]').count(),1);
    assert.equal(await page.evaluate(()=>window.reads.length),reads);
    await page.getByRole('button',{name:labels.latest,exact:true}).click();await page.locator('[data-chat-unread]').waitFor({state:'detached'});
    await page.getByRole('button',{name:labels.close,exact:true}).click();await page.evaluate(()=>window.arrive());await page.getByRole('button').click();
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    assert.ok(await scroll.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight)<=2,'closing at the bottom continues following new messages');
    await page.evaluate(()=>{window.holdRead=true;window.reconnect(210,false);});
    await page.waitForFunction(()=>window.session.getSnapshot().status==='syncing');
    await page.getByLabel('Message text',{exact:true}).fill('visible while syncing');await page.getByRole('button',{name:'Send fixture'}).click();
    await page.getByText('visible while syncing',{exact:true}).waitFor();
    await page.evaluate(()=>window.releaseRead());await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().messages.length),51);
    assert.equal(await page.evaluate(()=>window.reads.length),reads+1,'one combined fresh page and activity read');
    const box=await page.locator('[data-chat-panel]').boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1);
    if(output)await page.screenshot({path:resolve(output,`chat-${width}-${locale}-${dark?'dark':'light'}.png`)});
    const connectionCount=await page.evaluate(()=>window.client.disconnects);
    await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));window.arrive();});
    assert.equal(await page.evaluate(()=>window.client.disconnects),connectionCount);
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().unread),true);
    await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
    await page.locator('[data-chat-unread]').waitFor({state:'detached'});
    await page.getByLabel('Message text',{exact:true}).fill('private draft');
    await page.evaluate(()=>window.changeAccount('00000000-0000-4000-8000-000000000003'));
    await page.waitForFunction(()=>window.session.userId.endsWith('003'));
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().draft),'');
    assert.equal(await page.locator('[data-chat-panel]').count(),0);
    assert.deepEqual(errors,[]);
    report.push({width,locale,dark,recoveryReads:0,fallbackReads:1,closedUnread:true,accountIsolation:true,anchorShift:offset-anchor.offset,reopenAnchorShift:reopenedOffset-anchor.offset,repeatedReopen:true,nearBottomPreserved:true});
    if(width===1280&&locale==='en'){
      const results=await page.evaluate(async()=>{
        const output=[];
        for(const [w,h] of [[1000,12000],[4096,4097],[1000,17000]]){
          const canvas=new OffscreenCanvas(w,h);canvas.getContext('2d').fillRect(0,0,w,h);
          const blob=await canvas.convertToBlob({type:'image/png'}),result=await window.prepareChatImage(blob);
          output.push({width:result.width,height:result.height,unchanged:result.width===w&&result.height===h});
        }return output;
      });
      assert.equal(results[0].unchanged,true);for(const r of results){assert.ok(r.width*r.height<=16777216);assert.ok(Math.max(r.width,r.height)<=16383);}
      report.push({images:results});
    }
    await page.close();
  }
  console.log(JSON.stringify({passed:true,cases:report},null,2));
}finally{await browser.close();server.close();}
