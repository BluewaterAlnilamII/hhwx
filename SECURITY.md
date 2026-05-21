# Security Policy

中文说明见 [SECURITY.zh-CN.md](SECURITY.zh-CN.md).

## Reporting

Please report security issues privately by emailing:

```text
bluewater.alnilam.ii@gmail.com
```

Do not open a public GitHub issue for vulnerabilities, leaked credentials, auth bypasses, private user data exposure, or production infrastructure details.

## Sensitive Areas

The most sensitive parts of this project are:

- Supabase service-role access and row-level security policies;
- account, email, password reset, and verified-user authorization flows;
- game profile import, sync, export, and binding APIs;
- Cloudflare Turnstile verification;
- HHWX user fetcher service tokens;
- CDN and asset proxy behavior.

## Secret Handling

Never commit real values for:

- `.env.local` or any `.env*` file except `.env.example`;
- `SUPABASE_SECRET_KEY`;
- `TURNSTILE_SECRET_KEY`;
- `HHWX_USER_FETCHER_TOKEN`;
- Cloudflare R2 access keys or secret keys;
- Bilibili session tokens or signatures;
- private deployment scripts with hostnames, ports, or SSH keys.

If a secret is accidentally committed, rotate it immediately and remove it from the repository history before making the repository public.
