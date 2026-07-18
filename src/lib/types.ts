export type TenantStatus = 'active' | 'inactive'
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'ended'
export type CampaignSource = 'tiktok' | 'facebook' | 'instagram' | 'snapchat' | 'google' | 'website' | 'other'
export type KnowledgeCategory = 'faq' | 'product' | 'service' | 'general'

// A saved, reusable ad-platform account (pixel + access token) that a tenant
// creates once and links to any number of campaigns — see `ad_connections`
// and the `campaign_ad_connections` join table.
export type AdPlatform = 'tiktok' | 'facebook' | 'snapchat'

export interface AdConnection {
  id: string
  tenant_id: string
  platform: AdPlatform
  name: string
  pixel_id: string
  access_token: string
  // Native Instant/Lead-form webhook import (see ad_lead_webhook_events).
  // webhook_secret builds this connection's own secret webhook URL (tiktok,
  // snapchat); default_campaign_id is which CRM campaign new leads from this
  // account attach to.
  webhook_secret?: string
  default_campaign_id?: string | null
  page_id?: string | null // facebook: Page ID that owns the lead form(s)
  form_id?: string | null // snapchat: the specific Lead Generation form
  snap_integration_id?: string | null
  snap_hmac_secret?: string | null
  // tiktok: optional test-events code from TikTok Events Manager. When set,
  // conversion events are sent to the pixel's "Test events" tab (live) instead
  // of the real event stream — used to verify the integration during setup.
  tiktok_test_event_code?: string | null
  // facebook: optional test-events code from Meta Events Manager. When set,
  // conversion events are routed to the pixel's "Test events" tab (live) instead
  // of the real event stream — used to verify the integration during setup.
  meta_test_event_code?: string | null
  created_at: string
}

export interface KnowledgeCategoryDynamic {
  id: string
  tenant_id: string
  name: string
  created_at: string
}

export interface KnowledgeSection {
  id: string
  tenant_id: string
  category_id: string
  name: string
  created_at: string
}

export interface KnowledgeFile {
  name: string
  url: string
  size?: number
  type?: string
}

export interface KnowledgeLink {
  label: string
  url: string
}

export interface Tenant {
  id: string
  name: string
  subdomain: string
  email: string
  logo_url?: string
  created_at: string
  // false while the client is invited but hasn't set their password yet.
  activated?: boolean
  // random token that gates this tenant's Bevatel webhook URLs.
  bevatel_webhook_secret?: string | null
  // Bevatel (Chatwoot) API credentials, for pushing status labels back.
  bevatel_api_token?: string | null
  bevatel_api_host?: string | null
  bevatel_account_id?: string | null
}

export type UserRole = 'super_admin' | 'client_admin' | 'client_sales_manager' | 'client_user'

export interface Profile {
  id: string
  tenant_id: string | null
  full_name: string
  role: UserRole
  phone?: string
  job_title?: string
  team_id?: string
  suspended?: boolean
  avatar_url?: string
  // Monthly sales target (number of leads to convert to "sold" per calendar month).
  monthly_target?: number | null
  created_at: string
}

export interface Team {
  id: string
  tenant_id: string
  name: string
  description?: string
  manager_id?: string
  // Monthly sales target for the whole team.
  monthly_target?: number | null
  created_at: string
}

// A tenant member (profile) as shown in the team management page.
export interface TeamMember {
  id: string
  tenant_id: string | null
  full_name: string
  role: UserRole
  phone?: string
  job_title?: string
  team_id?: string
  suspended?: boolean
  avatar_url?: string
  // Agent identifier in Bevatel (email/name as shown there) — used to assign
  // Bevatel chat/call leads to this employee.
  bevatel_agent_id?: string | null
  // Monthly sales target (number of leads to convert to "sold" per calendar month).
  monthly_target?: number | null
  created_at: string
}

export interface Employee {
  id: string
  tenant_id: string
  team_id?: string
  full_name: string
  email?: string
  phone?: string
  role?: string
  created_at: string
}

export interface KnowledgeItem {
  id: string
  tenant_id: string
  category: KnowledgeCategory
  category_id?: string
  section_id?: string
  title: string
  description?: string
  content: string
  files?: KnowledgeFile[]
  links?: KnowledgeLink[]
  images?: string[]
  created_at: string
}

// A team plus its members — used for campaign team selection and lead distribution.
export interface TeamWithMembers {
  id: string
  name: string
  members: { id: string; name: string }[]
}

export interface Campaign {
  id: string
  tenant_id: string
  name: string
  description?: string
  source: CampaignSource // primary platform (first selected) — kept for compatibility
  sources?: CampaignSource[] // all selected platforms
  status: CampaignStatus
  tags?: string[]
  links?: KnowledgeLink[]
  files?: KnowledgeFile[]
  images?: string[]
  campaign_date?: string
  team_ids?: string[] // teams working on this campaign (chosen at creation)
  tiktok_pixel_id?: string
  tiktok_access_token?: string
  meta_pixel_id?: string
  meta_access_token?: string
  created_at: string
}

// A reusable form template — either a set of structured fields
// or a raw HTML form (rendered sandboxed, captures leads via [name] inputs).
export type TemplateKind = 'fields' | 'html'

export interface Template {
  id: string
  tenant_id: string
  name: string
  description?: string
  kind: TemplateKind
  fields?: FormField[]
  html?: string
  created_by?: string
  created_at: string
}

export type FormFieldType =
  | 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox'
  | 'number' | 'date' | 'time' | 'radio' | 'checkboxes' | 'file' | 'rating' | 'heading'

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  placeholder?: string
  required: boolean
  options?: string[] // for select / radio / checkboxes
  description?: string // helper text shown under the label
  defaultValue?: string
  width?: 'full' | 'half' // layout width in the rendered form
}

// Visual customization for a form's public page.
export interface FormDesign {
  bgType?: 'color' | 'gradient' | 'image'
  bgColor?: string
  bgGradient?: string
  bgImage?: string
  cardColor?: string
  textColor?: string
  primaryColor?: string
  buttonTextColor?: string
  fontFamily?: string
  radius?: number
  width?: 'narrow' | 'medium' | 'wide'
  logo?: string
  cover?: string
  submitText?: string
  successMessage?: string
}

export interface Form {
  id: string
  tenant_id: string
  campaign_id: string
  name: string
  fields: FormField[]
  design?: FormDesign
  html?: string // when set, form is rendered from raw HTML (sandboxed) instead of `fields`
  assignee_ids?: string[] // ordered pool of profile ids for round-robin lead distribution
  rr_index?: number // rotating counter — index of the next assignee
  source_type?: 'builder' | 'html' | 'google_sheet' // how leads reach this "form"
  sheet_url?: string // reference link to the connected Google Sheet (google_sheet only)
  sheet_webhook_secret?: string // shared secret the Apps Script sends to authenticate (google_sheet only)
  sheet_writeback_url?: string // Apps Script Web App URL used to push status changes back into the sheet
  published_at?: string
  created_at: string
}

export interface Lead {
  id: string
  tenant_id: string
  campaign_id?: string
  form_id?: string
  data: Record<string, string>
  source?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  ttclid?: string
  fbclid?: string
  status: LeadStatus
  sub_status?: string | null // detailed stage key (rolls up to status); see subStatus.ts
  assigned_to?: string // legacy: employee id (kept for backward-compat)
  assigned_sales_id?: string // profile id of the sales rep
  assigned_team_id?: string // team id
  attachments?: KnowledgeFile[] // images/files uploaded to this lead
  notes?: string
  sheet_row?: number // row number in the connected Google Sheet (google_sheet leads only)
  bevatel_conversation_id?: string | null // Bevatel/Chatwoot conversation id, for label sync
  bevatel_contact_id?: string | null // Bevatel/Chatwoot contact id, for status-attribute sync
  created_at: string
  updated_at: string
  campaigns?: Campaign
  forms?: Form
  employees?: Employee
  // joined helpers
  assigned_sales?: { id: string; full_name: string } | null
  assigned_team?: { id: string; name: string; manager_id?: string } | null
  shares?: LeadShare[]
}

export type LeadActivityType = 'created' | 'status_change' | 'call' | 'comment' | 'assignment' | 'share'

export interface LeadActivity {
  id: string
  tenant_id: string
  lead_id: string
  actor_id?: string | null
  type: LeadActivityType
  from_status?: string | null
  to_status?: string | null
  call_result?: 'answered' | 'no_answer' | null
  body?: string | null
  mentioned_id?: string | null
  created_at: string
  // joined helpers
  actor?: { id: string; full_name: string } | null
  mentioned?: { id: string; full_name: string } | null
}

export interface LeadShare {
  id: string
  tenant_id: string
  lead_id: string
  profile_id: string
  created_at: string
  profile?: { id: string; full_name: string } | null
}
