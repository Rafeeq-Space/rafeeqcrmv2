import type { SupabaseClient } from '@supabase/supabase-js'

// ── Two-factor (TOTP) helpers ─────────────────────────────────────────────────
//
// We use Supabase's built-in MFA (TOTP / authenticator apps like Google
// Authenticator). Enforcement is our own: every user — including super_admin
// — must reach assurance level aal2 (i.e. have entered a valid TOTP code this
// session) before reaching their dashboard.
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

// Deletes every MFA (TOTP) factor for a user, forcing re-enrollment (a fresh
// QR/key) on their next login. Used whenever an admin resets someone else's
// password — a stale authenticator factor shouldn't survive a credential
// reset. `adminClient` must be the service-role client (auth.admin.mfa.* is
// not available to a regular user session).
export async function clearMfaFactors(adminClient: SupabaseClient, userId: string): Promise<string | null> {
  const { data: list, error: listErr } = await adminClient.auth.admin.mfa.listFactors({ userId })
  if (listErr) return listErr.message
  for (const factor of list?.factors || []) {
    const { error: delErr } = await adminClient.auth.admin.mfa.deleteFactor({ id: factor.id, userId })
    if (delErr) return delErr.message
  }
  return null
}

