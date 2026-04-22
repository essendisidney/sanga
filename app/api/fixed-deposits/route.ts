import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const { data: deposits } = await supabase
    .from('fixed_deposits')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  
  return NextResponse.json(deposits || [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  
  // Calculate maturity date
  const startDate = new Date()
  const maturityDate = new Date()
  maturityDate.setDate(maturityDate.getDate() + body.term_days)
  
  // Calculate interest
  const interest = body.amount * (body.interest_rate / 100) * (body.term_days / 365)
  const maturityAmount = body.amount + interest
  
  const { data, error } = await supabase
    .from('fixed_deposits')
    .insert({
      user_id: user.id,
      amount: body.amount,
      interest_rate: body.interest_rate,
      term_days: body.term_days,
      start_date: startDate.toISOString(),
      maturity_date: maturityDate.toISOString(),
      maturity_amount: maturityAmount,
      status: 'active'
    })
    .select()
    .single()
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json(data)
}
