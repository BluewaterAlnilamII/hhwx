import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { ApiRouteError } from "../src/lib/api-contracts.ts";
import { createHash } from "node:crypto";
import * as codec from "../src/lib/bestdori-profile-codec.ts";
import * as areaItems from "../src/lib/bandori-area-item-groups.ts";
import * as profilePayload from "../src/lib/user-game-profile-payload.ts";
import * as compressedPayload from "../src/lib/user-game-profile-payload-server.ts";

function loadModule(path, dependencies, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(outputText, { exports, Buffer, URL, Object, AbortSignal, console, ...globals,
    require(id) { assert.ok(Object.hasOwn(dependencies, id), `Unexpected import: ${id}`); return dependencies[id]; },
  });
  return exports;
}

test("start checks verified account and binding once; confirm only checks identity", async () => {
  const calls = [];
  const taskId = "a".repeat(43);
  let saveFails = true;
  let enabled = true;
  const gate = { get GAME_PROFILE_SYNC_ENABLED() { return enabled; } };
  const route = loadModule("../src/app/api/account/game-profiles/sync/route.ts", {
    "@/lib/api-contracts": { ApiRouteError },
    "@/lib/api-response": {
      jsonSuccess: (data, init) => ({ data, init }), jsonError: (status, code) => ({ status, code }),
      jsonRouteError: (error) => ({ status: error.status, code: error.code, details: error.details }),
    },
    "@/lib/auth-server": {
      requireVerifiedAccount: async () => { calls.push("verified"); return { id: "owner" }; },
      requireAuthenticatedUserId: async () => { calls.push("identity"); return "owner"; },
    },
    "@/lib/game-account-binding": { normalizeGameUid: (value) => value },
    "@/lib/user-game-profile-sync": gate,
    "@/lib/user-game-snapshot-fetcher": {
      readSnapshotLoginJson: (request) => request.json(),
      requestGameProfileLogin: async (...args) => { calls.push(args); return { taskId, status: "waiting" }; },
    },
    "@/lib/user-game-profiles-server": {
      requireBoundGameUid: async () => { calls.push("binding"); },
      syncAutoGameProfile: async (...args) => { calls.push(["save", ...args]); if (saveFails) throw new ApiRouteError(400,"SAVE_FAILED","safe","private details"); return { id: "saved" }; },
    },
  });
  const post = (body) => route.POST({ json: async () => body });
  for (const body of [null, [], {action:"start",gameUid:"1001",ownerId:"attacker"}, {action:"start",gameUid:"1001",accessToken:"secret"}, {action:"confirm",gameUid:"1001",taskId:"bad"}, ...["poll","complete","cancel"].map(action=>({action,gameUid:"1001",taskId}))]) {
    assert.equal((await post(body)).status,400);
  }
  assert.equal(calls.length,0);
  const started=await post({action:"start",gameUid:"1001"});
  assert.equal(started.init.headers["Cache-Control"],"no-store");
  assert.deepEqual(calls,["verified","binding",["owner","1001"]]);
  calls.length=0;
  const failed=await post({action:"confirm",gameUid:"1001",taskId});
  assert.equal(failed.details,undefined);
  assert.deepEqual(calls,["identity",["save","owner","1001",taskId]]);
  saveFails=false;
  assert.equal((await post({action:"confirm",gameUid:"1001",taskId})).data.id,"saved");
  calls.length=0; enabled=false;
  assert.equal((await route.POST({json:()=>assert.fail("disabled route must not parse")})).status,503);
  assert.equal(calls.length,0);
});

test("backend adapter bounds and sanitizes replies and only exposes the official link", async () => {
  const taskId = "a".repeat(43);
  const original={taskId,gameUid:"1001",status:"waiting",expiresIn:300,loginUrl:"https://passport.bilibili.com/x/passport-tv-login/h5/qrcode/auth?auth_code=test",accessToken:"must-not-leak"};
  let payload=original, status=200;
  const requests=[];
  const adapter=loadModule("../src/lib/user-game-snapshot-fetcher.ts",{
    "server-only": {}, "@/lib/api-contracts": {ApiRouteError},
    "@/lib/hhwx-bandori-backend-server": {getBandoriBackendToken: ()=>"private-backend-token"},
  },{process:{env:{HHWX_USER_FETCHER_BASE_URL:"https://backend.example"}},fetch:async(url, options)=>{requests.push({url,options});return Response.json(payload,{status});}});
  const task=await adapter.requestGameProfileLogin("owner","1001");
  assert.equal(task.accessToken,undefined);
  assert.equal(task.expiresIn,300);
  assert.ok(requests[0].url.endsWith("/user-snapshot"));
  assert.equal(requests[0].options.redirect,"error");
  assert.deepEqual(JSON.parse(requests[0].options.body),{action:"start",ownerId:"owner",gameUid:"1001"});
  for(const expiresIn of [-1,301,0.5,"300",null,0,undefined]){
    payload={...original,expiresIn};
    await assert.rejects(adapter.requestGameProfileLogin("owner","1001"),{code:"TRACKER_SERVICE_INVALID_RESPONSE"});
  }
  for(const loginUrl of ["https://evil.example/","https://passport.bilibili.com@evil.example/","javascript:alert(1)"]){
    payload={...original,loginUrl};
    await assert.rejects(adapter.requestGameProfileLogin("owner","1001"),{code:"TRACKER_SERVICE_INVALID_RESPONSE"});
  }
  status=502; payload={code:"unknown-private-value",message:"secret",accessToken:"secret"};
  await assert.rejects(adapter.fetchGameUserSnapshot("owner","1001",taskId),error=>error.code==="TRACKER_SERVICE_FAILED" && !JSON.stringify(error).includes("secret"));
  assert.equal(JSON.parse(requests.at(-1).options.body).action,"confirm");
  status=409; payload={code:"LOGIN_NOT_COMPLETED",accessToken:"secret"};
  await assert.rejects(adapter.fetchGameUserSnapshot("owner","1001",taskId),{code:"LOGIN_NOT_COMPLETED"});
  status=200; payload={gameUid:"2001",snapshot:{profile:{},suite_user:{}}};
  await assert.rejects(adapter.fetchGameUserSnapshot("owner","1001",taskId),{code:"TRACKER_SERVICE_INVALID_RESPONSE"});
  await assert.rejects(adapter.readSnapshotLoginJson(new Response('"'+'x'.repeat(4096)+'"')));
});

test("confirm identity validates signed claims without account, email or binding reads", async () => {
  const valid={iss:"https://test.supabase.co/auth/v1",aud:"authenticated",role:"authenticated",sub:"00000000-0000-0000-0000-000000000001",exp:Date.now()/1000+100};
  let claims=valid;
  const auth=loadModule("../src/lib/auth-server.ts",{
    "@/lib/api-contracts":{ApiRouteError},
    "@/lib/account-status-server":{readAccountEmailVerified:()=>assert.fail("confirm must not read email")},
    "@/lib/supabase-server":{createServerSupabaseClient:()=>({auth:{getClaims:async(token)=>{assert.equal(token,"test-token");return {data:{claims},error:null};}}})},
  },{process:{env:{SUPABASE_URL:"https://test.supabase.co"}}});
  const request=new Request("https://hhwx.test",{headers:{Authorization:"Bearer test-token"}});
  assert.equal(await auth.requireAuthenticatedUserId(request),valid.sub);
  for(const override of [{iss:"https://evil.test/auth/v1"},{aud:"other"},{role:"anon"},{sub:"bad"},{exp:0},{exp:NaN},{exp:Infinity}]) {
    claims={...valid,...override};
    await assert.rejects(auth.requireAuthenticatedUserId(request),{status:401});
  }
});

test("saving preserves the existing payload and required titles, with no final database read", async () => {
  const calls = [];
  let upstreamError = null, mergeError = null;
  const snapshot = {gameUid: "1001", snapshot: {profile: {user_name: "Test profile"}, suite_user: {
    cards: [{situation_id: 100, level: 60, skill_level: 3, limit_break_rank: 2, training_status: "done"}],
    area_items: [{area_item_category: [...areaItems.BANDORI_AREA_ITEM_IDS][0], level: 3}],
    degrees: [{degree_id: 7}], degree_effects: [{bili_degree_effect_id: 8}],
    character_potential_levels: [{character_id: 1, performance_level: 2, technique_level: 3, visual_level: 4}],
    character_mission_bonuses: [{character_id: 1, bonus_type: "COLLECTION", performance: 2, technique: 3, visual: 4}],
  }}};
  let savedPayload;
  const server = loadModule("../src/lib/user-game-profiles-server.ts", {
    "node:crypto": {createHash}, "@/lib/api-contracts": {ApiRouteError},
    "@/lib/bandori/cards/api-server": {readBandoriCardsApiDatasetForServer: async () => {calls.push("master");return {}; }},
    "@/lib/bestdori-profile-codec": codec,
    "@/lib/user-game-snapshot-fetcher": {fetchGameUserSnapshot: async () => {calls.push("fetch");if(upstreamError)throw upstreamError;return snapshot;}},
    "@/lib/bandori-area-item-groups": areaItems,
    "@/lib/supabase-table-names": {USER_GAME_BINDINGS_TABLE: "bindings", USER_GAME_PROFILES_TABLE: "profiles"},
    "@/lib/user-game-profile-payload": profilePayload,
    "@/lib/user-game-profile-payload-server": compressedPayload,
    "@/lib/supabase-server": {createServerSupabaseClient: () => ({
      from: () => assert.fail("confirm must not reread account, binding, or profile"),
      rpc: async (name, params) => {
        calls.push(name);
        if(name === "upsert_auto_game_profile") {
          savedPayload = compressedPayload.decodeGameProfilePayload({storageCodec: profilePayload.USER_GAME_PROFILE_STORAGE_CODEC, payloadCompressed: params.p_payload_compressed, payloadSha256: params.p_payload_sha256, payloadSize: params.p_payload_size});
          return {data: {id: "saved", profile_kind: "auto", profile_name: params.p_profile_name, server: 3, source_game_uid: "1001", card_count: params.p_card_count, summary: {}, synced_at: "now", updated_at: "now"}, error: null};
        }
        assert.deepEqual(JSON.parse(JSON.stringify(params[name.endsWith("degree_effects") ? "p_degree_effect_ids" : "p_degree_ids"])), name.endsWith("degree_effects") ? [8] : [7]);
        return {error: name === mergeError ? {message: "private database token"} : null};
      },
    })},
  });
  const result = await server.syncAutoGameProfile("owner", "1001", "task");
  assert.equal(result.cardCount, 1);
  assert.equal(result.name, "Test profile");
  assert.deepEqual(calls, ["fetch", "master", "upsert_auto_game_profile", "merge_game_uid_binding_degrees", "merge_game_uid_binding_degree_effects"]);
  assert.equal(profilePayload.getGameProfileCards(savedPayload)[0].cardId, 100);
  assert.equal(profilePayload.getGameProfileCharacterPotentials(savedPayload)[0].visualLevel, 4);
  assert.equal(profilePayload.getGameProfileAreaItems(savedPayload).find(row => row.areaItemId === [...areaItems.BANDORI_AREA_ITEM_IDS][0]).level, 3);
  assert.equal(profilePayload.getGameProfileCharacterMissionBonuses(savedPayload).find(row => row.bonusType === "COLLECTION").performance, 20);
  for (const name of ["merge_game_uid_binding_degrees", "merge_game_uid_binding_degree_effects"]) {
    mergeError = name;
    await assert.rejects(server.syncAutoGameProfile("owner", "1001", "task"), error => error.code === "AUTO_GAME_PROFILE_SYNC_FAILED" && !JSON.stringify(error).includes("private"));
  }
  calls.length = 0;
  upstreamError = new ApiRouteError(429, "LOGIN_TASK_BUSY", "busy");
  await assert.rejects(server.syncAutoGameProfile("owner", "1001", "task"), {code: "LOGIN_TASK_BUSY"});
  assert.deepEqual(calls, ["fetch"]);
});
