'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AdConnection, Campaign, Form, TeamWithMembers } from '@/lib/types'
import FormBuilder from '../FormBuilder'
import HtmlFormBuilder from '../HtmlFormBuilder'
import GoogleSheetForm, { SheetConnectionInfo } from '../GoogleSheetForm'
import ChooseFormMethodModal from './ChooseFormMethodModal'
import EditCampaignModal from './EditCampaignModal'
import CampaignDetailContent from './CampaignDetailContent'

interface Props {
  campaign: Campaign
  initialForms: Form[]
  isAdmin: boolean
  tenantId: string
  teams: TeamWithMembers[]
  adConnections: AdConnection[]
  initialConnectionIds: string[]
}

type FormFlow = { mode: 'choose' | 'advanced' | 'html' | 'sheet' }

// The interactive shell around CampaignDetailContent — mirrors what
// CampaignsList used to manage for its (now removed) detail popup, just
// scoped to the one campaign this page was loaded for.
export default function CampaignDetailPageClient({
  campaign: initialCampaign, initialForms, isAdmin, tenantId, teams, adConnections, initialConnectionIds,
}: Props) {
  const router = useRouter()
  const [campaign, setCampaign] = useState(initialCampaign)
  const [forms, setForms] = useState(initialForms)
  const [copied, setCopied] = useState<string | null>(null)
  const [formFlow, setFormFlow] = useState<FormFlow | null>(null)
  const [sheetInfoForm, setSheetInfoForm] = useState<Form | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'
  const getFormLink = (formId: string) => `https://${rootDomain}/f/${formId}`

  async function copyLink(formId: string) {
    await navigator.clipboard.writeText(getFormLink(formId))
    setCopied(formId)
    setTimeout(() => setCopied(null), 2000)
  }

  function onFormCreated(form: Form) {
    setForms(prev => [form, ...prev])
    setFormFlow(null)
  }

  async function deleteForm(formId: string) {
    if (!confirm('حذف هذا النموذج نهائياً؟ لن يعمل رابطه بعد الحذف.')) return
    const supabase = createClient()
    const { error } = await supabase.from('forms').delete().eq('id', formId)
    if (error) { alert(`تعذّر حذف النموذج: ${error.message}`); return }
    setForms(prev => prev.filter(f => f.id !== formId))
  }

  return (
    <>
      <CampaignDetailContent
        campaign={campaign}
        forms={forms}
        isAdmin={isAdmin}
        getFormLink={getFormLink}
        copied={copied}
        onCopyLink={copyLink}
        onCreateForm={() => setFormFlow({ mode: 'choose' })}
        onDeleteForm={deleteForm}
        onViewSheet={setSheetInfoForm}
        onEdit={() => setEditOpen(true)}
      />

      {editOpen && isAdmin && (
        <EditCampaignModal
          campaign={campaign}
          teams={teams}
          adConnections={adConnections}
          initialConnectionIds={initialConnectionIds}
          onClose={() => setEditOpen(false)}
          onUpdated={c => { setCampaign(c); setEditOpen(false); router.refresh() }}
        />
      )}

      {formFlow && isAdmin && formFlow.mode === 'choose' && (
        <ChooseFormMethodModal
          onAdvanced={() => setFormFlow({ mode: 'advanced' })}
          onHtml={() => setFormFlow({ mode: 'html' })}
          onSheet={() => setFormFlow({ mode: 'sheet' })}
          onClose={() => setFormFlow(null)}
        />
      )}

      {formFlow && isAdmin && formFlow.mode === 'advanced' && (
        <FormBuilder
          campaignId={campaign.id}
          tenantId={tenantId}
          campaignTeams={teams.filter(t => (campaign.team_ids || []).includes(t.id))}
          onBack={() => setFormFlow({ mode: 'choose' })}
          onClose={() => setFormFlow(null)}
          onCreated={onFormCreated}
        />
      )}

      {formFlow && isAdmin && formFlow.mode === 'html' && (
        <HtmlFormBuilder
          campaignId={campaign.id}
          tenantId={tenantId}
          campaignTeams={teams.filter(t => (campaign.team_ids || []).includes(t.id))}
          onBack={() => setFormFlow({ mode: 'choose' })}
          onClose={() => setFormFlow(null)}
          onCreated={onFormCreated}
        />
      )}

      {formFlow && isAdmin && formFlow.mode === 'sheet' && (
        <GoogleSheetForm
          campaignId={campaign.id}
          tenantId={tenantId}
          campaignTeams={teams.filter(t => (campaign.team_ids || []).includes(t.id))}
          onBack={() => setFormFlow({ mode: 'choose' })}
          onClose={() => setFormFlow(null)}
          onCreated={form => { onFormCreated(form); setSheetInfoForm(form) }}
        />
      )}

      {sheetInfoForm && (
        <SheetConnectionInfo form={sheetInfoForm} onClose={() => setSheetInfoForm(null)} />
      )}
    </>
  )
}
