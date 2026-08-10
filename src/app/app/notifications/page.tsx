import { redirect } from 'next/navigation'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import NotificationsView from '@/components/NotificationsView'

// Push-notification toggle moved to the profile page (/app/profile).
export default async function AppNotificationsPage() {
  const viewer = await requireTenantUser()
  if (!viewer) redirect('/login')

  return (
    <div className="space-y-4">
      <NotificationsView viewerId={viewer.id} leadBasePath="/app/my-leads" />
    </div>
  )
}
