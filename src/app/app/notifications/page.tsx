import { redirect } from 'next/navigation'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import NotificationsView from '@/components/NotificationsView'

export default async function AppNotificationsPage() {
  const viewer = await requireTenantUser()
  if (!viewer) redirect('/login')

  return <NotificationsView viewerId={viewer.id} leadBasePath="/app/my-leads" />
}
