# Email setup (Resend)

SANGA sends welcome, loan-decision, deposit-confirmation, and statement
emails via [Resend](https://resend.com). Everything is already wired in
code (`lib/email/send.ts`, `app/api/email/send/route.ts`) and uses the
`notifications@sanga.africa` sender. Until you add the three DNS records
below, every send will fail with "The domain is not verified" and the
`log_email_failure` audit row will record why.

## 1. Add the domain in Resend

1. Log into Resend → Domains → Add Domain.
2. Enter `sanga.africa`.
3. Resend will show you three record sets to add. **Copy each exactly
   as shown in the dashboard** — values below are the shape, not the
   literal values you'll paste.

## 2. DNS records (add to your DNS provider for `sanga.africa`)

### SPF

| Type | Name | Value                               |
|------|------|-------------------------------------|
| TXT  | `@`  | `v=spf1 include:amazonses.com ~all` |

If you already have a TXT SPF record at `@`, **merge** — don't add a
second one. Combine the `include:` directives into the existing
record.

### DKIM

Resend gives you a CNAME like this (the `resend._domainkey` name is
fixed, the target changes per account):

| Type  | Name                                | Value                                     |
|-------|-------------------------------------|-------------------------------------------|
| CNAME | `resend._domainkey`                 | `resend._domainkey.<region>.amazonses.com` |

Paste exactly what the Resend dashboard shows.

### DMARC (optional but recommended)

| Type | Name      | Value                                                 |
|------|-----------|-------------------------------------------------------|
| TXT  | `_dmarc`  | `v=DMARC1; p=none; rua=mailto:dmarc@sanga.africa`     |

Start with `p=none` (monitor only). After a week of clean reports,
bump to `p=quarantine`, then `p=reject`.

## 3. Verify

1. Back in Resend → Domains → `sanga.africa` → click **Verify DNS records**.
2. All three rows should go green. If one stays red, the dashboard
   shows exactly which value mismatches.
3. Send a test email from the dashboard or run:

   ```bash
   curl -X POST https://sanga.africa/api/email/send \
     -H "Content-Type: application/json" \
     -H "Cookie: <your admin session cookie>" \
     -d '{"type":"welcome","to":"you@example.com","data":{"name":"Test","memberNumber":"SGA-TEST"}}'
   ```

## 4. Environment variables

Set `RESEND_API_KEY` in:

- `.env.local` (dev)
- Vercel → Project → Settings → Environment Variables (Production + Preview)

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxx
```

Redeploy after adding in Vercel; `sendEmail` lazily constructs the
Resend client, so a missing key at build time is harmless but a missing
key at runtime makes every send fail.

## Notes

- `from:` is hard-coded to `SANGA <notifications@sanga.africa>` in
  `lib/email/send.ts`. Update that constant if you ever use a different
  sender.
- Failures are swallowed by `sendEmail` on purpose (we don't want a
  transient Resend outage to 500 a teller deposit). They still land in
  `audit_logs` with `action = log_email_failure`, so grep there to
  confirm every expected send actually went out.
