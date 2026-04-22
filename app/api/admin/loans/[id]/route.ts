import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function GET(request: Request, context: any) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const params = await context?.params

  const { data: loan } = await supabase
    .from('loan_applications')
    .select(`
      *,
      users (
        id,
        full_name,
        phone,
        email,
        national_id,
        monthly_income
      ),
      loan_products (
        name,
        interest_rate,
        min_amount,
        max_amount,
        duration_days
      )
    `)
    .eq('id', params?.id)
    .single()

  return NextResponse.json(loan)
}

export async function PUT(request: Request, context: any) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const params = await context?.params
  const body = await request.json()

  const { data, error } = await supabase
    .from('loan_applications')
    .update(body)
    .eq('id', params?.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
