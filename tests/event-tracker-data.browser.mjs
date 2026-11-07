// Run with node tests/event-tracker-data.browser.mjs; PLAYWRIGHT_MODULE may point to an existing installation.
// Real data hooks, local HTTP responses and a local live transport; no account or production writes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const messages = { bandori: JSON.parse(await readFile("messages/en/bandori.json", "utf8")) };
const now = Date.now();
const requests = [];
const event = id => ({ eventType: "story", eventName: ["Event " + id, "", "", "Event " + id],
  startAt: [now - 3600000, null, null, now - 3600000], endAt: [now + 3600000, null, null, now + 3600000] });
const bundle = await build({
  bundle: true, write: false, platform: "browser", format: "esm", jsx: "automatic",
  define: { "process.env": '{"NODE_ENV":"production"}' },
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import {useLayoutEffect, useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {NextIntlClientProvider} from 'next-intl';
    import {useTrackerData} from './src/app/[locale]/bandori/events/_tracker/useTrackerData';
    import {useComparisonTrackerData} from './src/app/[locale]/bandori/events/_tracker/useComparisonTrackerData';
    import {useBestdoriPrediction} from './src/app/[locale]/bandori/events/_tracker/useBestdoriPrediction';
    import {useBandoriMusicMaster} from './src/hooks/useBandoriMusicMaster';
    import {useCachedFetch} from './src/hooks/useCachedFetch';
    import {useGameStore} from './src/store/useGameStore';
    const configs = [{id:'comparison',targetType:'event',targetId:2,tier:1000,enabled:true}];
    const monthlyOptions = [];
    useGameStore.setState({userId:'fixture',authReady:true});
    function Probe() {
      const [paused, setPaused] = useState(false), [eventId, setEventId] = useState(1);
      const [needsMusic, setNeedsMusic] = useState(false);
      const tracker = useTrackerData(eventId, 'event', 1000, 0, null, 3, true, paused);
      const comparison = useComparisonTrackerData({enabled:true, paused, configs, events:tracker.allEvents,
        monthlyOptions, alignment:'start', currentStart:tracker.startDate, currentEnd:tracker.endDate,
        liveTarget:tracker.liveTarget, server:3});
      const prediction = useBestdoriPrediction({enabled:true, paused, eventId, tier:1000});
      const refreshable = useCachedFetch('fixture-'+eventId, '/api/fixture?event='+eventId, undefined, {enabled:!paused});
      useBandoriMusicMaster(needsMusic);
      useLayoutEffect(() => { window.probe = {tracker, comparison, prediction, refreshable, paused}; });
      return <><button onClick={() => setPaused(p => !p)}>Pause</button>
        <button onClick={() => setEventId(3)}>Change event</button>
        <button onClick={() => setNeedsMusic(true)}>Need music</button>
        <button onClick={() => useGameStore.setState({userId:null})}>Sign out</button></>;
    }
    createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale="en" timeZone="UTC"
      messages={${JSON.stringify(messages)}}><Probe/></NextIntlClientProvider>);
  `},
  plugins: [{ name: "local-live-transport", setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/(supabase|bandori\/event-tracker\/live-connection)$/ }, ({path}) => ({path, namespace:"fixture"}));
    builder.onLoad({ filter: /.*/, namespace:"fixture" }, ({path}) => ({resolveDir:process.cwd(), contents:
      path.endsWith('/supabase') ? 'export const supabase = {};' : `
        window.listeners = new Set();
        export function subscribeBandoriTrackerLive(subscription, listener) {
          window.listeners.add(listener); return () => window.listeners.delete(listener);
        }`
    }));
  }}],
});
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/app.js') { res.setHeader('Content-Type','text/javascript'); res.end(bundle.outputFiles[0].text); return; }
  if (!url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type','text/html'); res.end('<!doctype html><div id="root"></div><script type="module" src="/app.js"></script>'); return;
  }
  requests.push(req.url);
  const id = Number(url.searchParams.get('event') || 1);
  const payload = url.pathname === '/api/bandori/master/events' ? {success:true,data:{1:event(1),2:event(2),3:event(3)}}
    : url.pathname === '/api/bandori/tracker/data' ? {result:true,cutoffs:[{time:now-60000,ep:id*100}]}
    : url.pathname === '/api/bandori/bestdori-prediction' ? {enabled:true,result:true,predictionPoints:[{time:now+3600000,ep:id*1000}],latestPrediction:id*1000}
    : url.pathname === '/api/bandori/master/music' ? {success:true,data:{}}
    : url.pathname === '/api/fixture' ? {eventId:id} : {success:true,data:{}};
  res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(payload));
});
await new Promise(done => server.listen(0, 'localhost', done));
const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome',headless:true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}`);
  await page.waitForFunction(() => window.probe?.comparison.comparisonLines[0]?.points.length && window.probe?.prediction.status === 'ready' && window.listeners.size === 2 && window.probe.refreshable.data);
  assert.ok(!requests.some(url => url.includes('/master/music')), 'Unused music catalog stays unloaded');
  await page.evaluate(now => {
    for (const listener of window.listeners) listener({server:'cn',namespace:'events',targetId:1,
      event:[{tier:1000,time:now,ep:999}],songs:[]});
  }, now);
  await page.waitForFunction(() => window.probe.tracker.chartData.at(-1)?.ep === 999);
  await page.evaluate(() => { window.beforePause = window.probe; });
  await page.getByText('Pause', {exact:true}).click();
  await page.waitForFunction(() => window.probe.paused && window.listeners.size === 0);
  const requestCount = requests.length;
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.probe.refreshable.refresh(); });
  await page.waitForTimeout(100);
  assert.equal(requests.length, requestCount, 'Hidden views neither refresh nor subscribe');
  assert.deepEqual(await page.evaluate(() => ({
    main: window.beforePause.tracker.chartData === window.probe.tracker.chartData,
    comparisons: window.beforePause.comparison.comparisonLines === window.probe.comparison.comparisonLines,
    prediction: window.beforePause.prediction.predictionPoints === window.probe.prediction.predictionPoints,
    status: window.probe.prediction.status,
  })), {main:true,comparisons:true,prediction:true,status:'ready'});
  await page.getByText('Pause', {exact:true}).click();
  await page.waitForFunction(() => window.listeners.size === 2);
  await page.waitForFunction(() => window.probe.refreshable.refreshing === false);
  assert.equal(await page.evaluate(() => window.probe.tracker.chartData.at(-1).ep), 999);
  await page.getByText('Sign out', {exact:true}).click();
  await page.waitForFunction(() => window.listeners.size === 0 && window.probe.tracker.chartData.at(-1)?.ep === 100);
  await page.getByText('Pause', {exact:true}).click();
  await page.getByText('Change event', {exact:true}).click();
  assert.equal(await page.evaluate(() => window.probe.tracker.chartData.length), 0, 'Another event cannot reuse the old snapshot');
  assert.equal(await page.evaluate(() => window.probe.refreshable.data), null);
  await page.getByText('Pause', {exact:true}).click();
  await page.waitForFunction(() => window.probe.tracker.chartData.at(-1)?.ep === 300);
  await Promise.all([page.waitForResponse('**/api/bandori/master/music'), page.getByText('Need music', {exact:true}).click()]);
  assert.deepEqual(errors, []);
  console.log('PASS: hidden snapshots retain identity, requests/live connections pause, resume and target isolation, deferred music');
} finally { await browser.close(); server.close(); }
