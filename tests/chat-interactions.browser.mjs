// Real dialog/composer/message UI and session; synthetic accounts, transport and HTTP only.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),root=process.cwd();
const locales=Object.fromEntries(await Promise.all(['en','zh-CN'].map(async locale=>[locale,Object.fromEntries(await Promise.all(['chat','comments','common','bandori'].map(async ns=>[ns,JSON.parse(await readFile(`messages/${locale}/${ns}.json`,'utf8'))])))])));
const mocks={
 'next/dynamic':'export default ()=>()=>null;',
 '@/store/useAccountProfileStore':'export const useAccountProfileStore=selector=>selector({userId:"fixture",profile:null});',
 '@/hooks/useBandoriCardsMaster':'export const useBandoriCardsMaster=()=>({data:{1:{resourceSetName:"fixture",displayName:"Fixture avatar"}},loading:false});',
 '@/hooks/useBandoriPublicAssetIndex':'export const useBandoriCardsAssetIndex=()=>({value:{resources:{fixture:{images:{normal:{thumb:{key:"bandori/fixture-avatar.png"}}}}}},loading:false});export const useBandoriStampsAssetIndex=()=>({value:null,loading:false});',
 '@/store/useBandoriPreferencesStore':'export const useBandoriPreferredServer=()=>"jp";',
 '@/lib/sound-effect-audio':'export const resumeSoundEffectAudio=async()=>{};export const preloadSoundEffect=async()=>{};export const playSoundEffect=async()=>{};export const playIndependentSoundEffect=()=>({stop(){}});',
};
const bundle=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',define:{'process.env':'{"NODE_ENV":"development","NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL":"https://cdn.hhwx.org"}'},stdin:{resolveDir:root,loader:'tsx',contents:`
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';
import ChatDialog from './src/components/chat/ChatDialog';import {ChatSession,ChatRequestError} from './src/lib/chat/chat-session';
import {CommentContent} from './src/components/comments/CommentContent';
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),actor=uuid(1),start=Date.now()-100000;
const rows=Array.from({length:60},(_,i)=>({id:uuid(i+100),clientRequestId:uuid(i+1000),content:'Message '+i,createdAt:new Date(start+i*100).toISOString().replace('Z','000Z'),reactions:[],reactionsVersion:0,reactionsViewerId:actor,author:{userId:uuid(2),username:'Fixture',publicUid:2,avatarCardId:1,avatarCardServer:null,avatarCardTrainType:'normal'}}));
const summary=m=>({id:m.id,deleted:false,username:m.author.username,content:m.content,image:false,createdAt:m.createdAt});
rows[59].reply=summary(rows[1]);window.calls=[];let handlers;
rows[58].reactions=[{emojiKey:'LisaMelt',count:1,reactedByViewer:false}];
rows[57].image={key:'user/images/temporary/fixture.png',width:64,height:64,contentType:'image/png',bytes:100,hash:'a'.repeat(64)};
for(const i of [5,10,15]){rows[i].content='@Me Mention '+i;rows[i].mentions=[{userId:actor,start:0,end:3}];}
rows[11].content='@Me plain text';rows[12].content='@User1 someone else';rows[12].mentions=[{userId:uuid(200),start:0,end:6}];
const mediaMode=new URLSearchParams(location.search).get('media');
const mediaContents=['文字加载失败 :ArisaAngery: 后面的文字',':ArisaAngery:',':Tae: :Tae: :Tae: :Tae: :Tae: :Tae: :Tae: :Tae:',':LisaMelt:',':KanonJii:',':KokoroYay:','文字中的表情 :LisaMelt: 后面继续写文字 :Tae:'];
if(mediaMode){for(let i=0;i<mediaContents.length;i++)rows[53+i].content=mediaContents[i];rows[52].image={...rows[57].image,width:400,height:30};rows[56].author={...rows[56].author,userId:actor,username:'Me'};delete rows[57].image;}
let mentionInbox={items:[],total:0};
const mentionUsers=Array.from({length:12},(_,i)=>({...rows[0].author,userId:uuid(200+i),username:'User'+(i+1),publicUid:10001+i}));
window.presenceFailure=false;window.onlineFixture=[...mentionUsers,{...rows[0].author,userId:actor,username:'Me',publicUid:1},rows[0].author];
const session=new ChatSession(actor,{transport(_c,_r,h){handlers=h;return{connect(){queueMicrotask(()=>{h.subscribed();h.activitySubscribed({recovered:false});});},disconnect(){},subscribeMessages(){},unsubscribeMessages(){}};},async request(path,init={}){
 window.calls.push({path,method:init.method,body:init.body});
 if(path.includes('/connection'))return{token:'fixture',url:'ws://fixture',viewer:{userId:actor,canModerate:false,mutedUntil:null,nextSendAt:null}};
 if(path==='/api/chat/users')return [...mentionUsers,{...rows[0].author,userId:actor,username:'Me',publicUid:1},rows[0].author];
 if(path==='/api/chat/presence?connections=1'){if(window.presenceFailure)throw new ChatRequestError('CHAT_UNAVAILABLE');return structuredClone(window.onlineFixture.map(user=>({clientId:user.userId,user})));}
 if(path==='/api/chat/activity')return {latest:null,latestOther:null};
 if(path.startsWith('/api/chat/mentions/users')){const q=new URL(path,location.origin).searchParams.get('q');if(!q)return mentionUsers.slice(0,8).map((u,i)=>({...u,lastMessageAt:new Date(start-i).toISOString().replace('Z','000Z')}));if(q==='slow')await new Promise(r=>setTimeout(r,350));return mentionUsers.filter(u=>u.username.toLowerCase().includes(q.toLowerCase())||String(u.publicUid)===q);}
 if(path==='/api/chat/mentions'){if(init.method==='PUT'){const {messageIds}=JSON.parse(init.body);mentionInbox.items=mentionInbox.items.filter(m=>!messageIds.includes(m.id));mentionInbox.total=mentionInbox.items.length;}return structuredClone(mentionInbox);}
 if(path.endsWith('/context')){if(window.failLocate){window.failLocate=false;throw new ChatRequestError('CHAT_UNAVAILABLE');}return{messages:rows.slice(0,15),nextCursor:null};}
 if(path.includes('/reactions')){
  const id=path.split('/')[4],m=rows.find(m=>m.id===id);
  if(init.method==='PUT'){const b=JSON.parse(init.body),previous=m.reactions.find(r=>r.emojiKey===b.emojiKey),count=(previous?.count??0)+(b.active?1:0)-(previous?.reactedByViewer?1:0);m.reactions=m.reactions.filter(r=>r.emojiKey!==b.emojiKey);if(count>0)m.reactions.push({emojiKey:b.emojiKey,count,reactedByViewer:b.active});m.reactionsVersion++;return{type:'message.reactions',messageId:id,version:m.reactionsVersion,reactions:m.reactions.map(({emojiKey,count})=>({emojiKey,count})),userId:actor,ownEmojiKeys:m.reactions.filter(r=>r.reactedByViewer).map(r=>r.emojiKey)};}
  if(window.participantGate)await window.participantGate;
  return{emojiKey:new URL(path,location.origin).searchParams.get('emojiKey'),messageId:id,users:[{userId:actor,username:'Participant',publicUid:1,avatar:{cardId:1,entityServer:null,trainType:'normal'},reactedAt:new Date().toISOString()}],hasMore:false,nextCursor:null};
 }
 if(init.method==='POST'){const b=JSON.parse(init.body),m={...rows[0],id:b.clientRequestId,clientRequestId:b.clientRequestId,content:b.content,mentions:b.mentions,reply:b.replyToId?summary(rows.find(r=>r.id===b.replyToId)):null,author:{...rows[0].author,userId:actor,username:'Me'},createdAt:new Date().toISOString().replace('Z','000Z')};rows.push(m);return{message:m,messageId:m.id,deleted:false,nextSendAt:null};}
 return{messages:rows.slice(-20),nextCursor:null};
}});window.session=session;window.presenceChanged=event=>handlers.presenceChanged(event);window.seedMentions=(username,indices=[5,10,15])=>{mentionInbox={items:indices.map(i=>({id:rows[i].id,createdAt:rows[i].createdAt,username:username??rows[i].author.username})),total:indices.length};return session.refreshMentions();};window.removeOriginal=()=>handlers.publication({type:'message.deleted',messageId:rows[1].id,deletedAt:new Date().toISOString()});
const locale=new URLSearchParams(location.search).get('locale')||'en';
function App(){const [open,setOpen]=useState(false),trigger=useRef(null),state=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot);
 useEffect(()=>{session.setOpen(open);session.setReadingAllowed(open);session.setMembersVisible(open);if(open)void session.activate();},[open]);return <NextIntlClientProvider locale={locale} messages={${JSON.stringify(locales)}[locale]}>{mediaMode==='comments'?<main className="mx-auto max-w-xl p-4">{mediaContents.map((content,i)=><div key={i} data-media-case={i} className="mb-4"><CommentContent content={content} isDeleted={false}/></div>)}</main>:<><button ref={trigger} onClick={()=>setOpen(true)}>Open fixture</button><ChatDialog open={open} onOpenChange={setOpen} trigger={trigger} userId={actor} session={session} state={state}/></>}</NextIntlClientProvider>;}
createRoot(document.getElementById('root')).render(<App/>);`},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},({path})=>Object.hasOwn(mocks,path)?{path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:mocks[path],resolveDir:root}));}}]});
const css=(await postcss([tailwind()]).process(await readFile('src/app/globals.css','utf8'),{from:resolve('src/app/globals.css')})).css;
const server=createServer(async(req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}else if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css);}else if(req.url.startsWith('/res/emoji/')){try{res.setHeader('Content-Type',req.url.endsWith('.webp')?'image/webp':'image/png');res.end(await readFile(resolve('public'+req.url)));}catch{res.writeHead(404);res.end();}}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html data-visual-theme="smile-patrol"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chat interactions</title><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>');}});
await new Promise(done=>server.listen(0,'localhost',done));
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
const output=process.env.CHAT_BROWSER_OUTPUT;if(output)await mkdir(output,{recursive:true});
async function checkScrollLock(page, scroll, touch, overlay) {
 const before=await scroll.evaluate(e=>e.scrollTop),windowBefore=await page.evaluate(()=>window.scrollY),box=await scroll.boundingBox();
 assert.ok(before>100,'The background list must actually be scrollable');
 const x=box.x+4,y=box.y+40;
 await page.mouse.move(x,y);await page.mouse.wheel(0,-180);await page.waitForTimeout(120);
 assert.equal(await scroll.evaluate(e=>e.scrollTop),before,'Wheel must not scroll behind a menu or picker');
 if(touch){
  const cdp=await page.context().newCDPSession(page);
  const bounds=await overlay.boundingBox(),touchX=bounds.x+bounds.width/2,touchY=bounds.y+24;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchX,y:touchY}]});
  for(let step=1;step<=5;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchX,y:touchY+step*20}]});await page.waitForTimeout(25);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(120);await cdp.detach();
  assert.equal(await scroll.evaluate(e=>e.scrollTop),before,'Touch must not scroll behind a menu or picker');
 }
 assert.equal(await page.evaluate(()=>window.scrollY),windowBefore);
}
async function checkGridScroll(page, grid, touch) {
 const before=await grid.evaluate(e=>e.scrollTop),box=await grid.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,120);
 await page.waitForFunction(({element,before})=>element.scrollTop>before,{element:await grid.elementHandle(),before});
 await grid.evaluate(e=>{e.scrollTop=0;});
 if(touch){
  const cdp=await page.context().newCDPSession(page),x=box.x+box.width/2,y=box.y+box.height-24;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let step=1;step<=5;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-step*20}]});await page.waitForTimeout(25);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(element=>element.scrollTop>0,await grid.elementHandle());await cdp.detach();
  await page.waitForTimeout(200);await grid.evaluate(e=>{e.scrollTop=0;});
 }
}
async function holdTouch(page, locator, {move=false,cancel=false,position}={}) {
 await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox(),x=b.x+(position?.x??b.width/2),y=b.y+(position?.y??b.height/2);
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 if(move)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-8}]});
 await page.waitForTimeout(800);
 await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();
}
async function checkRowHitArea(page, row, t, touch, own=false) {
 await row.scrollIntoViewIfNeeded();const b=await row.boundingBox(),x=own?b.x+10:b.x+b.width-10;
 for(const y of [b.y+1,b.y+b.height/2,b.y+b.height-1]){
  const hit=await page.evaluate(({x,y})=>{const e=document.elementFromPoint(x,y);return {tag:e?.tagName,classes:e?.className,message:e?.closest('[data-message-id]')?.getAttribute('data-message-id')};},{x,y});
  if(hit.message!==await row.evaluate(e=>e.closest('[data-message-id]').getAttribute('data-message-id'))){
   if(output)await page.screenshot({path:resolve(output,'hit-area-failure.png')});throw new Error(JSON.stringify({x,y,b,hit}));
  }
  await page.mouse.click(x,y,{button:'right'});await page.getByRole('menuitem',{name:t.reply,exact:true}).waitFor();
  assert.equal(await row.getAttribute('data-chat-actions-open'),'true','The menu belongs to the highlighted row');
  assert.equal(await page.locator('[data-chat-message-row][data-chat-actions-open="true"]').count(),1);
  await page.keyboard.press('Escape');await page.getByRole('menu').waitFor({state:'detached'});
 }
 await page.mouse.click(x,b.y+b.height/2);assert.equal(await page.getByRole('menu').count(),0,'Blank single-click has no action');
 if(touch){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:b.y+b.height/2}]});await page.waitForTimeout(800);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  await page.getByRole('menuitem',{name:t.reply,exact:true}).waitFor();
  assert.equal(await row.getAttribute('data-chat-actions-open'),'true');
  await page.keyboard.press('Escape');await page.getByRole('menu').waitFor({state:'detached'});
  await holdTouch(page,row,{move:true});assert.equal(await page.getByRole('menu').count(),0,'Moving cancels a pending long press');
 }
}
async function checkMediaLayout(width,mode,reading=false) {
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,colorScheme:width<500?'dark':'light'}),page=await context.newPage();
 const pending=new Map(),released=new Set(),assets=['LisaMelt.png','Tae.png','ArisaAngery.png','KanonJii.webp','KokoroYay.png',...(mode==='chat'?['fixture-avatar.png','fixture.png']:[])];
 let allRequested;const requested=new Promise(resolve=>{allRequested=resolve;});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route(/\/res\/emoji\/|\/fixture(?:-avatar)?\.png/,async route=>{
  const name=new URL(route.request().url()).pathname.split('/').pop();
  if(!released.has(name))await new Promise(resolve=>{const waiting=pending.get(name)||[];waiting.push(resolve);pending.set(name,waiting);if(assets.every(name=>pending.has(name)))allRequested();});
  if(name==='ArisaAngery.png')return route.fulfill({status:404,body:''});
  if(name==='fixture.png'||name==='fixture-avatar.png')return route.fulfill({contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:await readFile('public/res/emoji/Tae.png')});
  await route.continue();
 });
 try{
  await page.goto('http://localhost:'+server.address().port+'/?locale=zh-CN&media='+mode,{waitUntil:'domcontentloaded'});
  assert.equal(await page.title(),'Chat interactions');
  if(mode==='chat'){await page.getByText('Open fixture',{exact:true}).click();await page.locator('[data-chat-bubble]').last().waitFor();}
  else await page.locator('[data-media-case]').last().waitFor();
  // Exercise every media item, including those just outside the current reading viewport.
  await page.locator('img').evaluateAll(images=>images.forEach(image=>{image.loading='eager';}));
  let requestTimeout;
  try{await Promise.race([requested,new Promise((_,reject)=>{requestTimeout=setTimeout(()=>reject(new Error('Missing delayed assets: '+assets.filter(name=>!pending.has(name)).join(', '))),10000);})]);}
  finally{clearTimeout(requestTimeout);}
  if(reading){await page.getByLabel(locales['zh-CN'].chat.messages,{exact:true}).evaluate(e=>{e.scrollTop=Math.max(0,e.scrollTop-180);});await page.waitForFunction(()=>!window.session.getSnapshot().following);}
  const measure=()=>page.evaluate(()=>{
   const rect=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(n=>Math.round(n*100)/100);};
   const scroll=document.querySelector('[data-chat-panel] ol')?.parentElement;
   return {scroll:scroll?[scroll.scrollTop,scroll.scrollHeight,scroll.clientHeight]:null,
    frames:[...document.querySelectorAll('[data-chat-message-row],[data-chat-reply],[data-chat-reactions-row],[data-chat-message-row] [data-card-id]')].map(rect),
    rows:[...document.querySelectorAll('[data-chat-bubble],[data-media-case]')].map(e=>{
     const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),text=[];let node;
     while((node=walker.nextNode())){if(!node.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(node);text.push([...range.getClientRects()].map(r=>[r.x,r.y,r.width,r.height].map(n=>Math.round(n*100)/100)));}
     return {box:rect(e),text};
    })};
  });
  const before=await measure(),label=`${mode}-${reading?'reading':'bottom'}-${width}`;
  const emojiBoxes=await page.locator('[data-chat-bubble] span[title], [data-media-case] span[title]').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height];}));
  assert.ok(emojiBoxes.some(([w,h])=>w===24&&h===24)&&emojiBoxes.some(([w,h])=>w===48&&h===48));
  assert.ok(emojiBoxes.every(([w,h])=>w===h&&(w===24||w===48)),'All message emojis reserve a fixed square');
  assert.ok(await page.getByRole('status').count()>0,'Delayed images have loading feedback');
  if(output)await page.screenshot({path:resolve(output,`media-before-${label}.png`)});
  for(const name of assets){
   released.add(name);for(const resolve of pending.get(name)||[])resolve();
   await page.waitForFunction(name=>[...document.querySelectorAll('img')].filter(i=>new URL(i.src).pathname.endsWith('/'+name)).every(i=>i.complete),name);
   if(name==='ArisaAngery.png')await page.getByRole('img',{name:':ArisaAngery: 暂无图片',exact:true}).first().waitFor();
   await page.waitForTimeout(40);
   assert.deepEqual(await measure(),before,`${label}: loading ${name} must not change bubbles, text wrapping or scroll position`);
  }
  assert.equal(await page.getByRole('status').count(),0,'Success and failure both end loading feedback');
  assert.equal(await page.getByRole('img',{name:':ArisaAngery: 暂无图片',exact:true}).count(),2);
  if(mode==='chat'){
   const avatarBoxes=await page.locator('[data-chat-message-row] [data-card-id]').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height];}));
   assert.ok(avatarBoxes.length>0&&avatarBoxes.every(([w,h])=>w===(width<640?36:40)&&h===w),'Avatar loading preserves its desktop/mobile slot');
   const headerOffsets=await page.locator('[data-chat-message-row]').evaluateAll(rows=>rows.flatMap(row=>{
    const header=row.lastElementChild?.firstElementChild;
    if(!header?.querySelector('.tabular-nums')||header.children.length!==2)return [];
    const [name,uid]=[...header.children].map(e=>e.getBoundingClientRect());return [Math.abs(name.y+name.height/2-uid.y-uid.height/2)];
   }));
   assert.ok(headerOffsets.length>0&&headerOffsets.every(offset=>offset<0.1),'Username and UID remain vertically centered: '+JSON.stringify(headerOffsets));
  }
  if(output)await page.screenshot({path:resolve(output,`media-after-${label}.png`)});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({mediaLayout:label,stages:assets.length,geometryShift:0,textReflow:0,scrollShift:0}));
 }finally{for(const callbacks of pending.values())for(const resolve of callbacks)resolve();await context.close();}
}
try{
 for(const width of [1280,390]){await checkMediaLayout(width,'chat');await checkMediaLayout(width,'chat',true);await checkMediaLayout(width,'comments');}
 const cases=[];
 for(const [width,locale] of [[1280,'en'],[390,'zh-CN']]){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,colorScheme:locale==='zh-CN'?'dark':'light'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/fixture-avatar.png',async route=>route.fulfill({contentType:'image/png',body:await readFile('public/res/emoji/Tae.png')}));
  await page.route('https://cdn.hhwx.org/user/images/temporary/fixture.png?cors=1',async route=>route.fulfill({contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:await readFile('public/res/emoji/Tae.png')}));
  await page.goto('http://localhost:'+server.address().port+'/?locale='+locale);assert.equal(await page.title(),'Chat interactions');await page.getByText('Open fixture',{exact:true}).click();await page.locator('[data-chat-bubble]').last().waitFor();
  const t=locales[locale].chat,row=page.locator('[data-message-id]').last(),bubble=row.locator('[data-chat-bubble]');
  const scroll=page.getByLabel(t.messages,{exact:true});
  await page.waitForFunction(()=>window.session.getSnapshot().onlineUsers?.length===14);
  await page.locator('#chat-draft').fill('preserve draft');
  const oldScroll=await scroll.evaluate(e=>e.scrollTop);
  const header=page.locator('[data-chat-panel] header'),titleBounds=await header.getByRole('heading').boundingBox(),presenceBounds=await page.locator('[data-chat-presence-trigger]').boundingBox();
  assert.ok(presenceBounds.x-titleBounds.x-titleBounds.width<20,'Online count sits beside the left title');
  const presenceReads=await page.evaluate(()=>window.calls.filter(c=>c.path.startsWith('/api/chat/presence')).length);
  await page.locator('[data-chat-presence-trigger]').click();
  const members=page.locator('[data-chat-members]');await members.waitFor();
  assert.equal(await members.getAttribute('aria-describedby'),null,'Member list has no unnecessary description');
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.path.startsWith('/api/chat/presence')).length),presenceReads,'Opening the member dialog never reloads presence');
  assert.equal(await members.locator('li').count(),14,'Member list is not capped at eight');
  assert.equal(await members.evaluate(e=>e.scrollWidth<=e.clientWidth),true);
  if(output)await page.screenshot({path:resolve(output,`presence-members-${locale}-${width}.png`)});
  await page.keyboard.press('Escape');await members.waitFor({state:'detached'});
  assert.equal(await page.locator('[data-chat-panel]').isVisible(),true);
  assert.equal(await page.locator('#chat-draft').inputValue(),'preserve draft');
  assert.equal(await scroll.evaluate(e=>e.scrollTop),oldScroll);
  await page.evaluate(async()=>{window.presenceFailure=true;await window.session.refreshPresence();});
  assert.equal(await page.locator('[data-chat-presence-trigger]').innerText(),t.onlineUnknown);
  assert.equal(await row.getByRole('img',{name:t.offline,exact:true}).count(),0,'Unavailable presence is not offline');
  await page.evaluate(async()=>{window.presenceFailure=false;await window.session.refreshPresence();});
  await page.locator('#chat-draft').fill('@Me');await page.getByRole('option').first().waitFor();
  await page.locator('#chat-draft').press('Tab');assert.equal(await page.locator('#chat-draft').inputValue(),'@Me ');
  await page.locator('#chat-draft').fill('');
  assert.equal(await row.getByRole('button',{name:t.reply,exact:true}).count(),0);assert.equal(await row.getByRole('button',{name:t.addReaction,exact:true}).count(),0);
  await bubble.scrollIntoViewIfNeeded();
  const messageRow=row.locator('[data-chat-message-row]');await page.mouse.move(0,0);await page.waitForTimeout(160);
  const restColor=await messageRow.evaluate(e=>getComputedStyle(e).backgroundColor),restBounds=await messageRow.boundingBox();
  await bubble.hover();await page.waitForTimeout(160);
  assert.equal(await messageRow.evaluate((e,color)=>getComputedStyle(e).backgroundColor!==color,restColor),width>=500,'Only a fine hover pointer highlights a row');
  assert.deepEqual(await messageRow.boundingBox(),restBounds,'Row feedback never changes message geometry');
  await checkRowHitArea(page,messageRow,t,width<500);
  for(const part of [row.getByRole('img',{name:'Fixture avatar',exact:true}),row.getByText('Fixture',{exact:true}).first(),row.getByText('2',{exact:true}),row.locator('[data-chat-reply]')]){
   await part.click({button:'right'});await page.getByRole('menuitem',{name:t.reply,exact:true}).waitFor();
   assert.equal(await messageRow.getAttribute('data-chat-actions-open'),'true');await page.keyboard.press('Escape');
  }
  if(width<500){
   await holdTouch(page,row.locator('[data-chat-reply]'));await page.getByRole('menuitem',{name:t.reply,exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>window.session.getSnapshot().context),null,'Long-pressing a quote must not navigate');
   await row.locator('[data-chat-reply]').dispatchEvent('click',{detail:1});
   assert.equal(await page.evaluate(()=>window.session.getSnapshot().context),null,'Release click after long press is suppressed');await page.keyboard.press('Escape');
  }
  const imageRow=page.locator('[data-message-id="00000000-0000-4000-8000-000000000157"]'),imageButton=imageRow.getByRole('button',{name:t.openImage,exact:true});
  await imageButton.click({button:'right'});await page.getByRole('menuitem',{name:t.reply,exact:true}).waitFor();await page.keyboard.press('Escape');
  if(width<500){await holdTouch(page,imageButton);await page.getByRole('menuitem',{name:t.reply,exact:true}).waitFor();await imageRow.locator('[data-chat-image]').dispatchEvent('click',{detail:1});assert.equal(await page.getByRole('button',{name:t.closeImage,exact:true}).count(),0);await page.keyboard.press('Escape');}
  await imageButton.click();await page.getByRole('button',{name:t.closeImage,exact:true}).waitFor();await page.getByRole('button',{name:t.closeImage,exact:true}).click();
  await bubble.scrollIntoViewIfNeeded();
  if(width<500){const box=await bubble.boundingBox();await bubble.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:1,button:0,isPrimary:true,clientX:box.x+box.width/2,clientY:box.y+box.height/2});await page.waitForTimeout(750);await bubble.dispatchEvent('pointerup',{pointerType:'touch',pointerId:1,button:0,isPrimary:true,clientX:box.x+box.width/2,clientY:box.y+box.height/2});}
  else await bubble.click({button:'right'});
  await page.getByRole('menuitem',{name:t.reply,exact:true}).waitFor();
  assert.deepEqual(await page.getByRole('menu').locator('img').evaluateAll(images=>images.map(image=>image.alt)),[':Tae:',':KokoroYay:',':LisaMelt:']);
  await checkScrollLock(page,scroll,width<500,page.getByRole('menu'));
  await page.mouse.move(0,0);await page.waitForTimeout(160);
  assert.notEqual(await messageRow.evaluate(e=>getComputedStyle(e).backgroundColor),restColor,'An open menu keeps its target highlighted away from the pointer');
  if(output)await page.screenshot({path:resolve(output,`menu-${locale}-${width}.png`)});
  await page.getByRole('menuitem',{name:t.reply,exact:true}).click();
  await page.locator('[data-chat-reply-draft]').waitFor();assert.equal(await page.getByText(/^(正在回复|Replying)$/).count(),0);assert.equal(await page.locator('#chat-draft').evaluate(e=>document.activeElement===e),true);
  await page.keyboard.press('Escape');await page.locator('[data-chat-reply-draft]').waitFor({state:'detached'});assert.equal(await page.locator('[data-chat-panel]').count(),1);await bubble.click({button:'right'});await page.getByRole('menuitem',{name:t.reply,exact:true}).click();
  await page.locator('#chat-draft').fill('One answer');const sendButton=page.getByRole('button',{name:t.send,exact:true}),sendBox=await sendButton.boundingBox();
  await page.mouse.move(sendBox.x+sendBox.width/2,sendBox.y+sendBox.height/2);await page.mouse.down();await page.waitForTimeout(120);
  assert.equal(await sendButton.evaluate(e=>Number(getComputedStyle(e).scale)<1),true,'Press feedback is visible before sending');
  await page.mouse.up();await page.getByText('One answer',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-chat-reply-draft]').count(),0);
  const sent=page.locator('[data-message-id]').filter({has:page.getByText('One answer',{exact:true})});assert.equal(await sent.locator('[data-chat-reply]').count(),1);
  const ownAvatar=sent.getByRole('img',{name:'Fixture avatar',exact:true});await ownAvatar.waitFor();assert.doesNotMatch(await sent.innerText(),/\bMe\b|\bUID\b/);
  await checkRowHitArea(page,sent.locator('[data-chat-message-row]'),t,width<500,true);
  const ownBubbleBounds=await sent.locator('[data-chat-bubble]').boundingBox(),ownAvatarBounds=await ownAvatar.boundingBox();assert.ok(ownAvatarBounds.x>ownBubbleBounds.x+ownBubbleBounds.width,'Own avatar is to the right of the bubble');
  await page.locator('#chat-draft').fill('Continuation');await page.getByRole('button',{name:t.send,exact:true}).click();await page.getByText('Continuation',{exact:true}).waitFor();assert.equal(await page.locator('[data-message-id]').last().locator('[data-chat-reply]').count(),0);
  const continuation=page.locator('[data-message-id]').last();assert.equal(await continuation.getByRole('img',{name:'Fixture avatar',exact:true}).count(),0);assert.doesNotMatch(await continuation.innerText(),/\bMe\b|\bUID\b/);
  const continuationBounds=await continuation.locator('[data-chat-bubble]').boundingBox();assert.ok(Math.abs(continuationBounds.x+continuationBounds.width-ownBubbleBounds.x-ownBubbleBounds.width)<1,'Grouped continuation keeps the avatar column');
  const target=page.locator('[data-message-id="00000000-0000-4000-8000-000000000159"]');
  await target.locator('[data-chat-bubble]').click({button:'right'});await page.getByRole('menuitem',{name:t.reactWith.replace('{emoji}','KokoroYay'),exact:true}).click();
  const chip=target.getByRole('button',{name:':KokoroYay: 1',exact:true});await chip.waitFor();assert.equal(await chip.getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>{window.participantGate=new Promise(resolve=>{window.releaseParticipants=resolve;});});
  await holdTouch(page,chip);await target.locator('[popover="manual"][role="dialog"]').waitFor();
  assert.equal(await page.getByRole('menu').count(),0,'Reaction long press must not open the row menu');assert.equal(await chip.getAttribute('aria-pressed'),'true');
  await chip.click({button:'right'});assert.equal(await page.getByRole('menu').count(),0);await page.keyboard.press('Escape');
  await target.getByRole('button',{name:t.addReaction,exact:true}).click({button:'right'});assert.equal(await page.getByRole('menu').count(),0,'Add-reaction controls keep their own event boundary');
  await target.locator('[data-chat-bubble]').focus();await page.keyboard.press('Shift+F10');
  assert.deepEqual(await page.getByRole('menu').locator('img').evaluateAll(images=>images.map(image=>image.alt)),[':KokoroYay:',':Tae:',':LisaMelt:']);
  await page.getByRole('menuitem',{name:t.viewReactions,exact:true}).click();
  const participantsDialog=page.getByTestId('comment-reactions-dialog');await participantsDialog.waitFor();
  const participantReads=()=>page.evaluate(()=>window.calls.filter(c=>c.path.includes('000000000159/reactions?')&&!c.method).length);
  assert.equal(await participantReads(),1,'Preview and dialog share the pending first page');
  await page.evaluate(()=>{window.releaseParticipants();window.participantGate=null;});await page.getByText('Participant',{exact:true}).waitFor();
  assert.equal(await participantReads(),1);
  await page.getByTestId('comment-reactions-dialog').getByRole('button',{name:locales[locale].comments.actions.close,exact:true}).click();await page.getByTestId('comment-reactions-dialog').waitFor({state:'detached'});
  await target.locator('[data-chat-bubble]').click({button:'right'});await page.getByRole('menuitem',{name:t.viewReactions,exact:true}).click();
  await participantsDialog.getByText('Participant',{exact:true}).waitFor();assert.equal(await participantReads(),1,'Reopening the same version uses the completed first page');
  const participantSnapshot=await participantsDialog.innerText();
  await page.evaluate(()=>window.session.receive({type:'message.reactions',messageId:'00000000-0000-4000-8000-000000000159',version:2,userId:'00000000-0000-4000-8000-000000000002',ownEmojiKeys:['KokoroYay'],reactions:[{emojiKey:'KokoroYay',count:2}]}));
  await target.getByRole('button',{name:':KokoroYay: 2',exact:true,includeHidden:true}).waitFor();
  assert.equal(await participantsDialog.innerText(),participantSnapshot,'An open list remains a reading snapshot');assert.equal(await participantReads(),1);
  await participantsDialog.getByRole('button',{name:locales[locale].comments.actions.close,exact:true}).click();
  await target.locator('[data-chat-bubble]').click({button:'right'});await page.getByRole('menuitem',{name:t.viewReactions,exact:true}).click();
  await participantsDialog.getByText('Participant',{exact:true}).waitFor();assert.equal(await participantReads(),2,'Reopening after a version change reads the new page once');
  await participantsDialog.getByRole('button',{name:locales[locale].comments.actions.close,exact:true}).click();
  await target.getByRole('button',{name:t.addReaction,exact:true}).click();
  const inlinePicker=page.getByRole('dialog',{name:t.addReaction,exact:true});await inlinePicker.waitFor();
  await inlinePicker.getByRole('button').first().click({button:'right'});assert.equal(await page.getByRole('menu').count(),0,'Popover content must not open its owning row menu');
  if(width<500){
   await holdTouch(page,inlinePicker,{cancel:true});assert.equal(await page.getByRole('menu').count(),0,'Holding inside the picker must not start the row long-press timer');
  }
  await page.mouse.move(0,0);await page.waitForTimeout(160);
  assert.notEqual(await target.locator('[data-chat-message-row]').evaluate(e=>getComputedStyle(e).backgroundColor),restColor,'The target stays highlighted while choosing a reaction');
  const grid=inlinePicker.locator('div').first();const size=await grid.evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight,overflow:getComputedStyle(e).overflowY}));assert.equal(size.height,256);assert.ok(size.scroll>size.height);assert.equal(size.overflow,'auto');
  await checkScrollLock(page,scroll,width<500,grid);await checkGridScroll(page,grid,width<500);
  await page.setViewportSize({width,height:600});await page.waitForTimeout(120);
  assert.equal(await grid.evaluate(e=>e.clientHeight),256,'Reaction grid keeps its original height in a shorter viewport');
  const shortBounds=await inlinePicker.boundingBox();assert.ok(shortBounds.y>=0&&shortBounds.y+shortBounds.height<=600);
  await page.setViewportSize({width,height:900});await page.waitForTimeout(120);
  assert.equal(await inlinePicker.getByRole('heading').count(),0);assert.equal(await inlinePicker.getAttribute('popover'),'manual');
  const bounds=await inlinePicker.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y>=0&&bounds.y+bounds.height<=900);
  if(output)await page.screenshot({path:resolve(output,`reaction-picker-${locale}-${width}.png`)});
  await page.keyboard.press('Escape');await inlinePicker.waitFor({state:'detached'});assert.equal(await page.locator('[data-chat-panel]').count(),1);assert.equal(await target.getByRole('button',{name:t.addReaction,exact:true}).evaluate(e=>document.activeElement===e),true);
  const unlocked=await scroll.evaluate(e=>e.scrollTop),scrollBox=await scroll.boundingBox();await page.mouse.move(scrollBox.x+4,scrollBox.y+40);await page.mouse.wheel(0,-120);
  await page.waitForFunction(({element,before})=>element.scrollTop<before,{element:await scroll.elementHandle(),before:unlocked});
  await scroll.evaluate((e,top)=>{e.scrollTop=top;},unlocked);await page.waitForTimeout(120);
  const emojiLabel=locales[locale].comments.pickers.emoji;await page.getByRole('button',{name:emojiLabel,exact:true}).click();
  const composerPicker=page.getByRole('dialog',{name:emojiLabel,exact:true});await composerPicker.waitFor();await checkScrollLock(page,scroll,width<500,composerPicker.locator('div').first());await checkGridScroll(page,composerPicker.locator('div').first(),width<500);
  await page.keyboard.press('Escape');await composerPicker.waitFor({state:'detached'});
  await target.getByRole('button',{name:t.addReaction,exact:true}).click();await inlinePicker.getByRole('button',{name:':KanonLove:',exact:true}).click();await inlinePicker.waitFor({state:'detached'});await target.getByRole('button',{name:':KanonLove: 1',exact:true}).waitFor();
  await chip.click();await chip.waitFor({state:'detached'});await target.getByRole('button',{name:':KanonLove: 1',exact:true}).click();await target.getByRole('button',{name:t.addReaction,exact:true}).waitFor({state:'detached'});
  await target.locator('[data-chat-bubble]').click({button:'right'});
  assert.deepEqual(await page.getByRole('menu').locator('img').evaluateAll(images=>images.map(image=>image.alt)),[':KanonLove:',':KokoroYay:',':Tae:']);
  await page.getByRole('menuitem',{name:t.addReaction,exact:true}).click();
  const picker=page.getByRole('dialog',{name:t.addReaction,exact:true});await picker.waitFor();await picker.getByRole('button',{name:':KanonLove:',exact:true}).click();await picker.waitFor({state:'detached'});
  await target.getByRole('button',{name:':KanonLove: 1',exact:true}).waitFor();
  await sent.locator('[data-chat-bubble]').click({button:'right'});
  assert.deepEqual(await page.getByRole('menu').locator('img').evaluateAll(images=>images.map(image=>image.alt)),[':KanonLove:',':KokoroYay:',':Tae:']);
  if(output)await page.screenshot({path:resolve(output,`recent-reactions-${locale}-${width}.png`)});
  await page.keyboard.press('Escape');
  const otherReaction=page.locator('[data-message-id="00000000-0000-4000-8000-000000000158"]');
  await otherReaction.getByRole('button',{name:':LisaMelt: 1',exact:true}).click();
  const joined=otherReaction.getByRole('button',{name:':LisaMelt: 2',exact:true});await joined.waitFor();assert.equal(await joined.getAttribute('aria-pressed'),'true');
  await otherReaction.locator('[data-chat-bubble]').click({button:'right'});
  assert.deepEqual(await page.getByRole('menu').locator('img').evaluateAll(images=>images.map(image=>image.alt)),[':KanonLove:',':KokoroYay:',':Tae:'],'Joining an existing reaction must not change recents');
  await page.keyboard.press('Escape');await joined.click();await otherReaction.getByRole('button',{name:':LisaMelt: 1',exact:true}).waitFor();
  await target.getByRole('button',{name:t.viewOriginal,exact:true}).click();await page.waitForFunction(()=>window.session.getSnapshot().context!==null);
  await page.getByText('Message 1',{exact:true}).waitFor();assert.ok(await page.locator('[data-message-id="00000000-0000-4000-8000-000000000101"]').evaluate(e=>e.getBoundingClientRect().top>0));
  const located=page.locator('[data-message-id="00000000-0000-4000-8000-000000000101"] [data-chat-message-row]'),feedback=located.locator('[data-chat-locate-feedback]');await feedback.waitFor();
  assert.equal(await located.evaluate(e=>getComputedStyle(e).boxShadow),'none','Location uses a background, not a blue frame');
  assert.equal(await feedback.evaluate(e=>getComputedStyle(e).pointerEvents),'none');
  if(output)await page.screenshot({path:resolve(output,`locate-feedback-${locale}-${width}.png`)});
  const firstFeedback=await feedback.elementHandle();await page.waitForTimeout(800);
  await page.evaluate(()=>window.session.requestMentionLocation('00000000-0000-4000-8000-000000000101'));
  await page.waitForFunction(element=>!element.isConnected,firstFeedback);await page.waitForTimeout(900);
  assert.equal(await feedback.evaluate(e=>Number(getComputedStyle(e).opacity)),1,'Repeated location of the same message restarts emphasis');
  await page.waitForFunction(()=>{const e=document.querySelector('[data-chat-locate-feedback]');return e&&Number(getComputedStyle(e).opacity)<0.9;});
  await feedback.waitFor({state:'detached'});
  assert.equal(await page.getByRole('button',{name:/返回原位置|Return to previous position/}).count(),0);await page.getByRole('button',{name:t.latest,exact:true}).click();await target.waitFor();assert.equal(await page.evaluate(()=>window.session.getSnapshot().context),null);
  await page.evaluate(()=>window.removeOriginal());assert.equal(await target.locator('[data-chat-reply]').innerText(),t.messageDeleted);assert.equal(await target.getByRole('button',{name:t.viewOriginal,exact:true}).count(),0);
  assert.equal(await page.getByRole('checkbox').count(),0);assert.deepEqual(errors,[]);
  if(output)await page.screenshot({path:resolve(output,`replies-${locale}-${width}.png`)});
  const draft=page.locator('#chat-draft');await draft.fill('@');
  const options=page.locator('[data-chat-mention-picker] [role=option]');await options.first().waitFor();assert.equal(await options.count(),8);
  assert.equal(await options.filter({hasText:'User9'}).count(),0);
  assert.equal(await page.locator('[data-chat-mention-picker]').evaluate(e=>e.scrollHeight<=e.clientHeight+1),true,'All eight candidates fit when the viewport has space');
  await checkScrollLock(page,scroll,width<500,page.locator('[data-chat-mention-picker]'));
  if(output)await page.screenshot({path:resolve(output,`mentions-picker-${locale}-${width}.png`)});
  await draft.press('ArrowDown');
  const emptyOrder=await options.allTextContents();
  await page.evaluate(()=>{window.departed=window.onlineFixture.find(u=>u.username==='User2');window.presenceChanged({type:'leave',clientId:window.departed.userId});});
  assert.ok((await options.filter({'has':page.locator('[aria-label="'+t.offline+'"]')}).innerText()).includes('User2'));
  assert.deepEqual(await options.allTextContents(),emptyOrder,'Presence changes only the status dot, never the row order');
  await page.evaluate(()=>{const user=window.onlineFixture.find(u=>u.username==='User12');window.session.receiveActivity({type:'message.created',cursor:{id:'00000000-0000-4000-8000-000000000990',createdAt:new Date().toISOString()},userId:user.userId});window.session.receiveActivity({type:'message.deleted',messageId:'00000000-0000-4000-8000-000000000990'});});
  assert.deepEqual(await options.allTextContents(),emptyOrder,'New and deleted messages do not move a completed empty query');
  await draft.dispatchEvent('click');assert.deepEqual(await options.allTextContents(),emptyOrder,'Clicking the unchanged active query preserves its snapshot');
  assert.ok((await page.locator('[data-chat-mention-picker] [aria-selected=true]').innerText()).includes('User2'),'The selected account stays in its original row');
  await draft.press('Tab');assert.equal(await draft.inputValue(),'@User2 ');assert.equal(await draft.evaluate(e=>e===document.activeElement),true);
  await page.evaluate(()=>window.presenceChanged({type:'join',connection:{clientId:window.departed.userId,user:window.departed}}));
  await draft.fill('@User');await options.first().waitFor();const keywordOrder=await options.allTextContents();
  await draft.press('ArrowDown');
  await page.evaluate(()=>{const user=window.onlineFixture.find(u=>u.username==='User1');window.presenceChanged({type:'leave',clientId:user.userId});window.session.receiveActivity({type:'message.created',cursor:{id:'00000000-0000-4000-8000-000000000991',createdAt:new Date().toISOString()},userId:window.departed.userId});});
  assert.deepEqual(await options.allTextContents(),keywordOrder,'Keyword results ignore presence and recent activity');
  assert.ok((await options.nth(1).getAttribute('aria-selected'))==='true');
  await draft.press('Tab');assert.equal(await draft.inputValue(),'@User2 ');
  await page.evaluate(()=>{const user=window.onlineFixture.find(u=>u.username==='User1');window.presenceChanged({type:'join',connection:{clientId:user.userId,user}});});
  const draftHighlight=page.locator('[data-chat-draft-highlight]');assert.equal(await draftHighlight.getAttribute('aria-hidden'),'true');
  assert.equal(await draftHighlight.locator('[data-chat-mention]').innerText(),'@User2');
  assert.equal(await draftHighlight.locator('[data-chat-mention]').evaluate(e=>getComputedStyle(e).color!==getComputedStyle(e.parentElement).color&&getComputedStyle(e).backgroundColor!=='rgba(0, 0, 0, 0)'),true);
  const mentionContrast=await draftHighlight.locator('[data-chat-mention]').evaluate(e=>{
    const ctx=document.createElement('canvas').getContext('2d'),style=getComputedStyle(e);
    const luminance=color=>{ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);};
    const a=luminance(style.color),b=luminance(style.backgroundColor);return(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
  });assert.ok(mentionContrast>=4.5,'Blue mention text retains readable contrast in both themes');
  const searches=await page.evaluate(()=>window.calls.filter(c=>c.path.startsWith('/api/chat/mentions/users')).length);
  assert.equal(searches,1,'Only the first empty @ loads recent suggestions; keyword searches use the profile-only directory');
  for(const text of ['0',' 你好',' 😀']){
    await draft.pressSequentially(text);assert.equal(await page.locator('[data-chat-mention-picker]').count(),0);
  }
  await draft.click();assert.equal(await page.locator('[data-chat-mention-picker]').count(),0);
  await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.path.startsWith('/api/chat/mentions/users')).length),searches);
  assert.deepEqual(await page.evaluate(()=>window.session.getSnapshot().draftMentions),[{userId:'00000000-0000-4000-8000-000000000201',start:0,end:6}]);
  if(output)await page.screenshot({path:resolve(output,`mentions-continued-${locale}-${width}.png`)});
  await draft.press('End');await draft.pressSequentially(' @User3');await options.filter({hasText:'User3'}).waitFor();await draft.press('Enter');
  assert.equal(await page.locator('[data-chat-mention-picker]').count(),0);assert.equal(await page.evaluate(()=>window.session.getSnapshot().draftMentions.length),2);
  assert.equal(await draftHighlight.locator('[data-chat-mention]').count(),2);
  const shortDraft=await draft.inputValue();await draft.fill(shortDraft+' long words 中文 😀 '.repeat(35));
  await draft.evaluate(e=>{e.scrollTop=e.scrollHeight;});
  await page.waitForFunction(()=>{const field=document.querySelector('#chat-draft'),mirror=document.querySelector('[data-chat-draft-highlight]');return Math.abs(field.scrollTop-mirror.scrollTop)<1&&Math.abs(field.clientWidth-mirror.clientWidth)<1;});
  assert.equal(await draftHighlight.evaluate(e=>Math.abs(e.scrollHeight-document.querySelector('#chat-draft').scrollHeight)<2),true,'Colored draft wraps and scrolls with the native textarea');
  await draft.fill(shortDraft);
  await draft.fill('@10012');await options.filter({hasText:'User12'}).waitFor();assert.equal(await options.count(),1);await options.first().click();
  assert.equal(await draft.inputValue(),'@User12 ');assert.equal(await draft.evaluate(e=>e===document.activeElement),true);
  await draft.fill('@User1');await options.filter({hasText:'User1'}).first().waitFor();
  const sends=await page.evaluate(()=>window.calls.filter(c=>c.path==='/api/chat/messages'&&c.method==='POST').length);
  await draft.press('Enter');assert.equal(await draft.inputValue(),'@User1 ');
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.path==='/api/chat/messages'&&c.method==='POST').length),sends);
  await draft.pressSequentially('0你好');assert.equal(await page.locator('[data-chat-mention-picker]').count(),0);
  await draft.press('Enter');await page.locator('[data-chat-mention]').last().waitFor();
  assert.equal(await page.locator('[data-chat-mention]').last().innerText(),'@User1');
  assert.equal(await page.locator('[data-message-id]').last().locator('[data-chat-mentioned]').count(),0);
  const sentMention=await page.evaluate(()=>JSON.parse(window.calls.filter(c=>c.path==='/api/chat/messages'&&c.method==='POST').at(-1).body));
  assert.equal(sentMention.mentions.length,1);assert.equal(sentMention.mentions[0].end,6);assert.equal(sentMention.content,'@User1 0你好');
  await draft.fill('@nothing_here');await page.getByText(t.mentionNoResults,{exact:true}).waitFor();await draft.press('Escape');
  assert.equal(await page.locator('[data-chat-mention-picker]').count(),0);assert.equal(await page.getByRole('dialog').count(),1);
  await draft.fill('@');await options.first().waitFor();const imeSends=await page.evaluate(()=>window.calls.filter(c=>c.path==='/api/chat/messages'&&c.method==='POST').length);
  await draft.dispatchEvent('compositionstart');await draft.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,keyCode:229});assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.path==='/api/chat/messages'&&c.method==='POST').length),imeSends);
  await draft.dispatchEvent('compositionend');await options.first().waitFor();await draft.press('Escape');
  await draft.fill('@slow');await page.waitForTimeout(170);await draft.fill('@User2');await options.filter({hasText:'User2'}).waitFor();await page.waitForTimeout(400);assert.equal(await options.count(),1);await draft.press('Escape');await draft.fill('');
  await page.evaluate(()=>window.seedMentions());const banner=page.locator('[data-chat-mention-banner]');await banner.waitFor();
  assert.match(await banner.innerText(),locale==='en'?/2 more/:/还有 2 条/);
  await page.waitForTimeout(220);
  assert.equal(await banner.getByText('Fixture',{exact:true}).evaluate(e=>getComputedStyle(e).color!==getComputedStyle(e.parentElement).color),true,'Only the sender name uses mention blue');
  assert.equal(await banner.locator('button').first().evaluate(e=>getComputedStyle(e).color===getComputedStyle(e.closest('[data-chat-panel]')).color),true,'The mention suffix uses normal text color');
  const bannerBefore=await banner.boundingBox();assert.equal(bannerBefore.height,44);
  if(output)await page.screenshot({path:resolve(output,`mention-card-${locale}-${width}.png`)});
  const scrollBeforeDismiss=await scroll.evaluate(e=>e.scrollTop);await banner.getByRole('button',{name:t.dismissMention,exact:true}).click();
  await page.waitForFunction(()=>window.session.getSnapshot().mentions.total===2);assert.equal(await scroll.evaluate(e=>e.scrollTop),scrollBeforeDismiss);
  assert.deepEqual(await banner.boundingBox(),bannerBefore,'The next mention keeps the card in place');
  await page.evaluate(()=>window.failLocate=true);await banner.locator('button').first().click();await page.getByText(t.locateFailed,{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.session.getSnapshot().mentions.total),2);
  const tallMessage=await page.addStyleTag({content:'[data-message-id="00000000-0000-4000-8000-000000000110"] [data-chat-bubble]{min-height:1400px}'});
  await banner.locator('button').first().click();await page.locator('[data-message-id="00000000-0000-4000-8000-000000000110"]').waitFor();
  await page.waitForFunction(()=>!window.session.getSnapshot().mentions.items.some(m=>m.id.endsWith('000000000110')));
  await tallMessage.evaluate(e=>e.remove());
  assert.equal(await page.evaluate(()=>window.session.getSnapshot().mentions.items.some(m=>m.id.endsWith('000000000115'))),true);
  const readMention=page.locator('[data-message-id="00000000-0000-4000-8000-000000000110"] [data-chat-mentioned]');
  const closedMention=page.locator('[data-message-id="00000000-0000-4000-8000-000000000105"] [data-chat-mentioned]');
  await readMention.waitFor();assert.equal(await closedMention.count(),1,'Closing an alert keeps its message highlighted');
  await readMention.locator('[data-chat-locate-feedback]').waitFor();
  assert.equal(await readMention.locator('[data-chat-locate-feedback]').evaluate(e=>{const ctx=document.createElement('canvas').getContext('2d');ctx.fillStyle=getComputedStyle(e).backgroundColor;ctx.fillRect(0,0,1,1);const [r,g,b]=ctx.getImageData(0,0,1,1).data;return r>b&&g>b;}),true,'Mention location keeps a warm yellow background');
  const permanentColor=await readMention.evaluate(e=>getComputedStyle(e).backgroundColor);assert.notEqual(permanentColor,'rgba(0, 0, 0, 0)');
  assert.equal(await readMention.locator('[data-chat-bubble]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.equal(await page.locator('[data-message-id="00000000-0000-4000-8000-000000000111"] [data-chat-mentioned]').count(),0);
  assert.equal(await page.locator('[data-message-id="00000000-0000-4000-8000-000000000112"] [data-chat-mentioned]').count(),0);
  await banner.getByRole('button',{name:t.dismissMention,exact:true}).click();await page.waitForFunction(()=>window.session.getSnapshot().mentions.total===0);
  assert.equal(await readMention.evaluate(e=>getComputedStyle(e).backgroundColor),permanentColor,'Yellow styling survives clearing every unread alert');
  if(output)await page.screenshot({path:resolve(output,`mentions-banner-${locale}-${width}.png`)});
  await page.waitForFunction(()=>document.querySelector('.chat-mention-banner-slot').getBoundingClientRect().height===0);
  await checkRowHitArea(page,readMention,t,width<500);
  assert.equal(await readMention.evaluate(e=>getComputedStyle(e).paddingTop),'0px','Mention backgrounds keep their original height');
  assert.equal(await page.getByRole('button',{name:t.dismissMention,exact:true}).count(),0,'The retracted card is absent from keyboard and accessibility navigation');
  await page.evaluate(()=>window.session.jumpLatest());
  await page.waitForFunction(()=>!window.session.getSnapshot().context);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>window.seedMentions('Long_sender_name_'.repeat(10),[25,30,35]));await banner.waitFor();
  assert.equal(await banner.evaluate(e=>e.scrollWidth<=e.clientWidth),true,'A long name must not push the time or close button outside the card');
  assert.equal(await banner.locator('time').isVisible(),true);
  await banner.getByRole('button',{name:t.dismissMention,exact:true}).focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.session.getSnapshot().mentions.total===2);
  assert.equal(await banner.getByRole('button',{name:t.dismissMention,exact:true}).evaluate(e=>e===document.activeElement),true,'Keyboard focus stays on the close button for the next mention');
  await page.evaluate(()=>window.session.acknowledgeMentions(window.session.getSnapshot().mentions.items.map(m=>m.id)));
  await page.waitForFunction(()=>document.querySelector('.chat-mention-banner-slot').getBoundingClientRect().height===0);
  await page.evaluate(()=>window.session.requestMentionLocation('00000000-0000-4000-8000-000000000110'));
  const reducedFeedback=page.locator('[data-chat-locate-feedback]');await reducedFeedback.waitFor();
  assert.equal(await reducedFeedback.evaluate(e=>getComputedStyle(e).animationName),'none','Reduced motion retains a static location cue');
  const reducedSend=await sendButton.boundingBox();await page.mouse.move(reducedSend.x+reducedSend.width/2,reducedSend.y+reducedSend.height/2);await page.mouse.down();
  assert.equal(await sendButton.evaluate(e=>getComputedStyle(e).scale),'none','Reduced motion disables press scaling');await page.mouse.move(0,0);await page.mouse.up();
  await reducedFeedback.waitFor({state:'detached'});assert.equal(await readMention.evaluate(e=>getComputedStyle(e).backgroundColor),permanentColor);
  const earlyReactionId=await page.evaluate(async()=>{
    const session=window.session;await session.jumpLatest();
    const m={...session.getSnapshot().messages.at(-1),id:crypto.randomUUID(),clientRequestId:crypto.randomUUID(),content:'Early reaction fixture',reply:null,mentions:[],reactions:[],reactionsVersion:0,createdAt:new Date().toISOString()};
    session.receive({type:'message.reactions',messageId:m.id,version:1,userId:'00000000-0000-4000-8000-000000000002',ownEmojiKeys:['Tae'],reactions:[{emojiKey:'Tae',count:1}]});
    session.receive({type:'message.created',message:m});return m.id;
  });
  const earlyReaction=page.locator(`[data-message-id="${earlyReactionId}"]`).getByRole('button',{name:':Tae: 1',exact:true});
  await earlyReaction.waitFor();assert.equal(await earlyReaction.getAttribute('aria-pressed'),'false');await earlyReaction.scrollIntoViewIfNeeded();
  if(output)await page.screenshot({path:resolve(output,`early-reaction-${locale}-${width}.png`)});
  assert.deepEqual(errors,[]);
  cases.push({width,locale,presence:true,presenceFailure:true,fullMemberList:true,localDirectory:true,stableMentionSelection:true,stableEmptyAndKeywordResults:true,participantFirstPageReuse:true,stableOpenParticipantDialog:true,reply:true,continuation:true,ownAvatar:true,ownNameAndUidHidden:true,reactions:true,earlyReaction:true,recentReactions:true,mentions:true,participants:true,context:true,deletion:true,inlinePicker:true,fixedPickerHeight:true,backgroundScrollLocked:true,internalGridScroll:true,scrollRestoredOnClose:true,errors});await context.close();
 }
 console.log(JSON.stringify({passed:true,cases},null,2));
}finally{await browser.close();server.close();}
