'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CampaignSource, KnowledgeFile, KnowledgeLink } from '@/lib/types'

interface InitialValues {
  sources?: CampaignSource[]
  tags?: string[]
  links?: KnowledgeLink[]
  files?: KnowledgeFile[]
  images?: string[]
  teamIds?: string[]
  connectionIds?: string[]
}

// Everything the "create campaign" and "edit campaign" forms have in common:
// platform + team selection, tags, links, and file/image uploads (including
// the Supabase storage upload logic). Previously this whole block was
// duplicated between AddCampaignModal and EditCampaignModal; now both forms
// share one implementation so they can't silently drift apart.
export function useCampaignForm(uploadScope: string, initial: InitialValues = {}) {
  const [teamIds, setTeamIds] = useState<string[]>(initial.teamIds || [])
  const toggleTeam = (id: string) => setTeamIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])

  const [sources, setSources] = useState<CampaignSource[]>(initial.sources?.length ? initial.sources : ['tiktok'])
  const toggleSource = (v: CampaignSource) => setSources(prev => prev.includes(v) ? prev.filter(s => s !== v) : [...prev, v])
  const isTikTok = sources.includes('tiktok')
  const isMeta = sources.includes('facebook') || sources.includes('instagram')

  // Ad accounts (from the tenant's saved "wallet" of connections) chosen to
  // receive conversion events for this campaign — see ad_connections table.
  const [connectionIds, setConnectionIds] = useState<string[]>(initial.connectionIds || [])
  const toggleConnection = (id: string) => setConnectionIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])

  const [tags, setTags] = useState<string[]>(initial.tags || [])
  const [tagInput, setTagInput] = useState('')
  function addTag() {
    const t = tagInput.trim()
    if (!t || tags.includes(t)) { setTagInput(''); return }
    setTags(prev => [...prev, t])
    setTagInput('')
  }
  function removeTag(i: number) {
    setTags(prev => prev.filter((_, j) => j !== i))
  }

  const [links, setLinks] = useState<KnowledgeLink[]>(initial.links || [])
  const [linkForm, setLinkForm] = useState({ label: '', url: '' })
  function addLink(e: React.FormEvent) {
    e.preventDefault()
    if (!linkForm.url) return
    setLinks(prev => [...prev, { label: linkForm.label || linkForm.url, url: linkForm.url }])
    setLinkForm({ label: '', url: '' })
  }
  function removeLink(i: number) {
    setLinks(prev => prev.filter((_, j) => j !== i))
  }

  const [files, setFiles] = useState<KnowledgeFile[]>(initial.files || [])
  const [images, setImages] = useState<string[]>(initial.images || [])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File, folder: 'files' | 'images'): Promise<string> {
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${uploadScope}/campaigns/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    await supabase.storage.from('knowledge').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('knowledge').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setUploading(true)
    const uploaded: KnowledgeFile[] = await Promise.all(selected.map(async f => ({
      name: f.name,
      url: await uploadFile(f, 'files'),
      size: f.size,
      type: f.type,
    })))
    setFiles(prev => [...prev, ...uploaded])
    setUploading(false)
  }
  function removeFile(i: number) {
    setFiles(prev => prev.filter((_, j) => j !== i))
  }

  async function handleImages(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setUploading(true)
    const urls = await Promise.all(selected.map(f => uploadFile(f, 'images')))
    setImages(prev => [...prev, ...urls])
    setUploading(false)
  }
  function removeImage(i: number) {
    setImages(prev => prev.filter((_, j) => j !== i))
  }

  return {
    teamIds, toggleTeam,
    sources, toggleSource, isTikTok, isMeta,
    connectionIds, toggleConnection,
    tags, tagInput, setTagInput, addTag, removeTag,
    links, linkForm, setLinkForm, addLink, removeLink,
    files, images, uploading, handleFiles, handleImages, removeFile, removeImage,
    fileRef, imageRef,
  }
}

export type CampaignFormState = ReturnType<typeof useCampaignForm>
