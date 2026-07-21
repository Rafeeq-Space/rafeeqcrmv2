import { redirect } from 'next/navigation'

// Legacy alias — super admin login now lives at the unlisted /logininin.
export default function AdminLoginPage() {
  redirect('/logininin')
}
