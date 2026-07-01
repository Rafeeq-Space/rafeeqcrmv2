'use client'

import type { LandingPage, Form, Campaign } from '@/lib/types'
import { BlockView } from './LandingBlocks'

interface Props {
  page: LandingPage
  form?: Form | null
  campaign?: Campaign | null
}

export default function LandingPageView({ page, form, campaign }: Props) {
  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {page.blocks.map(block => (
          <div key={block.id}>
            <BlockView block={block} form={form} campaign={campaign} />
          </div>
        ))}
        {page.blocks.length === 0 && (
          <div className="text-center text-muted2 py-20">هذه الصفحة فارغة.</div>
        )}
      </div>
    </div>
  )
}
