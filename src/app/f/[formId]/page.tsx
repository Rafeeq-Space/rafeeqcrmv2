import { createClient as createServerClient } from '@supabase/supabase-js'
import PublicForm from '@/components/PublicForm'
import { notFound } from 'next/navigation'

const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ formId: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { formId } = await params
  const sp = await searchParams

  const { data: form } = await supabase
    .from('forms')
    .select('*, campaigns(*)')
    .eq('id', formId)
    .single()

  if (!form) notFound()

  return (
    <PublicForm
      form={form}
      campaign={form.campaigns}
      trackingParams={{
        utm_source: sp.utm_source || form.campaigns?.source || '',
        utm_medium: sp.utm_medium || '',
        utm_campaign: sp.utm_campaign || '',
        ttclid: sp.ttclid || '',
        fbclid: sp.fbclid || '',
      }}
    />
  )
}
