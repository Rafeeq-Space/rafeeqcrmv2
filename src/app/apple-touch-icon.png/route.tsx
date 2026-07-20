import { ImageResponse } from 'next/og'
import { PwaIconMark, PWA_ICON_BG } from '@/lib/pwaIcon'

// Served at /apple-touch-icon.png, referenced explicitly via metadata.icons.apple
// in layout.tsx — NOT via Next's apple-icon.tsx file convention, whose fixed
// output path ("/apple-icon", no extension) collides with proxy.ts's naive
// `pathname.startsWith('/app')` check (it matches "/apple-icon" too) and gets
// redirected to /login. A path ending in .png both satisfies the middleware
// matcher's static-asset exclusion and sidesteps the prefix collision.
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: PWA_ICON_BG,
        }}
      >
        <PwaIconMark height={120} />
      </div>
    ),
    { width: 180, height: 180 }
  )
}
