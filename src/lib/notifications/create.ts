import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export type NotificationType = 'mention' | 'lead_assigned' | 'lead_shared' | 'lead_reengaged'

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
  if (error) {
    console.error('createNotification failed:', error.message)
    return
  }

  // Also deliver as a Web Push so it lands even when the app isn't open. Kept
  // out of the caller's critical path via after() — the row is already written,
  // and a slow/failing push service must not delay the response. Imported
  // lazily so anything that only records notifications doesn't pull in
  // web-push. after() throws outside a request context, so fall back to a
  // detached call for any non-request caller.
  const deliver = async () => {
    try {
      const { sendPushToUser } = await import('@/lib/notifications/push')
      await sendPushToUser({ recipientId, type, leadId })
    } catch (err) {
      console.error('web push delivery failed:', err)
    }
  }
  try {
    after(deliver)
  } catch {
    void deliver()
  }
}
