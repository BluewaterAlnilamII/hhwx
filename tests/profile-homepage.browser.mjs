// Exercise the real Next page with request-boundary account fixtures. No account writes leave the browser.
// Start npm run dev first; PLAYWRIGHT_MODULE / CHROME_PATH may point to existing installations.
import { installProfileSession, user, userId } from "./fixtures/profile-session.mjs";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.PROFILE_TEST_ORIGIN || "http://localhost:3000";
const publicUid = Number(process.env.PROFILE_TEST_UID || 10001);
const out = process.env.PROFILE_TEST_OUTPUT;
require("@next/env").loadEnvConfig(fileURLToPath(new URL("..", import.meta.url)), true);
const authUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.ok(authUrl, "Local public Supabase URL is required for the isolated browser session");
const initial = { signature: "今天也想听到喜欢的歌", cover: {cardId:2254,entityServer:null,trainType:"after_training",x:28,y:26}, publicAccounts:true, allowGameIdSearch:true,
  modules:["cards","events","songs"].map(id=>({id,public:true})), accounts:["1000001234","1234567890123456"].map(gameUid=>({server:3,gameUid,public:true,titlesPublic:false})) };
let preferences = structuredClone(initial), persisted = {}, owner = true, username = "Bluewater Alnilam Player", failSave = false, failLoad = false, failAvatar = false;
const avatar = { avatarCardId: 1, avatarCardServer: null, avatarCardTrainType: "normal" };
const gameProfileJson = JSON.stringify({bestdoriProfile:{name:"Picker regression",server:0,compression:"2",data:{cards:{ids:"",levels:[],masters:[],skills:[],eps:[],trains:[],excludes:[]},items:{}}}});
const writes = [], avatarWrites = [], errors = [];
const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
const context = await browser.newContext({viewport:{width:1440,height:1000}});
await installProfileSession(context, authUrl);
const account = ()=>({userId,publicUid,email:user.email,emailVerified:true,username,...avatar,displayDegreeServer:0,displayDegreeId:100,displayDegreeEffectId:null,createdAt:"2026-01-01T00:00:00Z",updatedAt:null,roles:[]});
await context.route("**/api/account/**", async route=>{
  const path = new URL(route.request().url()).pathname;
  if(path==="/api/account/game-profiles/picker-fixture/payload") return route.fulfill({json:{success:true,data:{
    compressed:{storageCodec:"hhwx-profile+gzip+base64-v1",payloadCompressed:gzipSync(gameProfileJson).toString("base64"),payloadSha256:createHash("sha256").update(gameProfileJson).digest("hex"),payloadSize:Buffer.byteLength(gameProfileJson)},
    profile:{id:"picker-fixture",kind:"manual",name:"Picker regression",isEditable:true,updatedAt:"2026-01-01T00:00:00Z"},sectionVersions:{cardsHash:"fixture",itemsHash:"fixture"}
  }}});
  if(path === "/api/account/homepage/settings") {
    assert.equal(route.request().method(),"PATCH");
    const patch = route.request().postDataJSON(); writes.push(patch);
    if(failSave) return route.fulfill({status:500,json:{success:false,error:{code:"PROFILE_SAVE_FAILED",message:"Internal error"}}});
    preferences = {...preferences,...patch};
    persisted = {...persisted,...patch};
    return route.fulfill({json:{success:true,data:persisted}});
  }
  if(path.endsWith("/auth-summary")) return route.fulfill({json:{success:true,data:{userId,username,email:user.email,emailVerified:true}}});
  if(path.endsWith("/profile")) {
    if(route.request().method()==="PATCH") {
      const patch = route.request().postDataJSON(); avatarWrites.push(patch);
      if(failAvatar) return route.fulfill({status:500,json:{success:false}});
      Object.assign(avatar,patch);
    }
    return route.fulfill({json:{success:true,data:account()}});
  }
  if(path.endsWith("/display-degree")) return route.fulfill({json:{success:true,data:{selected:{server:0,degreeId:100,degreeEffectId:null},accounts:[{server:3,gameUid:"1000001234",ownedDegreeIds:[100,212,259],ownedDegreeEffectIds:[]}]}}});
  return route.fulfill({json:{success:true,data:[]}});
});
await context.route(`**/api/users/${publicUid}`, route=>{
  if(failLoad) return route.fulfill({status:500,json:{success:false,error:{code:"PROFILE_READ_FAILED",message:"Failed"}}});
  const bindings = preferences.accounts.flatMap(a=>{
    const visible=preferences.publicAccounts&&a.public;
    return !owner&&!visible?[]:[{server:3,gameUid:a.gameUid,playerName:a.gameUid==="1000001234"?"今天也想听喜欢的歌声":null,ownedDegreeIds:owner||(visible&&a.titlesPublic)?[100,212,259,192,211]:[],ownedDegreeEffectIds:[],public:visible,titlesPublic:visible&&a.titlesPublic}];
  });
  return route.fulfill({json:{success:true,data:{publicUid,username,createdAt:account().createdAt,avatar:{cardId:1,entityServer:null,trainType:"normal"},displayDegree:{server:0,degreeId:100,degreeEffectId:null},signature:preferences.signature,cover:preferences.cover,isOwner:owner,preferences:owner?preferences:null,bindings}}});
});
const page = await context.newPage(); page.on("pageerror",e=>errors.push(e.message));
const go = async()=>{await page.goto(`${origin}/zh-CN/user/${publicUid}`,{waitUntil:"domcontentloaded",timeout:120000});await page.getByRole("heading",{name:username,exact:true}).waitFor({timeout:60000});await page.getByAltText("展示卡面",{exact:true}).waitFor({timeout:60000});await page.waitForFunction(()=>{const i=document.querySelector('img[alt="展示卡面"]');return i?.complete&&i.naturalWidth>0;},null,{timeout:60000});};
const shot=async name=>{if(out){await page.waitForTimeout(2200);await page.waitForFunction(()=>Array.from(document.querySelectorAll('main img')).every(i=>i.complete),null,{timeout:30000});await mkdir(out,{recursive:true});await page.screenshot({path:`${out}/integrated-${name}.png`,fullPage:true});}};
const check=async(name,fn)=>{await fn();console.log(`PASS ${name}`);};
const feedbackNear=async(control,side="left",type="success")=>{
  const feedback=control.locator("..").locator(`[data-action-feedback="${type}"]`);await feedback.waitFor();
  const state=control.locator("xpath=preceding-sibling::span[@aria-hidden='true']");
  const action=await control.boundingBox(), notice=await feedback.boundingBox();
  const leftEdge=await state.count() ? (await state.boundingBox()).x : action.x;
  assert.ok(Math.abs(action.y+action.height/2-notice.y-notice.height/2)<1,"feedback follows the action's vertical center");
  assert.ok(Math.abs((side==="left" ? leftEdge-notice.x-notice.width : notice.x-action.x-action.width)-8)<1,"feedback sits 8px beside the control and its visible state");
  assert.ok(notice.x>=0&&notice.x+notice.width<=page.viewportSize().width,"feedback stays inside the viewport");
};
try {
  await check("the retired homepage write address has no PATCH handler", async () => {
    const response = await context.request.patch(origin + "/api/account/homepage", { data: {} });
    assert.ok([404, 405].includes(response.status()));
  });
  await check("account menu opens the personal homepage above Account Center",async()=>{
    await page.goto(origin+"/account",{waitUntil:"domcontentloaded"});
    await page.getByRole("button",{name:"打开账户菜单"}).click();
    const link=page.getByRole("link",{name:"个人主页",exact:true});
    await link.waitFor();assert.equal(await link.getAttribute("href"),`/user/${publicUid}`);
    assert.equal(await link.evaluate(el=>el.nextElementSibling.getAttribute("href")),"/account");
    await link.click();await page.waitForURL("**/user/"+publicUid);
    await page.getByRole("heading",{name:username,exact:true}).waitFor();
    assert.equal(await link.count(),0);
  });
  await page.getByAltText("展示卡面",{exact:true}).waitFor({timeout:60000});
  await page.waitForFunction(()=>{const i=document.querySelector('img[alt="展示卡面"]');return i?.complete&&i.naturalWidth>0;},null,{timeout:60000});
  await check("overlapping saves update both fields and preserve a reopened picker draft", async () => {
    const avatarButton = page.getByRole("button", {name:"选择头像", exact:true});
    const titleButton = page.getByRole("button", {name:"选择展示称号", exact:true});
    const dialog = page.getByRole("dialog");
    const endpoint = /\/api\/account\/(profile|display-degree)$/;
    for (const delayed of ["profile", "display-degree"]) {
      await go();
      const originalAvatar = await avatarButton.locator("img").getAttribute("src");
      const originalTitle = await titleButton.getByRole("img").getAttribute("aria-label");
      let selectedTitle;
      const gate = Promise.withResolvers();
      await page.route(endpoint, async route => {
        const request = route.request();
        if (request.method() !== "PATCH") return route.fallback();
        const kind = new URL(request.url()).pathname.split("/").pop();
        const data = kind === "profile" ? {...account(), ...request.postDataJSON()} : request.postDataJSON();
        if (kind === delayed) await gate.promise;
        await route.fulfill({json:{success:true, data}});
      });
      try {
        for (const kind of [delayed, delayed === "profile" ? "display-degree" : "profile"]) {
          if (kind === "profile") {
            await avatarButton.click();
            await dialog.getByRole("searchbox").fill("2254");
            await dialog.getByRole("searchbox").press("Enter");
            await dialog.locator('[data-card-id="2254"]').click();
          } else {
            await titleButton.click();
            const option = dialog.locator('button[aria-pressed="false"]').filter({has:page.getByRole("img")}).last();
            selectedTitle = await option.getByRole("img").getAttribute("aria-label");
            assert.notEqual(selectedTitle, originalTitle);
            await option.click();
          }
          const sent = page.waitForRequest(r => r.method() === "PATCH" && r.url().endsWith("/" + kind));
          await dialog.getByRole("button", {name:kind === "profile" ? "保存头像" : "保存称号", exact:true}).click();
          await sent;
          if (kind === delayed) await page.keyboard.press("Escape");
          await dialog.waitFor({state:"detached"});
        }
        let newDraft;
        if (delayed === "profile") {
          await avatarButton.click();
          await dialog.getByRole("searchbox").fill("2255");
          await dialog.getByRole("searchbox").press("Enter");
          newDraft = dialog.locator('[data-card-id="2255"]');
        } else {
          await titleButton.click();
          newDraft = dialog.locator('button[aria-pressed]').filter({has:page.getByRole("img")}).first();
        }
        await newDraft.click();
        gate.resolve();
        await page.waitForFunction(({originalAvatar, selectedTitle}) => {
          const avatar = document.querySelector('button[aria-label="选择头像"] img')?.getAttribute("src");
          const title = document.querySelector('button[aria-label="选择展示称号"] [role="img"]')?.getAttribute("aria-label");
          return avatar && avatar !== originalAvatar && title === selectedTitle;
        }, {originalAvatar, selectedTitle});
        assert.equal(await newDraft.getAttribute("aria-pressed"), "true", "The earlier save leaves the reopened dialog and its draft intact");
        await page.keyboard.press("Escape");
        await avatarButton.click();
        await dialog.getByRole("searchbox").fill("2254");
        await dialog.getByRole("searchbox").press("Enter");
        await dialog.locator('[data-card-id="2254"][aria-pressed="true"]').waitFor({state:"attached"});
        await page.keyboard.press("Escape");
      } finally {
        gate.resolve();
        await page.unroute(endpoint);
      }
    }
    await go();
  });
  await check("returning from details or settings reuses the homepage favorites", async () => {
    const url = "**/api/bandori/favorites?profile=" + publicUid;
    let reads = 0;
    await page.route(url, route => {
      reads++;
      return route.fulfill({json:{success:true,data:[{kind:"songs",items:[{target:"1",normalArt:false}]}]}});
    });
    try {
      await go();
      const song = page.getByRole("tabpanel").locator('[data-song="1"]');
      await song.waitFor();
      const initialReads = reads;
      for (const name of ["资料", "设置"]) {
        await page.getByRole("tab", {name, exact:true}).click();
        assert.equal(await song.count(), 0);
        await page.getByRole("tab", {name:"主页", exact:true}).click();
        await song.waitFor();
        assert.equal(reads, initialReads);
      }
    } finally { await page.unroute(url); }
  });
  await check("event time advances on return without polling or reloading favorites", async () => {
    const tab = await context.newPage();
    const base = Date.now();
    let reads = 0;
    try {
      await tab.clock.install({time:new Date(base)});
      await tab.route("**/api/bandori/master/events", route => route.fulfill({json:{success:true,data:{
        329: {eventName:["Clock test"], startAt:[base + 120000], endAt:[base + 240000]},
      }}}));
      await tab.route("**/api/bandori/favorites?profile=" + publicUid, route => {
        reads++;
        return route.fulfill({json:{success:true,data:[{kind:"events",items:[{target:"jp:329",normalArt:false}]}]}});
      });
      await tab.goto(origin + "/user/" + publicUid);
      const event = tab.locator('[data-event="jp:329"]');
      await event.getByText("未开始",{exact:true}).waitFor();
      const initialReads = reads;
      await tab.clock.fastForward(125000);
      assert.equal(await event.getByText("未开始",{exact:true}).count(),1);
      await tab.getByRole("tab",{name:"资料",exact:true}).click();
      await tab.getByRole("tab",{name:"主页",exact:true}).click();
      await event.getByText("进行中",{exact:true}).waitFor();
      await tab.clock.fastForward(125000);
      assert.equal(await event.getByText("进行中",{exact:true}).count(),1);
      await tab.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await event.getByText("已结束",{exact:true}).waitFor();
      assert.equal(reads, initialReads);
    } finally { await tab.close(); }
  });
  await check("picker stars update both open homepages, including a read already in flight", async () => {
    const path = "**/api/bandori/favorites**";
    const other = await context.newPage();
    let release;
    const hold = new Promise(resolve => { release = resolve; });
    let groupReads = 0, keyReads = 0, savedKey;
    await context.route(path, async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.searchParams.has("profile")) {
        if (++groupReads === 2) await hold;
        return route.fulfill({json:{success:true,data:[]}});
      }
      if (url.searchParams.has("view")) { keyReads++; return route.fulfill({json:{success:true,data:[]}}); }
      assert.ok(["PUT","DELETE"].includes(request.method()));
      savedKey = url.pathname.split("/").at(-1);
      return route.fulfill({json:{success:true,data:true}});
    });
    try {
      await Promise.all([page.waitForResponse(r => r.url().includes("favorites?profile=")), go()]);
      const pending = other.waitForRequest(req => req.url().includes("favorites?profile="));
      await other.goto(origin + "/user/" + publicUid, {waitUntil:"domcontentloaded"});
      await pending;
      await page.getByLabel("封面选项",{exact:true}).click();
      await page.getByRole("button",{name:"选择卡面",exact:true}).click();
      const tile = page.getByRole("dialog").locator("[data-card-id]").first();
      await tile.hover();
      const add = page.locator('button[data-compact=true][aria-pressed=false]').last();
      await add.click();
      await page.locator('button[data-compact=true][aria-pressed=true]').last().waitFor();
      const target = savedKey.slice("cards:".length);
      await page.getByRole("button",{name:"取消",exact:true}).click();
      const card = '[data-card="' + target + '"]';
      await page.locator(card).waitFor();
      release();
      await other.locator(card).waitFor();
      await other.locator(card).hover();
      await other.locator(card).getByRole("button",{name:"取消收藏",exact:true}).click();
      await other.locator(card).waitFor({state:"detached"});
      await page.locator(card).waitFor({state:"detached"});
      assert.equal(groupReads,2);
      assert.equal(keyReads,0);
    } finally {
      release(); await other.close(); await context.unroute(path);
    }
  });
  await check("a fresh owner collection corrects an already loaded detail star", async () => {
    const tab = await context.newPage();
    let keyReads = 0;
    try {
      await tab.route("**/api/bandori/favorites?view=keys", route => {
        keyReads++;
        return route.fulfill({json:{success:true,data:["cards:1"]}});
      });
      await tab.route("**/api/bandori/favorites?profile=" + publicUid, route => route.fulfill({json:{success:true,data:[]}}));
      await tab.goto(origin + "/bandori/cards/1");
      await tab.locator('button[data-detail=true][aria-pressed=true]').waitFor();
      await tab.getByRole("button",{name:"打开账户菜单"}).click();
      await Promise.all([
        tab.waitForResponse(r => r.url().includes("favorites?profile=")),
        tab.getByRole("link",{name:"个人主页",exact:true}).click(),
      ]);
      await tab.locator("#profile-panel-home:empty").waitFor({state:"attached"});
      await tab.goBack();
      await tab.locator('button[data-detail=true][aria-pressed=false][aria-disabled=false]').waitFor();
      assert.equal(keyReads,1);
    } finally { await tab.close(); }
  });
  await check("loading a display title keeps the header still and reveals only the artwork",async()=>{
    for(const width of [390,1440]){
      await page.setViewportSize({width,height:900});
      let release;
      const gate=new Promise(resolve=>{release=resolve;});
      const url="**/api/bandori/master/degrees";
      await page.route(url,async route=>{await gate;await route.continue();});
      const header=page.locator("main header"),name=header.getByRole("heading",{name:username});
      const choose=header.getByRole("button",{name:"选择展示称号"});
      try {
        await Promise.all([page.waitForRequest(url),go()]);
        await header.getByRole("button",{name:"选择头像"}).waitFor();
        assert.equal(await choose.count(),0);
        assert.equal(await header.getByText("选择展示称号",{exact:true}).count(),0);
        const before=await Promise.all([header.boundingBox(),name.boundingBox()]);
        release();await choose.getByRole("img").waitFor();
        assert.deepEqual(await Promise.all([header.boundingBox(),name.boundingBox()]),before);
      } finally {release();await page.unroute(url);}
    }
  });
  await check("unset and unavailable covers use the default artwork and its own crop",async()=>{
    const image=page.getByAltText("展示卡面",{exact:true});
    const customSrc=await image.getAttribute("src");
    preferences.cover=null;
    await go();
    const defaultSrc=await image.getAttribute("src");
    assert.notEqual(defaultSrc,customSrc);
    const position=await image.evaluate(el=>el.style.objectPosition);
    assert.match(position,/^50% 33\.111\d*%$/);
    preferences.cover=structuredClone(initial.cover);
    const rejectImage=route=>route.fulfill({status:404,body:""});
    await page.route(customSrc,rejectImage);
    await go();
    assert.equal(await image.getAttribute("src"),defaultSrc);
    assert.equal(await image.evaluate(el=>el.style.objectPosition),position);
    const height=(await page.locator("main header").boundingBox()).height;
    await page.route(defaultSrc,rejectImage);
    const failed=page.waitForResponse(r=>r.url()===defaultSrc && r.status()===404);
    await page.reload();await failed;await image.waitFor({state:"detached"});
    assert.equal((await page.locator("main header").boundingBox()).height,height);
    assert.equal(await page.locator('main header [class*="backdrop"] [aria-busy=true]').count(),0);
    assert.equal(writes.length,0);
    await page.unroute(customSrc,rejectImage);await page.unroute(defaultSrc,rejectImage);
    await go();assert.equal(await image.getAttribute("src"),customSrc);
  });
  await check("owner gets edit feedback without moving the artwork or signature",async()=>{
    const header=page.locator("main header");
    for(const label of ["选择头像","选择展示称号"]){
      const trigger=header.getByRole("button",{name:label,exact:true});
      const bounds=await trigger.boundingBox();
      await trigger.hover();
      await page.waitForFunction(el=>getComputedStyle(el.lastElementChild).opacity==="1",await trigger.elementHandle());
      const glyph=await trigger.locator("svg").last().boundingBox();
      assert.ok(Math.abs((bounds.x+bounds.width/2)-(glyph.x+glyph.width/2))<1 && Math.abs((bounds.y+bounds.height/2)-(glyph.y+glyph.height/2))<1);
      assert.deepEqual(await trigger.boundingBox(),bounds);
      if(out){await mkdir(out,{recursive:true});await header.screenshot({path:`${out}/hover-${label}.png`});}
    }
    const signature=header.getByRole("textbox",{name:"个性签名",exact:true});
    const fieldBounds=await signature.boundingBox();
    for(const colorScheme of ["light","dark"]){
      await page.emulateMedia({colorScheme});
      await signature.hover();
      await page.waitForFunction(el=>getComputedStyle(el).backgroundColor!=="rgba(0, 0, 0, 0)",await signature.elementHandle());
      assert.equal(await signature.evaluate(el=>getComputedStyle(el).cursor),"text");
      await signature.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
      const hoverColor=await signature.evaluate(el=>getComputedStyle(el).backgroundColor);
      if(out) await header.screenshot({path:`${out}/hover-signature-${colorScheme}.png`});
      await signature.click();
      const field=header.getByRole("textbox",{name:"个性签名"});
      assert.deepEqual(await field.boundingBox(),fieldBounds);
      assert.notEqual(await field.evaluate(el=>getComputedStyle(el).backgroundColor),hoverColor);
      await field.press("Escape");
      await field.press("Tab");
    }
    await page.emulateMedia({colorScheme:"light"});
  });
  await check("first signature click places the caret and width is independent of the text",async()=>{
    const field=page.getByRole("textbox",{name:"个性签名",exact:true});
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:900});
      const bounds=await field.boundingBox();
      const text=await field.inputValue();
      assert.ok(bounds.width>=(width===1440?550:width-52),"signature uses the available writing space");
      const x=await field.evaluate(el=>{
        const style=getComputedStyle(el),ctx=document.createElement("canvas").getContext("2d");
        ctx.font=style.font;
        return parseFloat(style.paddingInlineStart)+ctx.measureText(el.value.slice(0,3)).width;
      });
      await field.click({position:{x,y:12}});
      assert.equal(await field.evaluate(el=>el.selectionStart),3);
      await page.keyboard.insertText("♪");assert.equal(await field.inputValue(),text.slice(0,3)+"♪"+text.slice(3));
      for(const value of ["","短","一行较长的个性签名".repeat(15)]){
        await field.fill(value);assert.deepEqual(await field.boundingBox(),bounds);
      }
      await field.press("Escape");assert.equal(await field.inputValue(),text);
      await field.press("Tab");
      await field.click({position:{x:bounds.width-8,y:12}});
      assert.equal(await field.evaluate(el=>el.selectionStart),text.length);
      await field.press("Tab");
    }
    await page.setViewportSize({width:1440,height:1000});
  });
  await check("first signature write preserves unsaved bound-account defaults",async()=>{
    const input=page.getByRole("textbox",{name:"个性签名",exact:true});
    await input.fill("今天也想听到喜欢的歌！");await input.press("Tab");await page.getByText("已保存",{exact:true}).waitFor();
    await page.getByRole("tab",{name:"设置",exact:true}).click();assert.equal(await page.getByRole("switch",{name:"公开1000001234",exact:true}).count(),1);
    // The second binding was added after the first account's privacy was saved.
    persisted.accounts = initial.accounts.slice(0, 1);
    await input.fill("新绑定账号仍然可见");
    const saved = page.waitForResponse("**/api/account/homepage/settings");
    await input.press("Enter");
    await saved;
    await page.waitForFunction(() => !document.querySelector("main header input").readOnly);
    assert.equal(await page.getByRole("switch",{name:"公开1234567890123456",exact:true}).count(),1);
  });
  await check("clicking an account switch while leaving the signature saves both actions independently",async()=>{
    const field = page.getByRole("textbox", {name:"个性签名"});
    const first = page.getByRole("switch", {name:"公开1000001234", exact:true});
    const url = "**/api/account/homepage/settings";
    for (const failSignature of [false, true]) {
      let release;
      const delayed = new Promise(resolve => { release = resolve; });
      await page.route(url, async route => {
        if (!("signature" in route.request().postDataJSON())) return route.fallback();
        await delayed;
        return failSignature ? route.fulfill({status:500,json:{success:false}}) : route.fallback();
      });
      try {
        const draft = failSignature ? "保留这段草稿" : "签名与开关分别保存";
        const before = await first.getAttribute("aria-checked");
        await field.fill(draft);
        await first.click();
        await feedbackNear(first);
        const after = await first.getAttribute("aria-checked");
        assert.notEqual(after, before);
        release();
        await field.locator("..").locator(`[data-action-feedback="${failSignature ? "error" : "success"}"]`).waitFor();
        assert.equal(await first.getAttribute("aria-checked"), after);
        assert.equal(preferences.accounts[0].public, after === "true");
        assert.equal(await field.inputValue(), draft);
        assert.equal(preferences.signature === draft, !failSignature);
      } finally {
        release();
        await page.unroute(url);
      }
    }
    await go();
    await page.getByRole("tab",{name:"设置",exact:true}).click();
    assert.equal(await first.getAttribute("aria-checked"), "true");
    assert.equal(await field.inputValue(), "签名与开关分别保存");
  });
  await check("a late privacy response preserves a newer confirmed signature", async () => {
    const field = page.getByRole("textbox", {name:"个性签名"});
    const first = page.getByRole("switch", {name:"公开1000001234", exact:true});
    const url = "**/api/account/homepage/settings";
    let release;
    const holdReply = new Promise(resolve => { release = resolve; });
    await page.route(url, async route => {
      const patch = route.request().postDataJSON();
      if (!patch.accounts) return route.fallback();
      writes.push(patch);
      preferences = {...preferences, ...patch};
      persisted = {...persisted, ...patch};
      const reply = persisted;
      await holdReply;
      return route.fulfill({json:{success:true,data:reply}});
    });
    try {
      const pending = page.waitForRequest(url);
      await first.click();
      await pending;
      await field.fill("较晚保存的签名");
      await field.press("Enter");
      await field.locator("..").getByText("已保存",{exact:true}).waitFor();
      release();
      await feedbackNear(first);
      assert.equal(await field.inputValue(), "较晚保存的签名");
      assert.equal(await first.getAttribute("aria-checked"), "false");
    } finally {
      release();
      await page.unroute(url);
    }
    await first.click();
    await page.waitForFunction(() => !document.querySelector('[aria-label="公开1000001234"]').disabled);
  });
  await check("weighted signature limit preserves the suffix and waits for IME confirmation",async()=>{
    const field=page.getByRole("textbox",{name:"个性签名",exact:true});
    await field.fill("A"+"字".repeat(38)+"Z");
    await field.press("Home");await field.press("ArrowRight");
    await page.keyboard.insertText("猫狗鸟");
    assert.equal(await field.inputValue(),"A猫"+"字".repeat(38)+"Z");
    assert.equal(await field.evaluate(el=>el.selectionStart),2);
    await field.fill("a".repeat(79));await field.press("End");
    const cdp=await context.newCDPSession(page);
    try {
      await cdp.send("Input.imeSetComposition",{text:"猫",selectionStart:1,selectionEnd:1});
      assert.equal(await field.inputValue(),"a".repeat(79)+"猫");
      await cdp.send("Input.insertText",{text:"猫"});
      assert.equal(await field.inputValue(),"a".repeat(79));
    } finally {await cdp.detach();}
    await page.keyboard.insertText("ab");assert.equal(await field.inputValue(),"a".repeat(80));
    await field.press("Escape");assert.equal(await field.inputValue(),preferences.signature);
  });
  await check("three-level switches retain child preferences",async()=>{
    await page.getByRole("tab",{name:"设置",exact:true}).click();
    const master=page.getByRole("switch",{name:"公开绑定账号",exact:true});
    const first=page.getByRole("switch",{name:"公开1000001234",exact:true});
    const title=page.getByRole("switch",{name:"公开账号 1000001234 的称号",exact:true});
    const lookup=page.getByRole("switch",{name:"允许通过游戏ID搜索到网站账号",exact:true});
    const heading=page.getByRole("tabpanel").getByRole("heading",{name:"绑定账号",exact:true});
    const lookupLabel=page.getByText("允许通过游戏ID搜索到网站账号",{exact:true});
    const stateOf=control=>control.evaluate(el=>{
      const state=el.previousElementSibling;
      if(!state) return null;
      const gap=el.getBoundingClientRect().left-state.getBoundingClientRect().right;
      if(Math.abs(gap-8)>0.5) throw new Error(`Expected 8px before switch, got ${gap}`);
      return state.querySelector("svg") ? state.title : state.textContent;
    });
    assert.equal(await stateOf(lookup),null);
    assert.equal(await stateOf(master),"公开");assert.equal(await stateOf(title),"私密");
    assert.equal((await lookupLabel.boundingBox()).x,(await heading.boundingBox()).x);
    assert.equal((await lookup.boundingBox()).x,(await master.boundingBox()).x);
    assert.deepEqual(await page.getByRole("switch").evaluateAll(nodes=>nodes.map(n=>n.getAttribute("aria-checked"))),["true","true","true","true","true","true","false","true","false"]);
    await lookup.click();await feedbackNear(lookup);
    assert.deepEqual(writes.at(-1),{allowGameIdSearch:false});
    await go();await page.getByRole("tab",{name:"设置",exact:true}).click();
    assert.equal(await lookup.getAttribute("aria-checked"),"false");
    await title.click(); await feedbackNear(title);
    await master.click();await page.waitForFunction(()=>document.querySelector('[role="switch"][aria-label="公开1000001234"]')?.hasAttribute("disabled"));
    await feedbackNear(master);
    assert.equal(await stateOf(master),"私密");assert.equal(await stateOf(first),"私密");assert.equal(await stateOf(title),"私密");
    assert.equal(await first.getAttribute("aria-checked"),"false"); assert.equal(await title.isDisabled(),true);
    assert.equal(await lookup.isDisabled(),true);
    assert.equal(preferences.accounts[0].titlesPublic,true);
    await master.click(); await first.waitFor(); await page.waitForTimeout(150);
    assert.equal(await first.getAttribute("aria-checked"),"true");assert.equal(await title.getAttribute("aria-checked"),"true");
    assert.equal(await stateOf(title),"公开");
    assert.equal(await lookup.isEnabled(),true);assert.equal(await lookup.getAttribute("aria-checked"),"false");
    await page.setViewportSize({width:320,height:900});
    const beforeLookup=await lookup.boundingBox();
    failSave=true; await lookup.click(); await feedbackNear(lookup,"left","error"); failSave=false;
    const notice=await page.locator('[data-action-feedback="error"]').boundingBox();
    const labelBounds=await lookupLabel.boundingBox();
    assert.ok(notice.x>=labelBounds.x+labelBounds.width,"save feedback does not cover the lookup label");
    assert.deepEqual(await lookup.boundingBox(),beforeLookup,"wrapping the label does not move the switch");
    assert.equal(await lookup.getAttribute("aria-checked"),"false");
    await page.setViewportSize({width:1440,height:1000});
    await first.click();await page.waitForTimeout(150); assert.equal(await title.isDisabled(),true);
    await feedbackNear(first);
    await first.click();await page.waitForTimeout(150);assert.equal(await title.getAttribute("aria-checked"),"true");
    await shot("settings-desktop");
  });
  await check("signature editing keeps height and failed input",async()=>{
    const header=page.locator("main header");const before=await header.boundingBox();
    const input=page.getByRole("textbox",{name:"个性签名",exact:true});
    await input.click();
    assert.equal((await header.boundingBox()).height,before.height);
    await input.fill("保存失败后仍然保留的签名");failSave=true;await input.press("Enter");await page.getByText("保存失败",{exact:true}).waitFor();
    assert.equal(await input.inputValue(),"保存失败后仍然保留的签名"); assert.equal((await header.boundingBox()).height,before.height);
    const feedback=await page.getByRole("alert").filter({hasText:"保存失败"}).boundingBox();const fieldBounds=await input.boundingBox();
    assert.equal(feedback.x,fieldBounds.x);assert.equal(feedback.y,fieldBounds.y+fieldBounds.height+4);
    assert.equal(await input.evaluate(el=>el===document.activeElement),true);
    const signatureSaved = input.locator("..").getByText("已保存",{exact:true});
    failSave=false;await page.keyboard.press("Enter");await signatureSaved.waitFor();
    const saved=await signatureSaved.locator("..").boundingBox();
    assert.equal(saved.x,fieldBounds.x);assert.equal(saved.y,fieldBounds.y+fieldBounds.height+4);
    await input.fill("不应保存");await input.press("Escape");
    assert.equal(await input.evaluate(el=>el===document.activeElement),true);
    assert.equal(await input.inputValue(),"保存失败后仍然保留的签名");
    assert.equal(preferences.signature,"保存失败后仍然保留的签名");
  });
  await check("module and account order save without an extra confirmation",async()=>{
    const drag=page.getByRole("button",{name:"调整收藏的卡牌的顺序",exact:true});
    await drag.focus();await drag.press("Space");await page.waitForTimeout(100);await drag.press("ArrowDown");await page.waitForTimeout(100);await drag.press("Space");
    await page.waitForTimeout(200);assert.deepEqual(preferences.modules.map(m=>m.id),["events","cards","songs"]);
    await feedbackNear(drag,"right");
    assert.equal(await drag.evaluate(el=>el===document.activeElement),true,"focus follows the reordered module");
    const accountDrag=page.getByRole("button",{name:"调整1000001234的顺序",exact:true});
    await accountDrag.focus();await accountDrag.press("Space");await page.waitForTimeout(100);await accountDrag.press("ArrowDown");await page.waitForTimeout(100);await accountDrag.press("Space");
    await page.waitForTimeout(200);assert.deepEqual(preferences.accounts.map(a=>a.gameUid),["1234567890123456","1000001234"]);
    await feedbackNear(accountDrag,"right");
    assert.equal(await accountDrag.evaluate(el=>el===document.activeElement),true,"focus follows the reordered account");
    failSave=true;await page.getByRole("switch",{name:"公开收藏的歌曲",exact:true}).click();await page.getByText("保存失败",{exact:true}).waitFor();
    await feedbackNear(page.getByRole("switch",{name:"公开收藏的歌曲",exact:true}),"left","error");
    assert.equal(await page.getByRole("switch",{name:"公开收藏的歌曲",exact:true}).getAttribute("aria-checked"),"true");failSave=false;
  });
  await check("profile and tracker share outer edges and settings fit long game IDs",async()=>{
    const tracker=await context.newPage();
    try {
      await tracker.goto(origin+"/zh-CN/bandori/events",{waitUntil:"domcontentloaded"});
      const reference=tracker.locator(".event-page > div").first();
      await reference.waitFor();
      const panel=page.getByRole("tabpanel");
      const id=panel.getByText("1234567890123456",{exact:true});
      const control=panel.getByRole("switch",{name:"公开1234567890123456",exact:true});
      for(const width of [320,390,620,789,1024,1440,1920]){
        await Promise.all([page,tracker].map(p=>p.setViewportSize({width,height:900})));
        const [profileBox,trackerBox,idBox,switchBox]=await Promise.all([page.locator("main header"),reference,id,control].map(el=>el.boundingBox()));
        assert.ok(Math.abs(profileBox.x-trackerBox.x)<1 && Math.abs(profileBox.width-trackerBox.width)<1,`page edges at ${width}px`);
        assert.ok(idBox.x+idBox.width<switchBox.x,`bound game ID fits before the switch at ${width}px`);
      }
    } finally {await tracker.close();}
  });
  await check("switch feedback has no layout shift at desktop and mobile widths",async()=>{
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:900});
      const control=page.getByRole("switch",{name:"公开账号 1000001234 的称号",exact:true});
      await control.scrollIntoViewIfNeeded();const before=await page.getByRole("tabpanel").boundingBox();
      await control.click();await feedbackNear(control);
      assert.equal((await page.getByRole("tabpanel").boundingBox()).height,before.height);
      if(out) await page.screenshot({path:`${out}/feedback-${width}.png`,fullPage:true});
      await control.click();await feedbackNear(control);
    }
    await page.setViewportSize({width:1440,height:1000});
  });
  await check("cover position cancel and save",async()=>{
    await page.getByLabel("封面选项",{exact:true}).click();await page.getByRole("button",{name:"调整位置",exact:true}).click();
    const area=page.getByRole("group",{name:"调整位置",exact:true}); const before=structuredClone(preferences.cover);
    const box=await area.boundingBox();const image=page.getByAltText("展示卡面",{exact:true});const position=await image.evaluate(el=>el.style.objectPosition);
    const imageRect=await image.boundingBox();const aim=await page.locator("main .lucide-crosshair").boundingBox();assert.ok(Math.abs(aim.y+aim.height/2-imageRect.y-imageRect.height/2)<1,"reticle uses the actual image rectangle");
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+25,{steps:5});await page.mouse.up();
    assert.notEqual(await image.evaluate(el=>el.style.objectPosition),position);
    await area.press("Escape");await page.getByLabel("封面选项",{exact:true}).click();await page.getByRole("button",{name:"调整位置",exact:true}).click();
    await area.press("ArrowDown");await page.getByRole("button",{name:"取消",exact:true}).click(); assert.deepEqual(preferences.cover,before);
    await page.getByLabel("封面选项",{exact:true}).click();await page.getByRole("button",{name:"调整位置",exact:true}).click();
    await area.press("ArrowDown");await page.getByRole("button",{name:"保存",exact:true}).click();await area.waitFor({state:"detached"});assert.equal(preferences.cover.y,before.y+2);
    await page.getByLabel("封面选项",{exact:true}).click();await page.getByRole("button",{name:"选择卡面",exact:true}).click();
    await page.getByRole("dialog").waitFor();await page.getByRole("dialog").getByRole("button",{name:"取消",exact:true}).click();await page.getByRole("dialog").waitFor({state:"detached"});
    await page.getByLabel("封面选项",{exact:true}).and(page.locator(":focus")).waitFor({timeout:3000});
    await page.getByRole("button",{name:"选择展示称号",exact:true}).click();await page.getByRole("dialog").waitFor();
    await page.getByRole("dialog").getByRole("button",{name:/1000001234/}).waitFor();await page.setViewportSize({width:390,height:900});await shot("title-picker-mobile");await page.keyboard.press("Escape");await page.getByRole("dialog").waitFor({state:"detached"});await page.setViewportSize({width:1440,height:1000});
    await page.getByRole("button",{name:"选择头像",exact:true}).click();await page.getByRole("dialog").waitFor();await page.keyboard.press("Escape");await page.getByRole("dialog").waitFor({state:"detached"});
  });
  await check("avatar and cover share dialog geometry, scrolling and action styles",async()=>{
    const openCover=async()=>{await page.getByLabel("封面选项",{exact:true}).click();await page.getByRole("button",{name:"选择卡面",exact:true}).click();};
    const measure=async()=>{
      const dialog=page.getByRole("dialog");await dialog.locator("[data-card-id]").first().waitFor({timeout:60000});
      await dialog.locator("[data-card-id]").first().click();
      await page.waitForTimeout(180);
      return dialog.evaluate(el=>{
        const [header,body,footer]=el.children;
        const box=el.getBoundingClientRect(), button=footer.querySelector(".hhwx-action-accent"), buttonStyle=getComputedStyle(button);
        const beforeHeader=header.getBoundingClientRect().y,beforeFooter=footer.getBoundingClientRect().y;
        body.scrollTop=body.scrollHeight;
        const result={width:box.width,x:box.x,y:box.y,bottom:box.bottom,height:box.height,headerHeight:header.getBoundingClientRect().height,
          padding:getComputedStyle(body).padding,footerHeight:footer.getBoundingClientRect().height,buttonHeight:button.getBoundingClientRect().height,
          buttonBackground:buttonStyle.backgroundColor,buttonColor:buttonStyle.color,buttonRadius:buttonStyle.borderRadius,
          scrollable:body.scrollHeight>body.clientHeight,scrolled:body.scrollTop>0,
          headerMovement:header.getBoundingClientRect().y-beforeHeader,footerMovement:footer.getBoundingClientRect().y-beforeFooter};
        body.scrollTop=0;return result;
      });
    };
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:900});
      await page.getByRole("button",{name:"选择头像",exact:true}).click();const a=await measure();await shot(`avatar-picker-${width}`);
      await page.keyboard.press("Escape");await page.getByRole("dialog").waitFor({state:"detached"});
      await page.getByRole("button",{name:"选择头像",exact:true}).and(page.locator(":focus")).waitFor({timeout:3000});
      await openCover();const c=await measure();await shot(`cover-picker-${width}`);
      for(const key of ["width","headerHeight","padding","buttonHeight","buttonBackground","buttonColor","buttonRadius"]) assert.equal(c[key],a[key],`shared enabled-control ${key} at ${width}px`);
      for(const metrics of [a,c]) {
        assert.ok(metrics.x>=0&&metrics.x+metrics.width<=width&&metrics.y>=0&&metrics.bottom<=900,"dialog fits viewport");
        assert.ok(metrics.scrollable&&metrics.scrolled,"only card content scrolls");
        assert.equal(metrics.headerMovement,0);assert.equal(metrics.footerMovement,0);
      }
      const dialog=page.getByRole("dialog");
      await dialog.getByRole("searchbox").fill("2254");await dialog.getByRole("searchbox").press("Enter");await dialog.locator('[data-card-id="2254"]').waitFor();await dialog.locator('[data-card-id="2254"]').click();
      const before=structuredClone(preferences.cover);
      await dialog.getByRole("button",{name:"使用卡面",exact:true}).click();await dialog.waitFor({state:"detached"});
      const area=page.getByRole("group",{name:"调整位置",exact:true});await area.waitFor();await area.press("Escape");
      assert.deepEqual(preferences.cover,before,"choosing a cover does not persist until position is saved");
    }
    await page.setViewportSize({width:390,height:900});
    await page.getByRole("button",{name:"选择头像",exact:true}).click();const dialog=page.getByRole("dialog");
    await dialog.getByRole("searchbox").fill("2254");await dialog.getByRole("searchbox").press("Enter");await dialog.locator('[data-card-id="2254"]').click();
    const before=await dialog.boundingBox();failAvatar=true;await dialog.getByRole("button",{name:"保存头像",exact:true}).click();
    await dialog.getByRole("alert").waitFor();assert.equal((await dialog.boundingBox()).height,before.height);
    assert.equal(await dialog.locator('[data-card-id="2254"]').getAttribute("aria-pressed"),"true");
    const notice=await dialog.getByRole("alert").boundingBox(),save=await dialog.getByRole("button",{name:"保存头像",exact:true}).boundingBox();
    assert.ok(Math.abs(notice.x+notice.width-save.x-save.width)<1&&notice.y+notice.height<=save.y,"avatar error stays above its save action");
    if(out) await page.screenshot({path:`${out}/avatar-error-mobile.png`,fullPage:true});
    failAvatar=false;await dialog.getByRole("button",{name:"保存头像",exact:true}).click();await dialog.waitFor({state:"detached"});assert.equal(avatar.avatarCardId,2254);
    await page.setViewportSize({width:1440,height:1000});
  });
  await check("details and compact mobile composition",async()=>{
    await page.getByRole("tab",{name:"资料",exact:true}).click();await page.getByRole("heading",{name:/1000001234/}).waitFor();await shot("details-desktop");
    await page.setViewportSize({width:390,height:900});await shot("details-mobile");
    const before=await page.locator("main header").boundingBox();await page.getByRole("textbox",{name:"个性签名",exact:true}).click();assert.equal((await page.locator("main header").boundingBox()).height,before.height);await page.getByRole("textbox",{name:"个性签名"}).press("Escape");
    username="W".repeat(24);await go();await page.setViewportSize({width:320,height:900});await shot("long-name-320");
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const h=page.getByRole("heading",{name:username,exact:true});assert.equal(await h.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  });
  await check("private accounts absent from visitor page",async()=>{
    owner=false; preferences.publicAccounts=false;await go();assert.equal(await page.getByRole("switch").count(),0);assert.equal(await page.getByText("1000001234",{exact:true}).count(),0);assert.equal(await page.getByRole("tab",{name:"设置",exact:true}).count(),0);
    assert.equal(await page.locator("main header").getByRole("button").count(),0);
    await page.locator("main header").getByText(preferences.signature,{exact:true}).click();
    assert.equal(await page.locator("main header").getByRole("textbox").count(),0);
  });
  await check("blocking read retry",async()=>{
    failLoad=true;await page.reload();const retry=page.getByRole("button",{name:/重试/});await retry.waitFor();failLoad=false;await retry.click();await page.getByRole("heading",{name:username,exact:true}).waitFor();
  });
  await check("reduced motion",async()=>{
    owner=true;await page.emulateMedia({reducedMotion:"reduce"});await go();await page.getByRole("tab",{name:"设置",exact:true}).click();assert.equal(await page.getByRole("tabpanel").evaluate(el=>getComputedStyle(el).animationName),"none");
  });
  await check("dark desktop and mobile preserve readable surfaces and dialog controls",async()=>{
    username="Bluewater Alnilam Player";preferences=structuredClone(initial);await page.emulateMedia({colorScheme:"dark"});await go();
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:900});await page.getByRole("tab",{name:"资料",exact:true}).click();await shot(`dark-details-${width}`);
      await page.getByLabel("封面选项",{exact:true}).click();await page.getByRole("button",{name:"选择卡面",exact:true}).click();
      await page.getByRole("dialog").locator("[data-card-id]").first().waitFor();await shot(`dark-cover-picker-${width}`);await page.keyboard.press("Escape");await page.getByRole("dialog").waitFor({state:"detached"});
    }
    await page.emulateMedia({colorScheme:"light"});
  });
  await check("existing account avatar entry and game-card dialog keep their behavior",async()=>{
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(`${origin}/zh-CN/account/profile`,{waitUntil:"domcontentloaded"});
    await page.getByTestId("account-avatar-card-trigger").click();await page.getByTestId("account-avatar-card-dialog").waitFor();
    await page.keyboard.press("Escape");await page.getByRole("dialog").waitFor({state:"detached"});
    await page.getByTestId("account-avatar-card-trigger").and(page.locator(":focus")).waitFor({timeout:3000});
    await page.goto(`${origin}/zh-CN/bandori/game-profiles/picker-fixture/cards`,{waitUntil:"domcontentloaded"});
    await page.getByRole("button",{name:"添加卡牌",exact:true}).click();
    const picker=page.getByRole("dialog",{name:"添加卡牌",exact:true});await picker.locator("[data-card-id]").first().waitFor({timeout:60000});
    assert.equal(await picker.getByRole("button",{name:"特训前",exact:true}).count(),0,"game workflow keeps art toggle hidden");
    assert.equal(await picker.getByRole("button",{name:"使用卡面",exact:true}).count(),0,"game workflow does not gain profile confirmation");
    await picker.locator("[data-card-id]").first().click();
    const editor=page.getByRole("dialog").filter({has:page.getByRole("button",{name:"取消",exact:true})});await editor.waitFor();
    await editor.getByRole("button",{name:"取消",exact:true}).click();await editor.waitFor({state:"detached"});await picker.waitFor();
    await picker.getByRole("button",{name:"关闭卡牌选择器",exact:true}).click();await picker.waitFor({state:"detached"});
  });
  await check("stale settings tabs save only the changed preference", async () => {
    preferences = structuredClone(initial);
    const other = await context.newPage();
    const openSettings = async tab => {
      await tab.goto(origin + "/user/" + publicUid);
      await tab.getByRole("tab", {name:"设置", exact:true}).click();
    };
    const change = async (tab, name) => {
      const control = tab.getByRole("switch", {name, exact:true});
      await control.click();
      await control.locator("..").getByText("已保存", {exact:true}).waitFor();
    };
    try {
      await Promise.all([openSettings(page), openSettings(other)]);
      await change(page, "公开收藏的卡牌");
      await change(page, "公开绑定账号");
      await change(other, "允许通过游戏ID搜索到网站账号");
      assert.deepEqual(writes.at(-1), {allowGameIdSearch:false});
      assert.equal(preferences.publicAccounts, false);
      await change(other, "公开1234567890123456");
      assert.deepEqual(writes.at(-1), {accounts:[initial.accounts[0], {...initial.accounts[1], public:false}]});
      assert.equal(preferences.publicAccounts, false);
      await openSettings(other);
      await change(other, "公开绑定账号");
      for (const [name, checked] of [["公开收藏的卡牌",false],["公开1000001234",true],
        ["公开1234567890123456",false],["允许通过游戏ID搜索到网站账号",false]]) {
        assert.equal(await other.getByRole("switch", {name, exact:true}).getAttribute("aria-checked"), String(checked));
      }
    } finally { await other.close(); }
  });
  await check("a failed settings column rolls back only itself", async () => {
    await page.goto(origin + "/user/" + publicUid);
    await page.getByRole("tab",{name:"设置",exact:true}).click();
    const url = "**/api/account/homepage/settings";
    const card = page.getByRole("switch", {name:"公开收藏的卡牌",exact:true});
    const lookup = page.getByRole("switch", {name:"允许通过游戏ID搜索到网站账号",exact:true});
    for (const [slow, fast, field] of [[card, lookup, "modules"], [lookup, card, "allowGameIdSearch"]]) {
      const beforeSlow = await slow.getAttribute("aria-checked");
      const beforeFast = await fast.getAttribute("aria-checked");
      let release;
      const gate = new Promise(resolve => {release = resolve;});
      await page.route(url, async route => {
        if (!(field in route.request().postDataJSON())) return route.fallback();
        await gate;
        return route.fulfill({status:500,json:{success:false}});
      });
      try {
        const pending = page.waitForRequest(url);
        await slow.focus();
        await page.keyboard.press("Space");
        await pending;
        assert.equal(await slow.evaluate(el=>el===document.activeElement),true);
        assert.notEqual(await slow.getAttribute("aria-checked"), beforeSlow);
        assert.equal(await fast.isEnabled(), true);
        await fast.click();
        await feedbackNear(fast);
        release();
        await feedbackNear(slow, "left", "error");
        assert.equal(await fast.evaluate(el=>el===document.activeElement),true,"the earlier save leaves focus on the last control used");
        assert.equal(await slow.getAttribute("aria-checked"), beforeSlow);
        assert.notEqual(await fast.getAttribute("aria-checked"), beforeFast);
      } finally { release(); await page.unroute(url); }
    }
  });
  await check("only details with visible titles depend on the shared title catalog", async () => {
    const url = "**/api/bandori/master/degrees";
    const details = page.getByRole("tabpanel");
    const heading = details.getByRole("heading", {name:/1000001234/});
    const retry = details.getByRole("button", {name:/重试/});
    const headerTitle = page.locator('main header [class*="displayDegree"] [role="img"]');
    preferences = structuredClone(initial);
    owner = false;
    let failed = true;
    await page.route(url, route => failed ? route.fulfill({status:503,json:{success:false}}) : route.continue());
    try {
      for (const share of [false, true]) {
        preferences.accounts[0].titlesPublic = share;
        await Promise.all([page.waitForResponse(url), go()]);
        await page.getByRole("tab", {name:"资料",exact:true}).click();
        assert.equal(await headerTitle.count(), 0);
        if (share) {
          await retry.waitFor();
          assert.equal(await page.getByRole("button",{name:/重试/}).count(), 1);
          assert.equal(await heading.count(), 0);
          failed = false;
          await retry.click();
          await details.locator('[class*="titleGroup"] [role="img"]').first().waitFor();
          await headerTitle.waitFor();
        }
        await heading.waitFor();
        assert.equal(await retry.count(), 0);
      }
    } finally { await page.unroute(url); owner = true; }
  });
  await check("an owner without bindings sees a static default title", async () => {
    preferences.accounts = [];
    await go();
    const title = page.locator('main header [class*="displayDegree"]');
    const artwork = title.getByRole("img");
    await artwork.waitFor();
    for (const width of [390,1440]) {
      await page.setViewportSize({width,height:900});
      await artwork.hover();
      assert.equal(await title.locator("button, .lucide-pencil").count(), 0);
      await artwork.click();
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(await page.getByRole("button",{name:"选择头像",exact:true}).count(), 1);
    }
  });
  await check("English search permission and its save feedback fit on a narrow phone", async () => {
    preferences = structuredClone(initial);
    await page.setViewportSize({width:320,height:900});
    await page.goto(origin+"/en/user/"+publicUid);
    await page.getByRole("tab",{name:"Settings",exact:true}).click();
    const lookup = page.getByRole("switch",{name:/game ID/i});
    await lookup.scrollIntoViewIfNeeded();
    const before = await lookup.boundingBox();
    const label = page.getByText(await lookup.getAttribute("aria-label"),{exact:true});
    const fitsTwoLines = () => label.evaluate(el => el.scrollHeight <= 2 * parseFloat(getComputedStyle(el).lineHeight) + 1);
    assert.ok(await fitsTwoLines());
    try {
      for (const type of ["success","error"]) {
        failSave = type === "error";
        await lookup.click();
        await feedbackNear(lookup,"left",type);
        const bounds = await label.boundingBox();
        const notice = await lookup.locator("..").locator("[data-action-feedback]").boundingBox();
        assert.ok(await fitsTwoLines(),"the full permission label fits in two lines");
        assert.ok(bounds.x+bounds.width<=notice.x,"the save result leaves the permission label readable");
        assert.deepEqual(await lookup.boundingBox(),before,"showing the result keeps the switch still");
      }
    } finally { failSave = false; }
  });
  assert.deepEqual(errors,[]);console.log(`PASS browser runtime; ${writes.length} homepage and ${avatarWrites.length} avatar intercepted writes`);
} catch(error) {await shot("failure");console.log(JSON.stringify({url:page.url(),text:(await page.locator("body").innerText()).slice(-1800),errors}));throw error;} finally {await browser.close();}
