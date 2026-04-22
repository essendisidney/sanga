import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  let data: any[] = []

  switch (type) {
    case 'transactions':
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*, users(full_name, phone)')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })
      data = transactions?.map((t: any) => ({
        Date: new Date(t.created_at).toLocaleDateString(),
        Member: t.users?.full_name,
        Type: t.type,
        Amount: t.amount,
        Status: t.status,
        Reference: t.transaction_ref
      })) || []
      break

    case 'members':
      const { data: members } = await supabase
        .from('sacco_memberships')
        .select('*, users(*)')
      data = members?.map((m: any) => ({
        'Member No': m.member_number,
        Name: m.users?.full_name,
        Phone: m.users?.phone,
        'ID Number': m.users?.national_id,
        Joined: new Date(m.joined_at).toLocaleDateString(),
        Status: m.is_verified ? 'Verified' : 'Pending'
      })) || []
      break

    case 'loans':
      const { data: loans } = await supabase
        .from('loan_applications')
        .select('*, users(full_name, phone)')
      data = loans?.map((l: any) => ({
        Member: l.users?.full_name,
        Amount: l.amount,
        Purpose: l.purpose,
        Status: l.status,
        'Applied Date': new Date(l.created_at).toLocaleDateString(),
        'Approved Date': l.approved_at ? new Date(l.approved_at).toLocaleDateString() : '-'
      })) || []
      break
  }

  return NextResponse.json({ data })
}
