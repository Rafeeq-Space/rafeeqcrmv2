import { createClient as createServerClient } from '@supabase/supabase-js'
import PublicForm from '@/components/PublicForm'
import HtmlFormView from '@/components/HtmlFormView'
import { notFound } from 'next/navigation'

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ formId: string }>
  searchParams: Promise<Record<string, string>>
}) {
  // Read with the service role (server-side only) so the public page bypasses
  // the tenant RLS on `forms`. Only safe campaign fields are selected — never
  // the pixel access tokens, which must not reach the browser.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { formId } = await params
  const sp = await searchParams

  const { data: form } = await supabase
    .from('forms')
    .select('*, campaigns(id, name, source)')
    .eq('id', formId)
    .single()

  if (!form) notFound()

  const trackingParams = {
    utm_source: sp.utm_source || form.campaigns?.source || '',
    utm_medium: sp.utm_medium || '',
    utm_campaign: sp.utm_campaign || '',
    ttclid: sp.ttclid || '',
    fbclid: sp.fbclid || '',
  }

  // HTML-based forms are rendered inside a sandboxed iframe that captures leads.
  if (form.html) {
    return <HtmlFormView form={form} campaign={form.campaigns} trackingParams={trackingParams} />
  }

  return (
    <PublicForm
      form={form}
      campaign={form.campaigns}
      trackingParams={trackingParams}
    />
  )
}
