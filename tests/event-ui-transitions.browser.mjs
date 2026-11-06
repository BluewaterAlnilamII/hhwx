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
const messages = Object.fromEntries(await Promise.all(["bandori", "comments"].map(async name =>
  [name, JSON.parse(await readFile(`messages/zh-CN/${name}.json`, "utf8"))])));
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, platform: "browser", format: "esm", jsx: "automatic",
  define: { "process.env": '{"NODE_ENV":"production"}' },
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import {memo, useCallback, useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {NextIntlClientProvider} from 'next-intl';
    import {EventViewTabs} from './src/app/[locale]/bandori/events/EventViewTabs';
    import {ReactionChip} from './src/components/comments/CommentReactionChip';
    import {ComparisonControls} from './src/app/[locale]/bandori/events/_tracker/ComparisonControls';
    import {COMPARISON_LINE_COLORS} from './src/app/[locale]/bandori/events/_tracker/constants';
    const noop = () => {};
    const SlowCommit = memo(function SlowCommit({value}) {
      if (window.slowCommits) { const end = performance.now() + 4; while (performance.now() < end) {} }
      return null;
    });
    function Tabs() {
      const [value, setValue] = useState('tracker');
      const change = useCallback(next => {
        window.samplePendingSelection?.();
        setValue(next);
      }, []);
      return <><EventViewTabs value={value} onChange={change} onPreviewChange={noop} plannerOpen={false}>
        {view => <div data-view={view} style={{height: 420, padding: 24}}>
          <h1>{view === 'tracker' ? '分数追踪' : '活动信息'}</h1>
          <input aria-label={view + ' draft'} defaultValue="saved draft" />
        </div>}
      </EventViewTabs>{Array.from({length: 24}, (_,i) => <SlowCommit key={i} value={value} />)}</>;
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
      {location.pathname === '/tabs' ? <Tabs/> : location.pathname === '/reactions' ? <Reaction/> : <Comparisons/>}
    </NextIntlClientProvider>);
  `},
  plugins: [{ name: "fixture-avatar", setup(builder) {
    builder.onResolve({filter: /^@\/components\/account\/AccountCardAvatar$/}, ({path}) => ({path, namespace: "fixture"}));
    builder.onLoad({filter: /.*/, namespace: "fixture"}, () => ({
      contents: "import {createElement} from 'react'; export default () => createElement('span', {style:{display:'inline-block',width:28,height:28}}, '头像');",
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
    await page.goto(`${base}/tabs`);
    await page.getByRole("tab", {name: "活动信息"}).waitFor();
    await page.getByRole("textbox", {name: "tracker draft"}).fill("retained planner draft");
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
    console.log(`PASS ${width}px: tab frames, cancelled/reversed transitions, retained draft, reduced motion, async popup frames, hidden comparison colors`);
  }
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
