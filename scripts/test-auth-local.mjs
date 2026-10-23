// Run only against the disposable stack described in documents/account-auth-flow.md.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

const workdir = process.env.AUTH_TEST_WORKDIR || 'temp/auth-otp-local';
const appUrl = process.env.AUTH_TEST_APP_URL || 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(appUrl).hostname), 'App must be local');
const status = JSON.parse(execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'status', '--workdir', workdir, '-o', 'json'], {encoding:'utf8',stdio:['ignore','pipe','ignore']}));
assert.equal(status.API_URL, 'http://127.0.0.1:55321', 'Use the isolated Auth test stack on port 55321');
assert.equal(status.MAILPIT_URL, 'http://127.0.0.1:55324');
const settings = JSON.parse(execFileSync('docker',['inspect','supabase_auth_hhwx-auth-test'],{encoding:'utf8'}))[0];
const captchaToken = 'XXXX.DUMMY.TOKEN.XXXX';
const testAuthSettings = {
  GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD: 'true',
  GOTRUE_SECURITY_CAPTCHA_ENABLED: 'true',
  GOTRUE_SECURITY_CAPTCHA_PROVIDER: 'turnstile',
  GOTRUE_SECURITY_CAPTCHA_SECRET: '1x0000000000000000000000000000000AA',
};
// The current CLI does not expose this Auth setting. Recreate only this disposable,
// stateless Auth container with the password flag and official CAPTCHA test keys.
if (Object.entries(testAuthSettings).some(([key,value])=>!settings.Config.Env.includes(`${key}=${value}`))) {
  assert.equal(settings.Name, '/supabase_auth_hhwx-auth-test');
  assert.equal(settings.Mounts.length, 0);
  const args=['create','--name','supabase_auth_hhwx-auth-test','--network',Object.keys(settings.NetworkSettings.Networks)[0]];
  for(const item of settings.Config.Env.filter(value=>!(value.split('=')[0] in testAuthSettings)))args.push('--env',item);
  for(const [key,value] of Object.entries(testAuthSettings))args.push('--env',`${key}=${value}`);
  for(const [key,value] of Object.entries(settings.Config.Labels||{}))args.push('--label',key+'='+value);
  args.push(settings.Config.Image,...settings.Config.Cmd);
  execFileSync('docker',['rm','-f','supabase_auth_hhwx-auth-test'],{stdio:'ignore'});
  execFileSync('docker',args,{stdio:'ignore'});
  execFileSync('docker',['start','supabase_auth_hhwx-auth-test'],{stdio:'ignore'});
  execFileSync('docker',['restart','supabase_kong_hhwx-auth-test'],{stdio:'ignore'});
}

assert.ok(settings.Config.Env.includes('GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=true'));
for(let attempt=0;attempt<40;attempt++) {
  const ready=await fetch(status.API_URL+'/auth/v1/health',{signal:AbortSignal.timeout(1000)}).then(r=>r.ok).catch(()=>false);
  if(ready)break;
  assert.ok(attempt<39,'Local Auth did not become ready after container recreation');
  await delay(500);
}
// Replay the actual cutover in a rollback-only transaction with legacy fixtures.
const migration=readFileSync('supabase/migrations/20261022111732_native_auth_otp_registration.sql','utf8');
const cutover=`begin;
drop trigger complete_hhwx_registration on auth.users;
drop function account_private.complete_registration();
drop policy registration_insert on public.bandori_event_schedules_cn;
drop policy registration_update on public.bandori_event_schedules_cn;
create table public.account_email_verifications(id uuid);
insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data,raw_app_meta_data,email_change,email_change_token_new,email_change_token_current,email_change_confirm_status)
values ('d1111111-1111-4111-8111-111111111111','cutover-verified@example.com','fixture',now(),'{"username":"Trusted legacy"}','{}','','','',0),
('d2222222-2222-4222-8222-222222222222','cutover-pending@example.com','fixture',now(),'{"username":"Pending legacy"}','{}','cutover-change@example.com','old-new','old-current',1);
insert into public.account_status(user_id,email_verified_at) values ('d1111111-1111-4111-8111-111111111111',now()),('d2222222-2222-4222-8222-222222222222',null);
insert into auth.one_time_tokens(id,user_id,token_type,token_hash,relates_to) values (gen_random_uuid(),'d2222222-2222-4222-8222-222222222222','email_change_token_new','old-new','cutover-change@example.com');
${migration}
do $$ begin
assert (select raw_app_meta_data->'hhwx_registration'->>'id' is not null from auth.users where id='d1111111-1111-4111-8111-111111111111');
assert (select raw_app_meta_data->'hhwx_registration'->>'id' is null from auth.users where id='d2222222-2222-4222-8222-222222222222');
assert (select email='cutover-pending@example.com' and email_change='' and email_change_token_new='' and email_change_token_current='' and email_change_confirm_status=0 from auth.users where id='d2222222-2222-4222-8222-222222222222');
assert not exists(select 1 from auth.one_time_tokens where user_id='d2222222-2222-4222-8222-222222222222');
assert (select username='Pending legacy' from public.profiles where id='d2222222-2222-4222-8222-222222222222');
end $$;
rollback;`;
execFileSync('docker',['exec','-i','supabase_db_hhwx-auth-test','psql','-U','postgres','-v','ON_ERROR_STOP=1'],{input:cutover,stdio:['pipe','pipe','pipe']});
console.log('PASS migration replay: trusted legacy accounts retained, pending email changes canceled without deleting accounts');
const create = () => createClient(status.API_URL,status.PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const admin = createClient(status.API_URL,status.SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const users = [];
const run = Date.now();
async function api(path, session, body, method='POST') {
  const response=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.access_token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
}
async function latestMail(email, nativeEmailChange = false) {
  const list=await fetch(status.MAILPIT_URL+'/api/v1/messages?limit=100').then(r=>r.json());
  const item=list.messages.find(m=>m.To.some(to=>to.Address===email));
  assert.ok(item,`Missing local test mail for ${email}`);
  const mail=await fetch(status.MAILPIT_URL+'/api/v1/message/'+item.ID).then(r=>r.json());
  if (nativeEmailChange) {
    const href = mail.HTML.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/u)?.[1];
    assert.ok(href, 'Default native email-change mail must contain its confirmation link');
    const link = new URL(href.replaceAll('&amp;', '&'));
    assert.equal(link.origin, status.API_URL);
    assert.equal(link.searchParams.get('type'), 'email_change');
    assert.ok(link.searchParams.get('token'));
    return { ...mail, tokenHash: link.searchParams.get('token') };
  }
  assert.ok(!mail.HTML.includes('/auth/v1/verify'), 'OTP mail must not contain a consumable verification link');
  return {...mail,code:mail.Text.match(/\b\d{8}\b/u)?.[0]};
}
async function newRegistration(label, username='Shared nickname') {
  const client=create(),email=`hhwx-auth-${run}-${label}@example.com`;
  assert.equal((await client.auth.signInWithOtp({email,options:{captchaToken}})).error,null);
  const mail=await latestMail(email);assert.match(mail.code,/^\d{8}$/u);
  const wrong=await client.auth.verifyOtp({email,type:'email',token:mail.code==='00000000'?'00000001':'00000000'});assert.ok(wrong.error);
  const verified=await client.auth.verifyOtp({email,type:'email',token:mail.code});assert.equal(verified.error,null);
  users.push(verified.data.user.id);
  assert.equal((await client.auth.verifyOtp({email,type:'email',token:mail.code})).error?.code,'otp_expired');
  const session=verified.data.session;
  assert.equal((await api('/api/account/profile',session,null,'GET')).body.data.emailVerified,false);
  assert.equal((await api('/api/account/profile',session,{username:'Not yet'},'PUT')).status,403);
  const submissions=[{username,password:'RaceWinner123!'},{username:username+' other',password:'OtherWinner123!'}];
  const results=await Promise.all(submissions.map(body=>api('/api/auth/signup',session,body)));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const winner=submissions[results.findIndex(r=>r.status===200)];
  const login=await client.auth.signInWithPassword({email,password:winner.password,options:{captchaToken}});assert.equal(login.error,null);
  const profile=await api('/api/account/profile',login.data.session,null,'GET');
  assert.equal(profile.body.data.username,winner.username);assert.equal(profile.body.data.emailVerified,true);
  assert.equal((await api('/api/auth/signup',login.data.session,{username:'Overwrite',password:'Overwrite123!'})).status,409);
  return {client,email,session:login.data.session,password:winner.password,username:winner.username};
}
try {
  const blocked=create(),blockedEmail=`hhwx-auth-${run}-blocked@example.com`;
  for(const result of [await blocked.auth.signInWithOtp({email:blockedEmail}),await blocked.auth.resetPasswordForEmail(blockedEmail),await blocked.auth.signInWithPassword({email:blockedEmail,password:'Test123456!'})]) {
    assert.equal(result.error?.code,'captcha_failed','Auth must reject missing CAPTCHA before login or mail');
  }
  console.log('PASS native CAPTCHA: registration, recovery and login reject missing tokens');
  assert.equal((await api('/api/auth/signup',null,{username:'No session',password:'Test123456!'})).status,401);
  const a=await newRegistration('a');
  const ordinary=await a.client.auth.updateUser({password:'DirectPassword123!'});
  assert.equal(ordinary.error?.code,'current_password_required');
  assert.equal((await a.client.auth.resetPasswordForEmail(a.email,{captchaToken})).error,null);
  const recovery=await latestMail(a.email);
  assert.equal((await a.client.auth.verifyOtp({email:a.email,type:'recovery',token:recovery.code})).error,null);
  assert.equal((await a.client.auth.updateUser({password:'RecoveredPassword123!'})).error,null);
  assert.equal((await create().auth.signInWithPassword({email:a.email,password:a.password,options:{captchaToken}})).error?.code,'invalid_credentials');
  const recovered=await a.client.auth.getSession();a.session=recovered.data.session;
  console.log('PASS registration: wrong/replayed OTP, pending restrictions, atomic concurrent completion, no overwrite; password recovery with both security flags');
  const b=await newRegistration('b',a.username);
  // Race winner can differ; deliberately set the second display name to the first.
  assert.equal((await api('/api/account/profile',b.session,{username:a.username},'PUT')).status,200);
  console.log('PASS duplicate display nicknames');
  for(const [account,newFirst] of [[a,false],[b,true]]) {
    const newEmail=account.email.replace('@','-new@');
    assert.equal((await account.client.auth.setSession(account.session)).error,null);
    assert.equal((await account.client.auth.updateUser({email:newEmail})).error,null);
    assert.equal((await api('/api/account/profile',account.session,null,'GET')).body.data.emailVerified,true);
    const oldMail=await latestMail(account.email,true),newMail=await latestMail(newEmail,true);
    assert.notEqual(oldMail.tokenHash,newMail.tokenHash);
    const first=newFirst?newMail.tokenHash:oldMail.tokenHash;
    const second=newFirst?oldMail.tokenHash:newMail.tokenHash;
    const invalid=first.slice(0,-1)+(first.endsWith('0')?'1':'0');
    assert.ok((await create().auth.verifyOtp({type:'email_change',token_hash:invalid})).error);
    const one=await create().auth.verifyOtp({type:'email_change',token_hash:first});assert.equal(one.error,null);assert.equal(one.data.session,null);
    assert.equal((await admin.auth.admin.getUserById(account.session.user.id)).data.user.email,account.email);
    const two=await create().auth.verifyOtp({type:'email_change',token_hash:second});assert.equal(two.error,null);assert.equal(two.data.user.email,newEmail);assert.ok(two.data.session);
    assert.ok((await create().auth.verifyOtp({type:'email_change',token_hash:first})).error);
  }
  console.log('PASS native email change: separate default links, invalid/replayed links rejected, either confirmation order, first confirmation never switches email');
  // The app's local inbox captures admin-generated new-address codes without Resend.
  const sql = (statement) => execFileSync('docker',['exec','-i','supabase_db_hhwx-auth-test','psql','-U','postgres','-v','ON_ERROR_STOP=1'],{input:statement,stdio:['pipe','pipe','pipe']});
  async function currentProof(account) {
    sql(`update auth.users set recovery_sent_at=null where id='${account.session.user.id}'`);
    const client=create();
    assert.equal((await client.auth.signInWithOtp({email:account.email,options:{shouldCreateUser:false,captchaToken}})).error,null);
    const mail=await latestMail(account.email);
    const result=await client.auth.verifyOtp({email:account.email,type:'email',token:mail.code});assert.equal(result.error,null);
    return {client,session:result.data.session};
  }
  async function mailCount(email) {
    const list=await fetch(status.MAILPIT_URL+'/api/v1/messages?limit=500').then(r=>r.json());
    return list.messages.filter(m=>m.To.some(to=>to.Address===email)).length;
  }
  const c=await newRegistration('sequential'),nextEmail=c.email.replace('@','-new@');
  const change=(account,proofToken,email)=>api('/api/auth/email',account.session,{action:'update',newEmail:email,proofToken,captchaToken});
  assert.equal((await change(c,undefined,nextEmail)).status,403);
  assert.equal((await change(c,c.session.access_token,nextEmail)).status,403,'password-only session cannot authorize email change');
  assert.equal((await change(c,a.session.access_token,nextEmail)).status,403,'another account proof cannot authorize email change');
  const cProof=await currentProof(c),oldCount=await mailCount(c.email);
  const noCaptcha=await api('/api/auth/email',c.session,{action:'update',newEmail:nextEmail,proofToken:cProof.session.access_token});
  assert.equal(noCaptcha.status,400);assert.equal(noCaptcha.body.error.code,'TURNSTILE_REQUIRED');
  const requests=await Promise.all([change(c,cProof.session.access_token,nextEmail),change(c,cProof.session.access_token,nextEmail)]);
  assert.deepEqual(requests.map(r=>r.status).sort(),[200,429],JSON.stringify(requests));
  const success=requests.find(r=>r.status===200);assert.deepEqual(Object.keys(success.body.data).sort(),['currentEmail','newEmail']);
  assert.equal(await mailCount(c.email),oldCount,'new email step must not send another old-address mail');
  const nextMail=await latestMail(nextEmail);assert.match(nextMail.Text,/完成登录邮箱更换/u);assert.match(nextMail.Subject,/新邮箱/u);
  assert.equal(nextMail.Text.match(/\b\d{8}\b/gu)?.length,1,'new email text contains one copyable code');
  assert.equal((await admin.auth.admin.getUserById(c.session.user.id)).data.user.email,c.email);
  assert.ok((await create().auth.verifyOtp({email:nextEmail,type:'email_change',token:nextMail.code==='00000000'?'00000001':'00000000'})).error);
  const sessionId=JSON.parse(Buffer.from(cProof.session.access_token.split('.')[1],'base64url')).session_id;
  assert.match(sessionId,/^[\da-f-]{36}$/u);
  sql(`update auth.mfa_amr_claims set created_at=now()-interval '16 minutes',updated_at=now()-interval '16 minutes' where session_id='${sessionId}' and authentication_method='otp'`);
  const refreshed=await cProof.client.auth.refreshSession();assert.equal(refreshed.error,null);
  assert.equal((await change(c,refreshed.data.session.access_token,nextEmail)).status,403,'refreshing a JWT cannot renew old email proof');
  const completed=await create().auth.verifyOtp({email:nextEmail,type:'email_change',token:nextMail.code});assert.equal(completed.error,null);assert.equal(completed.data.user.email,nextEmail);
  assert.ok((await create().auth.verifyOtp({email:nextEmail,type:'email_change',token:nextMail.code})).error);
  console.log('PASS sequential email: old proof required, password/other-account denied, concurrent send limited, only new address mailed; stale refreshed proof cannot resend but pending code still completes');
  const d=await newRegistration('resend'),dProof=await currentProof(d);
  const firstEmail=d.email.replace('@','-first@'),secondEmail=d.email.replace('@','-second@');
  assert.equal((await change(d,dProof.session.access_token,firstEmail)).status,200);
  const firstMail=await latestMail(firstEmail);
  sql(`update account_private.email_change_dispatches set attempted_at=attempted_at-interval '61 seconds' where user_id='${d.session.user.id}'`);
  assert.equal((await change(d,dProof.session.access_token,secondEmail)).status,200);
  const secondMail=await latestMail(secondEmail);
  assert.ok((await create().auth.verifyOtp({email:firstEmail,type:'email_change',token:firstMail.code})).error,'superseded destination code must not complete another request');
  sql(`update auth.users set email_change_sent_at=now()-interval '61 minutes' where id='${d.session.user.id}'; update auth.one_time_tokens set created_at=now()-interval '61 minutes' where user_id='${d.session.user.id}' and token_type='email_change_token_new'`);
  assert.ok((await create().auth.verifyOtp({email:secondEmail,type:'email_change',token:secondMail.code})).error,'new email OTP expires after one hour');
  assert.equal((await admin.auth.admin.getUserById(d.session.user.id)).data.user.email,d.email);
  sql(`update account_private.email_change_dispatches set attempted_at=attempted_at-interval '61 seconds' where user_id='${d.session.user.id}'`);
  assert.equal((await change(d,dProof.session.access_token,secondEmail)).status,200);
  const resent=await latestMail(secondEmail);
  assert.ok((await create().auth.verifyOtp({email:secondEmail,type:'email_change',token:secondMail.code})).error,'resending to the same address invalidates the earlier code');
  const changed=await create().auth.verifyOtp({email:secondEmail,type:'email_change',token:resent.code});assert.equal(changed.error,null);assert.equal(changed.data.user.email,secondEmail);
  const afterChange=await api('/api/auth/email',changed.data.session,{action:'update',newEmail:firstEmail,proofToken:dProof.session.access_token,captchaToken});assert.equal(afterChange.status,403,'proof for a former email cannot authorize another change');
  console.log('PASS sequential resend: changed targets and resends invalidate old codes, native OTP expires after one hour, previous-email proof is rejected after completion');
  const legacyEmail=`hhwx-auth-${run}-legacy@example.com`;
  const legacy=await admin.auth.admin.createUser({email:legacyEmail,password:'LegacyPassword123!',email_confirm:true,user_metadata:{username:'Preserved nickname'}});assert.equal(legacy.error,null);users.push(legacy.data.user.id);
  const before=await admin.from('profiles').select('public_uid,username').eq('id',legacy.data.user.id).single();assert.equal(before.error,null);
  const legacyClient=create();
  const oldLogin=await create().auth.signInWithPassword({email:legacyEmail,password:'LegacyPassword123!',options:{captchaToken}});assert.equal(oldLogin.error,null);
  assert.equal((await legacyClient.auth.resetPasswordForEmail(legacyEmail,{captchaToken})).error,null);
  const legacyMail=await latestMail(legacyEmail);const proof=await legacyClient.auth.verifyOtp({email:legacyEmail,type:'recovery',token:legacyMail.code});assert.equal(proof.error,null);
  assert.equal((await api('/api/auth/signup',proof.data.session,{username:before.data.username,password:'NewLegacyPassword123!'})).status,200);
  const after=await admin.from('profiles').select('public_uid,username').eq('id',legacy.data.user.id).single();assert.deepEqual(after.data,before.data);
  assert.equal((await create().auth.signInWithPassword({email:legacyEmail,password:'LegacyPassword123!',options:{captchaToken}})).error?.code,'invalid_credentials');
  assert.equal((await api('/api/account/profile',oldLogin.data.session,{username:'Old session overwrite'},'PUT')).status,401, 'pre-verification sessions must not gain write permissions after completion');
  console.log('PASS retained legacy account: email proof and new password preserve ID, public UID and display name');
} finally {
  for(const id of users) { const result=await admin.auth.admin.deleteUser(id);assert.equal(result.error,null); }
}
