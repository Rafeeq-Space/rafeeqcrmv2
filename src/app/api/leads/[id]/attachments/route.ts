import { NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { adminSupabase, canAccessLead } from '@/lib/leads/access'
import type { Lead, KnowledgeFile } from '@/lib/types'

// Replaces the lead's attachments list (images/files). The client uploads to
// storage, then sends the full updated list here to persist.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireTenantUser()
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: leadId } = await params
  const supa = adminSupabase()

  const { data: lead } = await supa.from('leads').select('*').eq('id', leadId).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (!(await canAccessLead(viewer, lead as Lead))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { attachments?: KnowledgeFile[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const attachments = Array.isArray(body.attachments) ? body.attachments : []

  const { error } = await supa.from('leads').update({ attachments }).eq('id', leadId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, attachments })
}
