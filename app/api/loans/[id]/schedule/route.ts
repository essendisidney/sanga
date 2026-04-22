import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request, context: any) {
  const params = await context?.params
  const supabase = await createClient()

  const { data: schedule } = await supabase
    .from('loan_repayment_schedule')
    .select('*')
    .eq('loan_application_id', params?.id)
    .order('installment_number', { ascending: true })

  return NextResponse.json(schedule || [])
}

export async function POST(request: Request, context: any) {
  const params = await context?.params
  const supabase = await createClient()
  const body = await request.json()

  // Get loan details
  const { data: loan } = await supabase
    .from('loan_applications')
    .select('*')
    .eq('id', params?.id)
    .single()

  if (!loan) {
    return NextResponse.json({ error: 'Loan not found' }, { status: 404 })
  }

  // Generate repayment schedule
  const monthlyPayment = loan.total_repayable / (loan.duration_days / 30)
  const schedule = []

  for (let i = 1; i <= loan.duration_days / 30; i++) {
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + (i * 30))

    schedule.push({
      loan_application_id: params?.id,
      installment_number: i,
      due_date: dueDate.toISOString(),
      principal_due: loan.amount / (loan.duration_days / 30),
      interest_due: monthlyPayment - (loan.amount / (loan.duration_days / 30)),
      total_due: monthlyPayment,
      status: 'pending'
    })
  }

  const { data, error } = await supabase
    .from('loan_repayment_schedule')
    .insert(schedule)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
