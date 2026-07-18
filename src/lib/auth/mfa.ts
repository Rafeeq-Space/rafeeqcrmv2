import type { SupabaseClient } from '@supabase/supabase-js'

// ── Two-factor (TOTP) helpers ─────────────────────────────────────────────────
//
// We use Supabase's built-in MFA (TOTP / authenticator apps like Google
// Authenticator). Enforcement is our own: every tenant user must reach
// assurance level aal2 (i.e. have entered a valid TOTP code this session).
// super_admin (the SaaS owner) is exempt.
//
// The layout guards only need the CURRENT assurance level from the session
// token — if it isn't aal2 we send the user to /two-factor, which itself
// decides whether they still need to enrol or just enter a code.

// Read the `aal` claim ('aal1' | 'aal2') from the current access token.
export async function getCurrentAal(supabase: SupabaseClient): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return null
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    return typeof payload.aal === 'string' ? payload.aal : null
  } catch {
    return null
  }
}

// Whether a role is required to pass two-factor. Only the SaaS super admin is
// exempt; all tenant users (admin / manager / sales) must complete it.
export function roleRequiresMfa(role: string | null | undefined): boolean {
  return role !== 'super_admin'
}
