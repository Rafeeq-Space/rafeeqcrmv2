'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Copy, CheckCircle, Sheet, ExternalLink } from 'lucide-react'
import type { Form, TeamWithMembers } from '@/lib/types'
import LeadDistribution from './LeadDistribution'

const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'

// STATUS_LABELS must match LEAD_STATUS_LABELS in src/lib/utils.ts exactly.
const STATUS_LABELS = ['جديد', 'تم التواصل', 'مؤهل', 'تم التحويل', 'غير مؤهل']

function appsScript(webhookUrl: string, statusWebhookUrl: string, secret: string) {
  const statusList = STATUS_LABELS.map(s => `'${s}'`).join(', ')
  return `var STATUS_COL_NAME = 'الحالة';
var STATUSES = [${statusList}];
var WEBHOOK_URL = '${webhookUrl}';
var STATUS_WEBHOOK_URL = '${statusWebhookUrl}';
var SECRET = '${secret}';

function setupTrigger() {
  // Re-running setup must not stack duplicate triggers on the same sheet.
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'onSheetChange') ScriptApp.deleteTrigger(existing[i]);
  }
  ScriptApp.newTrigger('onSheetChange')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onChange()
    .create();
  // Spreadsheet triggers only fire for edits a person makes in the UI — a
  // lead source appending rows through the Sheets API (TikTok, Meta, Zapier)
  // never fires one, so onChange alone sees nothing at all on the sheets this
  // integration exists for. The time-driven trigger is what actually catches
  // those rows; onChange above just makes a manual edit land instantly.
  ScriptApp.newTrigger('onSheetChange')
    .timeBased()
    .everyMinutes(1)
    .create();
  ensureStatusColumn();
  // Rows already in the sheet at connect time are history, not new leads.
  // Without this, the first change posts every existing row as a fresh lead —
  // each one assigned, its rep notified, and a conversion event sent to the ad
  // platform stamped with today's date, which distorts optimization data for a
  // sheet that has been collecting leads for months. Only rows added after
  // setup are sent; importing the backlog is a separate, deliberate action.
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('lastSentRow') === null) {
    props.setProperty('lastSentRow', String(Math.max(SpreadsheetApp.getActiveSheet().getLastRow(), 1)));
  }
}

// Finds (or creates) the "الحالة" column and restricts it to a dropdown
// with the 5 exact status labels, so it can never contain a typo.
function ensureStatusColumn() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var lastCol = sheet.getLastColumn();
  // A sheet with no header row yet has nothing to append to — the column
  // would land in A1, ahead of the headers the lead source is about to write,
  // and every row after that would be read against the wrong column names.
  // Connect the sheet to its source first, then install this script.
  if (lastCol === 0) return 0;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var col = headers.indexOf(STATUS_COL_NAME) + 1;
  if (col === 0) {
    col = lastCol + 1;
    sheet.getRange(1, col).setValue(STATUS_COL_NAME);
  }
  var lastRow = Math.max(sheet.getLastRow(), 2);
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build();
  sheet.getRange(2, col, lastRow - 1, 1).setDataValidation(rule);
  return col;
}

// Fires on every edit/change to the sheet, and once a minute regardless:
// 1) sends brand-new rows to the CRM as leads (and stamps them "جديد").
// 2) detects manual edits to the status dropdown and forwards them to the CRM.
//
// Two triggers call this, so a run can start while another is mid-flight and
// post the same row twice — lastSentRow is only written after the loop
// finishes. The lock serialises them; a run that can't get it exits, because
// the run holding the lock is already covering the same rows.
function onSheetChange() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    sendNewRowsAndStatusEdits();
  } finally {
    lock.releaseLock();
  }
}

function sendNewRowsAndStatusEdits() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol === 0) return;

  var props = PropertiesService.getScriptProperties();
  var statusCol = ensureStatusColumn();
  var sentRow = parseInt(props.getProperty('lastSentRow') || '1', 10);

  // The pointer only ever moves forward, so if the sheet shrank — rows
  // deleted, or this script project reused on a smaller sheet — it can
  // end up above the sheet's own row count. Then lastRow > sentRow is false
  // forever and the script silently stops sending anything, with no error to
  // explain it. Resume from the current end rather than replaying history;
  // importing the backlog is what resendAllRows is for.
  if (sentRow > lastRow) {
    sentRow = lastRow;
    props.setProperty('lastSentRow', String(lastRow));
  }

  // The response used to be discarded and the pointer advanced past the whole
  // batch regardless, so a rejected row was lost permanently and in silence —
  // the sheet kept filling while the CRM received nothing. Now the pointer
  // moves one row at a time and only after that row is accepted, the first
  // failure stops the run so the next minute retries the same row, and the
  // throw at the end makes Apps Script email the script owner instead of
  // failing quietly while a campaign is spending.
  var firstError = '';
  if (lastRow > sentRow) {
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    for (var r = sentRow + 1; r <= lastRow; r++) {
      var values = sheet.getRange(r, 1, 1, lastCol).getValues()[0];
      var row = {};
      headers.forEach(function (h, i) { if (h !== STATUS_COL_NAME) row[h] = values[i]; });
      var res = UrlFetchApp.fetch(WEBHOOK_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-webhook-secret': SECRET },
        payload: JSON.stringify({ row: row, rowIndex: r }),
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      if (code < 200 || code >= 300) {
        firstError = 'row ' + r + ' -> HTTP ' + code + ' ' + res.getContentText().slice(0, 300);
        break;
      }
      sheet.getRange(r, statusCol).setValue(STATUSES[0]);
      props.setProperty('st_' + r, STATUSES[0]);
      props.setProperty('lastSentRow', String(r));
    }
  }

  var checkRows = Math.min(lastRow, sentRow);
  if (checkRows >= 2) {
    var statusValues = sheet.getRange(2, statusCol, checkRows - 1, 1).getValues();
    for (var i = 0; i < statusValues.length; i++) {
      var r2 = i + 2;
      var val = String(statusValues[i][0] || '').trim();
      if (!val) continue;
      var known = props.getProperty('st_' + r2);
      if (val !== known) {
        var sres = UrlFetchApp.fetch(STATUS_WEBHOOK_URL, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-webhook-secret': SECRET },
          payload: JSON.stringify({ rowIndex: r2, status: val }),
          muteHttpExceptions: true
        });
        var scode = sres.getResponseCode();
        // Only remember the new value once the CRM has it — otherwise a
        // rejected change looks synced and is never retried.
        if (scode >= 200 && scode < 300) {
          props.setProperty('st_' + r2, val);
        } else if (!firstError) {
          firstError = 'status row ' + r2 + ' -> HTTP ' + scode + ' ' + sres.getContentText().slice(0, 300);
        }
      }
    }
  }

  // Apps Script emails the script owner when a trigger throws, so this is the
  // only thing making a broken sheet connection noticeable while it is broken.
  if (firstError) throw new Error('CRM sync failed: ' + firstError);
}

// Run by hand to pull in rows that were already in the sheet when the script
// was installed (or that a stale pointer skipped). Deliberately manual: it
// posts every row from 2 onwards as a new lead, each one assigned, its rep
// notified, and a conversion event sent to the ad platform dated today.
function resendAllRows() {
  PropertiesService.getScriptProperties().deleteProperty('lastSentRow');
  onSheetChange();
}

// Web App entry point — called by the CRM when a lead's status changes there,
// so it can be mirrored back into this sheet. Deploy this script as a Web App
// (Execute as: Me, Who has access: Anyone) and paste the /exec URL in the CRM.
function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  if (body.secret !== SECRET) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'unauthorized' }));
  }
  var sheet = SpreadsheetApp.getActiveSheet();
  var statusCol = ensureStatusColumn();
  var row = parseInt(body.rowIndex, 10);
  if (statusCol > 0 && row >= 2 && body.status) {
    sheet.getRange(row, statusCol).setValue(body.status);
    PropertiesService.getScriptProperties().setProperty('st_' + row, String(body.status));
  }
  return ContentService.createTextOutput(JSON.stringify({ success: true }));
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
  const [copied, setCopied] = useState<'url' | 'secret' | 'script' | 'status' | null>(null)
  const [writebackUrl, setWritebackUrl] = useState(form.sheet_writeback_url || '')
  const [savingWriteback, setSavingWriteback] = useState(false)
  const [writebackSaved, setWritebackSaved] = useState(false)
  const [writebackError, setWritebackError] = useState('')

  const webhookUrl = `https://${rootDomain}/api/leads/sheet-webhook/${form.id}`
  const statusWebhookUrl = `https://${rootDomain}/api/leads/sheet-webhook/${form.id}/status`
  const secret = form.sheet_webhook_secret || ''
  const script = appsScript(webhookUrl, statusWebhookUrl, secret)

  async function copy(text: string, key: 'url' | 'secret' | 'script' | 'status') {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  async function saveWriteback() {
    setSavingWriteback(true)
    setWritebackError('')
    setWritebackSaved(false)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('forms')
      .update({ sheet_writeback_url: writebackUrl.trim() || null })
      .eq('id', form.id)
    setSavingWriteback(false)
    if (err) { setWritebackError(`تعذّر الحفظ: ${err.message}`); return }
    setWritebackSaved(true)
    setTimeout(() => setWritebackSaved(false), 2000)
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
            كما تتم إضافة عمود <b>"الحالة"</b> تلقائياً (قائمة منسدلة بخيارات ثابتة)، وتتزامن حالة العميل بين الـ CRM والشيت في الاتجاهين.
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
            <p className="text-xs text-muted2">من هذه اللحظة، أي صف جديد يُضاف للشيت (يدوياً أو عبر Google Form) سيُرسَل تلقائياً كـ Lead، وسيُضاف عمود "الحالة" مع القائمة المنسدلة.</p>
          </div>

          <div>
            <p className="label mb-1.5">٣. لتفعيل مزامنة الحالة من الشيت إلى الـ CRM: في نفس المحرر اضغط Deploy ← New deployment ← اختر النوع Web app ← اضبط Execute as: Me و Who has access: Anyone ← اضغط Deploy ووافق على الأذونات، ثم انسخ رابط الـ Web app (ينتهي بـ /exec) والصقه في الحقل أدناه واحفظه:</p>
            <div className="flex items-center gap-1.5">
              <input dir="ltr" className="input text-start flex-1 text-xs" value={writebackUrl} onChange={e => setWritebackUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" />
              <button onClick={saveWriteback} disabled={savingWriteback} className="btn btn-primary !py-2 !px-3 text-xs shrink-0">
                {savingWriteback ? '...' : writebackSaved ? <CheckCircle size={15} /> : 'حفظ'}
              </button>
            </div>
            {writebackError && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{writebackError}</p>}
            <p className="text-xs text-muted2 mt-1">بدون هذه الخطوة: يبقى إنشاء الـ Leads من الشيت يعمل بشكل طبيعي، لكن تغيير الحالة من داخل الـ CRM لن ينعكس في الشيت (والعكس يبقى يعمل).</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
            <div>
              <p className="label mb-1">رابط الـ Webhook (استقبال الصفوف)</p>
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
            <div className="sm:col-span-2">
              <p className="label mb-1">رابط webhook الحالة (Sheet ← CRM)</p>
              <div className="flex items-center gap-1.5">
                <code dir="ltr" className="flex-1 text-xs bg-surface2 border border-border px-2 py-2 rounded-lg truncate">{statusWebhookUrl}</code>
                <button onClick={() => copy(statusWebhookUrl, 'status')} className="text-muted2 hover:text-foreground shrink-0">
                  {copied === 'status' ? <CheckCircle size={15} style={{ color: 'var(--success)' }} /> : <Copy size={15} />}
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
