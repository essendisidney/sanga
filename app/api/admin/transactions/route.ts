import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function GET() {
  const auth = await requireAdmin()
  if ('response' in auth) return auth.response
  const { supabase } = auth

  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      *,
      users (
        full_name,
        phone
      ),
      member_accounts (
        account_number,
        account_type
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json(transactions || [])
}
