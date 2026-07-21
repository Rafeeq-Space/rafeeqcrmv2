import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  // Redirect to /logininin (the super admin login) on the same host the
  // request came from, so production lands on rafeeqcrm.com (not a
  // hardcoded localhost). NEXT_PUBLIC_SITE_URL still wins if set.
  let base = process.env.NEXT_PUBLIC_SITE_URL
  if (!base) {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000'
    const proto = host.includes('localhost') ? 'http' : 'https'
    base = `${proto}://${host}`
  }
  return NextResponse.redirect(new URL('/logininin', base))
}
