// Run with: node --conditions=react-server --import tsx scripts/test-auth-email-templates.mjs
// Uses only the isolated Auth stack; retains captured mail for local preview.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { requestAccountEmailChange } from "../src/lib/account-email-change-server.ts";

const status = JSON.parse(execFileSync(process.execPath, [resolve("node_modules/supabase/dist/supabase.js"),
  "status", "--workdir", "temp/auth-otp-local", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
assert.equal(status.API_URL, "http://127.0.0.1:55321");
assert.equal(status.MAILPIT_URL, "http://127.0.0.1:55324");
const container = JSON.parse(execFileSync("docker", ["inspect", "supabase_auth_hhwx-auth-test"]))[0];
const settings = Object.fromEntries(container.Config.Env.map((entry) => {
  const separator = entry.indexOf("=");
  return [entry.slice(0, separator), entry.slice(separator + 1)];
}));
assert.equal(settings.GOTRUE_SMTP_HOST, "supabase_inbucket_hhwx-auth-test");
assert.equal(settings.GOTRUE_SITE_URL, "http://localhost:3000");
const subjects = JSON.parse(readFileSync("supabase/templates/auth/subjects.json", "utf8"));
for (const [name, subject] of Object.entries(subjects)) {
  const suffix = ["password_changed", "email_changed"].includes(name) ? `${name}_notification` : name;
  assert.equal(settings[`GOTRUE_MAILER_SUBJECTS_${suffix.toUpperCase()}`], subject, `Sync the local ${name} subject first`);
}
for (const name of ["INVITE", "EMAIL_CHANGE", "REAUTHENTICATION"]) {
  assert.equal(settings[`GOTRUE_MAILER_TEMPLATES_${name}`], undefined);
  assert.equal(settings[`GOTRUE_MAILER_SUBJECTS_${name}`], undefined);
}

Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  AUTH_EMAIL_TEST_INBOX_URL: status.MAILPIT_URL,
});
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const client = () => createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
const admin = createClient(status.API_URL, status.SECRET_KEY, options);
const captchaToken = "XXXX.DUMMY.TOKEN.XXXX";
const prefix = `hhwx-mail-${Date.now()}-`;
const email = `${prefix}account@example.test`;
const seen = new Set();
const subject = {
  register: "HHWX 账号注册 / Account registration",
  current: "HHWX 更换邮箱：验证当前邮箱 / Email change: verify current email",
  next: "HHWX 更换邮箱：验证新邮箱 / Email change: verify new email",
  identity: "HHWX 身份验证 / Identity verification",
};

function ok(result) {
  assert.equal(result.error?.message, undefined);
  return result.data;
}

async function mail(recipient, expectedSubject, ...copy) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const list = await fetch(`${status.MAILPIT_URL}/api/v1/messages?limit=500`).then((response) => response.json());
    const item = list.messages.find((message) => !seen.has(message.ID)
      && message.To.some((to) => to.Address === recipient) && message.Subject === expectedSubject);
    if (item) {
      seen.add(item.ID);
      const message = await fetch(`${status.MAILPIT_URL}/api/v1/message/${item.ID}`).then((response) => response.json());
      for (const text of copy) assert.match(message.Text, text);
      assert.doesNotMatch(message.HTML, /\{\{|\}\}/u, "Go templates must be rendered");
      assert.doesNotMatch(message.Subject, /验证码/u);
      console.log(`PASS ${expectedSubject} http://localhost:55324/view/${item.ID}`);
      return { ...message, code: message.Text.match(/\b\d{8}\b/u)?.[0] };
    }
    await delay(250);
  }
  throw new Error(`Missing captured email: ${expectedSubject} -> ${recipient}`);
}

function clearCooldown(address) {
  assert.ok(address.startsWith(prefix) && /^[a-z0-9@.\-]+$/u.test(address));
  execFileSync("docker", ["exec", "-i", "supabase_db_hhwx-auth-test", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], {
    input: `update auth.users set confirmation_sent_at=null,recovery_sent_at=null where email='${address}';`,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

async function sendOtp(address, path, shouldCreateUser) {
  const otp = client();
  ok(await otp.auth.signInWithOtp({ email: address, options: {
    shouldCreateUser, captchaToken,
    ...(path ? { emailRedirectTo: new URL(path, settings.GOTRUE_SITE_URL).href } : {}),
  } }));
  return otp;
}

try {
  await sendOtp(email, "/auth?mode=register", true);
  await mail(email, subject.register, /继续注册 HHWX 账号/u, /Enter this code on HHWX to continue signing up/u);
  clearCooldown(email);
  const registration = await sendOtp(email, "/auth?mode=register", true);
  const repeated = await mail(email, subject.register, /继续注册 HHWX 账号/u, /Enter this code on HHWX to continue signing up/u);
  const registered = ok(await registration.auth.verifyOtp({ email, token: repeated.code, type: "email" }));
  // Confirmed Auth users select magic_link rather than confirmation on repeat registration.
  clearCooldown(email);
  await sendOtp(email, "/auth?mode=register", true);
  await mail(email, subject.register, /继续注册 HHWX 账号/u, /Enter this code on HHWX to continue signing up/u);

  clearCooldown(email);
  const recovery = client();
  ok(await recovery.auth.resetPasswordForEmail(email, { captchaToken }));
  const reset = await mail(email, subjects.recovery, /重置你的 HHWX 账号密码/u, /Enter this code on HHWX to reset your password/u);
  ok(await recovery.auth.verifyOtp({ email, token: reset.code, type: "recovery" }));
  ok(await recovery.auth.updateUser({ password: "PreviewPassword123!" }));
  await mail(email, subjects.password_changed, /密码已更改/u, /Your HHWX account password has changed/u);

  clearCooldown(email);
  await sendOtp(email, "/account/email", false);
  await mail(email, subject.current, /验证当前邮箱并继续更换登录邮箱/u, /Enter this code on HHWX to verify your current email and continue changing your email/u);
  clearCooldown(email);
  const current = await sendOtp(email, "/account/email", false);
  const currentMail = await mail(email, subject.current, /验证当前邮箱并继续更换登录邮箱/u, /Enter this code on HHWX to verify your current email and continue changing your email/u);
  assert.doesNotMatch(currentMail.Text, /新邮箱|New email/u);
  const proof = ok(await current.auth.verifyOtp({ email, token: currentMail.code, type: "email" }));
  const newEmail = `${prefix}new@example.test`;
  await requestAccountEmailChange({ id: registered.user.id, email }, proof.session.access_token, newEmail);
  const next = await mail(newEmail, subject.next, /验证新邮箱并完成登录邮箱更换/u, /Enter this code on HHWX to verify your new email and finish changing your email/u);
  ok(await client().auth.verifyOtp({ email: newEmail, token: next.code, type: "email_change" }));
  await mail(email, subjects.email_changed, /登录邮箱已更换/u, /Your HHWX sign-in email address has changed/u);

  clearCooldown(newEmail);
  await sendOtp(newEmail, undefined, false);
  await mail(newEmail, subject.identity, /验证你的 HHWX 账号身份/u, /Enter this code on HHWX to verify your identity/u);
  console.log(`Captured ${seen.size} messages. Preview: http://localhost:55324`);
} finally {
  const users = [];
  for (let page = 1; ; page++) {
    const data = ok(await admin.auth.admin.listUsers({ page, perPage: 100 }));
    users.push(...data.users.filter((user) => user.email?.startsWith(prefix)));
    if (data.users.length < 100) break;
  }
  for (const user of users) ok(await admin.auth.admin.deleteUser(user.id));
}
