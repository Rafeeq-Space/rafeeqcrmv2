export type TenantStatus = 'active' | 'inactive'
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'ended'
export type CampaignSource = 'tiktok' | 'facebook' | 'instagram' | 'google' | 'other'
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

export interface Campaign {
  id: string
  tenant_id: string
  name: string
  source: CampaignSource
  status: CampaignStatus
  tiktok_pixel_id?: string
  tiktok_access_token?: string
  meta_pixel_id?: string
  meta_access_token?: string
  created_at: string
}

export interface FormField {
  id: string
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox'
  label: string
  placeholder?: string
  required: boolean
  options?: string[] // for select fields
}

export interface Form {
  id: string
  tenant_id: string
  campaign_id: string
  name: string
  fields: FormField[]
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
  assigned_to?: string
  notes?: string
  created_at: string
  updated_at: string
  campaigns?: Campaign
  forms?: Form
  employees?: Employee
}
