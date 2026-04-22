import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  
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
