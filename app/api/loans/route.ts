import { NextResponse } from 'next/server'
import { loansStore } from './apply/route'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const phone = url.searchParams.get('phone')

  if (!phone) {
    return NextResponse.json(
      { error: 'phone query param required' },
      { status: 400 }
    )
  }

  const applications = loansStore.get(phone) ?? []
  return NextResponse.json({ applications })
}
