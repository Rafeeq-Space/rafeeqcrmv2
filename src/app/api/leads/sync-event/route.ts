import { NextResponse } from 'next/server'
import { syncLeadEvent } from '@/lib/leads/syncEvent'

export async function POST(request: Request) {
  try {
    const { leadId, status, eventType } = await request.json()

    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })

    const result = await syncLeadEvent({ leadId, status, eventType })
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    const status = message === 'Lead not found' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
