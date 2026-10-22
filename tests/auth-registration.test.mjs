import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';
import { ApiRouteError } from '../src/lib/api-contracts.ts';
import * as registration from '../src/lib/account-registration.ts';
import * as passwords from '../src/lib/password-policy.ts';
import * as usernames from '../src/lib/username-policy.ts';

const userId='00000000-0000-0000-0000-000000000001';
function signupRoute({claims={amr:[{method:'otp',timestamp:Date.now()/1000}]}, confirmed=true, complete=false}={}) {
  const writes=[];
  const user={id:userId,email_confirmed_at:confirmed?'2026-01-01':null,app_metadata:complete?{hhwx_registration:{id:userId}}:{}};
  const deps={
    'node:crypto':{randomUUID}, '@/lib/api-contracts':{ApiRouteError},
    '@/lib/account-registration':registration, '@/lib/password-policy':passwords, '@/lib/username-policy':usernames,
    '@/lib/auth-server':{requireAuthenticatedUserId:async(request)=>{if(!request.headers.get('Authorization'))throw new ApiRouteError(401,'UNAUTHENTICATED','Login');return userId;},parseBearerToken:()=> 'token'},
    '@/lib/api-response':{jsonSuccess:data=>Response.json({success:true,data}),jsonRouteError:error=>Response.json({code:error.code},{status:error.status||500})},
    '@/lib/supabase-server':{createServerSupabaseClient:()=>({auth:{getUser:async()=>({data:{user},error:null}),getClaims:async()=>({data:{claims},error:null}),admin:{updateUserById:async(id,body)=>{writes.push({id,body});return {error:null};}}}})},
  };
  const source=readFileSync(new URL('../src/app/api/auth/signup/route.ts',import.meta.url),'utf8');
  const exports={};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:id=>{assert.ok(deps[id],id);return deps[id];}});
  return {writes,post:(body={username:'Shared nickname',password:'Account123!'},authorized=true)=>exports.POST(new Request('http://localhost/api/auth/signup',{method:'POST',headers:authorized?{Authorization:'Bearer token'}:{},body:JSON.stringify(body)}))};
}
test('registration requires recent server-signed email proof and ignores mutable metadata',()=>{
  const now=10000;
  for(const method of ['otp','recovery'])assert.equal(registration.hasRecentEmailProof({amr:[{method,timestamp:now}]},now),true);
  for(const claims of [{},{amr:[{method:'password',timestamp:now}]},{amr:[{method:'otp',timestamp:now-901}]},{amr:[{method:'otp',timestamp:now+31}]},{amr:[{method:'otp',timestamp:Infinity}]},{user_metadata:{email_verified:true}}])assert.equal(registration.hasRecentEmailProof(claims,now),false);
  assert.equal(registration.isAccountEmailVerified({email_confirmed_at:'2026-01-01',app_metadata:{},user_metadata:{hhwx_registration:{id:userId}}}),false);
});
test('final registration writes the winning nickname, password and protected marker together',async()=>{
  const flow=signupRoute();assert.equal((await flow.post()).status,200);assert.equal(flow.writes.length,1);
  const {id,body}=flow.writes[0];assert.equal(id,userId);assert.equal(body.password,'Account123!');assert.equal(body.user_metadata.username,'Shared nickname');assert.equal(body.app_metadata.hhwx_registration.username,'Shared nickname');assert.match(body.app_metadata.hhwx_registration.id,/^[\da-f-]{36}$/);
});
test('unverified, stale, completed, unauthenticated and invalid submissions cannot mutate registration',async()=>{
  for(const [options,status] of [[{confirmed:false},403],[{claims:{amr:[{method:'password',timestamp:Date.now()/1000}]}},403],[{complete:true},409]]) {
    const flow=signupRoute(options);assert.equal((await flow.post()).status,status);assert.equal(flow.writes.length,0);
  }
  const flow=signupRoute();assert.equal((await flow.post(undefined,false)).status,401);assert.equal((await flow.post({username:'x',password:'weak'})).status,400);assert.equal(flow.writes.length,0);
});
