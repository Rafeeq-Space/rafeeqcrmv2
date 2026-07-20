import type { Metadata, Viewport } from 'next'
import { Tajawal } from 'next/font/google'
import './globals.css'

const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-arabic',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'رفيق CRM — إدارة العملاء المحتملين',
  description: 'منصة CRM لإدارة العملاء المحتملين والحملات الإعلانية',
  // iOS Safari doesn't fully honor the web app manifest — it needs these
  // specifically for "Add to Home Screen" to open standalone (no browser
  // chrome) with the right title, instead of just bookmarking the page.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'رفيق CRM',
  },
  // Declared explicitly (not via the apple-icon.tsx file convention) — that
  // convention's fixed output path ("/apple-icon") collides with proxy.ts's
  // `pathname.startsWith('/app')` check and gets redirected to /login.
  icons: {
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#080809',
}

// Applies the saved theme before paint to avoid a flash. Dark is the default.
const themeScript = `
(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.add('light');}}catch(e){}})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={tajawal.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  )
}
