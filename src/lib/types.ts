export type TenantStatus = 'active' | 'inactive'
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'ended'
export type CampaignSource = 'tiktok' | 'facebook' | 'instagram' | 'google' | 'website' | 'other'
export type KnowledgeCategory = 'faq' | 'product' | 'service' | 'general'

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
  created_at: string
}

export interface Team {
  id: string
  tenant_id: string
  name: string
  description?: string
  manager_id?: string
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
  assigned_to?: string // legacy: employee id (kept for backward-compat)
  assigned_sales_id?: string // profile id of the sales rep
  assigned_team_id?: string // team id
  attachments?: KnowledgeFile[] // images/files uploaded to this lead
  notes?: string
  sheet_row?: number // row number in the connected Google Sheet (google_sheet leads only)
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
