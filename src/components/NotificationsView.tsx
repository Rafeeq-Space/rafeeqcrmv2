'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AtSign, UserPlus, Share2, Bell, CheckCheck, type LucideIcon } from 'lucide-react'
import { leadName } from '@/lib/utils'

type NotificationType = 'mention' | 'lead_assigned' | 'lead_shared'

interface NotificationRow {
  id: string
  recipient_id: string
  actor_id: string | null
  type: NotificationType
  lead_id: string | null
  read: boolean
  created_at: string
  actor: { id: string; full_name: string | null } | null
  lead: { id: string; data: Record<string, string> | null } | null
}

const TYPE_META: Record<NotificationType, { icon: LucideIcon; color: string; soft: string }> = {
  mention: { icon: AtSign, color: 'var(--primary)', soft: 'var(--primary-soft)' },
  lead_assigned: { icon: UserPlus, color: 'var(--info, #3b82f6)', soft: 'var(--info-soft, rgba(59,130,246,0.12))' },
  lead_shared: { icon: Share2, color: 'var(--warning)', soft: 'var(--warning-soft)' },
}

function buildMessage(n: NotificationRow): string {
  const actor = n.actor?.full_name || 'أحد الزملاء'
  const lead = leadName(n.lead?.data || undefined)
  switch (n.type) {
    case 'mention':
      return `${actor} ذكرك في تعليق على العميل ${lead}`
    case 'lead_assigned':
      return `تم إسناد عميل جديد إليك: ${lead}`
    case 'lead_shared':
      return `${actor} شارك معك العميل ${lead}`
    default:
      return 'إشعار جديد'
  }
}

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'الآن'
  if (m < 60) return `منذ ${m} دقيقة`
  const h = Math.floor(m / 60)
  if (h < 24) return `منذ ${h} ساعة`
  const d = Math.floor(h / 24)
  if (d < 30) return `منذ ${d} يوم`
  return new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long' }).format(new Date(iso))
}

export default function NotificationsView({ viewerId, leadBasePath }: { viewerId: string; leadBasePath: string }) {
  const router = useRouter()
  const [items, setItems] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      const json = await res.json()
      setItems(json.notifications || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function markAllRead() {
    setItems(prev => prev.map(n => (n.recipient_id === viewerId ? { ...n, read: true } : n)))
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
  }

  async function openNotification(n: NotificationRow) {
    if (n.recipient_id === viewerId && !n.read) {
      setItems(prev => prev.map(x => (x.id === n.id ? { ...x, read: true } : x)))
      fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [n.id] }),
      }).catch(() => {})
    }
    if (n.lead_id) router.push(`${leadBasePath}/${n.lead_id}`)
  }

  const hasUnread = items.some(n => n.recipient_id === viewerId && !n.read)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="me-auto">
          <h1 className="text-2xl font-extrabold text-foreground">الإشعارات</h1>
          <p className="text-muted text-sm mt-1">أهم الأحداث المتعلقة بك وبفريقك</p>
        </div>
        {hasUnread && (
          <button onClick={markAllRead} className="btn btn-outline gap-2">
            <CheckCheck size={17} /> تعليم الكل كمقروء
          </button>
        )}
      </div>

      {loading ? (
        <div className="card p-10 text-center text-muted2">جارٍ التحميل…</div>
      ) : items.length === 0 ? (
        <div className="card p-12 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--surface2)' }}>
            <Bell size={26} className="text-muted2" />
          </div>
          <p className="font-bold text-foreground">لا توجد إشعارات بعد</p>
          <p className="text-sm text-muted2">هتظهر هنا الإشعارات لما حد يذكرك أو يُسنِد إليك عميلاً أو يشاركك واحد.</p>
        </div>
      ) : (
        <div className="card overflow-hidden divide-y divide-border">
          {items.map(n => {
            const meta = TYPE_META[n.type] || TYPE_META.mention
            const Icon = meta.icon
            const isMine = n.recipient_id === viewerId
            const unread = isMine && !n.read
            return (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={`w-full flex items-start gap-3 px-4 py-3.5 text-start transition hover:bg-surface2 ${unread ? 'bg-primary-soft/40' : ''}`}
              >
                <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: meta.soft }}>
                  <Icon size={18} style={{ color: meta.color }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-foreground leading-snug">{buildMessage(n)}</span>
                  <span className="flex items-center gap-2 mt-1">
                    <span className="text-[0.7rem] text-muted2">{timeAgo(n.created_at)}</span>
                    {!isMine && (
                      <span className="text-[0.65rem] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--muted2)' }}>
                        من فريقك
                      </span>
                    )}
                  </span>
                </span>
                {unread && <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5" style={{ background: 'var(--primary)' }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
