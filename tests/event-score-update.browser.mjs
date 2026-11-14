// Run with node tests/event-score-update.browser.mjs; exercises the real score component with controlled updates.
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
const bundle = await build({
  bundle: true, write: false, platform: "browser", format: "esm", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {TrackerScore} from './src/app/[locale]/bandori/events/_tracker/TrackerScore';
    function App() {
      const [score,setScore]=useState(null), [target,setTarget]=useState(0), [reverse,setReverse]=useState(false);
      const [players,setPlayers]=useState([{uid:1,score:100},{uid:2,score:200}]);
      return <main style={{padding:40}}>
        <div data-latest><TrackerScore key={target} value={score} className="font-bold text-[var(--theme-color-semantic-info-foreground)]">{score??'-'}</TrackerScore></div>
        {(reverse?[...players].reverse():players).map(player=><div key={player.uid} data-player={player.uid}><TrackerScore value={player.score} className="font-bold text-[var(--theme-color-text-default)]">{player.score}</TrackerScore></div>)}
        <button onClick={()=>setScore(100)}>Load</button><button onClick={()=>setScore(value=>(value??0)+10)}>Update</button>
        <button onClick={()=>setScore(value=>value)}>Unchanged</button><button onClick={()=>setScore(null)}>Clear</button>
        <button onClick={()=>{setTarget(value=>value+1);setScore(999);}}>Switch</button>
        <button onClick={()=>setPlayers(players=>players.map(player=>player.uid===1?{...player,score:player.score+10}:player))}>Player</button>
        <button onClick={()=>setReverse(value=>!value)}>Reorder</button>
      </main>;
    }
    createRoot(document.getElementById('root')).render(<App/>);
  `},
});
const css = (await postcss([tailwind()]).process(
  '@import "./src/app/globals.css";\n' + await readFile("src/app/[locale]/bandori/events/events.css", "utf8"),
  { from: resolve("score-update-fixture.css") },
)).css;
const server = createServer((request,response)=>{
  if(request.url==='/app.js') response.setHeader('Content-Type','text/javascript').end(bundle.outputFiles[0].text);
  else if(request.url==='/app.css') response.setHeader('Content-Type','text/css').end(css);
  else response.setHeader('Content-Type','text/html').end('<html data-visual-theme="smile-patrol"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>');
});
await new Promise(done=>server.listen(0,'localhost',done));
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
try {
  for(const width of [393,1440]) {
    const page=await browser.newPage({viewport:{width,height:700},hasTouch:width<640,isMobile:width<640});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://localhost:${server.address().port}`);
    const latest=page.locator('[data-latest] .event-score-update');
    const animations=locator=>locator.evaluate(el=>el.getAnimations().length);
    const finish=locator=>locator.evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished));});
    const click=name=>page.getByRole('button',{name,exact:true}).click();
    assert.equal(await animations(latest),0);
    await click('Load');assert.equal(await animations(latest),0,'initial data does not flash');
    await click('Update');assert.equal(await animations(latest),1,'changed score flashes');
    await latest.evaluate(el=>{window.previousScoreAnimation=el.getAnimations()[0];});
    await click('Update');
    assert.equal(await animations(latest),1,'rapid changes replace the animation');
    assert.equal(await page.evaluate(()=>window.previousScoreAnimation.playState),'idle');
    await finish(latest);assert.equal(await latest.evaluate(el=>getComputedStyle(el).opacity),'0');
    await click('Unchanged');assert.equal(await animations(latest),0);
    await click('Update');await click('Switch');assert.equal(await animations(latest),0,'new target does not flash');
    await click('Clear');await click('Load');assert.equal(await animations(latest),0,'null resets the baseline');
    await click('Player');
    const player1=page.locator('[data-player="1"] .event-score-update');
    assert.equal(await animations(player1),1);
    assert.equal(await animations(page.locator('[data-player="2"] .event-score-update')),0,'unchanged player stays quiet');
    await finish(player1);await click('Reorder');assert.equal(await animations(player1),0,'reordering does not flash');
    await page.emulateMedia({reducedMotion:'reduce',colorScheme:'dark'});
    await click('Update');
    const reduced=await latest.evaluate(el=>{const animation=el.getAnimations()[0];animation.pause();animation.currentTime=250;return {opacity:getComputedStyle(el).opacity,duration:animation.effect.getTiming().duration};});
    assert.deepEqual(reduced,{opacity:'1',duration:500});
    await latest.evaluate(el=>el.getAnimations()[0].play());await finish(latest);
    assert.equal(await latest.evaluate(el=>getComputedStyle(el).opacity),'0');
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}: initial/unchanged/changed scores, restart, target switch, player identity, reduced motion`);
    await page.close();
  }
} finally {await browser.close();await new Promise(done=>server.close(done));}
