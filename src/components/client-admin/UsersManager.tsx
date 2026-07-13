'use client'

import { useState } from 'react'
import { X, UserPlus, Trash2, Pencil } from 'lucide-react'

interface User {
  id: string
  full_name: string
  email: string
  role: string
  created_at: string
}

interface Props {
  users: User[]
  tenantId: string
  currentUserId: string
}

function AddUserModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ full_name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/client-admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onClose()
      window.location.reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overlay items-center justify-center p-4" onClick={onClose}>
      <div className="modal p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">إضافة مستخدم جديد</h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>
        <form onSubmit={handleAdd} className="space-y-3">
          <div>
            <label className="label">الاسم الكامل</label>
            <input className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
          </div>
          <div>
            <label className="label">البريد الإلكتروني</label>
            <input type="email" dir="ltr" className="input text-start" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <label className="label">كلمة المرور</label>
            <input type="password" dir="ltr" className="input text-start" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={8} placeholder="••••••••" />
          </div>
          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
            <button type="submit" disabled={loading} className="btn btn-primary flex-1">
              {loading ? 'جارٍ الإنشاء...' : 'إنشاء الحساب'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditMyProfileModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [fullName, setFullName] = useState(user.full_name)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const body: { full_name: string; password?: string } = { full_name: fullName }
      if (password) body.password = password
      const res = await fetch(`/api/client-admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onClose()
      window.location.reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overlay items-center justify-center p-4" onClick={onClose}>
      <div className="modal p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">تعديل بياناتي</h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="label">الاسم الكامل</label>
            <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} required />
          </div>
          <div>
            <label className="label">البريد الإلكتروني</label>
            <input type="email" dir="ltr" className="input text-start" value={user.email} disabled />
          </div>
          <div>
            <label className="label">كلمة مرور جديدة <span className="text-muted2">(اختياري)</span></label>
            <input type="password" dir="ltr" className="input text-start" value={password} onChange={e => setPassword(e.target.value)} minLength={8} placeholder="اتركها فارغة لعدم التغيير" />
          </div>
          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
            <button type="submit" disabled={loading} className="btn btn-primary flex-1">
              {loading ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function UsersManager({ users, currentUserId }: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('حذف هذا المستخدم نهائياً؟')) return
    await fetch(`/api/client-admin/users/${id}`, { method: 'DELETE' })
    window.location.reload()
  }

  const roleLabel = (role: string) => {
    if (role === 'client_admin') return { label: 'مدير', cls: 'badge-yellow' }
    if (role === 'client_sales_manager') return { label: 'مدير مبيعات', cls: 'badge-blue' }
    return { label: 'مستخدم', cls: 'badge-blue' }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">المستخدمون</h1>
          <p className="text-muted text-sm mt-1">إدارة أعضاء الفريق وصلاحياتهم</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn btn-primary gap-2">
          <UserPlus size={17} />
          إضافة مستخدم
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-start px-6 py-3 text-muted2 font-semibold">الاسم</th>
              <th className="text-start px-6 py-3 text-muted2 font-semibold">البريد الإلكتروني</th>
              <th className="text-start px-6 py-3 text-muted2 font-semibold">الدور</th>
              <th className="text-start px-6 py-3 text-muted2 font-semibold">تاريخ الإضافة</th>
              <th className="text-start px-6 py-3 text-muted2 font-semibold">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-muted2">
                  لا يوجد مستخدمون بعد. أضف أول عضو في فريقك.
                </td>
              </tr>
            )}
            {users.map(u => {
              const { label, cls } = roleLabel(u.role)
              const isSelf = u.id === currentUserId
              return (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-surface2 transition">
                  <td className="px-6 py-3 font-semibold text-foreground">
                    {u.full_name}
                    {isSelf && <span className="badge badge-green ms-2">أنت</span>}
                  </td>
                  <td className="px-6 py-3 text-muted2" dir="ltr">{u.email}</td>
                  <td className="px-6 py-3">
                    <span className={`badge ${cls}`}>{label}</span>
                  </td>
                  <td className="px-6 py-3 text-muted2">
                    {new Date(u.created_at).toLocaleDateString('ar-EG')}
                  </td>
                  <td className="px-6 py-3">
                    {isSelf ? (
                      <button
                        onClick={() => setEditing(u)}
                        className="text-muted2 hover:text-primary transition p-1.5 rounded-lg"
                        title="تعديل بياناتي"
                      >
                        <Pencil size={16} />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="text-muted2 hover:text-danger transition p-1.5 rounded-lg"
                        title="حذف"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} />}
      {editing && <EditMyProfileModal user={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
