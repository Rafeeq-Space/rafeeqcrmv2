'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Tenant } from '@/lib/types'
import ResetPasswordButton from '@/components/ResetPasswordButton'

interface Props {
  tenants: Tenant[]
  pending?: Tenant[]
}

export function AddClientButton() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', subdomain: '', email: '' })
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ')
    } finally {
      setLoading(false)
    }
  }

  function closeModal() {
    setOpen(false)
    if (sent) {
      window.location.reload()
      return
    }
    setForm({ name: '', subdomain: '', email: '' })
    setError('')
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-primary !py-2">+ إضافة عميل</button>

      {open && (
        <div className="overlay items-center justify-center p-4" onClick={closeModal}>
          <div className="modal p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-foreground">تسجيل عميل جديد</h3>
              <button onClick={closeModal} className="text-muted2 hover:text-foreground"><X size={20} /></button>
            </div>
            {sent ? (
              <div className="space-y-4 text-center py-2">
                <p className="text-sm text-foreground leading-relaxed">
                  تم إنشاء الحساب وإرسال رابط الدخول إلى
                  <span className="font-semibold block mt-1" dir="ltr">{form.email}</span>
                </p>
                <p className="text-xs text-muted2">سيقوم العميل بتعيين كلمة المرور الخاصة به من الرابط المُرسَل.</p>
                <button type="button" onClick={closeModal} className="btn btn-primary w-full">تم</button>
              </div>
            ) : (
              <form onSubmit={handleAdd} className="space-y-3">
                <div>
                  <label className="label">اسم الشركة</label>
                  <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <label className="label">النطاق الفرعي</label>
                  <div className="flex items-center bg-surface2 border border-border rounded-xl overflow-hidden focus-within:border-primary" dir="ltr">
                    <input
                      className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none text-foreground"
                      value={form.subdomain}
                      onChange={e => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                      required
                    />
                    <span className="bg-surface3 px-3 py-2.5 text-sm text-muted2">.rafeeqcrm.com</span>
                  </div>
                </div>
                <div>
                  <label className="label">البريد الإلكتروني</label>
                  <input type="email" dir="ltr" className="input text-start" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                </div>
                <p className="text-xs text-muted2">سيصل العميل رابط لتسجيل الدخول وتعيين كلمة المرور على بريده.</p>
                {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={closeModal} className="btn btn-outline flex-1">إلغاء</button>
                  <button type="submit" disabled={loading} className="btn btn-primary flex-1">{loading ? 'جارٍ الإرسال...' : 'إرسال الدعوة'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function EditButton({ tenant }: { tenant: Tenant }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: tenant.name, email: tenant.email, password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload: Record<string, string> = { name: form.name, email: form.email }
      if (form.password) payload.password = form.password
      const res = await fetch(`/api/admin/clients/${tenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOpen(false)
      window.location.reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs font-semibold me-3" style={{ color: 'var(--primary)' }}>تعديل</button>
      {open && (
        <div className="overlay items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="modal p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-foreground">تعديل العميل</h3>
              <button onClick={() => setOpen(false)} className="text-muted2 hover:text-foreground"><X size={20} /></button>
            </div>
            <p className="text-sm text-muted2 mb-4" dir="ltr">{tenant.subdomain}.rafeeqcrm.com</p>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="label">اسم الشركة</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="label">البريد الإلكتروني</label>
                <input type="email" dir="ltr" className="input text-start" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div>
                <label className="label">كلمة مرور جديدة <span className="text-muted2 font-normal">(اتركها فارغة للإبقاء عليها)</span></label>
                <input type="password" dir="ltr" className="input text-start" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} minLength={8} placeholder="••••••••" />
              </div>
              {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="btn btn-outline flex-1">إلغاء</button>
                <button type="submit" disabled={loading} className="btn btn-primary flex-1">{loading ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export default function AdminClientsTable({ tenants, pending = [] }: Props) {
  async function handleDelete(id: string) {
    if (!confirm('حذف هذا العميل؟')) return
    await fetch(`/api/admin/clients/${id}`, { method: 'DELETE' })
    window.location.reload()
  }

  return (
    <>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-start px-6 py-3 text-muted2 font-semibold">الاسم</th>
            <th className="text-start px-6 py-3 text-muted2 font-semibold">النطاق</th>
            <th className="text-start px-6 py-3 text-muted2 font-semibold">البريد الإلكتروني</th>
            <th className="text-start px-6 py-3 text-muted2 font-semibold">تاريخ الإنشاء</th>
            <th className="text-start px-6 py-3 text-muted2 font-semibold">إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {tenants.length === 0 && (
            <tr><td colSpan={5} className="px-6 py-10 text-center text-muted2">لا يوجد عملاء بعد. أضف عميلك الأول.</td></tr>
          )}
          {tenants.map(tenant => (
            <tr key={tenant.id} className="border-b border-border last:border-0 hover:bg-surface2 transition">
              <td className="px-6 py-3 font-semibold text-foreground">{tenant.name}</td>
              <td className="px-6 py-3">
                <a href={`https://${tenant.subdomain}.rafeeqcrm.com`} target="_blank" className="hover:underline" style={{ color: 'var(--primary)' }} dir="ltr">
                  {tenant.subdomain}.rafeeqcrm.com
                </a>
              </td>
              <td className="px-6 py-3 text-muted" dir="ltr">{tenant.email}</td>
              <td className="px-6 py-3 text-muted2">{new Date(tenant.created_at).toLocaleDateString('ar-EG')}</td>
              <td className="px-6 py-3 whitespace-nowrap">
                <EditButton tenant={tenant} />
                <ResetPasswordButton endpoint={`/api/admin/clients/${tenant.id}`} name={tenant.name} trigger="link" />
                <button onClick={() => handleDelete(tenant.id)} className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>حذف</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {pending.length > 0 && (
      <div className="border-t border-border">
        <div className="px-6 py-3 flex items-center gap-2">
          <span className="badge" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>بانتظار التفعيل</span>
          <span className="text-xs text-muted2">عملاء تمت دعوتهم ولم يُعيّنوا كلمة المرور بعد ({pending.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start px-6 py-3 text-muted2 font-semibold">الاسم</th>
                <th className="text-start px-6 py-3 text-muted2 font-semibold">النطاق</th>
                <th className="text-start px-6 py-3 text-muted2 font-semibold">البريد الإلكتروني</th>
                <th className="text-start px-6 py-3 text-muted2 font-semibold">تاريخ الدعوة</th>
                <th className="text-start px-6 py-3 text-muted2 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {pending.map(tenant => (
                <tr key={tenant.id} className="border-b border-border last:border-0 hover:bg-surface2 transition opacity-80">
                  <td className="px-6 py-3 font-semibold text-foreground">{tenant.name}</td>
                  <td className="px-6 py-3 text-muted2" dir="ltr">{tenant.subdomain}.rafeeqcrm.com</td>
                  <td className="px-6 py-3 text-muted" dir="ltr">{tenant.email}</td>
                  <td className="px-6 py-3 text-muted2">{new Date(tenant.created_at).toLocaleDateString('ar-EG')}</td>
                  <td className="px-6 py-3 whitespace-nowrap">
                    <button onClick={() => handleDelete(tenant.id)} className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
    </>
  )
}

