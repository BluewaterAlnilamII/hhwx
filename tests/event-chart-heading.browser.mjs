// Run against npm run dev; API failures are injected only in this isolated browser.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const now = Date.now();
const catalog = {success:true,data:{328:{eventType:'challenge',eventName:['Fixture','','','Fixture'],
  musics:[[{musicId:1}],[],[],[{musicId:1}]],
  startAt:[now-86400000,null,null,now-86400000],endAt:[now+86400000,null,null,now+86400000]}}};
const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome',headless:true});
try {
  for (const width of [393,1440]) {
    const page = await browser.newPage({viewport:{width,height:950},isMobile:width<640,hasTouch:width<640});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{
      if(message.type()==='error'&&/hydrated|hydration/i.test(message.text())) errors.push(message.text());
    });
    let trackerFails=true;
    await page.route('**/api/bandori/master/events',route=>route.fulfill({json:catalog}));
    await page.route('**/api/bandori/tracker/topdata?*',route=>route.fulfill({status:503,json:{error:'Fixture unavailable'}}));
    await page.route('**/api/bandori/tracker/data?*',route=>route.fulfill(trackerFails
      ? {status:503,json:{error:'Fixture unavailable'}}
      : {json:{result:true,cutoffs:[{time:now-3600000,ep:100000},{time:now,ep:200000}]}}));
    await page.goto(`${base}/bandori/events/328?server=cn&tier=1000`,{waitUntil:'domcontentloaded'});
    const title=page.locator('.event-chart-title'),chart=page.locator('.event-chart-surface');
    await page.waitForFunction(()=>document.querySelector('.event-chart-title')?.textContent==='CN 328期 活动排行 T1000');
    await chart.getByRole('alert').waitFor();
    assert.equal(await chart.getByRole('alert').innerText(),'加载失败\n重试');
    assert.equal(await chart.getByTestId('tracker-chart-empty').count(),0,'a failed request must not claim the ranking is empty');
    const retry=chart.getByRole('button',{name:'重试',exact:true});
    assert.ok((await retry.boundingBox()).height>=24,'retry keeps a usable visible target');
    if(width<640) {
      const hit=await retry.evaluate(el=>({height:el.clientHeight,top:parseFloat(getComputedStyle(el,'::after').top),bottom:parseFloat(getComputedStyle(el,'::after').bottom)}));
      assert.ok(hit.height-hit.top-hit.bottom>=44,'touch retry target reaches 44px without enlarging its text');
    }
    assert.equal(await page.locator('.event-view-panel > [role=alert]').count(),0);
    trackerFails=false;
    if(width<640) {
      const box=await retry.boundingBox();
      await page.touchscreen.tap(box.x+box.width/2,box.y-4);
    } else await retry.click();
    await chart.locator('.recharts-line-curve').first().waitFor();
    await page.waitForFunction(()=>!document.querySelector('.event-chart-surface [role=alert]'));
    const path=await chart.locator('.recharts-line-curve').first().getAttribute('d');
    trackerFails=true;
    const foregroundRequest=page.waitForResponse(response=>response.url().includes('/api/bandori/tracker/data?')&&response.status()===503);
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await foregroundRequest;
    await page.waitForFunction(()=>!document.querySelector('.event-tracker-surface [role=status]'));
    assert.equal(await chart.getByRole('alert').count(),0,'foreground revalidation failure keeps usable data silently');
    assert.equal(await chart.locator('.recharts-line-curve').first().getAttribute('d'),path);
    if(width<640) {
      for(const size of [320,393]) {
        await page.setViewportSize({width:size,height:950});
        const dimensions=await title.evaluate(el=>({height:el.getBoundingClientRect().height,line:parseFloat(getComputedStyle(el).lineHeight),overflow:el.scrollWidth>el.clientWidth}));
        assert.equal(dimensions.overflow,false);
        assert.ok(dimensions.height<=dimensions.line+1,'ordinary mobile title fits one line');
      }
      await page.locator('#tracker-mobile-ranking').selectOption('top10');
    } else await page.getByRole('button',{name:'TOP10',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.event-chart-title')?.textContent==='CN 328期 活动排行 TOP10');
    await chart.getByRole('alert').waitFor();
    assert.equal(await chart.getByTestId('tracker-chart-empty').count(),0,'TOP10 also distinguishes failure from no data');
    await page.getByRole('tab',{name:'月度排行',exact:true}).click();
    assert.match(await title.innerText(),/^CN \d{4}-\d{2} 月度排行 /);
    await page.getByRole('tab',{name:'歌曲排行',exact:true}).click();
    assert.match(await title.innerText(),/^CN 328期 歌曲排行 #\d+ /);
    assert.deepEqual(errors,[]);
    await page.close();
    console.log(`PASS ${width}: title identity, one-line mobile layout, scoped failure, cached refresh and retry`);
  }
  const page=await browser.newPage();
  let catalogFails=true;
  let downstreamRequests=0;
  await page.route('**/api/bandori/master/events',route=>route.fulfill(catalogFails?{status:503,json:{error:'Fixture unavailable'}}:{json:catalog}));
  await page.route('**/api/bandori/tracker/data?*',route=>{
    downstreamRequests++;
    return route.fulfill({json:{result:false,cutoffs:[]}});
  });
  await page.route('**/api/bandori/master/events/328',route=>{
    downstreamRequests++;
    return route.fulfill({status:503,json:{error:'Fixture unavailable'}});
  });
  await page.goto(`${base}/bandori/events/328?server=cn&tier=1000`,{waitUntil:'domcontentloaded'});
  const pickerError=page.locator('.event-page [role=alert]');
  await pickerError.waitFor();
  assert.equal(await pickerError.innerText(),'加载失败\n重试');
  const overview=page.locator('.event-heading');
  assert.equal(await overview.count(),1);
  assert.equal(await overview.locator('h1').count(),0);
  assert.equal(await overview.locator('.event-switcher-field [role=alert]').count(),0);
  assert.equal(await overview.locator('.event-switcher-summary [role=alert]').count(),1);
  const emptySelection=overview.getByRole('combobox',{name:'活动选择',exact:true});
  assert.equal(await emptySelection.inputValue(),'');
  assert.equal(await emptySelection.isDisabled(),true);
  assert.equal(await emptySelection.locator('option').innerText(),'');
  assert.equal(await overview.getByRole('button',{name:'搜索活动',exact:true}).isDisabled(),true);
  assert.equal(await overview.getByRole('button',{name:'最新活动',exact:true}).isDisabled(),true);
  assert.equal(await overview.locator('.event-switcher-servers button:not([disabled])').count(),4);
  assert.equal(await page.locator('.event-progress, .event-chart-surface, .event-view-tabs').count(),0);
  for(const width of [393,1440]) {
    await page.setViewportSize({width,height:950});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'failed overview keeps the responsive heading layout');
    const positions=await overview.evaluate(el=>({field:el.querySelector('.event-switcher-field').getBoundingClientRect().bottom,summary:el.querySelector('.event-switcher-summary').getBoundingClientRect().top}));
    assert.ok(positions.summary>=positions.field,'failure stays below the selection controls');
    if(process.env.OVERVIEW_FAILURE_SCREENSHOT_DIR) await overview.screenshot({path:`${process.env.OVERVIEW_FAILURE_SCREENSHOT_DIR}/event-overview-failure-${width}.png`});
  }
  assert.equal(downstreamRequests,0,'downstream requests wait for a valid overview');
  assert.ok(!(await page.title()).includes('Fixture'),'generic metadata does not need event data');
  catalogFails=false;
  await pickerError.getByRole('button',{name:'重试',exact:true}).click();
  await pickerError.waitFor({state:'detached'});
  await page.locator('.event-progress').waitFor();
  await page.waitForFunction(()=>document.title.includes('Fixture'));
  assert.equal(await page.locator('.event-heading h1').innerText(),'Fixture');
  assert.equal(await overview.getByRole('combobox',{name:'活动选择',exact:true}).inputValue(),'328');
  assert.equal(await overview.getByRole('combobox',{name:'活动选择',exact:true}).isDisabled(),false);
  assert.equal(downstreamRequests,1,'the tracker uses the resolved overview without a detail request');
  await page.getByRole('tab',{name:'活动信息',exact:true}).click();
  await page.locator('.event-info-loading [role=alert]').waitFor();
  assert.equal(downstreamRequests,2,'opening information requests its detail API');
  assert.equal(await page.locator('.event-heading h1').innerText(),'Fixture','a failed detail does not replace the overview');
  console.log('PASS: overview gates content, retry recovers, and detail belongs only to information');
  await page.close();

  const missing=await browser.newPage();
  let missingDownstream=0;
  await missing.route('**/api/bandori/master/events',route=>route.fulfill({json:catalog}));
  await missing.route('**/api/bandori/tracker/**',route=>{
    missingDownstream++;
    return route.fulfill({json:{result:false,cutoffs:[]}});
  });
  await missing.goto(`${base}/bandori/events/987654321?server=cn&type=monthly`,{waitUntil:'domcontentloaded'});
  await missing.getByRole('heading',{name:'404',exact:true}).waitFor();
  assert.equal(missingDownstream,0,'a missing explicit ID must not request another event or month');
  assert.equal(await missing.locator('.event-heading').count(),0,'a missing explicit ID must not fall back to a recommended event');
  assert.equal(await missing.locator('meta[name=robots][content*=noindex]').count(),1);
  await missing.close();
  console.log('PASS: missing event IDs show not-found after the overview succeeds');
  const emptyPage=await browser.newPage();
  await emptyPage.route('**/api/bandori/master/events',route=>route.fulfill({json:catalog}));
  await emptyPage.route('**/api/bandori/tracker/data?*',route=>route.fulfill({json:{result:false,cutoffs:[]}}));
  await emptyPage.goto(`${base}/bandori/events/328?server=cn&tier=1000`,{waitUntil:'domcontentloaded'});
  await emptyPage.getByTestId('tracker-chart-empty').waitFor();
  assert.equal(await emptyPage.locator('.event-chart-surface [role=alert]').count(),0,'a successful empty response remains an empty state');
  console.log('PASS: successful empty data keeps its own state');
  await emptyPage.close();

  for(const width of [393,1440]) {
    const entry=await browser.newPage({viewport:{width,height:950}});
    let catalogReads=0;
    await entry.addInitScript(()=>{
      window.eventPageFrames=[];
      let previous;
      const sample=()=>{
        const state={path:location.pathname,content:!!document.querySelector('.event-view-tabs'),loading:!!document.querySelector('.event-switcher-summary [role=status]')};
        const signature=JSON.stringify(state);
        if(signature!==previous){window.eventPageFrames.push(state);previous=signature;}
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await entry.route('**/bandori/events/328?*',async route=>{
      if(new URL(route.request().url()).searchParams.has('_rsc')) await new Promise(resolve=>setTimeout(resolve,350));
      await route.continue();
    });
    await entry.route('**/api/bandori/master/events',route=>{catalogReads++;return route.fulfill({json:catalog});});
    await entry.route('**/api/bandori/tracker/data?*',route=>route.fulfill({json:{result:false,cutoffs:[]}}));
    await entry.goto(`${base}/bandori/events?server=cn&tier=1000`,{waitUntil:'domcontentloaded'});
    await entry.waitForURL('**/bandori/events/328?*');
    await entry.getByTestId('tracker-chart-empty').waitFor();
    const frames=await entry.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(window.eventPageFrames))));
    const firstContent=frames.findIndex(frame=>frame.content);
    assert.ok(firstContent>=0,'the resolved event content becomes visible');
    assert.ok(frames.slice(firstContent).every(frame=>frame.content&&!frame.loading),
      `entry navigation must not replace visible event content with full-page loading: ${JSON.stringify(frames)}`);
    assert.equal(catalogReads,1,'canonical navigation reuses the browser overview cache');
    await entry.close();
    console.log(`PASS ${width}: entry navigation never returns visible content to full-page loading`);
  }
  const noEvents=await browser.newPage();
  await noEvents.route('**/api/bandori/master/events',route=>route.fulfill({json:{success:true,data:{}}}));
  await noEvents.goto(`${base}/bandori/events`,{waitUntil:'domcontentloaded'});
  await noEvents.getByText('暂无数据',{exact:true}).waitFor();
  assert.equal(await noEvents.locator('.event-page [role=alert], .event-page [role=status]').count(),0);
  await noEvents.close();
  console.log('PASS: entry navigation reuses the overview and an empty overview ends loading');

  const commentsPage=await browser.newPage();
  const commentPages=[];
  let commentsFail=true;
  const retainedComment={id:'11111111-1111-4111-8111-111111111111',targetType:'bandori-event',targetId:'328',parentId:null,rootId:null,
    userId:'22222222-2222-4222-8222-222222222222',username:'Regression',publicUid:null,avatar:{cardId:1,entityServer:null,trainType:'normal'},displayDegree:null,
    content:'第二页已有评论',depth:0,replyCount:0,reactions:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),editedAt:null,deletedAt:null,
    moderationStatus:'visible',canEdit:false,canDelete:false,replyToCommentId:null,replyToUsername:null,previewReplies:[]};
  await commentsPage.route('**/api/bandori/master/events',route=>route.fulfill({json:catalog}));
  await commentsPage.route('**/api/bandori/tracker/data?*',route=>route.fulfill({json:{result:false,cutoffs:[]}}));
  await commentsPage.route('**/api/bandori/events/328/comments?*',route=>{
    const requestedPage=new URL(route.request().url()).searchParams.get('page');
    commentPages.push(requestedPage);
    return route.fulfill(commentsFail ? {status:503,json:{error:'Fixture unavailable'}} : {json:{success:true,data:{comments:[retainedComment],page:Number(requestedPage),totalPages:3,totalCount:100,totalCommentCount:100}}});
  });
  await commentsPage.goto(`${base}/bandori/events/328?server=cn&page=2`,{waitUntil:'domcontentloaded'});
  const comments=commentsPage.locator('section').filter({has:commentsPage.getByRole('heading',{name:'评论',exact:false})}).last();
  await comments.getByRole('alert').waitFor();
  commentsFail=false;
  await comments.getByRole('button',{name:'重试',exact:true}).click();
  await comments.getByRole('alert').waitFor({state:'detached'});
  assert.deepEqual(commentPages,['2','2'],'retry preserves the failed comment page');
  assert.equal(new URL(commentsPage.url()).searchParams.get('page'),'2');
  await comments.getByText('第二页已有评论',{exact:true}).waitFor();
  const commentsHeight=(await comments.boundingBox()).height;
  commentsFail=true;
  const refreshFailure=commentsPage.waitForResponse(response=>response.url().includes('/events/328/comments?')&&response.status()===503);
  await comments.getByRole('button',{name:'刷新评论',exact:true}).click();
  await refreshFailure;
  await commentsPage.waitForFunction(()=>!document.querySelector('button[aria-label="刷新评论"]').disabled);
  assert.equal(await comments.getByText('第二页已有评论',{exact:true}).isVisible(),true,'refresh failure retains the previous page');
  assert.equal(await comments.getByRole('alert').innerText(),'刷新失败');
  assert.equal((await comments.boundingBox()).height,commentsHeight,'refresh feedback does not expand the module');
  assert.equal(new URL(commentsPage.url()).searchParams.get('page'),'2','failed refresh does not change pagination');
  assert.deepEqual(commentPages,['2','2','1']);
  if(process.env.COMMENT_REFRESH_SCREENSHOT) await comments.screenshot({path:process.env.COMMENT_REFRESH_SCREENSHOT});
  await comments.getByRole('alert').waitFor({state:'detached'});
  commentsFail=false;
  await comments.getByRole('button',{name:'刷新评论',exact:true}).click();
  await comments.getByText('刷新成功',{exact:true}).waitFor();
  assert.equal(new URL(commentsPage.url()).searchParams.get('page'),'1');
  await commentsPage.close();
  console.log('PASS: comment retry preserves pagination and failed refresh retains the previous page');
} finally { await browser.close(); }
