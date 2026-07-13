import { redirect } from 'next/navigation'

// Super admin login is unified under the main /login page.
export default function AdminLoginPage() {
  redirect('/login')
}
