import type { SupabaseClient } from '@supabase/supabase-js'

export type NotificationType = 'mention' | 'lead_assigned' | 'lead_shared'

// Inserts a notification row. Skips self-notifications (actor === recipient) and
// missing recipients. Failures are logged, never thrown — a notification must
// never break the primary action (assigning, commenting, sharing).
export async function createNotification(
  supa: SupabaseClient,
  args: {
    tenantId: string
    recipientId: string | null | undefined
    actorId?: string | null
    type: NotificationType
    leadId?: string | null
  },
): Promise<void> {
  const { tenantId, recipientId, actorId = null, type, leadId = null } = args
  if (!recipientId) return
  if (actorId && actorId === recipientId) return

  const { error } = await supa.from('notifications').insert({
    tenant_id: tenantId,
    recipient_id: recipientId,
    actor_id: actorId,
    type,
    lead_id: leadId,
  })
  if (error) console.error('createNotification failed:', error.message)
}
