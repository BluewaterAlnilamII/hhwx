import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as domain from "../src/lib/profile-homepage.ts";
import * as avatar from "../src/lib/account-avatar-card.ts";
import * as degree from "../src/lib/account-display-degree.ts";
import * as tables from "../src/lib/supabase-table-names.ts";
import { ApiRouteError } from "../src/lib/api-contracts.ts";
import { readBoundedRequestBody } from "../src/lib/api-request.ts";

function load(path, dependencies) {
  const {outputText} = ts.transpileModule(readFileSync(new URL(path,import.meta.url),"utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  const exports={};runInNewContext(outputText,{exports,Buffer,TextDecoder,require:id=>{assert.ok(Object.hasOwn(dependencies,id),id);return dependencies[id];}});return exports;
}
function service({preferences={},profileName=" Game name ",namesError=false,bindingsError=false}={}) {
  const calls=[];
  const rows={
    [tables.PROFILES_TABLE]:{id:"owner",public_uid:42,username:"Profile",created_at:null,avatar_card_id:1,preferences},
    [tables.USER_GAME_BINDINGS_TABLE]:[{game_uid:"10001",owned_degree_ids:[100],owned_degree_effect_ids:[]}],
    [tables.USER_GAME_PROFILES_TABLE]:[{source_game_uid:"10001",profile_name:profileName}],
  };
  const api=load("../src/lib/profile-homepage-server.ts",{
    "server-only":{},"@/lib/api-contracts":{ApiRouteError},"@/lib/profile-homepage":domain,"@/lib/account-avatar-card":avatar,"@/lib/account-display-degree":degree,"@/lib/supabase-table-names":tables,
    "@/lib/bandori/cards/api-server":{readBandoriCardApiDetail:async id=>id==="1"?{resourceSetName:"card1"}:null},
    "@/lib/bandori/cards/regional-extensions":{isKnownBandoriCardEntityCollision:id=>id===5000,materializeBandoriCardForServer:c=>c},
    "@/lib/bandori/cards/training":{hasTrainedCardArt:()=>false},
    "@/lib/supabase-server":{createServerSupabaseClient:()=>({
      from(table){const filters=[];const result=()=>({data:rows[table],error:(table===tables.USER_GAME_PROFILES_TABLE&&namesError)||(table===tables.USER_GAME_BINDINGS_TABLE&&bindingsError)?{}:null});
        const query={select(){return query;},eq(k,v){filters.push([k,v]);return query;},maybeSingle:async()=>{calls.push({table,filters});return result();},then(resolve){calls.push({table,filters});return Promise.resolve(result()).then(resolve);}};return query;},
      async rpc(name,args){calls.push({name,args});return {data:{...preferences,...args.p_patch},error:null};},
    })},
  });return {api,calls};
}
test("public projection excludes private accounts and raw preferences; owner retains them",async()=>{
  const {api,calls}=service({preferences:{publicAccounts:false,accounts:[{gameUid:"10001",public:true,titlesPublic:true}]}});
  const visitor=await api.readProfileHomepage(42,"someone-else");
  assert.equal(visitor.preferences,null);assert.equal(visitor.bindings.length,0);assert.equal(Object.hasOwn(visitor,"id"),false);
  assert.deepEqual(calls.map(c=>c.table),[tables.PROFILES_TABLE]);
  const owner=await api.readProfileHomepage(42,"owner");assert.equal(owner.bindings.length,1);assert.equal(owner.bindings[0].playerName,"Game name");assert.equal(owner.bindings[0].public,false);
  assert.ok(calls.filter(c=>c.table===tables.USER_GAME_PROFILES_TABLE).every(c=>c.filters.some(([k,v])=>k==="profile_kind"&&v==="auto")));
});
test("a newly bound account is public without its titles; explicit title sharing takes precedence",async()=>{
  const {api}=service({preferences:{signature:"existing profile"}});
  const owner=await api.readProfileHomepage(42,"owner");
  assert.equal(owner.preferences.publicAccounts,true);
  assert.deepEqual(Array.from(owner.preferences.modules,m=>[m.id,m.public]),[["cards",true],["events",true],["songs",true]]);
  assert.equal(owner.preferences.accounts[0].public,true);
  assert.equal(owner.preferences.accounts[0].titlesPublic,false);
  assert.deepEqual(owner.bindings[0].ownedDegreeIds,[100]);
  const visitor=(await api.readProfileHomepage(42,null)).bindings[0];
  assert.equal(visitor.gameUid,"10001");
  assert.deepEqual(visitor.ownedDegreeIds,[]);
  assert.deepEqual(visitor.ownedDegreeEffectIds,[]);
  const shared=service({preferences:{accounts:[{gameUid:"10001",public:true,titlesPublic:true}]}});
  assert.deepEqual((await shared.api.readProfileHomepage(42,null)).bindings[0].ownedDegreeIds,[100]);
});
test("name acquisition is auxiliary; privacy and binding failures fail closed",async()=>{
  assert.equal((await service({namesError:true}).api.readProfileHomepage(42,null)).bindings[0].playerName,null);
  await assert.rejects(service({bindingsError:true}).api.readProfileHomepage(42,null),{status:500});
});
test("the automatic UID label is omitted and other UID-like game names remain visible", async () => {
  for (const [profileName, expected] of [["UID 10001", null], ["UID 10002", "UID 10002"]]) {
    const { api } = service({ profileName });
    const { bindings } = await api.readProfileHomepage(42, null);
    assert.equal(bindings[0].gameUid, "10001");
    assert.equal(bindings[0].playerName, expected);
  }
});
test("game ID lookup consent defaults on, persists an explicit opt-out and stays owner-only",async()=>{
  const {api,calls}=service({preferences:{signature:"unchanged"}});
  assert.equal((await api.readProfileHomepage(42,"owner")).preferences.allowGameIdSearch,true);
  const saved=await api.updateProfileHomepage("owner",{allowGameIdSearch:false});
  assert.deepEqual(Object.keys(calls.at(-1).args.p_patch),["allowGameIdSearch"]);
  const reloaded=service({preferences:saved}).api;
  assert.equal((await reloaded.readProfileHomepage(42,"owner")).preferences.allowGameIdSearch,false);
  assert.equal((await reloaded.readProfileHomepage(42,null)).preferences,null);
});
test("settings cannot adopt foreign bindings or a stale subset",async()=>{
  const {api,calls}=service();
  for(const accounts of [[],[{gameUid:"99999",public:true,titlesPublic:true}]]) await assert.rejects(api.updateProfileHomepage("owner",{accounts}),{status:409});
  assert.equal(calls.filter(c=>c.name).length,0);
  await api.updateProfileHomepage("owner",{accounts:[{gameUid:"10001",public:false,titlesPublic:true}]});
  assert.equal(calls.at(-1).args.p_user_id,"owner");
});
test("cover validates catalog identity and training before persistence",async()=>{
  const {api,calls}=service();
  const cover={cardId:1,entityServer:3,trainType:"after_training",x:25,y:70};
  await api.updateProfileHomepage("owner",{cover});
  assert.equal(calls.at(-1).args.p_patch.cover.entityServer,null);assert.equal(calls.at(-1).args.p_patch.cover.trainType,"normal");
  await assert.rejects(api.updateProfileHomepage("owner",{cover:{...cover,cardId:999999}}),{status:400});
});
test("write route requires verified identity and passes only that owner to persistence",async()=>{
  let verified=false, called=0;
  const api=load("../src/app/api/account/homepage/route.ts",{
    "@/lib/api-contracts":{ApiRouteError},
    "@/lib/api-request":{readBoundedRequestBody},
    "@/lib/api-cache":{NO_STORE_HTTP_CACHE_POLICY:{},withHttpCachePolicy:()=>({"Cache-Control":"no-store"})},
    "@/lib/api-response":{jsonSuccess:(data,init)=>Response.json({success:true,data},init),jsonRouteError:(e,fallback,init)=>Response.json({success:false,error:{code:e.code??fallback.code}},{...init,status:e.status??fallback.status})},
    "@/lib/auth-server":{requireVerifiedAccount:async()=>{if(!verified)throw new ApiRouteError(403,"FORBIDDEN","Forbidden");return {id:"verified-owner"};}},
    "@/lib/profile-homepage-server":{updateProfileHomepage:async(id,body)=>{called++;assert.equal(id,"verified-owner");return body;}},
  });
  const request=body=>new Request("http://localhost/api/account/homepage",{method:"PATCH",body});
  assert.equal((await api.PATCH(request('{"signature":"x"}'))).status,403);assert.equal(called,0);
  verified=true;assert.equal((await api.PATCH(request("{"))).status,400);
  assert.equal((await api.PATCH(request(JSON.stringify({signature:"x".repeat(32768)})))).status,413);assert.equal(called,0);
  const response=await api.PATCH(request('{"signature":"saved"}'));assert.equal(response.status,200);assert.match(response.headers.get("Cache-Control"),/no-store/);assert.equal(called,1);
});

test("request size is enforced on streamed bytes before the rest of the body is read", async () => {
  let reads = 0, cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      reads++;
      controller.enqueue(new TextEncoder().encode("星"));
    },
    cancel() { cancelled = true; },
  }, {highWaterMark: 0});
  const request = new Request("http://localhost", {method:"PATCH", body, duplex:"half"});
  await assert.rejects(readBoundedRequestBody(request, 5), {status:413, code:"REQUEST_TOO_LARGE"});
  assert.equal(reads, 2);
  assert.equal(cancelled, true);
});
