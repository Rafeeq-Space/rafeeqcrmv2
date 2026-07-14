'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

// A password field with a show/hide eye toggle. Drop-in replacement for a
// plain <input type="password" />. All standard input props pass through.
export default function PasswordInput({ className = '', ...props }: Props) {
  const [show, setShow] = useState(false)

  return (
    // dir="ltr" so the logical end (eye + padding) sits on the right, matching
    // the LTR password fields used across the app.
    <div className="relative" dir="ltr">
      <input
        {...props}
        type={show ? 'text' : 'password'}
        className={`${className} pe-10`.trim()}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow(s => !s)}
        className="absolute inset-y-0 end-3 flex items-center text-muted2 hover:text-foreground transition"
        title={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}
