import { createClient as createServerClient } from '@supabase/supabase-js'
import LandingPageView from '@/components/app/LandingPageView'
import { notFound } from 'next/navigation'

export default async function PublicLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { slug } = await params

  const { data: page } = await supabase
    .from('landing_pages')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle()

  if (!page) notFound()

  let form = null
  let campaign = null
  if (page.form_id) {
    const { data } = await supabase
      .from('forms')
      .select('*, campaigns(*)')
      .eq('id', page.form_id)
      .maybeSingle()
    form = data
    campaign = data?.campaigns || null
  }

  return <LandingPageView page={page} form={form} campaign={campaign} />
}
