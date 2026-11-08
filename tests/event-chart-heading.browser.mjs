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
    await page.goto(`${base}/bandori/events/328?server=cn&tier=1000`);
    const title=page.locator('.event-chart-title'),chart=page.locator('.event-chart-surface');
    await page.waitForFunction(()=>document.querySelector('.event-chart-title')?.textContent==='CN 328期 活动排行 T1000');
    await chart.getByRole('alert').waitFor();
    assert.equal(await chart.getByRole('alert').innerText(),'分数追踪数据加载失败\n重试');
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
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await chart.getByRole('alert').waitFor();
    assert.match(await chart.getByRole('alert').innerText(),/分数更新失败，暂时显示已加载数据/);
    assert.equal(await chart.locator('.recharts-line-curve').first().getAttribute('d'),path);
    trackerFails=false;
    await chart.getByRole('button',{name:'重试',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.event-chart-surface [role=alert]'));
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
  await page.route('**/api/bandori/master/events',route=>route.fulfill(catalogFails?{status:503,json:{error:'Fixture unavailable'}}:{json:catalog}));
  await page.goto(`${base}/bandori/events/328?server=cn&tier=1000`);
  const pickerError=page.locator('.event-switcher-field [role=alert]');
  await pickerError.waitFor();
  assert.match(await pickerError.innerText(),/活动列表更新失败/);
  assert.equal(await page.locator('.event-switcher-field select').inputValue(),'328');
  assert.equal(await page.locator('.event-progress').isVisible(),true,'catalog failure keeps server-provided progress');
  catalogFails=false;
  await pickerError.getByRole('button',{name:'重试',exact:true}).click();
  await pickerError.waitFor({state:'detached'});
  console.log('PASS: catalog error and retry remain with event selection');
  const emptyPage=await browser.newPage();
  await emptyPage.route('**/api/bandori/master/events',route=>route.fulfill({json:catalog}));
  await emptyPage.route('**/api/bandori/tracker/data?*',route=>route.fulfill({json:{result:false,cutoffs:[]}}));
  await emptyPage.goto(`${base}/bandori/events/328?server=cn&tier=1000`);
  await emptyPage.getByTestId('tracker-chart-empty').waitFor();
  assert.equal(await emptyPage.locator('.event-chart-surface [role=alert]').count(),0,'a successful empty response remains an empty state');
  console.log('PASS: successful empty data keeps its own state');
} finally { await browser.close(); }
