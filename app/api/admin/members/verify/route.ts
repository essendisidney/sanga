import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { membershipId } = await request.json()
  
  const { data, error } = await supabase
    .from('sacco_memberships')
    .update({ 
      is_verified: true, 
      verified_at: new Date().toISOString() 
    })
    .eq('id', membershipId)
    .select()
    .single()
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json(data)
}
