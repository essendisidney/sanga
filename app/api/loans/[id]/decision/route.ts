import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  context: any
) {
  try {
    const params = await context?.params
    const body = (await request.json()) as {
      decision?: 'approve' | 'reject' | string
      notes?: string
    }

    const { decision, notes = '' } = body

    if (decision !== 'approve' && decision !== 'reject') {
      return NextResponse.json(
        { error: 'decision must be approve|reject' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const updateData: any = {
      status: decision === 'approve' ? 'approved' : 'rejected',
      [`${decision === 'approve' ? 'approved_by' : 'rejected_by'}`]: user.id,
      [`${decision === 'approve' ? 'approved_at' : 'rejected_at'}`]:
        new Date().toISOString(),
      loan_officer_notes: notes,
    }

    const { data, error } = await supabase
      .from('loan_applications')
      .update(updateData)
      .eq('id', params?.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, application: data })
  } catch {
    return NextResponse.json({ error: 'Approval failed' }, { status: 500 })
  }
}

