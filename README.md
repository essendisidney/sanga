This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Experience modes

Members can switch their dashboard layout at any time from the in-header
`ExperienceToggle` control:

- **Digital first** (`/dashboard`) — full feature set: social feed, instant
  loans, challenges, recommendations.
- **Simplified** (`/dashboard/simplified`) — bigger text, fewer choices,
  prominent support phone/email pulled from `saccos.contact_phone` and
  `saccos.contact_email`.
- **Hybrid** — currently routes to `/dashboard` but the preference is
  stored and available for future layout differentiation.

Preference is persisted per user in `user_personas.experience_mode` via
the `set_experience_mode(p_mode)` RPC, with a `localStorage` fast-path so
first paint after login doesn't flicker. The regular dashboard auto-
redirects to `/dashboard/simplified` if the saved preference is
`simplified`.

## USSD

A read-only USSD menu is available at `POST /api/ussd`, compatible with
Africa's Talking's webhook format. Menu:

```
*384*SANGA#
1. Balance
2. Recent transactions
3. Loan eligibility
4. Support
0. Exit
```

All current options are read-only and require no PIN — they only expose
information the SIM holder already practically controls. Write options
(loan apply, withdraw) are gated behind a 4–6 digit PIN stored as a
`pgcrypto` bf-salted hash in `users.ussd_pin_hash`. Members set their
PIN in the app via `PATCH /api/me/ussd-pin`.

### Wiring up with Africa's Talking

1. Sign up at <https://africastalking.com> and provision a USSD
   shortcode.
2. Set the callback URL to
   `https://YOUR_DOMAIN/api/ussd?secret=YOUR_SECRET`.
3. Add `USSD_WEBHOOK_SECRET=YOUR_SECRET` to your Vercel env. Without it
   set, the route warns in logs but still accepts requests — fine for
   local development, not fine for production.
4. Phones are matched in either `+254…` or `254…` form, because
   historical imports stored both.

## Family accounts

Members can link to other members (`parent`, `child`, `guardian`,
`spouse`, `sibling`, `dependant`) and grant opt-in permissions:

- **`can_guarantee`** — linked member auto-surfaces in the loan
  application UI as a pre-approved guarantor option.
- **`can_view_balance`** — linked member may call
  `GET /api/me/family-balance/:userId` to see savings / shares / loan
  balance. Enforced server-side by `get_family_balance` RPC; member
  accounts RLS is NOT broadened (so a bug in the RPC can't leak
  balances into unrelated admin queries).

Links are **directional and consented**: the initiator creates a
`pending` invite via `POST /api/me/family-links`, and only the
**invitee** can move it to `accepted` via
`POST /api/me/family-links/:id/respond`. Either party can revoke via
`DELETE /api/me/family-links/:id`. Revocations set `status='revoked'`
rather than deleting the row, so the audit trail survives.

## Configurable loan rules

`loan_rules_by_age` stores age-bracketed loan parameters
(`requires_guarantors`, `min_guarantors`, `max_instant_loan`,
`interest_rate`). `GET /api/loans/applicable-rule` resolves the
applicable row via `get_applicable_loan_rule(user_id, sacco_id)`.

**Compliance warning** (included in the migration file too):
differential loan terms based on a borrower's age per se may violate
consumer-protection / SACCO regulations in Kenya and elsewhere.
`social_credit_scores` + `instant_loan_rules` already give you
risk-based differentiation and are the recommended decision signal.
Flip `is_active = FALSE` on all age rows if compliance says no, and
the resolver returns empty — callers should then defer to
`instant_loan_rules`.
