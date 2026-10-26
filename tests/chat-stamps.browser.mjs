// Real stamp layer, audio cancellation and atlas rendering with local media fixtures.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.cwd();
const atlas='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="8"><path fill="red" d="M0 0h8v8H0z"/><path fill="blue" d="M8 0h8v8H8z"/></svg>');
const animation={atlasUrl:atlas,frameRate:5,loop:false,frames:[0,8].map(x=>({rect:{x,y:0,width:8,height:8}}))};
const mocks={
  '@/hooks/useCommentStamps': `export const useCommentStampCatalog=()=>({catalog:null});export const useCommentStampAnimation=()=>({animation:${JSON.stringify(animation)}});`,
  '@/lib/bandori-builtin-resources':'export const buildBandoriChatStampResources=()=>({});',
  '@/lib/sound-effect-audio':`export const preloadSoundEffect=async()=>{};export const playSoundEffect=async()=>{};
    export const playIndependentSoundEffect=(_url,signal)=>{window.audioStarts++;return new Promise(resolve=>signal.addEventListener('abort',()=>{window.audioStops++;resolve();},{once:true}));};`,
};
const bundle=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',
  define:{'process.env':'{"NODE_ENV":"development"}'},
  stdin:{resolveDir:root,loader:'tsx',contents:`
    import {useRef,useState} from 'react';import {createRoot} from 'react-dom/client';
    import {ChatStampLayer} from './src/components/chat/ChatStampLayer';
    import {BandoriAtlasAnimationCanvas} from './src/components/bandori/BandoriAtlasAnimationCanvas';
    const animation=${JSON.stringify(animation)};
    window.audioStarts=0;window.audioStops=0;window.frames=[];
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(...args){window.frames.push({stamp:!!this.canvas.closest('[data-chat-stamp]'),x:args[1]});return draw.apply(this,args);};
    window.setHidden=hidden=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:hidden?'hidden':'visible'});document.dispatchEvent(new Event('visibilitychange'));};
    function App(){const ref=useRef(null),[open,setOpen]=useState(true);window.setOpen=setOpen;
      window.playStamp=id=>ref.current.play({id,userId:id,publicUid:1,username:'Fixture',stamp:{id:1,region:'cn',kind:'normal',imageUrl:animation.atlasUrl,voiceUrl:'/voice',animation:{manifestUrl:'/manifest',atlasUrl:animation.atlasUrl}}});
      return <><div style={{position:'relative',width:600,height:400}}>{open&&<ChatStampLayer ref={ref}/>}</div>
        {open&&<BandoriAtlasAnimationCanvas animation={animation} label="Reference animation" onError={()=>{throw new Error('atlas failed');}}/>}</>;}
    createRoot(document.getElementById('root')).render(<App/>);
  `},plugins:[{name:'media-fixtures',setup(builder){builder.onResolve({filter:/.*/},({path})=>Object.hasOwn(mocks,path)?{path,namespace:'fixture'}:undefined);
    builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:mocks[path],resolveDir:root}));}}]});
const server=createServer((request,response)=>{
  if(request.url==='/app.js'){response.setHeader('Content-Type','text/javascript');response.end(bundle.outputFiles[0].text);}
  else{response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Stamp background playback</title><style>[data-chat-stamp-layer]{position:absolute;inset:0}.chat-stamp-visual{visibility:hidden}canvas{width:120px;height:80px}</style><div id="root"></div><script type="module" src="/app.js"></script>');}
});
await new Promise(resolve=>server.listen(0,'localhost',resolve));
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'}));
  await page.goto('http://localhost:'+server.address().port);
  await page.locator('[data-chat-stamp-layer]').waitFor();
  await page.evaluate(()=>window.playStamp('hidden-start'));
  await page.locator('[data-chat-stamp="hidden-start"] .chat-stamp-visual').waitFor({state:'visible',timeout:2000});
  await page.waitForFunction(()=>window.frames.some(frame=>frame.stamp&&frame.x===8),{},{timeout:2000});
  assert.equal(await page.evaluate(()=>window.frames.some(frame=>!frame.stamp&&frame.x===8)),false,'ordinary atlas animations still pause while hidden');
  assert.equal(await page.evaluate(()=>window.audioStarts),1);
  await page.evaluate(()=>{window.setHidden(false);window.setHidden(true);});
  assert.equal(await page.locator('[data-chat-stamp="hidden-start"]').count(),1,'hiding must not clear an active effect');
  assert.equal(await page.evaluate(()=>window.audioStops),0,'hiding must not cancel audio');
  await page.locator('[data-chat-stamp="hidden-start"]').waitFor({state:'detached',timeout:5000});
  await page.evaluate(()=>window.setHidden(false));
  assert.equal(await page.locator('[data-chat-stamp]').count(),0,'expired effects are not queued for the foreground');
  await page.evaluate(()=>{window.setHidden(true);window.playStamp('close-test');});
  await page.locator('[data-chat-stamp="close-test"]').waitFor();
  await page.evaluate(()=>window.setOpen(false));
  await page.locator('[data-chat-stamp-layer]').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>window.audioStops),2,'closing still cancels all active audio');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({hiddenStampPlayback:true,hiddenAnimationAdvances:true,ordinaryAnimationStillPauses:true,hidePreservesAudio:true,expiryWithoutReplay:true,closeCancels:true}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
