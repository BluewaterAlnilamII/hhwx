// Run with node tests/event-ui-transitions.browser.mjs; PLAYWRIGHT_MODULE may point to an existing installation.
// Real components and styles, synthetic data only. No account or production writes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd();
const messages = Object.fromEntries(await Promise.all(["bandori", "comments", "common", "errors"].map(async name =>
  [name, JSON.parse(await readFile(`messages/zh-CN/${name}.json`, "utf8"))])));
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, platform: "browser", format: "esm", jsx: "automatic",
  define: { "process.env": '{"NODE_ENV":"production"}' },
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import {memo, Suspense, useCallback, useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {NextIntlClientProvider} from 'next-intl';
    import {ResponsiveContainer, LineChart, Line} from 'recharts';
    import {EventViewTabs} from './src/app/[locale]/bandori/events/EventViewTabs';
    import {ReactionChip} from './src/components/comments/CommentReactionChip';
    import {CommentContent} from './src/components/comments/CommentContent';
    import {CommentComposer} from './src/components/comments/CommentComposer';
    import {CommentItem} from './src/components/comments/CommentItem';
    import {CommentRequestError} from './src/lib/comments/comment-request-guard';
    import {ComparisonControls} from './src/app/[locale]/bandori/events/_tracker/ComparisonControls';
    import {COMPARISON_LINE_COLORS} from './src/app/[locale]/bandori/events/_tracker/constants';
    const noop = () => {};
    const chartPoints = [{time:0,ep:0},{time:1,ep:50},{time:2,ep:100}];
    function Composer() {
      return <main className="hhwx-panel border p-5"><CommentComposer placeholder="写下评论" submitLabel="发布评论" onSubmit={async content => {
        const response = await fetch('/fixture-comment', {method:'POST', body:content});
        if (!response.ok) throw new CommentRequestError(response.status, response.status === 400 ? 'COMMENT_TOO_LONG' : null, await response.text());
      }}/></main>;
    }
    function CommentActions() {
      const [target,setTarget]=useState('fixture');
      window.changeCommentTarget=setTarget;
      const [comment, setComment] = useState({id:'fixture',userId:'author',username:'用户',publicUid:1,content:'保留已有评论',
        avatar:{cardId:null,entityServer:null,trainType:'normal'},createdAt:'2026-11-09T00:00:00Z',editedAt:null,deletedAt:null,
        canEdit:true,canDelete:true,replyCount:0,previewReplies:[],reactions:[{emojiKey:'Tae',count:1,reactedByViewer:false,users:[],remainingUserCount:0}]});
      async function perform(action) {
        const response = await fetch('/fixture-action/' + action, {method:'POST'});
        if (!response.ok) throw new CommentRequestError(response.status, null, await response.text());
      }
      return <main className="hhwx-panel border p-5" style={{marginTop:80}}><CommentItem comment={comment} highlightedId={null}
        replies={{}} loadingReplies={{}} failedReplies={{}} stampLookup={new Map()} canReact commentPage={1} draftTargetKey={target}
        draftUserId="author" draftUsername="用户" resolveDisplayDegree={()=>null} buildPermalink={()=>location.href}
        onCreateReply={async()=>{await perform('reply')}} onLoadReplies={async()=>{}} onLocateComment={async()=>{}}
        onLoadReactionParticipants={async()=>({users:[],nextCursor:null,hasMore:false})}
        onToggleReaction={async()=>{await perform('reaction');setComment(c=>({...c,reactions:c.reactions.map(r=>({...r,reactedByViewer:!r.reactedByViewer}))}));}}
        onUpdate={async(id,content)=>{await perform('save');setComment(c=>({...c,content,editedAt:'2026-11-09T01:00:00Z'}));}}
        onDelete={async()=>{await perform('delete');setComment(c=>({...c,deletedAt:'2026-11-09T01:00:00Z',canEdit:false,canDelete:false}));}}/></main>;
    }
    function CommentLoading() {
      const [loaded, setLoaded] = useState(false);
      const stamp = {id: 1, region: 'cn', kind: 'normal', imageName: 'fixture', characterId: null,
        imageUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', voiceUrl: ''};
      return <Suspense fallback={<p data-page-loading>加载中</p>}><main>
        <h1>分数追踪</h1><input aria-label="comment draft" defaultValue="retained draft"/>
        <button onClick={() => setLoaded(true)}>Load stamp catalog</button>
        <CommentContent content="before :stamp-cn-1: after" isDeleted={false}
          stampLookup={new Map(loaded ? [['cn:1:normal', stamp]] : [])}/>
      </main></Suspense>;
    }
    const SlowCommit = memo(function SlowCommit({value}) {
      if (window.slowCommits) { const end = performance.now() + 4; while (performance.now() < end) {} }
      return null;
    });
    function Tabs() {
      const [value, setValue] = useState('tracker');
      const [identity, setIdentity] = useState(1);
      const [infoReady, setInfoReady] = useState(false);
      const scrolling = location.pathname === '/scroll-tabs';
      window.changeEvent = () => setIdentity(key => key + 1);
      window.finishInfo = () => setInfoReady(true);
      const change = useCallback(next => {
        window.samplePendingSelection?.(next);
        setValue(next);
      }, []);
      return <>{scrolling && <><header style={{position:'fixed',top:0,height:60,width:'100%',zIndex:50,background:'var(--theme-color-panel-background)'}}>HHWX</header><div style={{height:320}}>活动横幅</div></>}
      <EventViewTabs value={value} onChange={change} onPreviewChange={noop} plannerOpen={false} scrollKey={String(identity)}>
        {view => scrolling && view === 'info' && !infoReady ? <div data-view="info" className="event-info-loading">加载活动信息</div> : <div data-view={view} style={{height: scrolling ? view === 'tracker' ? 2000 : 2800 : 420, padding: 24}}>
          <h1>{view === 'tracker' ? '分数追踪' : '活动信息'}</h1>
          <input aria-label={view + ' draft'} defaultValue="saved draft" />
          {view === 'tracker' ? <div data-chart-probe data-event-swipe-ignore style={{height:180}}>
            <ResponsiveContainer width="100%" height="100%"><LineChart data={chartPoints}>
              <Line dataKey="ep" isAnimationActive={false}/>
            </LineChart></ResponsiveContainer>
          </div> : null}
          {scrolling && <><button data-action onClick={() => {window.actions = (window.actions ?? 0) + 1;}}>内容操作</button><div data-horizontal-scroll style={{width:200,overflowX:'auto'}}><div style={{width:800}}>横向内容</div></div>
            {Array.from({length:16}, (_,i) => <p key={i} style={{height:80}}>{view} 内容段落 {i + 1}</p>)}</>}
        </div>}
      </EventViewTabs>{scrolling && <div style={{height:1000}}>共用评论区</div>}{Array.from({length: 24}, (_,i) => <SlowCommit key={i} value={value} />)}</>;
    }
    const reaction = {emojiKey: 'fixture', count: 3, reactedByViewer: false, users: [], remainingUserCount: 0};
    function Reaction() {
      const onPreview = useCallback(() => new Promise(resolve => {
        window.loadParticipants = () => resolve({...reaction, users: Array.from({length: 3}, (_,i) => ({
          userId: String(i), username: '回应者 ' + (i + 1), publicUid: i + 1,
          avatar: {cardId: null, entityServer: null, trainType: 'normal'}
        }))});
      }), []);
      return <div style={{paddingTop: 360, paddingLeft: 120}}><ReactionChip reaction={reaction}
        disabled={false} onToggle={async () => {}} onViewAll={noop} onPreview={onPreview}/></div>;
    }
    function Comparisons() {
      const [configs, setConfigs] = useState(Array.from({length: 5}, (_,i) => ({
        id: String(i), targetType: 'event', targetId: 322-i, tier: 1000, enabled: true
      })));
      const resolved = configs.map((config, colorIndex) => ({...config, colorIndex}));
      return <ComparisonControls comparisonConfigs={configs} resolvedComparisonConfigs={resolved}
        comparisonLineById={new Map(resolved.filter(c => c.enabled).map(c => [c.id, {
          id: c.id, color: COMPARISON_LINE_COLORS[c.colorIndex], label: c.targetId + '期 T1000'
        }]))} comparisonAlignment="start" onAlignmentChange={noop}
        onToggleComparison={id => setConfigs(cs => cs.map(c => c.id === id ? {...c, enabled: !c.enabled} : c))}
        onUpdateComparison={noop} onAddComparison={noop} onRemoveComparison={noop} onRemoveAllComparisons={noop}
        comparisonTargetLabelMap={new Map()} comparisonTargetOptions={configs.map(c => ({id: c.targetId, label: String(c.targetId)}))}
        comparisonTargetType="event" comparisonTierOptions={[1000]} comparisonTierOptionsByConfigId={new Map()}
        canAddComparisonRow={false} bestdoriPrediction={{status:'no-data'}} trackingMode="event" status="ended"
        setShowBestdoriPrediction={noop} setShowDayProjection={noop} setShowInstantProjection={noop}
        showBestdoriPrediction={false} showDayProjection={false} showInstantProjection={false}/>;
    }
    createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale="zh-CN" timeZone="UTC" messages={${JSON.stringify(messages)}}>
      {location.pathname === '/composer' ? <Composer/> : location.pathname === '/actions' ? <CommentActions/> : location.pathname === '/comment-loading' ? <CommentLoading/> : location.pathname.endsWith('tabs') ? <Tabs/> : location.pathname === '/reactions' ? <Reaction/> : <Comparisons/>}
    </NextIntlClientProvider>);
  `},
  plugins: [{ name: "fixture-avatar", setup(builder) {
    builder.onResolve({filter: /^@\/components\/account\/AccountCardAvatar$/}, ({path}) => ({path, namespace: "fixture"}));
    builder.onLoad({filter: /.*/, namespace: "fixture"}, () => ({
      contents: "import {createElement} from 'react'; export default () => createElement('span', {style:{display:'inline-block',width:28,height:28}}, '头像');",
      resolveDir: root,
    }));
  }}, { name: "app-router-dynamic", setup(builder) {
    // Exercise App Router's real lazy boundary, with a deliberately delayed module.
    builder.onResolve({filter: /^next\/dynamic$/}, ({path}) => ({path, namespace: "app-dynamic"}));
    builder.onLoad({filter: /.*/, namespace: "app-dynamic"}, () => ({
      contents: `import dynamic from 'next/dist/shared/lib/app-dynamic';
        export default (loader, options) => dynamic(() => new Promise(resolve => {
          window.releaseStampModule = () => resolve(loader());
        }), options);`,
      resolveDir: root,
    }));
  }}],
});
const css = (await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), {
  from: resolve("src/app/globals.css"),
})).css + await readFile("src/app/[locale]/bandori/events/events.css", "utf8");
const server = createServer((request, response) => {
  response.setHeader("Content-Type", request.url === "/app.js" ? "text/javascript" : request.url === "/app.css" ? "text/css" : "text/html");
  response.end(request.url === "/app.js" ? bundle.outputFiles[0].text : request.url === "/app.css" ? css
    : '<!doctype html><html data-visual-theme="smile-patrol"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UI transition regression</title><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>');
});
await new Promise(done => server.listen(0, "localhost", done));
const browser = await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || "chrome", headless: true});
try {
  for (const width of [393, 1440]) {
    const page = await browser.newPage({viewport: {width, height: 852}, hasTouch: width < 640});
    const errors = [];
    page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
    const base = `http://localhost:${server.address().port}`;
    let postStatus=503;
    await page.route('**/fixture-comment', route => postStatus===0 ? route.abort('failed')
      : route.fulfill({status:postStatus,body:postStatus===400?'评论内容过长':'Internal failure'}));
    await page.goto(`${base}/composer`);
    await page.getByRole('textbox').fill('保留这条评论草稿');
    const composerHeight = (await page.locator('main').boundingBox()).height;
    for(const status of [503,0,400]) {
      postStatus=status;
      const completedRequest=page.waitForEvent(status===0?'requestfailed':'requestfinished',
        {predicate:request=>request.url().endsWith('/fixture-comment')});
      await page.getByRole('button',{name:'发布评论',exact:true}).click();
      await completedRequest;
      await page.locator('[data-action-feedback="error"]').waitFor();
      await page.getByText(status===400?'评论内容过长':'发布失败',{exact:true}).waitFor({timeout:5000}).catch(async error=>{
        throw new Error(`Comment status ${status}: ${await page.locator('main').innerText()}`,{cause:error});
      });
      assert.equal(await page.getByRole('textbox').inputValue(),'保留这条评论草稿');
      assert.equal((await page.locator('main').boundingBox()).height,composerHeight,'action failure does not expand the composer');
      assert.equal(await page.locator('[data-action-feedback="error"]').count(),1);
      assert.equal(await page.getByRole('button',{name:'重试',exact:true}).count(),0,'failed posting uses the original action');
      assert.equal(await page.getByText('Internal failure',{exact:true}).count(),0);
      if(status===503&&width===393&&process.env.COMMENT_FAILURE_SCREENSHOT) {
        await page.locator('main').screenshot({path:process.env.COMMENT_FAILURE_SCREENSHOT});
        await page.emulateMedia({colorScheme:'dark'});
        await page.waitForTimeout(300);
        await page.locator('main').screenshot({path:process.env.COMMENT_FAILURE_SCREENSHOT.replace('.png','-dark.png')});
        await page.emulateMedia({colorScheme:'light'});
      }
      if(status===503) await page.locator('[data-action-feedback]').waitFor({state:'hidden',timeout:5000});
    }
    postStatus=200;
    await page.getByRole('button',{name:'发布评论',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('textarea').value==='');
    await page.locator('[data-action-feedback="success"]').getByText('发布成功',{exact:true}).waitFor();
    console.log(`PASS ${width}px: publish failure wording, retained draft, actionable validation and successful retry`);
    let actionStatus=503;
    await page.route('**/fixture-action/*',route=>route.fulfill({status:actionStatus,body:'Internal failure'}));
    await page.goto(`${base}/actions`);
    await page.getByRole('button',{name:'编辑',exact:true}).click();
    await page.getByRole('textbox').fill('保留编辑内容');
    const editingHeight=(await page.locator('main').boundingBox()).height;
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.getByRole('alert').getByText('保存失败',{exact:true}).waitFor();
    assert.equal(await page.getByRole('textbox').inputValue(),'保留编辑内容');
    assert.equal((await page.locator('main').boundingBox()).height,editingHeight);
    if(process.env.COMMENT_ACTION_SCREENSHOT_DIR) await page.locator('main').screenshot({path:process.env.COMMENT_ACTION_SCREENSHOT_DIR+'/comment-save-failure-'+width+'.png'});
    await page.evaluate(()=>window.changeCommentTarget('other'));
    await page.locator('[data-action-feedback]').waitFor({state:'hidden'});
    await page.evaluate(()=>window.changeCommentTarget('fixture'));
    assert.equal(await page.locator('[data-action-feedback]').count(),0,'returning to a target does not resurrect its old feedback');
    actionStatus=200;
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.getByText('保存成功',{exact:true}).waitFor();
    assert.equal(await page.getByRole('textbox').count(),0);
    await page.getByText('保留编辑内容',{exact:true}).waitFor();
    actionStatus=503;
    await page.getByRole('button',{name:'删除',exact:true}).click();
    const dialog=page.getByRole('dialog'),dialogHeight=(await dialog.boundingBox()).height;
    await dialog.getByRole('button',{name:'删除',exact:true}).click();
    await dialog.getByRole('alert').getByText('删除失败',{exact:true}).waitFor();
    assert.equal((await dialog.boundingBox()).height,dialogHeight);
    const deleteFeedbackBox=await dialog.getByRole('alert').boundingBox();
    assert.ok(deleteFeedbackBox.y+deleteFeedbackBox.height<=(await dialog.boundingBox()).y,'delete feedback does not cover the dialog title');
    assert.equal(await page.locator('main').getByRole('alert').count(),0,'modal feedback is visible inside the dialog only');
    if(process.env.COMMENT_ACTION_SCREENSHOT_DIR) {
      await page.screenshot({path:process.env.COMMENT_ACTION_SCREENSHOT_DIR+'/comment-delete-failure-'+width+'.png'});
      await page.emulateMedia({colorScheme:'dark'});
      await page.waitForTimeout(300);
      await page.screenshot({path:process.env.COMMENT_ACTION_SCREENSHOT_DIR+'/comment-delete-failure-dark-'+width+'.png'});
      await page.emulateMedia({colorScheme:'light'});
    }
    await dialog.getByRole('button',{name:'取消',exact:true}).click();
    await page.locator('[data-comment-reactions] button').first().click();
    await page.getByText('回应失败',{exact:true}).waitFor();
    actionStatus=200;
    await page.locator('[data-comment-reactions] button').first().click();
    await page.getByText('回应成功',{exact:true}).waitFor();
    await page.getByRole('button',{name:'删除',exact:true}).click();
    await dialog.getByRole('button',{name:'删除',exact:true}).click();
    await page.getByText('删除成功',{exact:true}).waitFor();
    await page.getByText('（已删除）',{exact:true}).waitFor();
    await page.locator('[data-action-feedback]').waitFor({state:'hidden',timeout:3000});
    assert.equal(await page.getByText('Internal failure',{exact:true}).count(),0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    console.log(`PASS ${width}px: shared save, delete and reaction feedback, retained content and stable layout`);
    await page.goto(`${base}/comment-loading`);
    await page.getByRole('textbox', {name: 'comment draft'}).fill('keep this draft');
    await page.getByRole('button', {name: 'Load stamp catalog'}).click();
    await page.waitForFunction(() => typeof window.releaseStampModule === 'function');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('[data-page-loading]').count(), 0, `${width}: a pending stamp must not hide the page`);
    assert.ok(await page.getByRole('heading', {name: '分数追踪'}).isVisible());
    assert.equal(await page.getByRole('textbox', {name: 'comment draft'}).inputValue(), 'keep this draft');
    await page.evaluate(() => { window.releaseStampModule(); });
    await page.getByRole('img', {name: ':stamp-cn-1:', exact: true}).waitFor();
    assert.equal(await page.locator('[data-page-loading]').count(), 0);
    assert.equal(await page.getByRole('textbox', {name: 'comment draft'}).inputValue(), 'keep this draft');
    await page.goto(`${base}/tabs`);
    await page.getByRole("tab", {name: "活动信息"}).waitFor();
    await page.getByRole("textbox", {name: "tracker draft"}).fill("retained planner draft");
    await page.locator('[data-chart-probe] .recharts-line-curve').waitFor();
    await page.evaluate(() => { window.retainedCurve = document.querySelector('[data-chart-probe] .recharts-line-curve'); });
    await page.evaluate(() => { window.slowCommits = true; });
    for (const [label, destination] of [["活动信息", "info"], ["分数追踪", "tracker"]]) {
      await page.evaluate(() => {
        window.tabFrames = [];
        window.recordTabs = true;
        function snapshot() {
          if (!window.recordTabs) return;
          const viewport = document.querySelector('.event-view-viewport').getBoundingClientRect();
          const x = viewport.left + viewport.width / 2, y = viewport.top + 100;
          const visible = [...document.querySelectorAll('.event-view-panel')].filter(panel => {
            const rect = panel.getBoundingClientRect();
            return rect.left <= x && rect.right > x && rect.top <= y && rect.bottom > y;
          }).map(panel => panel.querySelector('[data-view]').dataset.view);
          window.tabFrames.push(visible);
        }
        // Include the layout handed to React while its new selection is still pending.
        window.samplePendingSelection = snapshot;
        function sample() {
          snapshot();
          if (window.recordTabs) requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      await page.getByRole("tab", {name: label}).click();
      await page.waitForFunction(destination => {
        const panel = document.querySelector('.event-view-panel[data-active=true]');
        return panel.querySelector('[data-view]').dataset.view === destination
          && !document.querySelector('.event-view-section').hasAttribute('data-moving');
      }, destination);
      await page.waitForTimeout(50);
      const frames = await page.evaluate(() => { window.recordTabs = false; return window.tabFrames; });
      const arrived = frames.findIndex(visible => visible.length === 1 && visible[0] === destination);
      assert.ok(arrived >= 0, `${width}: destination was displayed`);
      assert.ok(frames.slice(arrived).every(visible => visible.length === 1 && visible[0] === destination),
        `${width}: completed slide must not flash the previous panel: ${JSON.stringify(frames)}`);
      assert.ok(await page.evaluate(() => window.retainedCurve.isConnected
        && window.retainedCurve === document.querySelector('[data-chart-probe] .recharts-line-curve')),
        `${width}: hiding/restoring a tab preserves the rendered chart curve`);
    }
    assert.equal(await page.getByRole("textbox", {name: "tracker draft"}).inputValue(), "retained planner draft");
    await page.evaluate(() => { window.slowCommits = false; });
    if (width < 640) {
      const session = await page.context().newCDPSession(page);
      const bar = await page.locator('.event-view-tabs-bar').boundingBox();
      const x = bar.x + bar.width * 0.7, y = bar.y + bar.height / 2;
      await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
      await session.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x - 35, y}]});
      await page.waitForFunction(() => document.querySelector('.event-view-section').hasAttribute('data-moving'));
      await session.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []});
      await page.waitForFunction(() => !document.querySelector('.event-view-section').hasAttribute('data-moving'));
      assert.equal(await page.getByRole('tab', {name: '分数追踪'}).getAttribute('aria-selected'), 'true');
      await session.detach();
    }
    await page.getByRole('tab', {name: '活动信息'}).click();
    await page.getByRole('tab', {name: '分数追踪'}).click();
    await page.waitForFunction(() => !document.querySelector('.event-view-section').hasAttribute('data-moving'));
    assert.equal(await page.getByRole('tab', {name: '分数追踪'}).getAttribute('aria-selected'), 'true');
    await page.emulateMedia({reducedMotion: "reduce"});
    await page.getByRole("tab", {name: "活动信息"}).click();
    await page.getByRole("textbox", {name: "info draft"}).waitFor();
    await page.waitForFunction(() => !document.querySelector('.event-view-section').hasAttribute('data-moving'));
    await page.emulateMedia({reducedMotion: "no-preference"});

    await page.goto(`${base}/scroll-tabs`);
    const collapse = await page.evaluate(async () => {
      const root = document.querySelector('.event-view-section');
      const strip = root.querySelector('.event-view-tabs-bar');
      const button = strip.querySelector('button');
      const marker = root.querySelector('.event-view-sentinel');
      const header = document.querySelector('header').getBoundingClientRect().bottom;
      const origin = marker.getBoundingClientRect().top + scrollY - header;
      const normal = root.querySelector('.event-view-tabs').getBoundingClientRect().height;
      const compact = parseFloat(getComputedStyle(button).minHeight);
      const frames = [];
      for (const ratio of [0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25, 0]) {
        scrollTo({top: origin + ratio * (normal - compact), behavior: 'instant'});
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const bounds = strip.getBoundingClientRect();
        frames.push({height: bounds.height, bottom: bounds.bottom,
          contentTop: root.querySelector('.event-view-viewport').getBoundingClientRect().top,
          font: parseFloat(getComputedStyle(button).fontSize)});
      }
      return {origin, normal, compact, frames};
    });
    assert.ok(new Set(collapse.frames.map(frame => frame.height)).size >= 5, 'scrolling renders intermediate tab sizes in both directions');
    assert.ok(collapse.frames.every(frame => Math.abs(frame.bottom - frame.contentTop) < 1), 'shrinking tabs stay aligned with their content');
    assert.equal(collapse.frames[0].height, collapse.normal);
    assert.equal(collapse.frames[4].height, collapse.compact);
    assert.equal(collapse.frames[8].height, collapse.normal);
    assert.equal(collapse.frames[0].font, 16);
    assert.equal(collapse.frames[4].font, width < 640 ? 13 : 14);
    await page.emulateMedia({reducedMotion:'reduce'});
    for (const [offset, expected] of [[3, collapse.compact], [-3, collapse.normal]]) {
      await page.evaluate(top => scrollTo({top, behavior:'instant'}), collapse.origin + offset);
      await page.waitForFunction(expected => document.querySelector('.event-view-tabs-bar').getBoundingClientRect().height === expected, expected);
    }
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(() => scrollTo({top:0, behavior:'instant'}));
    await page.evaluate(() => {
      window.samplePendingSelection = next => {
        window.pendingPanelTop = document.querySelector('[data-view=' + next + ']').getBoundingClientRect().top;
      };
    });
    const settle = async view => page.waitForFunction(view =>
      document.querySelector('.event-view-panel[data-active=true] [data-view]')?.dataset.view === view
      && !document.querySelector('.event-view-section').hasAttribute('data-moving'), view);
    const switchTab = async (label, view) => {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const before = await page.evaluate(() => {
        const rect = document.querySelector('.event-view-tabs-bar').getBoundingClientRect();
        window.chromeFrames = [];
        window.recordChrome = true;
        const sample = () => {
          if (!window.recordChrome) return;
          const bar = document.querySelector('.event-view-tabs-bar').getBoundingClientRect();
          window.chromeFrames.push({top: bar.top, height: bar.height, header: document.querySelector('header').getBoundingClientRect().bottom});
          requestAnimationFrame(sample);
        };
        sample();
        return {top: rect.top, height: rect.height};
      });
      await page.getByRole('tab', {name:label}).click(); await settle(view);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const frames = await page.evaluate(() => { window.recordChrome = false; return window.chromeFrames; });
      assert.ok(frames.every(frame => Math.abs(frame.top - before.top) < 1 && Math.abs(frame.height - before.height) < 1 && frame.header === 60),
        `${width}: switching keeps the header and tab bar fixed throughout every frame`);
      const [preview, committed] = await page.evaluate(view => [window.pendingPanelTop,
        document.querySelector('[data-view=' + view + ']').getBoundingClientRect().top], view);
      assert.ok(Math.abs(preview - committed) < 2, `${width}: incoming preview matches restored content without a vertical jump`);
    };
    const scrollDepth = async depth => page.evaluate(depth => {
      const origin = document.querySelector('.event-view-viewport').getBoundingClientRect().top + scrollY - 104;
      scrollTo({top:origin + depth, behavior:'instant'});
      return scrollY;
    }, depth);
    const nearY = async expected => assert.ok(Math.abs(await page.evaluate(() => scrollY) - expected) < 2, `${width}: restore ${expected}`);
    const trackerY = await scrollDepth(450);
    await switchTab('活动信息', 'info');
    const infoStart = await page.evaluate(() => document.querySelector('.event-view-panel[data-active=true]').getBoundingClientRect().top);
    assert.ok(Math.abs(infoStart - 104) < 2, `${width}: first entry starts beneath sticky tabs even while loading`);
    await page.evaluate(() => window.finishInfo());
    await page.getByRole('textbox', {name:'info draft'}).waitFor();
    assert.ok(Math.abs(await page.locator('[data-view=info]').evaluate(el => el.getBoundingClientRect().top) - 104) < 2);
    const infoY = await scrollDepth(800);
    await switchTab('分数追踪', 'tracker'); await nearY(trackerY);
    await switchTab('活动信息', 'info'); await nearY(infoY);
    await switchTab('分数追踪', 'tracker'); await nearY(trackerY);
    await page.evaluate(() => scrollTo({top: 0, behavior: 'instant'}));
    await switchTab('活动信息', 'info'); await nearY(0);
    await scrollDepth(800);
    await switchTab('分数追踪', 'tracker');
    assert.ok(Math.abs(await page.locator('[data-view=tracker]').evaluate(el => el.getBoundingClientRect().top) - 104) < 2,
      'returning to a tab last viewed above the tabs must not reveal the shared heading');
    await switchTab('活动信息', 'info'); await nearY(infoY);
    await switchTab('分数追踪', 'tracker');
    await scrollDepth(450);
    if (width < 640) {
      const session = await page.context().newCDPSession(page);
      const swipe = async (x, y, dx, dy = 0, cancel = false) => {
        await session.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x,y}]});
        for (let i=1; i<=6; i++) {
          await session.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:x+dx*i/6,y:y+dy*i/6}]});
          await page.waitForTimeout(16);
        }
        await session.send('Input.dispatchTouchEvent', {type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
      };
      await swipe(280, 350, -180); await settle('info'); await nearY(infoY);
      await swipe(100, 350, 180); await settle('tracker'); await nearY(trackerY);
      await swipe(280, 350, -35, 0, true); await settle('tracker'); await nearY(trackerY);
      await scrollDepth(0);
      await page.locator('.event-view-panel[data-active=true] [data-action]').tap();
      assert.equal(await page.evaluate(() => window.actions), 1, 'a cancelled swipe must not swallow the next control tap');
      await scrollDepth(450);
      await swipe(280, 350, -35, 0, true); await settle('tracker');
      await scrollDepth(0);
      await page.locator('.event-view-panel[data-active=true] [data-action]').click();
      assert.equal(await page.evaluate(() => window.actions), 2, 'a cancelled swipe must not swallow a subsequent mouse click');
      await session.send('Emulation.setPageScaleFactor', {pageScaleFactor: 2});
      const panBefore = await page.evaluate(() => visualViewport.offsetLeft);
      await swipe(280, 400, -180);
      await settle('tracker');
      assert.ok(await page.evaluate(() => visualViewport.offsetLeft) > panBefore, 'a zoomed page pans without switching tabs');
      await session.send('Emulation.setPageScaleFactor', {pageScaleFactor: 1});
      await session.send('Emulation.setPageScaleFactor', {pageScaleFactor: 2});
      await swipe(280, 75, -180);
      await settle('tracker');
      assert.ok(await page.evaluate(() => visualViewport.offsetLeft) > 0, 'the zoomed tab bar also leaves horizontal panning native');
      await session.send('Emulation.setPageScaleFactor', {pageScaleFactor: 1});
      await scrollDepth(450);
      await swipe(200, 400, 0, -160); await settle('tracker');
      assert.ok(await page.evaluate(() => scrollY) > trackerY + 80, 'vertical content gestures scroll the document');
      await scrollDepth(0);
      for (const selector of ['[data-chart-probe]', 'input', '[data-horizontal-scroll]']) {
        const box = await page.locator('.event-view-panel[data-active=true]').locator(selector).boundingBox();
        await swipe(box.x+Math.min(box.width-10,150),box.y+box.height/2,-100);
        await settle('tracker');
      }
      assert.ok(await page.locator('[data-horizontal-scroll]').first().evaluate(el => el.scrollLeft) > 0, 'nested horizontal scroll remains native');
      await scrollDepth(450);
      await session.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:280,y:350}]});
      await session.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:200,y:350}]});
      await page.waitForFunction(() => document.querySelector('.event-view-section').hasAttribute('data-moving'));
      await page.evaluate(() => window.changeEvent());
      await session.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
      await settle('tracker');
      await session.detach();
    }
    await scrollDepth(500);
    await page.evaluate(() => window.changeEvent());
    await page.waitForTimeout(50);
    assert.ok(Math.abs(await page.locator('.event-view-panel[data-active=true]').evaluate(el => el.getBoundingClientRect().top) - 104) < 2);
    await switchTab('活动信息', 'info');
    assert.ok(Math.abs(await page.locator('[data-view=info]').evaluate(el => el.getBoundingClientRect().top) - 104) < 2, 'new identity discards both positions');
    await scrollDepth(650);
    await page.emulateMedia({reducedMotion:'reduce'});
    await switchTab('分数追踪','tracker');
    await switchTab('活动信息','info');
    await nearY(await page.evaluate(() => document.querySelector('.event-view-viewport').getBoundingClientRect().top + scrollY - 104 + 650));
    await page.getByRole('tab', {name:'活动信息'}).focus();
    await page.keyboard.press('ArrowLeft'); await settle('tracker');
    assert.equal(await page.getByRole('tab', {name:'分数追踪'}).evaluate(el => document.activeElement === el), true);
    await page.keyboard.press('ArrowRight'); await settle('info');
    await nearY(await page.evaluate(() => document.querySelector('.event-view-viewport').getBoundingClientRect().top + scrollY - 104 + 650));
    await page.emulateMedia({reducedMotion:'no-preference'});
    if (process.env.UI_TRANSITIONS_SCREENSHOT_DIR) await page.screenshot({path:resolve(process.env.UI_TRANSITIONS_SCREENSHOT_DIR, `hhwx-event-tabs-${width}.png`)});
    console.log(`PASS ${width}px: independent scroll, initial delayed info, identity reset, reduced motion${width < 640 ? ', content swipe, cancellation, vertical and nested scrolling, control exclusions' : ''}`);

    await page.goto(`${base}/reactions`);
    await page.getByRole("button", {name: ":fixture: 3"}).hover();
    await page.getByRole("dialog").waitFor();
    await page.evaluate(() => {
      window.previewFrames = [];
      window.recordPreview = true;
      function sample() {
        if (!window.recordPreview) return;
        const popup = document.querySelector('[popover]');
        const anchor = popup.parentElement.querySelector('button');
        if (popup.textContent.includes('回应者 1')) {
          window.previewFrames.push({bottom: popup.getBoundingClientRect().bottom, top: anchor.getBoundingClientRect().top});
        }
        if (window.recordPreview) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
      window.loadParticipants();
    });
    await page.getByText("回应者 3", {exact: true}).waitFor();
    await page.waitForTimeout(100);
    const frames = await page.evaluate(() => { window.recordPreview = false; return window.previewFrames; });
    assert.ok(frames.length > 0);
    assert.ok(frames.every(frame => Math.abs(frame.bottom - frame.top) < 1),
      `${width}: loaded popup must touch its anchor from its first frame: ${JSON.stringify(frames)}`);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({state: "detached"});

    await page.goto(`${base}/comparisons`);
    const buttons = page.locator('.event-comparison-legend button');
    await buttons.first().waitFor();
    const colors = () => page.locator('.event-comparison-row > span:first-child').evaluateAll(elements =>
      elements.map(element => getComputedStyle(element).backgroundColor));
    const before = await colors();
    assert.equal(new Set(before).size, 5);
    for (let index = 0; index < 5; index++) {
      await buttons.nth(index).click();
      assert.deepEqual(await colors(), before, `${width}: hiding line ${index} preserves every row color`);
    }
    const legendColors = await buttons.locator('span:first-child').evaluateAll(elements =>
      elements.map(element => getComputedStyle(element).backgroundColor));
    assert.deepEqual(legendColors, before, `${width}: hidden legend and editor colors match`);
    for (let index = 0; index < 5; index++) await buttons.nth(index).click();
    assert.deepEqual(await colors(), before);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${width}px: isolated stamp loading, tab frames, cancelled/reversed transitions, retained draft, reduced motion, async popup frames, hidden comparison colors`);
  }
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
