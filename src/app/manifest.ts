import type { MetadataRoute } from 'next'

// Auto-detected by Next.js and linked as /manifest.webmanifest — this is what
// lets a user "Add to Home Screen" and get a real app-like icon instead of a
// generic browser-tab shortcut. start_url is relative ("/") so the installed
// icon on any tenant's subdomain launches back into that same subdomain,
// rather than a fixed hostname shared across every tenant.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'رفيق CRM',
    short_name: 'رفيق CRM',
    description: 'منصة CRM لإدارة العملاء المحتملين والحملات الإعلانية',
    start_url: '/',
    display: 'standalone',
    background_color: '#080809',
    theme_color: '#080809',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
