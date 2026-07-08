'use client'

import { X, Wand2, Code2, Sheet, ChevronLeft } from 'lucide-react'

export default function ChooseFormMethodModal({
  onAdvanced, onHtml, onSheet, onClose,
}: {
  onAdvanced: () => void
  onHtml: () => void
  onSheet: () => void
  onClose: () => void
}) {
  return (
    <div className="overlay items-center justify-center p-4" onClick={onClose}>
      <div className="modal p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">إنشاء نموذج</h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>
        <p className="text-sm text-muted mb-4">اختر طريقة الإنشاء:</p>
        <div className="space-y-3">
          <button
            onClick={onAdvanced}
            className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-surface2 hover:bg-surface3 hover:border-primary transition text-start"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--purple-soft)' }}>
              <Wand2 size={20} style={{ color: 'var(--purple)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground">أداة منشئ النماذج</p>
              <p className="text-xs text-muted2 mt-0.5">تحكم كامل بالحقول والتصميم — بالاختيارات ومعاينة حية.</p>
            </div>
            <ChevronLeft size={18} className="text-muted2 shrink-0" />
          </button>

          <button
            onClick={onHtml}
            className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-surface2 hover:bg-surface3 hover:border-primary transition text-start"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--warning-soft)' }}>
              <Code2 size={20} style={{ color: 'var(--warning)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground">كود HTML أو ملف</p>
              <p className="text-xs text-muted2 mt-0.5">الصق كود HTML أو ارفع ملف .html وأنشئ منه نموذجاً.</p>
            </div>
            <ChevronLeft size={18} className="text-muted2 shrink-0" />
          </button>

          <button
            onClick={onSheet}
            className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-surface2 hover:bg-surface3 hover:border-primary transition text-start"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--success-soft)' }}>
              <Sheet size={20} style={{ color: 'var(--success)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground">ربط Google Sheet</p>
              <p className="text-xs text-muted2 mt-0.5">اسحب العملاء تلقائياً وباستمرار من شيت جوجل إلى هذه الحملة.</p>
            </div>
            <ChevronLeft size={18} className="text-muted2 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  )
}
