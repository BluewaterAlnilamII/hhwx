// Real comment components/hooks with request-boundary fixtures; no account or production writes.
// Run with node tests/comment-recovery.browser.mjs and an existing PLAYWRIGHT_MODULE installation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.cwd();
const messages = Object.fromEntries(await Promise.all(['comments','common','errors'].map(async name =>
  [name,JSON.parse(await readFile(`messages/zh-CN/${name}.json`,'utf8'))])));
const stubs = {
  '@/lib/supabase': 'export const getSafeSession=async()=>null;',
  '@/store/useGameStore': `const state={userId:'author',username:'测试用户',emailVerified:true,authReady:true};
    export const useGameStore=(selector)=>selector?selector(state):state; useGameStore.getState=()=>state;`,
  '@/hooks/useBandoriDegrees': 'export const useBandoriDegreeCatalog=()=>({catalog:null});',
  '@/hooks/useCommentStamps': `export const useCommentStampCatalog=()=>({catalog:null,loading:false,error:null,refresh:()=>{}});
    export const useCommentStampsForRegion=()=>({stamps:[],loading:false,error:null,refresh:()=>{}});
    export const useCommentStampAnimation=()=>({animation:null,loading:false,error:null});`,
  '@/components/account/AccountCardAvatar': `import {createElement} from 'react'; export default ()=>createElement('span',{style:{width:40,height:40,display:'block'}});`,
  '@/components/bandori/BandoriDegreeView': 'export default ()=>null;',
};
const bundle = await build({
  absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',
  define:{'process.env':'{"NODE_ENV":"production"}'},
  stdin:{resolveDir:root,loader:'tsx',contents:`
    import {useCallback,useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {NextIntlClientProvider} from 'next-intl';
    import CommentThread from './src/components/comments/CommentThread';
    import {CommentReactionsDialog} from './src/components/comments/CommentReactionsDialog';
    const readLocation=()=>{const params=new URLSearchParams(location.search);return {page:Number(params.get('page')||2),commentId:params.get('comment')};};
    const updateLocation=value=>history.replaceState(null,'','?page='+value.page+(value.commentId?'&comment='+value.commentId:''));
    const buildPermalink=(id,page)=>'?page='+page+'&comment='+id;
    function Thread(){
      const [target,setTarget]=useState('current'); window.changeTarget=setTarget;
      return <main className="mx-auto max-w-3xl p-3"><CommentThread apiBase={'/fixture/comments/'+target} apiQuery="" targetKey={target}
        readLocation={readLocation} updateLocation={updateLocation} buildPermalink={buildPermalink}
        title="评论" signedOutMessage="未登录" emptyMessage="暂无评论"/></main>;
    }
    function Participants(){
      const load=useCallback(async({cursor})=>{
        const response=await fetch('/fixture/participants'+(cursor?'?cursor='+cursor:''));
        if(!response.ok) throw new Error('fixture'); return response.json();
      },[]);
      return <CommentReactionsDialog commentId="root" initialEmojiKey="Tae"
        reactions={[{emojiKey:'Tae',count:51,reactedByViewer:false,users:[],remainingUserCount:51}]}
        loadParticipants={load} onClose={()=>{}}/>;
    }
    createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale="zh-CN" timeZone="UTC" messages={${JSON.stringify(messages)}}>
      {location.pathname==='/participants'?<Participants/>:<Thread/>}
    </NextIntlClientProvider>);
  `},
  plugins:[{name:'isolated-services',setup(builder){
    builder.onResolve({filter:/^@\//},({path})=>path in stubs?{path,namespace:'fixture'}:undefined);
    builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:stubs[path],resolveDir:root}));
  }}],
});
const css=(await postcss([tailwind()]).process(await readFile('src/app/globals.css','utf8'),{from:resolve('src/app/globals.css')})).css;
const server=createServer((request,response)=>{
  response.setHeader('Content-Type',request.url==='/app.js'?'text/javascript':request.url==='/app.css'?'text/css':'text/html');
  response.end(request.url==='/app.js'?bundle.outputFiles[0].text:request.url==='/app.css'?css:
    '<!doctype html><html data-visual-theme="smile-patrol"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comment recovery regression</title><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>');
});
await new Promise(done=>server.listen(0,'localhost',done));
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
const base=`http://localhost:${server.address().port}`;
const node=(id,content,extra={})=>({id,userId:'author',username:'测试用户',publicUid:1,content,
  avatar:{cardId:null,entityServer:null,trainType:'normal'},createdAt:'2026-11-09T00:00:00Z',updatedAt:'2026-11-09T00:00:00Z',
  editedAt:null,deletedAt:null,depth:0,moderationStatus:'visible',canEdit:true,canDelete:true,replyToCommentId:null,replyToUsername:null,
  replyCount:0,previewReplies:[],reactions:[],...extra});
const replies=[1,2,3].map(i=>node('reply'+i,'回复内容'+i,{depth:1,parentId:'root'}));
const existing=node('root','原有评论',{replyCount:3,previewReplies:[replies[0]]});
const posted=node('posted','发布的新评论');
const success=(route,data)=>route.fulfill({status:200,json:{success:true,data}});
const failure=route=>route.fulfill({status:503,json:{success:false,error:{code:'FIXTURE',message:'Internal failure'}}});
const list=(comments,page=2)=>({comments,page,totalPages:3,totalCount:20,totalCommentCount:23,nextCursor:null,hasMore:false});
const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(done=>setTimeout(done,30));}throw new Error('fixture request was not observed');};
try {
  for(const width of [393,1440]) {
    const page=await browser.newPage({viewport:{width,height:852},hasTouch:width<640});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    let postRoute,readRoute,posts=0,holdRead=true,replyMode='fail';
    const cursors=[];
    await page.route('**/fixture/comments/**',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.method()==='POST'){posts++;postRoute=route;return;}
      if(url.pathname.endsWith('/replies')){
        cursors.push(url.searchParams.get('cursor'));
        if(replyMode==='fail') return failure(route);
        const more=url.searchParams.has('cursor');
        return success(route,{comments:more?[replies[2]]:replies.slice(0,2),nextCursor:more?null:'next',hasMore:!more});
      }
      if(url.pathname.endsWith('/other')) return success(route,list([node('other','另一个目标')],2));
      const currentPage=Number(url.searchParams.get('page')||1);
      if(currentPage===1&&holdRead){readRoute=route;return;}
      return success(route,list(currentPage===1?[posted,existing]:[existing],currentPage));
    });
    await page.goto(base+'/thread?page=2');
    await page.getByText('原有评论',{exact:true}).waitFor();
    const originalLocation=await page.evaluate(()=>({url:location.href,length:history.length}));
    const copyLink=page.locator('#comment-root').getByRole('button',{name:messages.comments.actions.copyLink,exact:true}).first();
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text;}}}));
    await copyLink.click();
    await page.getByText('复制成功',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.copied),'?page=2&comment=root');
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Denied');}}}));
    await copyLink.click();
    await page.getByText('复制失败',{exact:true}).waitFor();
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));
    await copyLink.click();
    await page.getByText('复制失败',{exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(()=>({url:location.href,length:history.length})),originalLocation);
    await page.locator('textarea').fill('发布的新评论');
    await page.getByRole('button',{name:'发布评论',exact:true}).click();
    await until(()=>postRoute);
    assert.equal(await page.getByText('发布成功',{exact:true}).count(),0,'success waits for POST acknowledgement');
    assert.equal(await page.locator('textarea').inputValue(),'发布的新评论');
    const acknowledged=page.waitForResponse(response=>response.request().method()==='POST');
    await success(postRoute,posted);await acknowledged;
    await until(()=>readRoute);
    await page.getByText('发布成功',{exact:true}).waitFor({timeout:1500});
    assert.equal(await page.locator('textarea').inputValue(),'');
    assert.equal(new URL(page.url()).searchParams.get('page'),'2');
    assert.equal(await page.getByText('原有评论',{exact:true}).count(),1,'old list remains while the subsequent GET is pending');
    if(process.env.COMMENT_RECOVERY_SCREENSHOT_DIR) await page.locator('main').screenshot({path:process.env.COMMENT_RECOVERY_SCREENSHOT_DIR+'/comment-post-success-pending-'+width+'.png'});
    const readFailed=page.waitForResponse(response=>response.status()===503);
    await failure(readRoute);await readFailed;
    await page.getByRole('button',{name:'刷新评论',exact:true}).waitFor();
    assert.equal(posts,1);
    assert.equal(await page.getByText('发布失败',{exact:true}).count(),0);
    assert.equal(await page.getByText('加载失败',{exact:true}).count(),0);
    assert.equal(new URL(page.url()).searchParams.get('page'),'2');
    assert.equal(await page.getByText('原有评论',{exact:true}).count(),1);

    const article=page.locator('#comment-root');
    const before=(await article.boundingBox()).height;
    await article.getByRole('button',{name:'展开 2 条回复',exact:true}).click();
    await article.getByRole('button',{name:'重试',exact:true}).waitFor();
    assert.equal((await article.boundingBox()).height,before,'failed expansion reuses its action slot');
    assert.equal(await article.getByText('回复内容1',{exact:true}).count(),1);
    replyMode='success';
    await article.getByRole('button',{name:'重试',exact:true}).click();
    await article.getByText('回复内容2',{exact:true}).waitFor();
    replyMode='fail';
    await article.getByRole('button',{name:/再展开/}).click();
    await article.getByRole('button',{name:'重试',exact:true}).waitFor();
    assert.equal(await article.getByText('回复内容2',{exact:true}).count(),1);
    replyMode='success';
    await article.getByRole('button',{name:'重试',exact:true}).click();
    await article.getByText('回复内容3',{exact:true}).waitFor();
    assert.deepEqual(cursors,[null,null,'next','next']);
    holdRead=false;replyMode='fail';
    await page.getByRole('button',{name:'刷新评论',exact:true}).click();
    await page.getByText('刷新成功',{exact:true}).waitFor();
    await until(()=>cursors.length===5);
    assert.equal(await page.getByText('刷新失败',{exact:true}).count(),0);
    assert.equal(await article.getByText('回复内容3',{exact:true}).count(),1);
    assert.equal(new URL(page.url()).searchParams.get('page'),'1');

    // A successful auxiliary refresh also clears an earlier pagination failure.
    replyMode='success';
    await page.getByRole('button',{name:'刷新评论',exact:true}).click();
    await article.getByRole('button',{name:/再展开/}).waitFor();
    replyMode='fail';
    await article.getByRole('button',{name:/再展开/}).click();
    await article.getByRole('button',{name:'重试',exact:true}).waitFor();
    replyMode='success';
    await page.getByRole('button',{name:'刷新评论',exact:true}).click();
    await article.getByRole('button',{name:/再展开/}).waitFor();
    assert.equal(await article.getByRole('button',{name:'重试',exact:true}).count(),0);

    // An old post's delayed list must not commit after changing the comment target.
    holdRead=true;postRoute=null;readRoute=null;
    await page.locator('textarea').fill('第二条评论');
    await page.getByRole('button',{name:'发布评论',exact:true}).click();
    await until(()=>postRoute);await success(postRoute,posted);await until(()=>readRoute);
    await page.evaluate(()=>window.changeTarget('other'));
    await page.getByText('另一个目标',{exact:true}).waitFor();
    await success(readRoute,list([posted],1));
    assert.equal(await page.getByText('发布的新评论',{exact:true}).count(),0);
    assert.equal(await page.getByText('另一个目标',{exact:true}).count(),1);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}: POST acknowledgement before list completion, failed GET retention, reply recovery, refresh semantics and target isolation`);
    await page.close();

    const linked=await browser.newPage({viewport:{width,height:852}});
    const linkedErrors=[];linked.on('pageerror',error=>linkedErrors.push(error.message));
    let contextMode='fail',listFails=false,pendingContext;
    const requests=[];
    await linked.route('**/fixture/comments/**',route=>{
      const url=new URL(route.request().url());requests.push(url.pathname+url.search);
      if(url.pathname.endsWith('/root')){
        if(contextMode==='fail') return failure(route);
        if(contextMode==='missing') return route.fulfill({status:404,json:{success:false,error:{code:'COMMENT_NOT_FOUND',message:'missing'}}});
        if(contextMode==='pending'){pendingContext=route;return;}
        return success(route,{root:existing,ancestors:[],comment:existing,rootPage:3});
      }
      if(listFails) return failure(route);
      return success(route,list([existing],Number(url.searchParams.get('page'))));
    });
    await linked.goto(base+'/thread?page=2&comment=root');
    const loadError=linked.getByRole('alert');
    await loadError.getByText('加载失败',{exact:true}).waitFor();
    const linkedErrorMarkup=await loadError.evaluate(el=>el.outerHTML);
    await linked.waitForTimeout(4200);
    assert.equal(await loadError.count(),1,'initial failure persists after action feedback would expire');
    assert.equal(await linked.locator('article').count(),0);
    assert.equal(await linked.getByText('无法定位评论',{exact:true}).count(),0);
    assert.equal(new URL(linked.url()).search,'?page=2&comment=root');
    await loadError.getByRole('button',{name:'重试',exact:true}).click();
    await loadError.waitFor();
    assert.deepEqual(requests,['/fixture/comments/current/root','/fixture/comments/current/root'],'retry preserves the context request without a page-one fallback');
    contextMode='success';listFails=true;
    await loadError.getByRole('button',{name:'重试',exact:true}).click();
    await loadError.waitFor();
    assert.equal(new URL(linked.url()).search,'?page=2&comment=root','failed root list preserves the original share link');
    assert.equal(requests.at(-1),'/fixture/comments/current?page=3');
    if(process.env.COMMENT_RECOVERY_SCREENSHOT_DIR) await linked.locator('main').screenshot({path:process.env.COMMENT_RECOVERY_SCREENSHOT_DIR+'/comment-link-load-failed-'+width+'.png'});
    listFails=false;contextMode='pending';
    await loadError.getByRole('button',{name:'重试',exact:true}).click();
    await until(()=>pendingContext);
    assert.equal(await loadError.count(),0,'retry replaces the failure with pending state');
    assert.equal(new URL(linked.url()).search,'?page=2&comment=root');
    await success(pendingContext,{root:existing,ancestors:[],comment:existing,rootPage:3});
    await linked.locator('#comment-root').waitFor();
    await linked.waitForFunction(()=>location.search==='?page=3&comment=root');
    assert.equal(await linked.getByText('刷新成功',{exact:true}).count(),0);

    // With no available list, the header control must retry the share link too.
    contextMode='fail';await linked.goto(base+'/thread?page=2&comment=root');
    await loadError.waitFor();contextMode='success';
    await linked.getByRole('button',{name:'刷新评论',exact:true}).click();
    await linked.locator('#comment-root').waitFor();
    await linked.waitForFunction(()=>location.search==='?page=3&comment=root');
    assert.equal(await linked.getByText('刷新成功',{exact:true}).count(),0);

    contextMode='missing';await linked.goto(base+'/thread?page=2&comment=root');
    await linked.locator('#comment-root').waitFor();
    await linked.waitForFunction(()=>location.search==='?page=2');
    assert.equal(await loadError.count(),0,'a deleted comment still falls back to the requested list');
    listFails=true;await linked.goto(base+'/thread?page=2');
    await loadError.waitFor();
    assert.equal(await loadError.evaluate(el=>el.outerHTML),linkedErrorMarkup,'ordinary and linked-comment failures use identical markup');
    listFails=false;contextMode='pending';pendingContext=null;
    await linked.goto(base+'/thread?page=2&comment=root');await until(()=>pendingContext);
    await linked.evaluate(()=>{history.replaceState(null,'','?page=2');window.changeTarget('other');});
    await linked.locator('#comment-root').waitFor();
    await success(pendingContext,{root:existing,ancestors:[],comment:existing,rootPage:3});
    await linked.waitForTimeout(100);
    assert.equal(new URL(linked.url()).search,'?page=2','stale context cannot rewrite another target');
    assert.deepEqual(linkedErrors,[]);
    console.log(`PASS ${width}: clipboard outcomes, identical load failure UI, share-link recovery and stale context isolation`);
    await linked.close();

    const participants=await browser.newPage({viewport:{width,height:852},hasTouch:width<640});
    const participantErrors=[];participants.on('pageerror',error=>participantErrors.push(error.message));
    let moreFails=true,initialFails=false,moreRequests=0,moreRoute;
    const users=Array.from({length:50},(_,i)=>({userId:String(i),username:'回应用户'+i,publicUid:i+1,avatar:{cardId:null,entityServer:null,trainType:'normal'}}));
    await participants.route('**/fixture/participants*',route=>{
      if(initialFails) return failure(route);
      const more=new URL(route.request().url()).searchParams.has('cursor');
      if(more){moreRequests++;if(moreFails){moreRoute=route;return;}}
      return route.fulfill({status:200,json:{users:more?[{...users[0],userId:'last',username:'最后一位'}]:users,nextCursor:more?null:'next',hasMore:!more}});
    });
    await participants.goto(base+'/participants');
    const participantList=participants.getByTestId('reaction-participant-list');
    await participants.getByTestId('reaction-participant-row').nth(49).waitFor();
    await participantList.evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await until(()=>moreRoute);
    // Compare the same scroll position after content-visibility has measured the visible rows.
    await participants.waitForTimeout(100);
    const beforeFailure=await participantList.evaluate(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight}));
    await failure(moreRoute);
    await participants.getByRole('button',{name:'重试',exact:true}).waitFor();
    assert.equal(await participants.getByTestId('reaction-participant-row').count(),50);
    assert.equal(await participants.getByRole('alert').count(),0,'pagination uses its footer, not another module warning');
    assert.deepEqual(await participantList.evaluate(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight})),beforeFailure);
    await participants.waitForTimeout(250);assert.equal(moreRequests,1,'failed pagination stops automatic retries');
    if(process.env.COMMENT_RECOVERY_SCREENSHOT_DIR) await participants.screenshot({path:process.env.COMMENT_RECOVERY_SCREENSHOT_DIR+'/comment-participants-retry-'+width+'.png'});
    moreFails=false;
    await participants.getByRole('button',{name:'重试',exact:true}).click();
    await participants.getByText('最后一位',{exact:true}).waitFor();
    assert.equal(moreRequests,2);
    initialFails=true;await participants.reload();
    await participants.getByRole('alert').getByText('加载失败',{exact:true}).waitFor();
    assert.equal(await participants.getByTestId('reaction-participant-row').count(),0);
    assert.ok(await participantList.evaluate(el=>el.scrollHeight<=el.clientHeight+1),'initial failure does not append an extra footer');
    assert.deepEqual(participantErrors,[]);
    console.log(`PASS ${width}: participant pagination preserves users and geometry; initial failure replaces the list`);
    await participants.close();
  }
} finally {await browser.close();await new Promise(done=>server.close(done));}
