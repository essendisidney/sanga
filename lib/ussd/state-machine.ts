import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * USSD state machine for SANGA.
 *
 * Compatible with Africa's Talking USSD webhook payloads. The provider
 * accumulates user input as a star-separated `text` string. Each
 * response begins with either:
 *   - "CON "  – session continues, expect more input
 *   - "END "  – session terminates after this message
 *
 * Strict 182-char USSD limit per response is observed.
 *
 * Phone authentication model:
 *   - Read-only menus (balance, recent tx, eligibility, support) are
 *     served without a PIN. Practical access risk is no higher than
 *     someone holding the SIM walking into a branch with the same
 *     phone, and our SMS confirmations cover repudiation.
 *   - Write-side menus (loan apply, withdraw) require a PIN, which the
 *     member sets in the app via PATCH /api/me/ussd-pin. Until the PIN
 *     system is wired into the menu options, write paths return a
 *     friendly "open the app first" message.
 */

const MAX_RESPONSE = 182

type Step = 'CON' | 'END'

export interface UssdResponse {
  step: Step
  body: string
}

export interface UssdInput {
  sessionId: string
  serviceCode: string
  phoneNumber: string
  text: string
}

export function makeResponse(step: Step, body: string): UssdResponse {
  // pad/clamp body to USSD limits
  const safe = body.replace(/\s+$/g, '').slice(0, MAX_RESPONSE)
  return { step, body: safe }
}

export function formatResponse(r: UssdResponse): string {
  return `${r.step} ${r.body}`
}

/**
 * Normalise a phone number to E.164 (+254...) for Kenyan numbers.
 * Africa's Talking already sends +254... but the rest of our system
 * stores +254 too (the auth provider normalises). Accept 0..., 254...,
 * +254... defensively.
 */
export function normalisePhone(raw: string): string {
  if (!raw) return ''
  let n = String(raw).trim().replace(/\s+/g, '').replace(/[^0-9+]/g, '')
  if (n.startsWith('+')) return n
  if (n.startsWith('254')) return `+${n}`
  if (n.startsWith('0') && n.length === 10) return `+254${n.slice(1)}`
  if (n.length === 9) return `+254${n}`
  return n
}

interface MemberContext {
  user_id: string
  full_name: string | null
  has_pin: boolean
  membership_id: string | null
  sacco_id: string | null
  sacco_name: string | null
  support_phone: string | null
  savings: number
  shares: number
  loan_balance: number
}

async function loadMember(
  supabase: SupabaseClient,
  phone: string,
): Promise<MemberContext | null> {
  // Use the SECURITY DEFINER helper so RLS doesn't block phone lookup.
  const lookup = await supabase.rpc('lookup_user_by_phone', { p_phone: phone })
  const row = Array.isArray(lookup.data) ? lookup.data[0] : lookup.data
  if (!row?.user_id) return null

  const userId = row.user_id as string

  const membership = await supabase
    .from('sacco_memberships')
    .select('id, sacco_id')
    .eq('user_id', userId)
    .maybeSingle()

  let savings = 0
  let shares = 0
  let loan = 0
  let saccoName: string | null = null
  let supportPhone: string | null = null

  if (membership.data?.id && membership.data.sacco_id) {
    const [accounts, sacco] = await Promise.all([
      supabase
        .from('member_accounts')
        .select('balance, account_type')
        .eq('sacco_membership_id', membership.data.id),
      supabase
        .from('saccos')
        .select('name, contact_phone')
        .eq('id', membership.data.sacco_id)
        .maybeSingle(),
    ])

    savings = Number(
      accounts.data?.find((a) => a.account_type === 'savings')?.balance ?? 0,
    )
    shares = Number(
      accounts.data?.find((a) => a.account_type === 'shares')?.balance ?? 0,
    )
    loan = Number(
      accounts.data?.find((a) => a.account_type === 'loan')?.balance ?? 0,
    )
    saccoName = sacco.data?.name ?? null
    supportPhone = sacco.data?.contact_phone ?? null
  }

  return {
    user_id: userId,
    full_name: row.full_name ?? null,
    has_pin: Boolean(row.has_pin),
    membership_id: membership.data?.id ?? null,
    sacco_id: membership.data?.sacco_id ?? null,
    sacco_name: saccoName,
    support_phone: supportPhone,
    savings,
    shares,
    loan_balance: loan,
  }
}

async function recentTransactionsText(
  supabase: SupabaseClient,
  membershipId: string,
): Promise<string> {
  const accounts = await supabase
    .from('member_accounts')
    .select('id, account_type')
    .eq('sacco_membership_id', membershipId)

  const savingsId = accounts.data?.find((a) => a.account_type === 'savings')?.id
  if (!savingsId) return 'No transactions yet.'

  const tx = await supabase
    .from('transactions')
    .select('type, amount, created_at')
    .eq('member_account_id', savingsId)
    .order('created_at', { ascending: false })
    .limit(3)

  if (!tx.data?.length) return 'No transactions yet.'

  return tx.data
    .map((t: any) => {
      const sign = t.type === 'deposit' ? '+' : '-'
      const date = t.created_at
        ? new Date(t.created_at).toISOString().slice(5, 10).replace('-', '/')
        : ''
      return `${date} ${sign}${Number(t.amount).toLocaleString()}`
    })
    .join('\n')
}

async function eligibilityText(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('ensure_social_credit_score', {
    p_user_id: userId,
  })
  if (error) return 'Eligibility check unavailable. Try again later.'
  const row = (Array.isArray(data) ? data[0] : data) as
    | { final_score: number; loan_eligibility_without_guarantors: number | string }
    | null
  if (!row) return 'No eligibility profile yet. Save more to qualify.'
  const cap = Number(row.loan_eligibility_without_guarantors ?? 0)
  if (cap <= 0) {
    return `Score ${row.final_score}. You don't yet qualify for an instant loan. Keep saving!`
  }
  return `Score ${row.final_score}. You qualify for up to KES ${cap.toLocaleString()} instantly. Open the SANGA app to apply.`
}

/**
 * Main router. Pure function over the inbound USSD `text` string.
 */
export async function routeUssd(
  supabase: SupabaseClient,
  input: UssdInput,
): Promise<UssdResponse> {
  const phone = normalisePhone(input.phoneNumber)
  const text = (input.text ?? '').trim()
  const steps = text === '' ? [] : text.split('*')

  // Look up member up-front. Most menus need it.
  const member = await loadMember(supabase, phone)

  if (!member) {
    return makeResponse(
      'END',
      `Welcome to SANGA. The number ${phone} is not registered yet. Visit www.sanga.africa to sign up, or visit any SANGA branch.`,
    )
  }

  const firstName = (member.full_name?.split(' ')[0] ?? 'Member').slice(0, 20)

  // Main menu
  if (steps.length === 0) {
    return makeResponse(
      'CON',
      `Hi ${firstName}\n1. Balance\n2. Recent transactions\n3. Loan eligibility\n4. Support\n0. Exit`,
    )
  }

  const choice = steps[0]

  if (choice === '0') {
    return makeResponse('END', 'Thank you for using SANGA.')
  }

  if (choice === '1') {
    if (!member.membership_id) {
      return makeResponse(
        'END',
        'You are not a member of any SACCO yet. Open the SANGA app to join one.',
      )
    }
    const total = member.savings + member.shares
    return makeResponse(
      'END',
      `${member.sacco_name ?? 'SANGA'}\nSavings: KES ${member.savings.toLocaleString()}\nShares:  KES ${member.shares.toLocaleString()}\nLoan:    KES ${member.loan_balance.toLocaleString()}\nTotal:   KES ${total.toLocaleString()}`,
    )
  }

  if (choice === '2') {
    if (!member.membership_id) {
      return makeResponse(
        'END',
        'You have no transactions yet — you are not a member of any SACCO.',
      )
    }
    const txt = await recentTransactionsText(supabase, member.membership_id)
    return makeResponse('END', `Last 3 transactions:\n${txt}`)
  }

  if (choice === '3') {
    const txt = await eligibilityText(supabase, member.user_id)
    return makeResponse('END', txt)
  }

  if (choice === '4') {
    const support = member.support_phone || '+254 700 000 000'
    return makeResponse(
      'END',
      `Need help? Call ${support} (Mon-Fri 8am-5pm) or open the SANGA app.`,
    )
  }

  return makeResponse(
    'END',
    'Invalid choice. Dial again and pick a number from the menu.',
  )
}
