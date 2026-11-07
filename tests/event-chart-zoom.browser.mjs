// Run with node tests/event-chart-zoom.browser.mjs; uses real components and synthetic public chart data.
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
const messages = { bandori: JSON.parse(await readFile("messages/zh-CN/bandori.json", "utf8")) };
const start = Date.UTC(2026, 10, 1), span = 6 * 86400000;
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, platform: "browser", format: "esm", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import {useRef, useState, useMemo, useCallback} from 'react';
    import {createRoot} from 'react-dom/client';
    import {NextIntlClientProvider} from 'next-intl';
    import {LineChart, XAxis, YAxis, ReferenceDot} from 'recharts';
    import {TrackerChartPanel} from './src/app/[locale]/bandori/events/_tracker/TrackerChartPanel';
    import {ComparisonControls} from './src/app/[locale]/bandori/events/_tracker/ComparisonControls';
    import {EventViewTabs} from './src/app/[locale]/bandori/events/EventViewTabs';
    const start=${start}, span=${span}, noop=()=>{};
    const configs=Array.from({length:3},(_,i)=>({id:String(i),targetId:322-i,tier:1000,targetType:'event',enabled:true,colorIndex:i}));
    const colors=['#ec4899','#f59e0b','#10b981'];
    const plan={baselineAt:start+span*0.6,endAt:start+span,currentPt:1000000,finalPt:5000000,targetPt:null,limitPt:null};
    function Chart({event, revision}) {
      const chart=useRef(null), viewport=useRef(null), scroll=useRef(null), tooltip=useRef(null), schedule=useRef(noop);
      const points=useMemo(()=>Array.from({length:601+revision},(_,i)=>({time:start+i*span/1000,ep:i*4000,
        c0:i*4700,c1:i*3700,c2:i*3200,instantEp:i===600?2400000:undefined,dayEp:i===600?2400000:undefined})).concat([{time:start+span,instantEp:4000000,dayEp:6000000,isProjection:true}]),[revision]);
      const comparisons=useMemo(()=>configs.map((c,i)=>({...c,dataKey:'c'+i,color:colors[i],label:c.targetId+'期 T1000',points})),[points]);
      const lookup=useMemo(()=>new Map(points.map(p=>[p.time,p])),[points]);
      const hover=useCallback(state=>({active:true,label:state.activeLabel,coordinate:state.activeCoordinate,
        signature:String(state.activeLabel),payload:[{dataKey:'ep',payload:lookup.get(state.activeLabel),value:lookup.get(state.activeLabel)?.ep}]}),[lookup]);
      return <TrackerChartPanel zoomKey={String(event)} chartContainerKey={String(event)} chartAnchorRef={chart}
        calculatorProjection={plan}
        chartViewportRef={viewport} scrollContainerRef={scroll} tooltipRef={tooltip} scheduleTooltipPositionUpdateRef={schedule}
        chartViewportHeight={innerWidth<640?270:360} displayedChartData={points} domainStart={start} domainEnd={start+span}
        hasRenderableChartData={true} isLoading={false} comparisonLines={comparisons} server={3} trackingMode="event"
        showInstantProjection={true} showDayProjection={true} showBestdoriPrediction={false} bestdoriPredictionPointCount={0}
        midnights={Array.from({length:7},(_,i)=>start+i*86400000)} nonWorkingDayBands={[{key:'holiday',start:start+86400000,end:start+3*86400000}]}
        yDomainInfo={[0,6000000]} yTicks={[0,2000000,4000000,6000000]} buildHoverTooltip={hover}
        renderTooltip={value=><div data-readout>{value.label}</div>}
        renderControls={()=><ComparisonControls
          comparisonConfigs={configs} resolvedComparisonConfigs={configs} comparisonLineById={new Map(comparisons.map(c=>[c.id,c]))}
          comparisonTargetLabelMap={new Map()} comparisonTargetOptions={configs.map(c=>({id:c.targetId,label:c.targetId+'期活动'}))}
          comparisonTargetType="event" comparisonTierOptions={[1000]} comparisonTierOptionsByConfigId={new Map()}
          comparisonAlignment="start" onAlignmentChange={noop} onAddComparison={noop} onRemoveAllComparisons={noop}
          onRemoveComparison={noop} onToggleComparison={noop} onUpdateComparison={noop} canAddComparisonRow={false}
          setShowBestdoriPrediction={noop} setShowDayProjection={noop} setShowInstantProjection={noop}
          showBestdoriPrediction={false} showDayProjection={true} showInstantProjection={true}
          bestdoriPrediction={{status:'no-data'}} status="ongoing" trackingMode="event"/>}/>;
    }
    function App() {
      const [view,setView]=useState('tracker'), [event,setEvent]=useState(328), [revision,setRevision]=useState(0);
      return <main className="event-page hhwx-panel" style={{margin:'180px auto 800px',maxWidth:1100,padding:12}}>
        <div data-legacy-planner-label aria-hidden style={{position:'absolute',left:-1000,top:0}}>
          <LineChart width={200} height={200} data={[{x:0.5,y:0.5}]}>
            <XAxis dataKey="x" type="number" domain={[0,1]} allowDataOverflow hide/><YAxis dataKey="y" type="number" domain={[0,1]} allowDataOverflow hide/>
            <ReferenceDot x={0.5} y={0.5} r={5} label={{value:'可达 500万',position:'insideTopRight',dx:-8,dy:-12,fontSize:11}}/>
          </LineChart>
        </div>
        <button onClick={()=>setRevision(r=>r+1)}>Refresh data</button>
        <button onClick={()=>setEvent(e=>e+1)}>Change event</button>
        <EventViewTabs value={view} onChange={setView} onPreviewChange={noop} plannerOpen={false}>
          {tab=>tab==='tracker'?<Chart event={event} revision={revision}/>:<div style={{height:700}}>活动信息</div>}
        </EventViewTabs>
      </main>;
    }
    createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale="zh-CN" timeZone="UTC" messages={${JSON.stringify(messages)}}><App/></NextIntlClientProvider>);
  `},
});
const css = (await postcss([tailwind()]).process(
  '@import "./src/app/globals.css";\n' + await readFile("src/app/[locale]/bandori/events/events.css", "utf8"),
  {from:resolve(root,"chart-zoom-fixture.css")},
)).css;
const server=createServer((request,response)=>{
  response.setHeader("Content-Type",request.url==="/app.js"?"text/javascript":request.url==="/app.css"?"text/css":"text/html");
  response.end(request.url==="/app.js"?bundle.outputFiles[0].text:request.url==="/app.css"?css:
    '<!doctype html><html data-visual-theme="smile-patrol"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chart zoom regression</title><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>');
});
await new Promise(done=>server.listen(0,"localhost",done));
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||"chrome",headless:true});
try {
  for(const width of [393,1440]) {
    const page=await browser.newPage({viewport:{width,height:900},hasTouch:width<640,isMobile:width<640});
    const errors=[]; page.on("pageerror",e=>errors.push(e.message));
    await page.goto(`http://localhost:${server.address().port}`);
    await page.locator('.recharts-line-curve').first().waitFor();
    const chart=page.getByTestId('tracker-chart'), plot=page.getByTestId('tracker-chart-pointer-layer');
    const range=()=>chart.evaluate(el=>({scale:+el.dataset.zoom,start:+el.dataset.viewStart,end:+el.dataset.viewEnd}));
    const close=(a,b,message)=>assert.ok(Math.abs(a-b)<0.002,`${message}: ${a} vs ${b}`);
    const settle=()=>page.waitForTimeout(300);
    const zoomIn=page.getByRole('button',{name:'放大',exact:true});
    const zoomOut=page.getByRole('button',{name:'缩小',exact:true});
    const pressZoom=async button=>{if(width<640){await button.focus();await page.keyboard.press('Enter');await button.evaluate(el=>el.blur());}else await button.click();};
    const ticks=await page.getByTestId('tracker-y-axis').innerText();
    const plannerLabelOffset=()=>page.locator('[data-tracker-active-marker="calculator-end"]').evaluate(marker=>{
      const point=marker.getBoundingClientRect();
      const label=marker.nextElementSibling.querySelector('text').getBoundingClientRect();
      return {right:label.right-point.x-point.width/2,top:label.top-point.y-point.height/2};
    });
    const legacyOffset=await page.locator('[data-legacy-planner-label]').evaluate(root=>{
      const point=root.querySelector('circle').getBoundingClientRect();
      const label=root.querySelector('text').getBoundingClientRect();
      return {right:label.right-point.x-point.width/2,top:label.top-point.y-point.height/2};
    });
    const currentOffset=await plannerLabelOffset();
    assert.ok(Math.abs(currentOffset.top-legacyOffset.top)<1,'planner label keeps its original vertical placement');
    assert.ok(Math.abs(currentOffset.right-legacyOffset.right)<1,'planner label keeps its original horizontal placement');
    const mainLine=page.locator('.recharts-line-curve[stroke="#3B82F6"]');
    const originalPath=await mainLine.getAttribute('d');
    await pressZoom(zoomIn); await settle();
    let r=await range(); close(r.scale,2,'button zoom');
    assert.equal(await page.locator('.recharts-xAxis-tick-labels text').evaluateAll(ticks=>ticks.some(tick=>tick.checkVisibility({opacityProperty:true,visibilityProperty:true}))),false,'full-range labels are not painted over zoom labels');
    close((start+span*0.6-r.start)/(r.end-r.start),0.76,'latest actual point anchor');
    assert.equal(await mainLine.getAttribute('d'),originalPath,'zoom reuses curve geometry');
    const endpoint=await mainLine.evaluate(path=>{
      const point=path.getPointAtLength(path.getTotalLength());
      const screen=new DOMPoint(point.x,point.y).matrixTransform(path.getScreenCTM());
      const plot=document.querySelector('[data-testid=tracker-chart-pointer-layer]').getBoundingClientRect();
      return (screen.x-plot.left)/plot.width;
    });
    close(endpoint,0.76,'transformed curve matches the time axis');
    const planPoint=await page.locator('[data-tracker-active-marker="calculator-start"]').boundingBox();
    close(planPoint.width,10,'planner marker retains its width');
    close(planPoint.height,10,'planner marker retains its height');
    assert.equal(await page.getByTestId('tracker-y-axis').innerText(),ticks);
    await pressZoom(zoomOut); await settle();
    const restoredOffset=await plannerLabelOffset();
    assert.ok(Math.abs(restoredOffset.top-legacyOffset.top)<1,'planner label placement survives zoom and reset');
    assert.equal(await page.locator('.recharts-xAxis-tick-labels text').evaluateAll(ticks=>ticks.some(tick=>tick.checkVisibility({opacityProperty:true,visibilityProperty:true}))),true,'full-range labels return at 1x');
    await plot.scrollIntoViewIfNeeded();
    let box=await plot.boundingBox();
    if(width<640) await page.touchscreen.tap(box.x+box.width*0.4,box.y+60);
    else await page.mouse.click(box.x+box.width*0.4,box.y+60);
    await page.waitForTimeout(80);
    const selected=+(await page.locator('[data-readout]').innerText());
    await pressZoom(zoomIn); await settle(); r=await range();
    close((selected-r.start)/(r.end-r.start),0.4,'selected point anchor');
    await page.getByRole('button',{name:'Refresh data',exact:true}).click(); await settle();
    assert.deepEqual(await range(),r,'refresh preserves view');
    await page.getByRole('tab',{name:'活动信息',exact:true}).click(); await settle();
    await page.getByRole('tab',{name:'分数追踪',exact:true}).click(); await settle();
    assert.deepEqual(await range(),r,'returning from info preserves view');
    await page.getByRole('button',{name:'Change event',exact:true}).click(); await settle();
    close((await range()).scale,1,'new event resets view');

    if(width<640) {
      const cdp=await page.context().newCDPSession(page);
      const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2,force:1}))});
      await plot.scrollIntoViewIfNeeded(); box=await plot.boundingBox();
      const y=box.y+90, center=box.x+box.width/2;
      await touch('touchStart',[[1,center-40,y],[2,center+40,y]]);
      for(let i=1;i<=6;i++){await touch('touchMove',[[1,center-40-i*4,y],[2,center+40+i*4,y]]);await page.waitForTimeout(20);}
      await touch('touchEnd',[]); await settle();
      close((await range()).scale,1.6,'pinch retains fractional scale');
      assert.equal(await page.getByTestId('tracker-zoom-scale').innerText(),'1.6×');
      await pressZoom(zoomIn); await settle(); close((await range()).scale,2,'button after pinch');
      await plot.scrollIntoViewIfNeeded(); box=await plot.boundingBox();
      const x=box.x+box.width/2, py=box.y+90;
      const before=await range();
      await touch('touchStart',[[1,x-40,py],[2,x+40,py]]);
      for(let i=1;i<=5;i++){await touch('touchMove',[[1,x-40+i*5,py],[2,x+40+i*5,py]]);await page.waitForTimeout(20);}
      await touch('touchEnd',[[1,x-15,py]]);
      await touch('touchMove',[[1,x+10,py+20]]);
      await touch('touchEnd',[]); await settle();
      const after=await range(); close(after.scale,2,'two-finger pan preserves scale');
      close((before.start-after.start)/(before.end-before.start),25/box.width,'pan follows fingers');
      assert.equal(await page.getByTestId('tracker-hover-tooltip').evaluate(el=>getComputedStyle(el).visibility),'hidden','remaining finger does not select');
      const scrollY=await page.evaluate(()=>scrollY);
      await touch('touchStart',[[1,x,py]]);
      await touch('touchMove',[[1,x+20,py+30]]);
      await touch('touchEnd',[]); await settle();
      assert.deepEqual(await range(),after,'single finger only selects');
      assert.equal(await page.evaluate(()=>scrollY),scrollY,'plot does not scroll the page');
      assert.equal(await page.getByTestId('tracker-hover-tooltip').evaluate(el=>getComputedStyle(el).visibility),'visible');
      const axis=await page.getByTestId('tracker-y-axis').boundingBox();
      const originalY=await page.evaluate(()=>scrollY);
      await touch('touchStart',[[1,axis.x+axis.width/2,axis.y+180]]);
      for(let i=1;i<=5;i++){await touch('touchMove',[[1,axis.x+axis.width/2+i*5,axis.y+180-i*20]]);await page.waitForTimeout(25);}
      await touch('touchEnd',[]); await settle();
      assert.ok(await page.evaluate(()=>scrollY)>originalY+30,'axis-start gesture scrolls even after crossing into plot');
      assert.deepEqual(await range(),after);
      await page.getByRole('button',{name:'Change event',exact:true}).click();await settle();
      await plot.scrollIntoViewIfNeeded();box=await plot.boundingBox();
      const tx=box.x+box.width*0.6,ty=box.y+80;
      const tap=async()=>{await touch('touchStart',[[1,tx,ty]]);await page.waitForTimeout(35);await touch('touchEnd',[]);};
      const doubleTap=async()=>{await tap();await page.waitForTimeout(50);await tap();await settle();};
      assert.ok((await page.locator('[data-tracker-zoom-controls]').boundingBox()).width<4,'touch controls do not occupy chart space');
      for(const expected of [2,4,8,16,32,32]) {await doubleTap();close((await range()).scale,expected,'successive double taps only zoom in');}
      const maxView=await range();
      await tap();await page.waitForTimeout(50);await touch('touchStart',[[1,tx,ty]]);
      await touch('touchMove',[[1,tx,ty+120]]);await page.waitForTimeout(40);
      close((await range()).scale,16,'double tap drag down zooms out continuously');
      await page.waitForTimeout(900);
      assert.equal(await page.getByTestId('tracker-zoom-feedback').getAttribute('data-visible'),'true','feedback stays visible while holding a zoom gesture');
      await touch('touchMove',[[1,tx,ty-60]]);await touch('touchEnd',[]);await settle();
      close((await range()).scale,maxView.scale,'drag up zooms in without a release step');
      await page.waitForTimeout(1000);
      assert.equal(await page.getByTestId('tracker-zoom-feedback').evaluate(el=>getComputedStyle(el).opacity),'0','feedback fades after zoom');
      await touch('touchStart',[[1,tx,ty]]);await touch('touchMove',[[1,tx+15,ty+15]]);await touch('touchEnd',[]);await settle();
      close((await range()).scale,32,'ordinary selection after double tap drag does not zoom');
      await page.getByRole('button',{name:'Change event',exact:true}).click();await settle();
      await plot.scrollIntoViewIfNeeded();box=await plot.boundingBox();
      const rapidTap=async()=>{await touch('touchStart',[[1,box.x+box.width/2,box.y+80]]);await touch('touchEnd',[]);};
      for(let i=0;i<3;i++){await rapidTap();await page.waitForTimeout(45);await rapidTap();await page.waitForTimeout(45);}
      await settle();close((await range()).scale,8,'rapid double taps accumulate unfinished zoom steps');
    } else {
      await plot.scrollIntoViewIfNeeded();box=await plot.boundingBox();
      await page.mouse.move(box.x+box.width*0.4,box.y+70);await page.mouse.wheel(0,-90);await settle();
      close((await range()).scale,1,'wheel before clicking scrolls the page');
      await plot.scrollIntoViewIfNeeded();box=await plot.boundingBox();
      await page.mouse.click(box.x+box.width*0.4,box.y+70);
      const wheelStart=await range(),wheelScroll=await page.evaluate(()=>scrollY);
      const wheelFrames=chart.evaluate(el=>new Promise(done=>{
        const frames=[],until=performance.now()+300;
        const record=now=>{
          frames.push({scale:+el.dataset.zoom,start:+el.dataset.viewStart,end:+el.dataset.viewEnd,
            transform:el.querySelector('.recharts-line-curve').getScreenCTM().a});
          if(now<until) requestAnimationFrame(record);else done(frames);
        };
        requestAnimationFrame(record);
      }));
      await page.mouse.wheel(0,-90);
      const frames=await wheelFrames;
      const wheelView=await range();close(wheelView.scale,Math.exp(0.3),'wheel zooms continuously');
      const intermediates=frames.filter(frame=>frame.scale>1.001&&frame.scale<wheelView.scale-0.001);
      assert.ok(new Set(intermediates.map(frame=>frame.transform)).size>=3,'wheel paints multiple intermediate chart transforms');
      for(const frame of intermediates) close((wheelStart.start+0.4*(wheelStart.end-wheelStart.start)-frame.start)/(frame.end-frame.start),0.4,'wheel anchor stays fixed during easing');
      close((wheelStart.start+0.4*(wheelStart.end-wheelStart.start)-wheelView.start)/(wheelView.end-wheelView.start),0.4,'wheel anchor follows mouse');
      assert.equal(await page.evaluate(()=>scrollY),wheelScroll,'active wheel does not scroll page');
      await page.keyboard.press('Escape');await page.mouse.wheel(0,-90);await settle();
      close((await range()).scale,wheelView.scale,'Escape releases wheel');
      await plot.scrollIntoViewIfNeeded();box=await plot.boundingBox();
      await page.mouse.click(box.x+box.width*0.4,box.y+70);
      await plot.evaluate(el=>{
        const box=el.getBoundingClientRect();
        for(let i=0;i<3;i++) el.dispatchEvent(new WheelEvent('wheel',{deltaY:-90,clientX:box.x+box.width*0.4,cancelable:true}));
      });
      await settle();close((await range()).scale,Math.exp(1.2),'rapid wheel input accumulates unfinished targets');
      const reversal=await plot.evaluate(async el=>{
        const box=el.getBoundingClientRect(),chart=el.closest('[data-testid="tracker-chart"]');
        const wheel=deltaY=>el.dispatchEvent(new WheelEvent('wheel',{deltaY,clientX:box.x+box.width*0.4,cancelable:true}));
        wheel(-120);await new Promise(done=>setTimeout(done,60));
        const before=+chart.dataset.zoom;
        wheel(30);await new Promise(done=>setTimeout(done,50));
        const after=+chart.dataset.zoom;
        await new Promise(done=>setTimeout(done,200));
        return {before,after,final:+chart.dataset.zoom};
      });
      assert.ok(reversal.after<reversal.before,'reversing the wheel immediately zooms out instead of finishing pending zoom-in');
      close(reversal.final,reversal.before*Math.exp(-0.1),'reverse wheel uses the visible scale');
      await page.mouse.wheel(0,-90);
      await page.getByRole('button',{name:'Change event',exact:true}).click();await settle();
      close((await range()).scale,1,'changing event cancels an unfinished wheel animation');
      await pressZoom(zoomIn); await settle();
      await plot.scrollIntoViewIfNeeded(); box=await plot.boundingBox();
      const before=await range();
      await page.mouse.move(box.x+box.width/2,box.y+90);await page.mouse.down();
      await page.mouse.move(box.x+box.width/2+50,box.y+90,{steps:6});await page.mouse.up();await settle();
      const after=await range();close(after.scale,before.scale,'mouse pan scale');
      assert.ok(after.start<before.start,'mouse drag pans');
      await page.emulateMedia({reducedMotion:'reduce'});
      await zoomIn.focus();await page.keyboard.press('Enter');
      close((await range()).scale,4,'keyboard zoom respects reduced motion');
      await plot.scrollIntoViewIfNeeded();box=await plot.boundingBox();
      await page.mouse.click(box.x+box.width*0.4,box.y+70);
      const reducedWheel=await plot.evaluate(async el=>{
        const box=el.getBoundingClientRect();
        el.dispatchEvent(new WheelEvent('wheel',{deltaY:-90,clientX:box.x+box.width*0.4,cancelable:true}));
        await new Promise(requestAnimationFrame);
        return +el.closest('[data-testid="tracker-chart"]').dataset.zoom;
      });
      close(reducedWheel,4*Math.exp(0.3),'wheel applies immediately with reduced motion');
    }
    await chart.scrollIntoViewIfNeeded();
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.getByTestId('tracker-zoom-feedback').evaluate(el=>getComputedStyle(el).transitionDuration),'0s','zoom feedback respects reduced motion');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
    assert.deepEqual(errors,[]);
    if(process.env.CHART_ZOOM_SCREENSHOT_DIR) await page.screenshot({path:resolve(process.env.CHART_ZOOM_SCREENSHOT_DIR,`hhwx-chart-zoom-${width}.png`)});
    console.log(`PASS ${width}: anchors, continuous zoom, input separation, lifecycle, errors and layout`);
    await page.close();
  }
} finally { await browser.close(); await new Promise(done=>server.close(done)); }
