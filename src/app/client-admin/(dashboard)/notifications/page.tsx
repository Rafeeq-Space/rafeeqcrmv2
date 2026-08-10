import { redirect } from 'next/navigation'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import NotificationsView from '@/components/NotificationsView'

// Push-notification toggle moved to the profile page (/client-admin/profile).
export default async function ClientAdminNotificationsPage() {
  const viewer = await requireTenantUser()
  if (!viewer) redirect('/login')

  return (
    <div className="space-y-4">
      <NotificationsView viewerId={viewer.id} leadBasePath="/client-admin/leads" />
    </div>
  )
}
