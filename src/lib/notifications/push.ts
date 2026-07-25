import webpush from 'web-push'
import { adminSupabase } from '@/lib/supabase/admin'
import type { NotificationType } from '@/lib/notifications/create'

// Web Push delivery for the notifications the CRM already records in the
// `notifications` table — this is purely an extra delivery channel, so every
// failure here is logged and swallowed. A push that can't be sent must never
// break assigning a lead or posting a comment.

// VAPID identifies this server to the browser's push service. Configured lazily
// so a missing key degrades to "push disabled" instead of crashing the module
// (and every route that imports it) at startup.
let configured: boolean | null = null

function ensureConfigured(): boolean {
  if (configured !== null) return configured
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    console.warn('web push disabled — VAPID keys not configured')
    configured = false
    return false
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@rafeeqcrm.com', publicKey, privateKey)
  configured = true
  return true
}

// Arabic copy per notification type, matching what the in-app list shows.
function describe(type: NotificationType): { title: string; body: string } {
  switch (type) {
    case 'lead_assigned':
      return { title: 'عميل جديد مُسند إليك', body: 'تم إسناد عميل محتمل جديد إليك — اضغط للمتابعة.' }
    case 'lead_shared':
      return { title: 'تم مشاركة عميل معك', body: 'شارك أحد الزملاء عميلاً محتملاً معك.' }
    case 'mention':
      return { title: 'تم ذكرك في تعليق', body: 'ذكرك أحد الزملاء في تعليق على عميل محتمل.' }
    default:
      return { title: 'رفيق CRM', body: 'لديك إشعار جديد.' }
  }
}

interface PushArgs {
  recipientId: string
  type: NotificationType
  leadId?: string | null
}

// Fans a notification out to every device the recipient has enabled.
export async function sendPushToUser({ recipientId, type, leadId }: PushArgs): Promise<void> {
  if (!ensureConfigured()) return

  const supa = adminSupabase()
  const { data: subs, error } = await supa
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('profile_id', recipientId)

  // Table not provisioned yet, or nobody enabled notifications — nothing to do.
  if (error || !subs?.length) return

  const { title, body } = describe(type)

  // The recipient's own role decides the deep link: an admin's leads live in
  // the client-admin portal, everyone else's under /app. Resolved here rather
  // than passed in, so no caller has to know or care.
  const { data: profile } = await supa.from('profiles').select('role').eq('id', recipientId).single()
  const base = profile?.role === 'client_admin' ? '/client-admin/leads' : '/app/my-leads'
  const payload = JSON.stringify({
    title,
    body,
    url: leadId ? `${base}/${leadId}` : `${base}`,
    // One notification per lead per type, so repeat events replace rather
    // than stack.
    tag: leadId ? `${type}_${leadId}` : type,
  })

  // Endpoints that the push service has permanently rejected are dead: the
  // user cleared site data, uninstalled the PWA, or revoked permission.
  // Pruning them keeps the table from growing forever and avoids retrying
  // known-dead devices on every future notification.
  const dead: string[] = []

  await Promise.all(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(sub.id)
        else console.error('web push send failed:', status, (err as Error).message)
      }
    })
  )

  if (dead.length) {
    await supa.from('push_subscriptions').delete().in('id', dead)
  }
}
