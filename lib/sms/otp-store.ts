/**
 * Shared in-memory OTP store.
 *
 * Lives outside the route file because Next 16 rejects non-HTTP exports from
 * `app/api/**\/route.ts`. Swap this for a real Redis/DB store when we go
 * multi-instance — right now it only works because dev/prod both run one node
 * process.
 */
export const otpStore = new Map<
  string,
  { code: string; expiresAt: number }
>()
