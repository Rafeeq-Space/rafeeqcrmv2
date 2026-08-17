'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Phone, MessageCircle, Calendar, Clock, User, Megaphone, LayoutGrid, Table as TableIcon, Plus, Search, ChevronRight, ChevronLeft, ExternalLink, Share2, Copy, FilterX, ChevronDown, Check } from 'lucide-react'
import type { Lead, LeadStatus } from '@/lib/types'
import { usePollWhenVisible } from '@/lib/hooks/usePollWhenVisible'
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, SOURCE_LABELS, leadName, leadPhone, phoneDigits, phoneMatches } from '@/lib/utils'
import { SUB_STATUS_GROUPS, SUB_STATUSES, subStatusByKey, STATUS_DOT, displayBucketForLead, DISPLAY_BUCKET_LABELS, DISPLAY_BUCKET_COLORS } from '@/lib/leads/subStatus'
import { useLeadSelection } from '@/components/client-admin/LeadSelectionContext'
import { useToast } from '@/components/ToastProvider'
import AddLeadModal from './AddLeadModal'

interface FilterOption {
  id: string
  name: string
  team_id?: string | null
}

interface Props {
  leads: Lead[]
  role: string
  basePath: string // e.g. '/client-admin/leads' or '/app/my-leads'
  tenantId: string
  campaigns?: FilterOption[]
  teams?: FilterOption[]
  members?: FilterOption[]
  bevatel?: { host: string; accountId: string } | null
  // Tenant-wide Rafeeq Social bot id (see rafeeqSocialSend.ts's
  // rafeeqSocialBotId) — resolved ONCE per page load, not per lead, since
  // it's identical for every row; only the phone digits differ per lead.
  rafeeqSocialBotId?: string | number | null
  currentUserId?: string
  sharedWithMeIds?: string[]
}

// Overview stat cards (also act as quick status filters) shown at the top of
// the leads center. Colors mirror the status badge palette. 'contacted' and
// 'pending' both draw from the canonical 'contacted' status — split display-
// only via displayBucketForLead (see subStatus.ts), never touching the real
// `status` column.
const STAT_CARDS: { key: string; label: string; color: string }[] = [
  { key: 'all', label: 'إجمالي العملاء', color: 'var(--foreground)' },
  { key: 'new', label: 'جديد', color: DISPLAY_BUCKET_COLORS.new },
  { key: 'contacted', label: DISPLAY_BUCKET_LABELS.in_progress, color: DISPLAY_BUCKET_COLORS.in_progress },
  { key: 'pending', label: DISPLAY_BUCKET_LABELS.pending, color: DISPLAY_BUCKET_COLORS.pending },
  { key: 'qualified', label: 'مؤهل', color: DISPLAY_BUCKET_COLORS.qualified },
  { key: 'converted', label: 'تم التحويل', color: DISPLAY_BUCKET_COLORS.converted },
  { key: 'lost', label: 'غير مؤهل', color: DISPLAY_BUCKET_COLORS.lost },
]

// Period quick-filter over the lead creation date.
type PeriodKey = 'all' | 'day' | 'week' | 'month' | 'thisMonth' | 'range'
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'day', label: 'اليوم' },
  { key: 'week', label: 'آخر أسبوع' },
  { key: 'month', label: 'آخر شهر' },
  { key: 'thisMonth', label: 'الشهر الحالي' },
  { key: 'range', label: 'نطاق' },
]

function digits(s: string) {
  return s.replace(/[^\d+]/g, '').replace(/^\+/, '')
}

// Page numbers to show, collapsing long ranges with ellipsis:
// 1 … 4 5 6 … 20
function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) pages.push('…')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < total - 1) pages.push('…')
  pages.push(total)
  return pages
}

// Creation date is shown as a plain day; last-update also shows the time, since
// it can change multiple times within the same day.
function fmtDate(d?: string) {
  return d ? new Date(d).toLocaleDateString('ar-EG') : '—'
}
function fmtDateTime(d?: string) {
  return d ? new Date(d).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

function campaignLabel(lead: Lead) {
  return lead.campaigns?.name || SOURCE_LABELS[lead.source || ''] || 'مباشر'
}

// The source badge (e.g. "TikTok") shown next to the campaign name. Hidden when
// there's no campaign, since campaignLabel already falls back to the source.
function sourceLabel(lead: Lead) {
  if (!lead.campaigns?.name || !lead.source) return null
  return SOURCE_LABELS[lead.source] || lead.source
}

// Call / WhatsApp buttons — clicking them must not trigger the row/card
// navigation. Both always offer two options, regardless of the lead's
// source: Call → plain tel: (OS chooser covers "personal phone or a
// softphone app") or copy-for-Bevatel-Softphone (it has no documented
// click-to-call link, unlike wa.me — copying the number is the honest
// best-effort). WhatsApp → plain wa.me or Bevatel chat, which opens the
// existing conversation if there is one, else the contact's own page (still
// specific to this customer) if we at least have a synced contact id.
function ContactButtons({ lead, phone, bevatel, rafeeqSocialBotId }: {
  lead: Lead; phone: string
  bevatel?: { host: string; accountId: string } | null
  rafeeqSocialBotId?: string | number | null
}) {
  const [menu, setMenu] = useState<'call' | 'wa' | null>(null)
  const { showToast } = useToast()
  if (!phone) return null
  const d = digits(phone)
  const cls = 'btn text-xs !py-1.5 !px-2.5 flex items-center gap-1.5'
  // Falls back all the way to the plain account host when this specific lead
  // has no synced conversation/contact yet — the option should always be
  // there whenever Bevatel Chat is connected at all, not only once this one
  // customer happens to have chat history.
  const chatUrl = bevatel && lead.bevatel_conversation_id
    ? `${bevatel.host.replace(/\/+$/, '')}/app/accounts/${bevatel.accountId}/conversations/${lead.bevatel_conversation_id}`
    : bevatel && lead.bevatel_contact_id
    ? `${bevatel.host.replace(/\/+$/, '')}/app/accounts/${bevatel.accountId}/contacts/${lead.bevatel_contact_id}`
    : bevatel
    ? bevatel.host.replace(/\/+$/, '')
    : null
  // Pure string formatting only — the expensive part (resolving the tenant's
  // bot id) already happened once at the page level, not per row. See
  // rafeeqSocialSend.ts's rafeeqSocialBotId/buildRafeeqSocialChatUrl for the
  // server-side counterpart this mirrors (confirmed live URL format there).
  const rafeeqSocialUrl = rafeeqSocialBotId != null
    ? `https://rafeeq.social/all/livechat?subscriber_id=${d}-${rafeeqSocialBotId}&from_media=whatsapp`
    : null

  const close = (e: React.MouseEvent) => { e.stopPropagation(); setMenu(null) }
  const toggle = (m: 'call' | 'wa') => (e: React.MouseEvent) => { e.stopPropagation(); setMenu(v => v === m ? null : m) }
  // No documented click-to-call link exists for Bevatel Softphone, so this is
  // a best-effort guess (the sip: URI scheme, which some SIP softphones
  // register as a handler for) alongside the clipboard copy, which always
  // works regardless of whether the app-open attempt does anything.
  const openSoftphone = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard?.writeText(d).catch(() => {})
    showToast('تم نسخ الرقم، وجارٍ محاولة فتح Bevatel Softphone — لو ما فتحش تلقائي، الرقم منسوخ وتقدر تلزقه بنفسك')
    window.location.href = `sip:${d}`
    setMenu(null)
  }
  // Bevatel's own conversation deep-link only resolves via in-app navigation,
  // not a fresh external open (confirmed a Bevatel-side routing bug, not
  // ours — see project memory) — copying the number alongside opening it
  // lets the user paste straight into Bevatel's own search instead of typing
  // it, so a manual lookup is at least fast.
  //
  // Copies the number unspaced, keeping the country code: sources write it
  // formatted differently ("+966 53 056 3856" from the sheet, "+966530563856"
  // from Bevatel), and the spaces are what a rep had to strip by hand before
  // Bevatel's own search box would return anything.
  const copyForChat = () => {
    const compact = phone.replace(/[^\d+]/g, '')
    navigator.clipboard?.writeText(compact).catch(() => {})
    showToast('تم نسخ رقم العميل — دوّر عليه جوه بيفاتيل لو ما فتحش المحادثة تلقائي')
  }

  return (
    <div className="relative flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      <button onClick={toggle('call')} className={`${cls} btn-primary`} title="اتصال"><Phone size={14} /></button>
      <button onClick={toggle('wa')} className={cls} style={{ background: 'var(--success-soft)', color: 'var(--success)' }} title="واتساب"><MessageCircle size={14} /></button>

      {menu && (
        <>
          <div className="fixed inset-0 z-20" onClick={close} />
          <div className="absolute z-30 top-full mt-1 start-0 w-52 rounded-xl border border-border bg-surface shadow-lg p-1">
            {menu === 'call' ? (
              <>
                <a href={`tel:${d}`} onClick={close} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface2 hover:text-foreground transition">
                  <Phone size={15} /> اتصال هاتفي
                </a>
                <button onClick={openSoftphone} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface2 hover:text-foreground transition">
                  <Copy size={15} /> فتح Bevatel Softphone
                </button>
              </>
            ) : (
              <>
                <a href={`https://wa.me/${d}`} target="_blank" rel="noopener noreferrer" onClick={close} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface2 hover:text-foreground transition">
                  <MessageCircle size={15} /> واتساب
                </a>
                {chatUrl && (
                  <a href={chatUrl} target="_blank" rel="noopener noreferrer" onClick={e => { close(e); copyForChat() }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface2 hover:text-foreground transition">
                    <ExternalLink size={15} /> شات بيفاتيل
                  </a>
                )}
                {rafeeqSocialUrl && (
                  <a href={rafeeqSocialUrl} target="_blank" rel="noopener noreferrer" onClick={close} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface2 hover:text-foreground transition">
                    <ExternalLink size={15} /> رفيق سوشيال
                  </a>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Inline status dropdown for the leads list — same option set as
// LeadProfile.tsx's StatusPicker (all SUB_STATUSES, flat, colored dot per
// canonical status), just triggered from the existing status badge instead
// of a full-width button so it drops into the card/table layout unchanged.
// Clicking it must not trigger the row/card navigation, same reasoning as
// ContactButtons above.
function StatusCell({ currentKey, currentStatus, saving, onPick }: {
  currentKey: string | null
  currentStatus: LeadStatus
  saving: boolean
  onPick: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const current = subStatusByKey(currentKey || undefined)
  const label = current ? current.label : LEAD_STATUS_LABELS[currentStatus]

  return (
    <div className="relative inline-block" onClick={e => e.stopPropagation()}>
      <button type="button" disabled={saving} onClick={() => setOpen(v => !v)}
        className={`badge ${LEAD_STATUS_COLORS[currentStatus]} flex items-center gap-1 disabled:opacity-60`}>
        {label}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 mt-1 w-56 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface shadow-lg p-1 text-start">
            {SUB_STATUSES.map(s => {
              const active = s.key === currentKey
              return (
                <button key={s.key} type="button" onClick={() => { setOpen(false); onPick(s.key) }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-start transition ${active ? 'bg-primary-soft text-foreground font-semibold' : 'text-muted hover:bg-surface2 hover:text-foreground'}`}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_DOT[s.status] }} />
                  <span className="truncate">{s.label}</span>
                  {active && <Check size={13} className="ms-auto shrink-0" style={{ color: 'var(--primary)' }} />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// Status values a caller may deep-link to via `?status=`, beyond the plain
// per-status keys — 'in_progress' mirrors LeadStats.inProgress (contacted +
// qualified combined), matching the "قيد المتابعة" stat card on the profile
// page, which has no single matching `leads.status` value of its own.
const VALID_STATUS_PARAMS = new Set(['all', 'new', 'contacted', 'pending', 'qualified', 'converted', 'lost', 'in_progress'])
const VALID_PERIOD_PARAMS = new Set(['all', 'day', 'week', 'month', 'thisMonth'])

// Remembers every filter across a "leave the page and come back" round trip
// (e.g. opening a lead then hitting back) — sessionStorage rather than the
// URL, since a plain `router.push` back to this page carries no query string
// of its own. Keyed by basePath since /app/my-leads and /client-admin/leads
// are separate instances of this same component.
//
// A `?status=` deep link (from a home-page stat card — see LeadStatCards.tsx/
// ProfileView.tsx) means the opposite: a deliberate "show me exactly this"
// intent, so it's treated as overriding every remembered filter rather than
// merging with them — reading storage is skipped entirely in that case.
interface StoredLeadFilters {
  status?: string
  subStatus?: string
  campaign?: string
  team?: string
  member?: string
  source?: string
  assignedToMe?: boolean
  sharedWithMeOnly?: boolean
  period?: string
  customFrom?: string
  customTo?: string
  search?: string
  view?: 'cards' | 'table'
}

function storedFiltersKey(basePath: string): string {
  return `leadsCenterFilters:${basePath}`
}

function readStoredFilters(basePath: string): StoredLeadFilters {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(storedFiltersKey(basePath))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

// useSearchParams() (for the profile-page deep-link support below) requires
// a Suspense boundary — wrapped here so every existing call site doesn't
// need to add one itself.
export default function LeadsCenter(props: Props) {
  return (
    <Suspense fallback={null}>
      <LeadsCenterInner {...props} />
    </Suspense>
  )
}

function LeadsCenterInner({ leads, role, basePath, tenantId, campaigns = [], teams = [], members = [], bevatel = null, rafeeqSocialBotId = null, currentUserId, sharedWithMeIds = [] }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Deep-link support (e.g. from a home-page stat card):
  // ?status=new&mine=1&period=all pre-applies those filters on first render
  // and takes over from any remembered filters entirely (see the comment on
  // readStoredFilters above) — otherwise, returning to this page (e.g. back
  // from a lead profile) restores whatever was last selected.
  const hasDeepLink = searchParams.get('status') != null
  const stored = hasDeepLink ? {} : readStoredFilters(basePath)

  const [view, setView] = useState<'cards' | 'table'>(() => stored.view || 'table')
  const [status, setStatus] = useState(() => {
    const s = searchParams.get('status')
    if (s && VALID_STATUS_PARAMS.has(s)) return s
    if (stored.status && VALID_STATUS_PARAMS.has(stored.status)) return stored.status
    return 'all'
  })
  const [subStatus, setSubStatus] = useState(() => stored.subStatus || 'all')
  const [campaign, setCampaign] = useState(() => stored.campaign || 'all')
  const [team, setTeam] = useState(() => stored.team || 'all')
  const [member, setMember] = useState(() => stored.member || 'all')
  const [source, setSource] = useState(() => stored.source || 'all')
  const [assignedToMe, setAssignedToMe] = useState(() => {
    const m = searchParams.get('mine')
    return m != null ? m === '1' : (stored.assignedToMe ?? false)
  })
  const [sharedWithMeOnly, setSharedWithMeOnly] = useState(() => stored.sharedWithMeOnly ?? false)
  const [period, setPeriod] = useState<PeriodKey>(() => {
    const p = searchParams.get('period')
    if (p && VALID_PERIOD_PARAMS.has(p)) return p as PeriodKey
    if (stored.period && VALID_PERIOD_PARAMS.has(stored.period)) return stored.period as PeriodKey
    return 'day'
  })
  const [customFrom, setCustomFrom] = useState(() => stored.customFrom || '')
  const [customTo, setCustomTo] = useState(() => stored.customTo || '')
  const [search, setSearch] = useState(() => stored.search || '')
  const [showAddLead, setShowAddLead] = useState(false)

  // Persist every filter (including the cards/table toggle) whenever any of
  // them changes, so the initializers above can restore them on return.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      sessionStorage.setItem(storedFiltersKey(basePath), JSON.stringify({
        status, subStatus, campaign, team, member, source,
        assignedToMe, sharedWithMeOnly, period, customFrom, customTo, search, view,
      } satisfies StoredLeadFilters))
    } catch {
      // sessionStorage unavailable (private mode, quota) — filters just won't persist.
    }
  }, [basePath, status, subStatus, campaign, team, member, source, assignedToMe, sharedWithMeOnly, period, customFrom, customTo, search, view])

  // Optimistic status overrides, keyed by lead id — `leads` is server-fetched
  // and handed down as a prop (see the comment near fetchVisibleLeads below),
  // so a status change made from this list has nowhere else to live until
  // the next router.refresh() re-fetches it for real.
  const [statusOverride, setStatusOverride] = useState<Record<string, { status: LeadStatus; sub_status: string }>>({})
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null)
  const { showToast } = useToast()

  async function changeLeadStatus(leadId: string, currentKey: string | null, key: string) {
    if (!key || key === currentKey) return
    const sub = subStatusByKey(key)
    if (!sub) return
    if (!confirm('هل أنت متأكد أنك تريد تغيير الحالة؟')) return
    setSavingStatusId(leadId)
    try {
      const res = await fetch(`/api/leads/${leadId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'status_change', sub_status: key }),
      })
      if (!res.ok) throw new Error()
      setStatusOverride(prev => ({ ...prev, [leadId]: { status: sub.status, sub_status: key } }))
    } catch {
      showToast('تعذّر تغيير الحالة', 'error')
    } finally {
      setSavingStatusId(null)
    }
  }

  const sharedWithMeSet = useMemo(() => new Set(sharedWithMeIds), [sharedWithMeIds])

  // Distinct source values actually present in the visible leads, so the
  // dropdown never offers a source with zero matching leads. Falls back to
  // 'direct' for leads with no source (same fallback campaignLabel() uses).
  const sourceOptions = useMemo(() => {
    const set = new Set<string>()
    for (const l of leads) set.add(l.source || 'direct')
    return [...set].sort((a, b) => (SOURCE_LABELS[a] || a).localeCompare((SOURCE_LABELS[b] || b), 'ar'))
  }, [leads])

  const isAdmin = role === 'client_admin'
  const isManager = role === 'client_sales_manager'

  // Bulk-select checkboxes only ever render for client_admin (the delete
  // button they feed is admin-only) — see LeadSelectionContext.
  const selection = useLeadSelection()
  const bulkSelect = isAdmin ? selection : null

  const open = (id: string) => router.push(`${basePath}/${id}`)

  // When a team is selected, the employees dropdown shows only that team's
  // members. If members carry no team_id (e.g. legacy data), fall back to all.
  const visibleMembers = useMemo(() => {
    if (team === 'all') return members
    const scopedToTeam = members.filter(m => m.team_id === team)
    return scopedToTeam.length ? scopedToTeam : members
  }, [members, team])

  // If the currently-selected employee isn't in the chosen team, clear it so the
  // employee filter never contradicts the team filter.
  useEffect(() => {
    if (member !== 'all' && !visibleMembers.some(m => m.id === member)) setMember('all')
  }, [visibleMembers, member])

  // `leads` is server-fetched (fetchVisibleLeads) and handed down as a prop —
  // there's no client-side fetch to poll here, so staying "live" means a
  // periodic router.refresh() to re-run that same server query and hand back
  // fresh props in place, without a full navigation or losing filter/scroll
  // state. Same cadence as the notifications list, so a lead a colleague just
  // touched (new message, status change, assignment) surfaces without a
  // manual reload. Paused while the tab is backgrounded (usePollWhenVisible)
  // — this page is commonly left open all day.
  //
  // router.refresh() itself is expensive here — it re-runs fetchVisibleLeads,
  // a full tenant fetch with joins (1191+ rows for this tenant and growing).
  // Calling it unconditionally every 12s was the single largest driver of
  // this tenant's Supabase egress and Vercel compute once lead count passed
  // 1000 (see fetchAllRows) — a tab left open all day means thousands of full
  // refetches. Polling a cheap signal (row count + latest updated_at, no lead
  // rows transferred) instead, and only refreshing when it actually differs
  // from what's on screen, keeps the same "feels live within 12s" behavior at
  // a fraction of the cost — most 12s windows in a real workday have no
  // change at all.
  const lastSignalRef = useRef<{ count: number; latest: string } | null>(null)
  useEffect(() => {
    const latest = leads.reduce((max, l) => (l.updated_at > max ? l.updated_at : max), '')
    lastSignalRef.current = { count: leads.length, latest }
  }, [leads])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/signal')
      if (!res.ok) return
      const signal: { count: number; latest: string | null } = await res.json()
      const prev = lastSignalRef.current
      if (!prev || signal.count !== prev.count || signal.latest !== prev.latest) {
        router.refresh()
      }
    } catch {
      // Network hiccup — skip this tick, the next one retries.
    }
  }, [router])
  usePollWhenVisible(refresh, 12000)

  // Leads after every filter EXCEPT status (period, search, campaign, team,
  // member). The overview cards and the status filter both derive from this, so
  // the whole page — including the 6 cards up top — reacts to the period/search
  // filters, while the cards still show a per-status breakdown to pick from.
  const scoped = useMemo(() => {
    // Date bounds for the selected period (null = unbounded on that side).
    const now = Date.now()
    let minTime: number | null = null
    let maxTime: number | null = null
    if (period === 'range') {
      if (customFrom) minTime = new Date(`${customFrom}T00:00:00`).getTime()
      if (customTo) maxTime = new Date(`${customTo}T23:59:59`).getTime()
    } else if (period === 'day') {
      // "اليوم" = since midnight today, not the last 24 hours.
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      minTime = d.getTime()
    } else if (period === 'week') {
      minTime = now - 7 * 86400000
    } else if (period === 'month') {
      minTime = now - 30 * 86400000
    } else if (period === 'thisMonth') {
      const d = new Date()
      minTime = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
    }
    const q = search.trim().toLowerCase()
    const qDigits = phoneDigits(q)

    return leads.filter(l => {
      if (campaign !== 'all' && l.campaign_id !== campaign) return false
      if (team !== 'all' && l.assigned_team_id !== team) return false
      if (member !== 'all' && l.assigned_sales_id !== member) return false
      if (source !== 'all' && (l.source || 'direct') !== source) return false
      if (assignedToMe && currentUserId && l.assigned_sales_id !== currentUserId) return false
      if (sharedWithMeOnly && !sharedWithMeSet.has(l.id)) return false
      const t = new Date(l.created_at).getTime()
      if (minTime !== null && t < minTime) return false
      if (maxTime !== null && t > maxTime) return false
      if (q) {
        // A phone query is matched on digits, not text: the same number is
        // stored formatted differently by different sources ("+966505845214"
        // vs "+966 50 5845214"), and one copied out of an Arabic interface
        // carries invisible bidi marks — a substring match finds neither.
        const byPhone = qDigits.length >= 4 && phoneMatches(leadPhone(l.data), q)
        if (!byPhone && !leadName(l.data).toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [leads, campaign, team, member, source, assignedToMe, sharedWithMeOnly, currentUserId, sharedWithMeSet, period, customFrom, customTo, search])

  const filtered = useMemo(
    () => scoped.filter(l => {
      // 'contacted' and 'pending' are both display-only splits of the same
      // canonical 'contacted' status (see displayBucketForLead) — never a
      // second `l.status === status` match, since that column only ever
      // holds 'contacted'.
      const statusMatches =
        status === 'all' ? true :
        status === 'in_progress' ? (l.status === 'contacted' || l.status === 'qualified') :
        status === 'contacted' ? displayBucketForLead(l.status, l.sub_status) === 'in_progress' :
        status === 'pending' ? displayBucketForLead(l.status, l.sub_status) === 'pending' :
        l.status === status
      // "جديد" (new_lead) is one of three sub-statuses under the 'new' bucket
      // (new_lead / first_inbound_call / first_inbound_message) — only leads
      // created directly (ads/manual/sheets) ever get stamped 'new_lead'
      // itself, so for a Bevatel/Rafeeq-Social-heavy tenant this option would
      // otherwise always show 0 despite "جديد" leads clearly existing (they're
      // just stamped one of the other two). Matching on the canonical status
      // instead makes this option mean the whole "new" bucket, same as the
      // "جديد" stat card above — and naturally covers a null sub_status too.
      const subStatusMatches =
        subStatus === 'all' ? true :
        subStatus === 'new_lead' ? l.status === 'new' :
        l.sub_status === subStatus
      return statusMatches && subStatusMatches
    }),
    [scoped, status, subStatus],
  )

  // "Select all" toggles every lead matching the CURRENT filters (not just
  // the visible page) — so a filtered-down admin selection can't silently
  // balloon into "delete everything".
  const allFilteredSelected = !!bulkSelect && filtered.length > 0 && filtered.every(l => bulkSelect.selected.has(l.id))
  const toggleSelectAllFiltered = () => {
    if (!bulkSelect) return
    if (allFilteredSelected) bulkSelect.clear()
    else bulkSelect.selectMany(filtered.map(l => l.id))
  }

  // Pagination — show a bounded page of leads instead of the whole list.
  const PAGE_SIZE = 10
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // Snap back to a valid page whenever filters shrink the list.
  useEffect(() => { setPage(1) }, [status, subStatus, campaign, team, member, source, assignedToMe, sharedWithMeOnly, period, customFrom, customTo, search])
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Lead counts per status — shown as overview cards that double as quick
  // filters. Computed from the scoped set so they respect the active filters.
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: scoped.length, new: 0, contacted: 0, pending: 0, qualified: 0, converted: 0, lost: 0 }
    for (const l of scoped) {
      if (l.status === 'contacted') {
        const bucket = displayBucketForLead(l.status, l.sub_status)
        counts[bucket === 'pending' ? 'pending' : 'contacted']++
      } else if (l.status && counts[l.status] !== undefined) {
        counts[l.status]++
      }
    }
    return counts
  }, [scoped])

  // Whether any filter differs from "show everything" — drives whether the
  // reset button appears at all, rather than cluttering the toolbar with a
  // no-op control when nothing is actually filtered.
  const hasActiveFilters =
    search !== '' || period !== 'all' || status !== 'all' || subStatus !== 'all' ||
    campaign !== 'all' || team !== 'all' || member !== 'all' || source !== 'all' ||
    assignedToMe || sharedWithMeOnly

  function resetFilters() {
    setSearch('')
    setPeriod('all')
    setCustomFrom('')
    setCustomTo('')
    setStatus('all')
    setSubStatus('all')
    setCampaign('all')
    setTeam('all')
    setMember('all')
    setSource('all')
    setAssignedToMe(false)
    setSharedWithMeOnly(false)
  }

  return (
    <div className="space-y-6">
      {/* Page-level search + period quick-filter — controls everything below,
          including the overview cards. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted2 pointer-events-none" />
          <input
            className="input ps-9"
            placeholder="ابحث بالاسم أو رقم الهاتف..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border w-fit">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                period === p.key ? 'bg-primary text-primary-fg' : 'text-muted hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'range' && (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" dir="ltr" value={customFrom} max={customTo || undefined}
              onChange={e => setCustomFrom(e.target.value)} className="input !py-1.5 !w-auto text-start" aria-label="من تاريخ" />
            <span className="text-muted2 text-sm">إلى</span>
            <input type="date" dir="ltr" value={customTo} min={customFrom || undefined}
              onChange={e => setCustomTo(e.target.value)} className="input !py-1.5 !w-auto text-start" aria-label="إلى تاريخ" />
          </div>
        )}
      </div>

      {/* Overview stat cards — counts per status, clickable as quick filters */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-muted2">نظرة عامة</p>
          <button onClick={() => setShowAddLead(true)} className="btn btn-primary !py-1.5 !px-3 text-sm">
            <Plus size={16} /> عميل جديد
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {STAT_CARDS.map(c => {
            const active = status === c.key
            return (
              <button
                key={c.key}
                onClick={() => setStatus(active && c.key !== 'all' ? 'all' : c.key)}
                className={`card p-4 text-start transition hover:border-primary ${active ? 'border-primary ring-1 ring-primary' : ''}`}
              >
                <p className="text-2xl font-extrabold" style={{ color: c.color }}>{statusCounts[c.key]}</p>
                <p className="text-xs text-muted2 mt-1 truncate">{c.label}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Filters + view toggle */}
      <div className="card p-3 flex flex-wrap gap-3 items-center">
        <select className="input !w-auto" value={subStatus} onChange={e => setSubStatus(e.target.value)}>
          <option value="all">اختر الحالة</option>
          {SUB_STATUS_GROUPS.map(g => (
            <optgroup key={g.bucket} label={DISPLAY_BUCKET_LABELS[g.bucket]}>
              {g.items.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </optgroup>
          ))}
        </select>
        {(isAdmin || isManager) && campaigns.length > 0 && (
          <select className="input !w-auto" value={campaign} onChange={e => setCampaign(e.target.value)}>
            <option value="all">كل الحملات</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {isAdmin && teams.length > 0 && (
          <select className="input !w-auto" value={team} onChange={e => setTeam(e.target.value)}>
            <option value="all">كل الفِرَق</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {(isAdmin || isManager) && members.length > 0 && (
          <select className="input !w-auto" value={member} onChange={e => setMember(e.target.value)}>
            <option value="all">كل الموظفين</option>
            {visibleMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        {sourceOptions.length > 0 && (
          <select className="input !w-auto" value={source} onChange={e => setSource(e.target.value)}>
            <option value="all">كل المصادر</option>
            {sourceOptions.map(s => <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>)}
          </select>
        )}
        {currentUserId && (
          <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border">
            <button
              type="button"
              onClick={() => setAssignedToMe(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${assignedToMe ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-foreground'}`}
            >
              <User size={14} /> مسند لي
            </button>
            <button
              type="button"
              onClick={() => setSharedWithMeOnly(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${sharedWithMeOnly ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-foreground'}`}
            >
              <Share2 size={14} /> مشارك معي
            </button>
          </div>
        )}
        {hasActiveFilters && (
          <button type="button" onClick={resetFilters} className="btn btn-outline !py-1.5 !px-3 text-sm flex items-center gap-1.5">
            <FilterX size={14} /> إعادة تعيين الفلاتر
          </button>
        )}
        <span className="text-sm text-muted2">{filtered.length} عميل محتمل</span>

        <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border ms-auto">
          <button onClick={() => setView('cards')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${view === 'cards' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
            <LayoutGrid size={15} /> كروت
          </button>
          <button onClick={() => setView('table')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${view === 'table' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
            <TableIcon size={15} /> جدول
          </button>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-muted2">لا يوجد عملاء محتملون.</div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {paged.map(lead => {
            const phone = leadPhone(lead.data)
            const override = statusOverride[lead.id]
            const effStatus = override?.status ?? lead.status
            const effSubStatus = override?.sub_status ?? lead.sub_status ?? null
            return (
              <div key={lead.id} onClick={() => open(lead.id)} className="card p-4 text-start transition hover:border-primary cursor-pointer">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {bulkSelect && (
                      <span onClick={e => e.stopPropagation()} className="shrink-0">
                        <input type="checkbox" checked={bulkSelect.selected.has(lead.id)} onChange={() => bulkSelect.toggle(lead.id)} aria-label={`تحديد ${leadName(lead.data)}`} />
                      </span>
                    )}
                    <div className="w-9 h-9 rounded-full bg-primary-soft flex items-center justify-center shrink-0">
                      <User size={16} style={{ color: 'var(--primary)' }} />
                    </div>
                    <span className="text-sm font-bold text-foreground truncate">{leadName(lead.data)}</span>
                  </div>
                  <span className="shrink-0">
                    <StatusCell currentKey={effSubStatus} currentStatus={effStatus} saving={savingStatusId === lead.id}
                      onPick={key => changeLeadStatus(lead.id, effSubStatus, key)} />
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-muted mb-3">
                  <p className="flex items-center gap-2 flex-wrap"><Megaphone size={13} /> {campaignLabel(lead)}{sourceLabel(lead) && <span className="badge bg-surface2 text-muted2">{sourceLabel(lead)}</span>}</p>
                  <p className="flex items-center gap-2"><Calendar size={13} /> <span className="text-muted2">أنشئ:</span> {fmtDateTime(lead.created_at)}</p>
                  <p className="flex items-center gap-2"><Clock size={13} /> <span className="text-muted2">آخر تحديث:</span> {fmtDateTime(lead.updated_at)}</p>
                  {(isAdmin || isManager) && <p className="flex items-center gap-2"><User size={13} /> <span className="text-muted2">المسؤول:</span> {lead.assigned_sales?.full_name || 'غير مُسنَد'}</p>}
                </div>
                {phone && <div className="flex items-center gap-2"><ContactButtons lead={lead} phone={phone} bevatel={bevatel} rafeeqSocialBotId={rafeeqSocialBotId} /></div>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted2 text-xs">
                  {bulkSelect && (
                    <th className="w-10 px-4 py-3">
                      <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAllFiltered} aria-label="تحديد الكل" />
                    </th>
                  )}
                  <th className="text-start font-semibold px-4 py-3">العميل</th>
                  <th className="text-start font-semibold px-4 py-3">الحالة</th>
                  {/* Contact shown right here on small screens (no scrolling needed), and again at the end for large screens — see the matching pair of <td>s below. */}
                  <th className="md:hidden text-start font-semibold px-4 py-3">تواصل</th>
                  <th className="hidden md:table-cell text-start font-semibold px-4 py-3">الحملة</th>
                  {(isAdmin || isManager) && <th className="hidden md:table-cell text-start font-semibold px-4 py-3">المسؤول</th>}
                  <th className="hidden md:table-cell text-start font-semibold px-4 py-3">تاريخ الإنشاء</th>
                  <th className="hidden md:table-cell text-start font-semibold px-4 py-3">آخر تحديث</th>
                  <th className="hidden md:table-cell text-start font-semibold px-4 py-3">تواصل</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(lead => {
                  const phone = leadPhone(lead.data)
                  const override = statusOverride[lead.id]
                  const effStatus = override?.status ?? lead.status
                  const effSubStatus = override?.sub_status ?? lead.sub_status ?? null
                  return (
                    <tr key={lead.id} onClick={() => open(lead.id)} className="border-b border-border last:border-0 hover:bg-surface2 cursor-pointer transition">
                      {bulkSelect && (
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={bulkSelect.selected.has(lead.id)} onChange={() => bulkSelect.toggle(lead.id)} aria-label={`تحديد ${leadName(lead.data)}`} />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className="font-semibold text-foreground block">{leadName(lead.data)}</span>
                        {phone && <span className="text-xs text-muted2" dir="ltr">{phone}</span>}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <StatusCell currentKey={effSubStatus} currentStatus={effStatus} saving={savingStatusId === lead.id}
                          onPick={key => changeLeadStatus(lead.id, effSubStatus, key)} />
                      </td>
                      <td className="md:hidden px-4 py-3"><div className="flex items-center gap-1.5"><ContactButtons lead={lead} phone={phone} bevatel={bevatel} rafeeqSocialBotId={rafeeqSocialBotId} /></div></td>
                      <td className="hidden md:table-cell px-4 py-3 text-muted"><span className="flex items-center gap-2 flex-wrap">{campaignLabel(lead)}{sourceLabel(lead) && <span className="badge bg-surface2 text-muted2">{sourceLabel(lead)}</span>}</span></td>
                      {(isAdmin || isManager) && (
                        <td className="hidden md:table-cell px-4 py-3 text-muted whitespace-nowrap">
                          {lead.assigned_sales?.full_name
                            ? <span className="flex items-center gap-1.5"><User size={13} /> {lead.assigned_sales.full_name}</span>
                            : <span className="text-muted2">غير مُسنَد</span>}
                        </td>
                      )}
                      <td className="hidden md:table-cell px-4 py-3 text-muted2 whitespace-nowrap">{fmtDate(lead.created_at)}</td>
                      <td className="hidden md:table-cell px-4 py-3 text-muted2 whitespace-nowrap">{fmtDateTime(lead.updated_at)}</td>
                      <td className="hidden md:table-cell px-4 py-3"><div className="flex items-center gap-1.5"><ContactButtons lead={lead} phone={phone} bevatel={bevatel} rafeeqSocialBotId={rafeeqSocialBotId} /></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <span className="text-xs text-muted2">
            عرض {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} من {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface2 transition disabled:opacity-40 disabled:pointer-events-none"
              aria-label="السابق"
            >
              <ChevronRight size={16} />
            </button>
            {pageWindow(safePage, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={`e${i}`} className="w-9 h-9 flex items-center justify-center text-muted2">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  aria-current={p === safePage}
                  className={`min-w-9 h-9 px-2 flex items-center justify-center rounded-lg text-sm font-semibold transition border ${
                    p === safePage
                      ? 'bg-primary text-primary-fg border-transparent'
                      : 'border-border text-muted hover:text-foreground hover:bg-surface2'
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface2 transition disabled:opacity-40 disabled:pointer-events-none"
              aria-label="التالي"
            >
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>
      )}

      {showAddLead && (
        <AddLeadModal
          role={role}
          basePath={basePath}
          tenantId={tenantId}
          campaigns={campaigns}
          members={members}
          onClose={() => setShowAddLead(false)}
        />
      )}
    </div>
  )
}
