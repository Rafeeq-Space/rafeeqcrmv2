// Single place that reads environment variables, instead of scattering
// `process.env.X!` across dozens of files. Required vars throw a clear error
// immediately if missing (instead of a cryptic failure deep inside a
// Supabase call); optional vars keep their existing fallback values.
function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const env = {
  get NEXT_PUBLIC_SUPABASE_URL() { return required('NEXT_PUBLIC_SUPABASE_URL') },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY() { return required('NEXT_PUBLIC_SUPABASE_ANON_KEY') },
  get SUPABASE_SERVICE_ROLE_KEY() { return required('SUPABASE_SERVICE_ROLE_KEY') },
  get NEXT_PUBLIC_ROOT_DOMAIN() { return process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com' },
  get NEXT_PUBLIC_SITE_URL() { return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000' },
}
