'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Copy, CheckCircle, Sheet, ExternalLink } from 'lucide-react'
import type { Form, TeamWithMembers } from '@/lib/types'
import LeadDistribution from './LeadDistribution'

const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'

function appsScript(webhookUrl: string, secret: string) {
  return `function setupTrigger() {
  ScriptApp.newTrigger('onSheetChange')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onChange()
    .create();
}

function onSheetChange() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var lastRow = sheet.getLastRow();
  var props = PropertiesService.getScriptProperties();
  var sentRow = parseInt(props.getProperty('lastSentRow') || '1', 10);
  if (lastRow <= sentRow || sheet.getLastColumn() === 0) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var r = sentRow + 1; r <= lastRow; r++) {
    var values = sheet.getRange(r, 1, 1, sheet.getLastColumn()).getValues()[0];
    var row = {};
    headers.forEach(function (h, i) { row[h] = values[i]; });
    UrlFetchApp.fetch('${webhookUrl}', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-webhook-secret': '${secret}' },
      payload: JSON.stringify({ row: row }),
      muteHttpExceptions: true
    });
  }
  props.setProperty('lastSentRow', String(lastRow));
}`
}

function genSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

// Shown right after creating the connection, and reopenable later from the
// forms list, so the admin can always get back the webhook URL / secret / script.
export function SheetConnectionInfo({ form, onClose }: { form: Form; onClose: () => void }) {
  const [copied, setCopied] = useState<'url' | 'secret' | 'script' | null>(null)
  const webhookUrl = `https://${rootDomain}/api/leads/sheet-webhook/${form.id}`
  const secret = form.sheet_webhook_secret || ''
  const script = appsScript(webhookUrl, secret)

  async function copy(text: string, key: 'url' | 'secret' | 'script') {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="overlay items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="modal p-6 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Sheet size={19} style={{ color: 'var(--success)' }} />
            <h3 className="text-lg font-bold text-foreground">ربط Google Sheet — {form.name}</h3>
          </div>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>

        <div className="space-y-4 text-sm">
          <div className="rounded-xl bg-surface2 border border-border p-3 text-xs text-muted leading-relaxed">
            كل صف جديد يُضاف إلى الشيت سيدخل تلقائياً كـ Lead جديد في هذه الحملة، ويُوزَّع على الأعضاء المختارين بالتساوي.
            نفّذ الخطوات التالية مرة واحدة فقط داخل الشيت.
          </div>

          <div>
            <p className="label mb-1.5">١. افتح الشيت ← Extensions ← Apps Script، والصق هذا الكود:</p>
            <div className="relative">
              <pre dir="ltr" className="bg-surface2 border border-border rounded-xl p-3 text-xs overflow-x-auto max-h-56 text-foreground font-mono">{script}</pre>
              <button onClick={() => copy(script, 'script')} className="absolute top-2 end-2 btn btn-outline !py-1 !px-2 text-xs gap-1 bg-surface">
                {copied === 'script' ? <CheckCircle size={13} style={{ color: 'var(--success)' }} /> : <Copy size={13} />}
                نسخ
              </button>
            </div>
          </div>

          <div>
            <p className="label mb-1.5">٢. من قائمة الدوال أعلى المحرر اختر <code dir="ltr">setupTrigger</code> ثم اضغط تشغيل (Run)، ووافق على الأذونات المطلوبة مرة واحدة.</p>
            <p className="text-xs text-muted2">من هذه اللحظة، أي صف جديد يُضاف للشيت (يدوياً أو عبر Google Form) سيُرسَل تلقائياً كـ Lead.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
            <div>
              <p className="label mb-1">رابط الـ Webhook</p>
              <div className="flex items-center gap-1.5">
                <code dir="ltr" className="flex-1 text-xs bg-surface2 border border-border px-2 py-2 rounded-lg truncate">{webhookUrl}</code>
                <button onClick={() => copy(webhookUrl, 'url')} className="text-muted2 hover:text-foreground shrink-0">
                  {copied === 'url' ? <CheckCircle size={15} style={{ color: 'var(--success)' }} /> : <Copy size={15} />}
                </button>
              </div>
            </div>
            <div>
              <p className="label mb-1">المفتاح السري</p>
              <div className="flex items-center gap-1.5">
                <code dir="ltr" className="flex-1 text-xs bg-surface2 border border-border px-2 py-2 rounded-lg truncate">{secret}</code>
                <button onClick={() => copy(secret, 'secret')} className="text-muted2 hover:text-foreground shrink-0">
                  {copied === 'secret' ? <CheckCircle size={15} style={{ color: 'var(--success)' }} /> : <Copy size={15} />}
                </button>
              </div>
            </div>
          </div>

          {form.sheet_url && (
            <a href={form.sheet_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs" style={{ color: 'var(--primary)' }}>
              <ExternalLink size={13} /> فتح الشيت
            </a>
          )}

          <div className="flex justify-end pt-1">
            <button onClick={onClose} className="btn btn-primary">تم</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Step 1: create the connection (name + distribution + optional sheet link).
export default function GoogleSheetForm({
  campaignId, tenantId, campaignTeams, onBack, onClose, onCreated,
}: {
  campaignId: string
  tenantId: string
  campaignTeams: TeamWithMembers[]
  onBack?: () => void
  onClose: () => void
  onCreated: (form: Form) => void
}) {
  const [name, setName] = useState('')
  const [sheetUrl, setSheetUrl] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) { setError('اسم مطلوب لهذا الربط'); return }
    setSaving(true)
    setError('')
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('forms')
      .insert({
        name,
        campaign_id: campaignId,
        tenant_id: tenantId,
        fields: [],
        assignee_ids: assigneeIds,
        rr_index: 0,
        source_type: 'google_sheet',
        sheet_url: sheetUrl.trim() || null,
        sheet_webhook_secret: genSecret(),
        published_at: new Date().toISOString(),
      })
      .select()
      .single()
    setSaving(false)
    if (err) { setError(`تعذّر إنشاء الربط: ${err.message}`); return }
    if (data) onCreated(data)
  }

  return (
    <div className="overlay items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="modal p-6 w-full max-w-lg my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Sheet size={18} style={{ color: 'var(--success)' }} />
            <h3 className="text-lg font-bold text-foreground">ربط Google Sheet</h3>
          </div>
          <div className="flex items-center gap-2">
            {onBack && <button onClick={onBack} className="btn btn-outline !py-1.5 !px-3 text-sm">رجوع</button>}
            <button onClick={onClose} className="text-muted2 hover:text-foreground px-1"><X size={20} /></button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">اسم الربط *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="مثال: عملاء حملة الفيسبوك — شيت" />
          </div>

          <div>
            <label className="label">رابط الشيت (اختياري، للمرجعية فقط)</label>
            <input dir="ltr" className="input text-start" value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
          </div>

          <div>
            <label className="label">توزيع العملاء</label>
            <LeadDistribution campaignTeams={campaignTeams} onChange={setAssigneeIds} />
          </div>

          <div className="rounded-xl bg-surface2 border border-border p-3 text-xs text-muted leading-relaxed">
            بعد الإنشاء ستحصل على كود جاهز (Google Apps Script) تلصقه داخل الشيت، ليتم إرسال أي صف جديد تلقائياً كـ Lead لهذه الحملة، بشكل مستمر.
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
            <button type="button" onClick={save} disabled={saving} className="btn btn-primary flex-1">
              {saving ? 'جارٍ الإنشاء...' : 'إنشاء الربط'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
