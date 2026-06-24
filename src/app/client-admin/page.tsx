import { redirect } from 'next/navigation'

export default function ClientAdminRoot() {
  redirect('/client-admin/dashboard')
}
