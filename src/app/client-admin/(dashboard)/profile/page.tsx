import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadProfileViewData } from '@/lib/profile/loadProfileViewData'
import ProfileView from '@/components/ProfileView'

export default async function ClientAdminProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const data = await loadProfileViewData(user.id)
  if (!data) redirect('/login')

  return <ProfileView {...data} targetsHref="/client-admin/targets" leadsHref="/client-admin/leads" />
}
