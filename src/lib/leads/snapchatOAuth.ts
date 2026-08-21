import { adminSupabase } from '@/lib/supabase/admin'
import type { AdConnection } from '@/lib/types'

// ── Snapchat Marketing API OAuth (access tokens expire after 60 minutes) ──
//
// Confirmed against developers.snap.com/api/marketing-api/Ads-API/
// authentication (2026-08-21): access_token is valid for 3600 seconds; a
// long-lived refresh_token (obtained once via the authorize/callback flow
// below) is used to silently mint new ones going forward. A tenant's own
// OAuth App (snap_client_id/snap_client_secret) is created once in Snapchat
// Business Manager (Business Details → Organization Admin required).
//
// Every other place in the codebase that needs to call Snapchat's API on
// this connection's behalf (registerSnapchatWebhook, syncEvent.ts) must go
// through getValidSnapchatAccessToken() — never read connection.access_token
// directly, since it may already be expired.

const TOKEN_URL = 'https://accounts.snapchat.com/login/oauth2/access_token'
const AUTHORIZE_URL = 'https://accounts.snapchat.com/login/oauth2/authorize'
// Refresh a bit before the real 60-minute expiry lands, so a slow request
// never straddles the boundary and gets a 401 mid-flight.
const REFRESH_BUFFER_MS = 5 * 60 * 1000

export function buildSnapchatAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'snapchat-marketing-api',
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

interface SnapchatTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

async function requestSnapchatToken(body: Record<string, string>): Promise<SnapchatTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const json = (await res.json().catch(() => null)) as SnapchatTokenResponse | null
  if (!res.ok || !json?.access_token) {
    throw new Error(json?.error_description || json?.error || 'فشل التواصل مع سناب شات للحصول على التوكن')
  }
  return json
}

// Step 4 of the OAuth web flow — exchanges the one-time `code` (from the
// callback route) for the first access_token + refresh_token pair.
export async function exchangeSnapchatCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<SnapchatTokenResponse> {
  return requestSnapchatToken({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  })
}

// Uses the stored refresh_token to mint a new access_token, persists both
// (Snapchat sometimes rotates the refresh_token too) and the new expiry
// back onto the connection row, and returns the fresh access_token.
export async function refreshSnapchatAccessToken(connection: AdConnection): Promise<string> {
  if (!connection.snap_client_id || !connection.snap_client_secret || !connection.snap_refresh_token) {
    throw new Error('حساب سناب شات غير مربوط بعد — اضغط "ربط الحساب مع سناب شات" أولاً')
  }

  const tokens = await requestSnapchatToken({
    grant_type: 'refresh_token',
    refresh_token: connection.snap_refresh_token,
    client_id: connection.snap_client_id,
    client_secret: connection.snap_client_secret,
  })

  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString()
  await adminSupabase()
    .from('ad_connections')
    .update({
      access_token: tokens.access_token,
      snap_refresh_token: tokens.refresh_token || connection.snap_refresh_token,
      snap_token_expires_at: expiresAt,
    })
    .eq('id', connection.id)

  return tokens.access_token
}

// The one function every caller should use. Returns the connection's
// current access_token as-is if it still has enough life left, otherwise
// refreshes first — so callers never have to think about expiry themselves.
export async function getValidSnapchatAccessToken(connection: AdConnection): Promise<string> {
  const expiresAtMs = connection.snap_token_expires_at ? new Date(connection.snap_token_expires_at).getTime() : 0
  const stillValid = !!connection.access_token && expiresAtMs - Date.now() > REFRESH_BUFFER_MS
  if (stillValid) return connection.access_token
  return refreshSnapchatAccessToken(connection)
}
