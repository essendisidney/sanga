import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateStatementPDF } from '@/lib/pdf/generate'
import { renderToBuffer } from '@react-pdf/renderer'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { startDate, endDate } = await request.json()

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: 'startDate and endDate required' },
      { status: 400 }
    )
  }

  const { data: member } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: true })

  const pdfStream = await renderToBuffer(
    generateStatementPDF(member, transactions || [], startDate, endDate)
  )

  return new NextResponse(pdfStream as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=statement_${user.id}.pdf`
    }
  })
}
