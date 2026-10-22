import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { ApiRouteError } from '../src/lib/api-contracts.ts';
import { emailChangeProofExpiresAt, EMAIL_CHANGE_PROOF_MAX_AGE_SECONDS } from '../src/lib/account-email-change.ts';

function load(path, deps, extra={}) {
  const exports={};
  runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,URL,AbortSignal,fetch,process,require:id=>{assert.ok(id in deps,id);return deps[id];},...extra});
  return exports;
}
const user={id:'a1111111-1111-4111-8111-111111111111',email:'current@example.com',emailVerified:true};
function service({claims={},identity={},quota=null,failAt=null,acceptedSession=null}={}) {
  const calls=[];
  const verifiedClaims={iss:'http://localhost:55321/auth/v1',aud:'authenticated',role:'authenticated',sub:user.id,email:user.email,exp:Date.now()/1000+3600,amr:[{method:'otp',timestamp:Date.now()/1000}],...claims};
  const auth={getUser:async()=>({data:{user:{...user,...identity}},error:null}),getClaims:async()=>({data:{claims:verifiedClaims},error:null}),
    admin:{generateLink:async(params)=>{calls.push(params.type);return failAt===params.type?{error:{code:'unavailable'}}:{error:null,data:{user,properties:{email_otp:params.type==='email_change_current'?'12345678':'87654321'}}};}},
    verifyOtp:async(params)=>{calls.push('confirm-current');assert.equal(params.email,user.email);assert.equal(params.token,'12345678');return {error:failAt==='verify'?{}:null,data:{session:acceptedSession,user:null}};}};
  const deps={'server-only':{},'@supabase/supabase-js':{createClient:()=>({auth,rpc:async()=>{calls.push('reserve');return {error:quota?{message:quota}:null};}})},
    '@/lib/api-contracts':{ApiRouteError},'@/lib/account-email-change':{emailChangeProofExpiresAt,EMAIL_CHANGE_PROOF_MAX_AGE_SECONDS},
    '@/lib/account-email-delivery-server':{accountEmailDeliveryConfig:()=>({apiKey:'fixture'}),sendNewAccountEmailCode:async(config,email,code)=>{calls.push('send-new');assert.equal(email,'next@example.com');assert.equal(code,'87654321');if(failAt==='send')throw new ApiRouteError(502,'ACCOUNT_EMAIL_SEND_FAILED','failed');}}};
  const loaded=load('../src/lib/account-email-change-server.ts',deps,{process:{env:{SUPABASE_URL:'http://localhost:55321',NEXT_PUBLIC_SUPABASE_URL:'http://localhost:55321',SUPABASE_SECRET_KEY:'local',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'local'}}});
  return {calls,run:()=>loaded.requestAccountEmailChange(user,'proof','next@example.com')};
}

test('proof expires 15 minutes after OTP authentication, not token refresh or password/recovery sign-in',()=>{
  assert.equal(emailChangeProofExpiresAt({amr:[{method:'otp',timestamp:1000},{method:'token_refresh',timestamp:1800}]}),1900000);
  for(const claims of [{},{amr:[{method:'password',timestamp:1000}]},{amr:[{method:'recovery',timestamp:1000}]},{amr:[{method:'otp',timestamp:NaN}]}])assert.equal(emailChangeProofExpiresAt(claims),null);
});
test('native invalid OTP errors have localized code guidance instead of raw Auth text',()=>{
  const {formatAuthErrorMessage}=load('../src/lib/auth-error.ts',{'@/lib/password-policy':{PASSWORD_POLICY_MESSAGE:'password policy'}},{Error});
  const error=Object.assign(new Error('Token has expired or is invalid'),{code:'otp_expired'});
  assert.equal(formatAuthErrorMessage(error,'failed'), '验证码错误');
  assert.equal(formatAuthErrorMessage(error,'failed',undefined,{invalidCode:'Incorrect verification code'}),'Incorrect verification code');
});
test('unchanged passwords use the locale message regardless of provider wording',()=>{
  const {formatAuthErrorMessage}=load('../src/lib/auth-error.ts',{'@/lib/password-policy':{PASSWORD_POLICY_MESSAGE:'password policy'}},{Error});
  const {getLocalizedAuthErrorMessages}=load('../src/lib/localized-auth-errors.ts',{'@/lib/password-policy':{PASSWORD_MIN_LENGTH:8,PASSWORD_MAX_LENGTH:64}});
  for(const locale of ['zh-CN','en']) {
    const catalog=JSON.parse(readFileSync(new URL(`../messages/${locale}/auth.json`,import.meta.url),'utf8'));
    const messages=getLocalizedAuthErrorMessages(key=>key.split('.').reduce((value,part)=>value[part],catalog));
    for(const error of [
      Object.assign(new Error('New password should be different from the old password.'),{code:'same_password'}),
      Object.assign(new Error('Provider wording changed'),{code:'same_password'}),
      new Error('New password should be different from the old password.'),
      new Error('New password cannot be the same as the old password'),
    ]) assert.equal(formatAuthErrorMessage(error,'failed',undefined,messages),catalog.errors.samePassword);
  }
});
test('new email dispatch requires matching, fresh, server-authenticated email proof before any mutation',async()=>{
  const now=Date.now()/1000;
  for(const options of [{claims:{amr:[]}},{claims:{amr:[{method:'otp',timestamp:now-901}]}},{claims:{amr:[{method:'otp',timestamp:now+60}]}},{claims:{sub:'other'}},{identity:{id:'other'}},{identity:{email:'changed@example.com'}},{claims:{email:'changed@example.com'}},{claims:{iss:'https://other.supabase.co/auth/v1'}},{claims:{exp:now-1}}]) {
    const flow=service(options);await assert.rejects(flow.run(),{code:'EMAIL_CHANGE_PROOF_REQUIRED'});assert.deepEqual(flow.calls,[]);
  }
});
test('dispatch generates current then new, confirms current, sends only new and never returns either code',async()=>{
  const flow=service(),result=await flow.run();assert.deepEqual(flow.calls,['reserve','email_change_current','email_change_new','confirm-current','send-new']);
  assert.equal(JSON.stringify(result),JSON.stringify({currentEmail:user.email,newEmail:'next@example.com'}));
});

test('new-address send and resend reject missing, invalid and spent CAPTCHA before dispatch',async()=>{
  const calls=[];
  const env={NEXT_PUBLIC_TURNSTILE_SITE_KEY:'fixture',TURNSTILE_SECRET_KEY:'fixture'};
  const request=new Request('http://localhost/api/auth/email');
  const {verifyTurnstileToken}=load('../src/lib/turnstile-server.ts',{'@/lib/api-contracts':{ApiRouteError}},{
    URLSearchParams,process:{env},
    fetch:async(_url,{body})=>{
      const token=body.get('response');calls.push(`verify:${token}`);
      if(token==='unavailable')return new Response(null,{status:503});
      if(token==='malformed')return new Response('not JSON');
      return Response.json({success:token==='valid','error-codes':token==='spent'?['timeout-or-duplicate']:['invalid-input-response']});
    },
  });
  const route=load('../src/app/api/auth/email/route.ts',{
    '@/lib/api-contracts':{ApiRouteError},'@/lib/auth-server':{requireVerifiedAccount:async()=>user},
    '@/lib/api-response':{jsonSuccess:data=>Response.json({data}),jsonRouteError:error=>Response.json({code:error.code},{status:error.status||500})},
    '@/lib/turnstile-server':{verifyTurnstileToken},
    '@/lib/account-email-change-server':{requestAccountEmailChange:async()=>{calls.push('dispatch');return {};}}
  });
  for(const [captchaToken,expected,status=400] of [[undefined,'TURNSTILE_REQUIRED'],[{},'TURNSTILE_REQUIRED'],['invalid','TURNSTILE_INVALID'],['spent','TURNSTILE_INVALID'],['malformed','TURNSTILE_INVALID'],['unavailable','TURNSTILE_VERIFY_FAILED',502]]) {
    calls.length=0;
    const result=await route.POST(new Request(request,{method:'POST',body:JSON.stringify({action:'update',newEmail:'next@example.com',proofToken:'proof',captchaToken})}));
    assert.equal(result.status,status);assert.equal((await result.json()).code,expected);assert.ok(!calls.includes('dispatch'));
  }
  calls.length=0;
  const result=await route.POST(new Request(request,{method:'POST',body:JSON.stringify({action:'update',newEmail:'next@example.com',proofToken:'proof',captchaToken:'valid'})}));
  assert.equal(result.status,200);assert.deepEqual(calls,['verify:valid','dispatch']);
  for(const [siteKey,secretKey] of [['',''],['fixture',''],['','fixture'],['   ','fixture']]) {
    env.NEXT_PUBLIC_TURNSTILE_SITE_KEY=siteKey;env.TURNSTILE_SECRET_KEY=secretKey;
    calls.length=0;
    const rejected=await route.POST(new Request(request,{method:'POST',body:JSON.stringify({action:'update',newEmail:'next@example.com',proofToken:'proof',captchaToken:'valid'})}));
    assert.equal(rejected.status,503);assert.equal((await rejected.json()).code,'TURNSTILE_SERVER_NOT_CONFIGURED');
    assert.deepEqual(calls,[]);
  }
});
test('quota, Auth errors and unexpected completion stop dispatch; delivery failures stay explicit',async()=>{
  for(const quota of ['EMAIL_CHANGE_RATE_LIMITED','EMAIL_CHANGE_QUOTA_EXCEEDED']) {
    const flow=service({quota});await assert.rejects(flow.run(),{status:429,code:quota});assert.deepEqual(flow.calls,['reserve']);
  }
  for(const options of [{failAt:'email_change_current'},{failAt:'email_change_new'},{failAt:'verify'},{acceptedSession:{access_token:'unexpected'}}]) {
    const flow=service(options);await assert.rejects(flow.run());assert.ok(!flow.calls.includes('send-new'));
  }
  await assert.rejects(service({failAt:'send'}).run(),{code:'ACCOUNT_EMAIL_SEND_FAILED'});
});
test('local mail delivery is impossible with a production or remote Auth environment',()=>{
  const config=(env)=>load('../src/lib/account-email-delivery-server.ts',{'server-only':{},'@/lib/api-contracts':{ApiRouteError}},{process:{env}}).accountEmailDeliveryConfig();
  const local={NODE_ENV:'development',AUTH_EMAIL_TEST_INBOX_URL:'http://127.0.0.1:55324',NEXT_PUBLIC_SUPABASE_URL:'http://localhost:55321'};
  assert.equal(config(local).inboxUrl,local.AUTH_EMAIL_TEST_INBOX_URL);
  for(const env of [{...local,NODE_ENV:'production'},{...local,NEXT_PUBLIC_SUPABASE_URL:'https://remote.supabase.co'},{...local,SUPABASE_URL:'https://remote.supabase.co'},{...local,AUTH_EMAIL_TEST_INBOX_URL:'https://example.com'}])assert.throws(()=>config(env));
  assert.throws(()=>config({NODE_ENV:'production'}),{code:'ACCOUNT_EMAIL_NOT_CONFIGURED'});
});

test('new-email HTML and plain text deliver the same single code through both transports',async()=>{
  for(const config of [{inboxUrl:'http://127.0.0.1:55324'},{apiKey:'fixture'}]) {
    let sent;
    const {sendNewAccountEmailCode}=load('../src/lib/account-email-delivery-server.ts',{'server-only':{},'@/lib/api-contracts':{ApiRouteError}},{
      fetch:async(url,options)=>{sent={url,...JSON.parse(options.body)};return {ok:true};},
    });
    await sendNewAccountEmailCode(config,'next@example.test','00123456',AbortSignal.timeout(1000));
    const local='inboxUrl' in config;
    assert.equal(sent.url,local?'http://127.0.0.1:55324/api/v1/send':'https://api.resend.com/emails');
    assert.equal(local?sent.To[0].Email:sent.to[0],'next@example.test');
    for(const body of [local?sent.HTML:sent.html,local?sent.Text:sent.text]) {
      assert.deepEqual(body.match(/\b\d{8}\b/gu),['00123456']);
      assert.ok(!body.includes('/auth/v1/verify'));
    }
  }
});
