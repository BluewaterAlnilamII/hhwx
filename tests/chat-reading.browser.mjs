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
  '@/store/useGameStore': 'export const useGameStore = selector => selector({userId:window.actor});',
  '@/store/useAccountProfileStore': 'export const useAccountProfileStore = selector => selector({userId:window.actor,profile:null});',
  '@/hooks/useChatSession': `import {useEffect,useSyncExternalStore} from 'react';
    export function useChatSession(id,open){
      const session=window.session;
      const state=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot);
      useEffect(()=>{if(open) void session.activate(); else session.pause(true);},[open,session]);
      return {session,state};
    }`,
  'next/dynamic': 'export default () => () => null;',
  './ChatStampLayer': 'export const ChatStampLayer=()=>null;',
  '@/lib/sound-effect-audio': 'export const resumeSoundEffectAudio = async()=>{};',
  '@/components/account/AccountCardAvatar': 'export default ()=>null;',
  '@/components/comments/CommentPublicUid': 'export const CommentPublicUid=()=>null;',
  '@/lib/account-avatar-card': 'export const resolveStoredAccountAvatarCardIdentity=()=>({cardId:1,entityServer:0});',
  './ChatComposer': `import {createElement} from 'react'; export const useChatAttachments=()=>({});
    export const ChatComposer=({draft,onChange,onSend})=>createElement('div',null,createElement('textarea',{value:draft,onChange:e=>onChange(e.target.value),'aria-label':'Message text',style:{height:60,width:'100%'}}),createElement('button',{onClick:()=>onSend([])},'Send fixture'));`,
  './ChatMessageBubble': `import {createElement} from 'react'; export const ChatMessageBubble=({message})=>createElement('div',{'data-bubble':message.id,style:{minHeight:40,padding:8,borderRadius:12,background:'var(--theme-color-control-background)'}},message.content);`,
  './ChatPendingMessage': 'export const ChatPendingMessage=()=>null;',
  '@/components/ImageViewer': 'export default ()=>null;',
};
const bundle = await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',
  define:{'process.env':'{"NODE_ENV":"development"}'},
  stdin:{resolveDir:root,loader:'tsx',contents:`
    import {useRef,useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {NextIntlClientProvider} from 'next-intl'; import ChatDialog from './src/components/chat/ChatDialog';
    import {ChatSession} from './src/lib/chat/chat-session';
    import {prepareChatImage} from './src/lib/chat/chat-image-processing';
    window.prepareChatImage=prepareChatImage;
    const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
    window.actor=uuid(1); let available=Number(new URLSearchParams(location.search).get('initial')||50),removed=new Set(),events;
    const rows=Array.from({length:2200},(_,i)=>({id:uuid(i+100),clientRequestId:uuid(i+1000),
      createdAt:new Date(Date.now()-60000+i).toISOString().replace('Z','000Z'), content:'Message '+i,
      author:{userId:window.actor,username:'Fixture',publicUid:1,avatarCardId:1,avatarCardServer:null,avatarCardTrainType:'normal'}}));
    window.reads=[]; window.failNext=false;
    window.session=new ChatSession(window.actor,{
      async request(path,init={}){
        if(path.endsWith('connection'))return {token:'fixture',url:'ws://fixture',viewer:{userId:window.actor,nextSendAt:null,mutedUntil:null,canModerate:false}};
        if(init.method==='POST'&&path==='/api/chat/messages'){
          const body=JSON.parse(init.body),saved=rows[available++];saved.content=body.content;saved.clientRequestId=body.clientRequestId;
          return {message:saved,messageId:saved.id,clientRequestId:saved.clientRequestId,deleted:false,nextSendAt:null};}
        window.reads.push(path);
        if(window.holdRead&&path.includes(window.holdRead)){window.holdRead=null;await new Promise(resolve=>{window.releaseRead=resolve;});}
        const live=rows.slice(0,available).filter(m=>!removed.has(m.id));
        const after=new URL(path,location.origin).searchParams.get('after');
        if(after){if(window.failNext){window.failNext=false;throw Error('fixture failure');}
          const cursor=after.split('|');const next=live.filter(m=>m.createdAt>cursor[0]||(m.createdAt===cursor[0]&&m.id>cursor[1]));
          return {messages:next.slice(0,50),hasMore:next.length>50};}
        const before=new URL(path,location.origin).searchParams.get('before');
        if(before){const cursor=before.split('|'),older=live.filter(m=>m.createdAt<cursor[0]||(m.createdAt===cursor[0]&&m.id<cursor[1]));
          return {messages:older.slice(-50),nextCursor:older.length>50?older.at(-50):null};}
        return {messages:live.slice(-50),nextCursor:live.length>50?live.at(-50):null};
      },transport(c,r,handlers){events=handlers;return {connect(){handlers.connecting();if(!window.holdSubscribe)queueMicrotask(()=>handlers.subscribed());},disconnect(){}};}
    });
    window.finishConnect=()=>events.subscribed();
    window.deleteMessage=id=>{removed.add(id);events.publication({type:'message.deleted',messageId:id,deletedAt:new Date().toISOString()});};
    window.reconnect=async(count=available,deletedId=null)=>{window.session.pause();available=count;if(deletedId)removed.add(deletedId);await window.session.activate();};
    window.arrive=()=>{available++;events.publication({type:'message.created',message:rows[available-1]});};
    const locale=new URLSearchParams(location.search).get('locale')||'en';
    function App(){const [open,setOpen]=useState(true),trigger=useRef(null);return <NextIntlClientProvider locale={locale} messages={${JSON.stringify(locales)}[locale]}>
      <button ref={trigger} onClick={()=>setOpen(true)}>Open</button><ChatDialog open={open} onOpenChange={setOpen} trigger={trigger}/></NextIntlClientProvider>;}
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
    const page=await browser.newPage({viewport:{width,height},colorScheme:dark?'dark':'light'}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',message=>{if(['error','warning'].includes(message.type()))errors.push(message.text());});
    await page.goto('http://localhost:'+server.address().port+'/?locale='+locale);
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    assert.equal(await page.title(),'Chat reading regression');
    assert.equal(new URL(page.url()).hostname,'localhost');
    const labels=locales[locale].chat, scroll=page.getByLabel(labels.messages,{exact:true});
    const initialBottom=await scroll.evaluate(el=>el.scrollTop);
    await page.evaluate(()=>window.reconnect());
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().newMessages),0);
    assert.ok(Math.abs(await scroll.evaluate(el=>el.scrollTop)-initialBottom)<=2,'no-news recovery preserves the bottom');
    await scroll.evaluate(el=>new Promise(done=>{
      el.addEventListener('scroll',()=>requestAnimationFrame(done),{once:true});el.scrollTop=500;
    }));
    await page.waitForFunction(()=>!window.session.getSnapshot().following);
    const anchor=await scroll.evaluate(el=>{const top=el.getBoundingClientRect().top;const row=[...el.querySelectorAll('[data-message-id]')].find(r=>r.getBoundingClientRect().bottom>top);return {id:row.dataset.messageId,offset:row.getBoundingClientRect().top-top,viewportTop:top};});
    const liveReads=await page.evaluate(()=>window.reads.length);
    await page.evaluate(()=>window.arrive());
    await page.waitForFunction(()=>window.session.getSnapshot().messages.length===51);
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().following),false);
    assert.equal(await page.evaluate(()=>window.reads.length),liveReads);
    assert.ok(Math.abs(await scroll.evaluate((el,id)=>el.querySelector('[data-message-id="'+id+'"]').getBoundingClientRect().top-el.getBoundingClientRect().top,anchor.id)-anchor.offset)<=2);
    await page.evaluate(()=>window.reconnect(90));
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().messages.length),90);
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().hasNewerMessages),false);
    await page.evaluate(()=>window.reconnect(210));
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    await page.getByText(labels.newMessages,{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:labels.latest,exact:true}).count(),1);
    assert.equal(await page.locator('header button').count(),1,'header contains only Close');
    assert.ok(await page.getByRole('heading').evaluate(el=>el.scrollWidth<=el.clientWidth),'title remains fully visible');
    const offset=await scroll.evaluate((el,id)=>el.querySelector('[data-message-id="'+id+'"]').getBoundingClientRect().top-el.getBoundingClientRect().top,anchor.id);
    assert.ok(Math.abs(offset-anchor.offset)<=2, 'reconnect preserves the anchor');
    assert.ok(Math.abs(await scroll.evaluate(el=>el.getBoundingClientRect().top)-anchor.viewportTop)<=2,'the notice does not resize the header');
    const scrollWidth=await page.locator('[data-chat-panel]').evaluate(el=>[el.scrollWidth,el.clientWidth]);
    assert.ok(scrollWidth[0]<=scrollWidth[1], 'the notice fits without horizontal overflow');
    await page.evaluate(id=>{document.querySelector('[data-bubble="'+id+'"]').style.height='140px';},'00000000-0000-4000-8000-000000000100');
    await page.waitForFunction(({id,offset})=>{
      const row=document.querySelector('[data-message-id="'+id+'"]'), viewport=row.closest('[aria-label]');
      return Math.abs(row.getBoundingClientRect().top-viewport.getBoundingClientRect().top-offset)<=2;
    },anchor);
    const resized=await scroll.evaluate((el,id)=>el.querySelector('[data-message-id="'+id+'"]').getBoundingClientRect().top-el.getBoundingClientRect().top,anchor.id);
    assert.ok(Math.abs(resized-anchor.offset)<=2,'delayed media preserves the anchor after layout');
    if(output)await page.screenshot({path:resolve(output,`chat-${width}-${locale}-${dark?'dark':'light'}.png`)});
    const neighbour=await scroll.evaluate((el,id)=>{const row=el.querySelector('[data-message-id="'+id+'"]').nextElementSibling;
      return {id:row.dataset.messageId,offset:row.getBoundingClientRect().top-el.getBoundingClientRect().top};},anchor.id);
    await page.evaluate(id=>window.deleteMessage(id),anchor.id);
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    assert.equal(await page.locator('[data-message-id="'+anchor.id+'"]').count(),0);
    const neighbourOffset=await scroll.evaluate((el,id)=>el.querySelector('[data-message-id="'+id+'"]').getBoundingClientRect().top-el.getBoundingClientRect().top,neighbour.id);
    assert.ok(Math.abs(neighbourOffset-neighbour.offset)<=2,'deleted anchors fall back to their surviving neighbour');
    await page.evaluate(()=>{window.failNext=true;});
    await scroll.hover(); await page.mouse.wheel(0,5000);
    await page.waitForFunction(()=>window.session.getSnapshot().newerError);
    await page.getByText(labels.newerFailed,{exact:true}).waitFor();
    const failedCursor=await page.evaluate(()=>window.reads.at(-1));
    await scroll.evaluate(el=>{el.scrollTop-=200;});await page.waitForTimeout(50);
    await page.mouse.wheel(0,5000);
    await page.waitForFunction(()=>!window.session.getSnapshot().newerError&&!window.session.getSnapshot().loadingNewer);
    assert.equal(await page.evaluate(()=>window.reads.at(-1)),failedCursor,'scroll retries the same page without an extra button');
    assert.ok(await page.evaluate(()=>window.session.getSnapshot().newMessages),'pagination alone does not dismiss the notice');
    for(let i=0;i<8;i++){
      if(!await page.evaluate(()=>window.session.getSnapshot().hasNewerMessages))break;
      await scroll.hover();await page.mouse.wheel(0,5000);await page.waitForTimeout(100);
    }
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().hasNewerMessages),false);
    await scroll.hover();await page.mouse.wheel(0,5000);await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().newMessages),0);
    await scroll.evaluate(el=>new Promise(done=>{
      el.addEventListener('scroll',()=>requestAnimationFrame(done),{once:true});el.scrollTop=300;
    }));
    await page.evaluate(()=>window.reconnect(240));await page.getByText(labels.newMessages,{exact:true}).waitFor();
    const reads=await page.evaluate(()=>window.reads.length);
    await page.getByRole('button',{name:labels.latest,exact:true}).click();
    await page.waitForFunction(()=>window.session.getSnapshot().following);
    assert.equal(await page.evaluate(()=>window.reads.length),reads,'explicit latest uses the prefetched page');
    assert.ok(await scroll.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop<2));
    assert.deepEqual(errors,[]);
    report.push({width,height,locale,dark,anchorShift:offset-anchor.offset});
    // Exercise real browser decoding and WebP encoding at both dimension limits.
    if(width===1280&&locale==='en'){
      const results=await page.evaluate(async()=>{
        const output=[];
        for(const [w,h] of [[1000,12000],[4096,4097],[1000,17000]]){
          const canvas=new OffscreenCanvas(w,h);canvas.getContext('2d').fillRect(0,0,w,h);
          const source=await canvas.convertToBlob({type:'image/png'}),result=await window.prepareChatImage(source);
          output.push({original:[w,h],width:result.width,height:result.height,unchanged:source.size===result.bytes});
        }return output;
      });
      assert.equal(results[0].unchanged,true);for(const result of results){assert.ok(result.width*result.height<=16777216);assert.ok(Math.max(result.width,result.height)<=16383);}
      report.push({images:results});
    }
    await page.close();
  }
  for (const width of [1280,390]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(['error','warning'].includes(message.type()))errors.push(message.text());});
    await page.goto('http://localhost:'+server.address().port+'/?initial=600');
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    const labels=locales.en.chat,scroll=page.getByLabel(labels.messages,{exact:true});
    const move=async(position)=>{
      await scroll.evaluate((el,position)=>{el.scrollTop=position==='bottom'?el.scrollHeight:position;},position);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    };
    const anchor=()=>scroll.evaluate(el=>{
      const top=el.getBoundingClientRect().top,row=[...el.querySelectorAll('[data-message-id]')].find(row=>row.getBoundingClientRect().bottom>top);
      return {id:row.dataset.messageId,offset:row.getBoundingClientRect().top-top};
    });
    const checkAnchor=async(previous)=>{
      const current=await anchor();assert.equal(current.id,previous.id);assert.ok(Math.abs(current.offset-previous.offset)<=2);
    };
    for(let i=0;i<9;i++){
      await move(0);await page.getByRole('button',{name:labels.older,exact:true}).click();
      await page.waitForFunction(count=>window.session.getSnapshot().messages.length===count,100+i*50);
    }
    const original=await page.evaluate(()=>window.session.getSnapshot().messages.map(m=>m.id));
    assert.equal(original.length,500);
    await move(0);await page.evaluate(()=>{window.holdRead='?before=';});
    await page.getByRole('button',{name:labels.older,exact:true}).click();
    await page.waitForFunction(()=>window.session.getSnapshot().loadingOlder);
    await move('bottom');const bottomAnchor=await anchor();
    await page.evaluate(()=>window.releaseRead());await page.waitForFunction(()=>!window.session.getSnapshot().loadingOlder);
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().messages.length),550);
    assert.deepEqual(await page.evaluate(()=>window.session.getSnapshot().messages.slice(50).map(m=>m.id)),original);
    await checkAnchor(bottomAnchor);
    await move(0);await page.getByRole('button',{name:labels.older,exact:true}).click();
    await page.waitForFunction(()=>window.session.getSnapshot().messages[0].content==='Message 0');
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().messages.length),600);
    await page.evaluate(()=>window.reconnect(650));
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    await page.evaluate(()=>{window.holdRead='?after=';});await move('bottom');
    await page.waitForFunction(()=>window.session.getSnapshot().loadingNewer);
    await move(200);const topAnchor=await anchor();
    await page.evaluate(()=>window.releaseRead());await page.waitForFunction(()=>!window.session.getSnapshot().loadingNewer);
    await checkAnchor(topAnchor);
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().messages[0].content),'Message 0');
    await move('bottom');await page.waitForFunction(()=>!window.session.getSnapshot().hasNewerMessages);
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().messages.at(-1).content),'Message 649');
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().messages.length),650);
    await move(300);
    await page.evaluate(()=>{window.holdSubscribe=true;void window.reconnect(700);});
    await page.waitForFunction(()=>window.session.getSnapshot().status==='connecting');
    assert.equal(await page.getByRole('button',{name:labels.latest,exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:labels.latest,exact:true}).count(),0);
    await page.getByLabel('Message text').fill('send while connecting');
    await page.getByRole('button',{name:'Send fixture',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().messages.at(-1).content),'Message 649');
    await page.evaluate(()=>{window.holdRead='/api/chat/messages';window.finishConnect();});
    await page.waitForFunction(()=>window.session.getSnapshot().status==='syncing');
    assert.equal(await page.getByRole('button',{name:labels.latest,exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:labels.latest,exact:true}).count(),0);
    await page.evaluate(()=>window.releaseRead());
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live'&&window.session.getSnapshot().following);
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().messages.at(-1).content),'send while connecting');
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().messages.length),50);
    assert.ok(await scroll.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight<=2));
    if(output)await page.screenshot({path:resolve(output,`chat-${width}-recovery-send.png`)});
    await page.goto('http://localhost:'+server.address().port+'/?initial=3');
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    await page.evaluate(()=>window.reconnect(5));
    await page.waitForFunction(()=>window.session.getSnapshot().messages.length===5&&window.session.getSnapshot().following);
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().newMessages),0);
    assert.ok(await scroll.evaluate(el=>el.scrollHeight<=el.clientHeight));
    await page.evaluate(()=>window.arrive());
    await page.waitForFunction(()=>window.session.getSnapshot().messages.length===6);
    assert.equal(await page.getByRole('button',{name:/Continue reading|View latest|继续读取|查看最新/}).count(),0);
    await page.goto('http://localhost:'+server.address().port+'/?initial=3');
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    await page.evaluate(()=>window.reconnect(120));
    await page.waitForFunction(()=>window.session.getSnapshot().messages.length===53&&!window.session.getSnapshot().loadingNewer);
    assert.equal(await page.evaluate(()=>window.reads.filter(path=>path.includes('?after=')).length),1,'short list fills one page and stops once scrollable');
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().hasNewerMessages),true);
    await page.setViewportSize({width,height:400});
    await page.goto('http://localhost:'+server.address().port+'/?initial=10');
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    await move(0);await page.waitForFunction(()=>!window.session.getSnapshot().following);
    await page.setViewportSize({width,height:900});
    await page.waitForFunction(()=>window.session.getSnapshot().following);
    await page.evaluate(()=>window.arrive());await page.waitForFunction(()=>window.session.getSnapshot().messages.length===11);
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().newMessages),0);
    assert.deepEqual(errors,[]);
    await page.goto('http://localhost:'+server.address().port+'/?initial=1250');
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    for(let i=0;i<24;i++){
      await move(0);await page.getByRole('button',{name:labels.older,exact:true}).click();
      await page.waitForFunction(count=>window.session.getSnapshot().messages.length===count,100+i*50);
    }
    await move(500);const largeAnchor=await anchor();
    await page.evaluate(()=>window.reconnect());
    await page.waitForFunction(()=>window.session.getSnapshot().status==='live');
    assert.equal(await page.evaluate(()=>window.session.getSnapshot().messages.length),1250);
    assert.equal(await page.evaluate(()=>window.reads.filter(path=>path==='/api/chat/messages').length),2,'initial load plus one reconnect read');
    await checkAnchor(largeAnchor);
    assert.deepEqual(errors,[]);
    if(output)await page.screenshot({path:resolve(output,`chat-${width}-1250-messages.png`)});
    report.push({width,retainedMessages:1250,reconnectReads:1,reverseWhileLoading:'both directions appended, anchors preserved',recoverySend:'deferred jump',shortList:'automatic fill and resize following'});
    await page.close();
  }
  console.log(JSON.stringify({passed:true,cases:report},null,2));
}finally{await browser.close();server.close();}
