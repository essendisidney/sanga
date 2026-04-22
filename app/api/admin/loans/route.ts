import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  
  const { data: loans } = await supabase
    .from('loan_applications')
    .select(`
      *,
      users (
        id,
        full_name,
        phone
      ),
      loan_products (
        name,
        interest_rate
      )
    `)
    .order('created_at', { ascending: false })
  
  return NextResponse.json(loans || [])
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const body = await request.json()
  const { id, status, notes } = body
  
  const updateData: any = { status }
  if (status === 'approved') {
    updateData.approved_at = new Date().toISOString()
  }
  if (status === 'rejected') {
    updateData.rejected_at = new Date().toISOString()
    updateData.rejection_reason = notes
  }
  
  const { data, error } = await supabase
    .from('loan_applications')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json(data)
}
