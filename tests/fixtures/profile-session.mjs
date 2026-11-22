export const userId = "00000000-0000-0000-0000-000000000042";
export const user = { id: userId, aud: "authenticated", role: "authenticated", email: "profile@example.invalid", email_confirmed_at: "2026-01-01", app_metadata: {}, user_metadata: {} };

export async function installProfileSession(context, authUrl) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const session = { access_token: `${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,exp,aud:"authenticated",role:"authenticated"})}.fixture`, refresh_token: "fixture", expires_at: exp, expires_in: 3600, token_type: "bearer", user };
  await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)), {key:`sb-${new URL(authUrl).hostname.split(".")[0]}-auth-token`,session});
  await context.route(`${new URL(authUrl).origin}/**`, route=>route.fulfill({json:user}));
}
