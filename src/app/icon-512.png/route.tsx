import { ImageResponse } from 'next/og'
import { PwaIconMark, PWA_ICON_BG } from '@/lib/pwaIcon'

// Served at /icon-512.png — referenced by manifest.ts's icons array (the
// 512×512 "maskable" size Android's install prompt uses).
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
        <PwaIconMark height={340} />
      </div>
    ),
    { width: 512, height: 512 }
  )
}
