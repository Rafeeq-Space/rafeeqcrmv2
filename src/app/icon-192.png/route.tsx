import { ImageResponse } from 'next/og'
import { PwaIconMark, PWA_ICON_BG } from '@/lib/pwaIcon'

// Served at /icon-192.png — referenced by manifest.ts's icons array (the
// 192×192 size PWA installability checks look for).
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
        <PwaIconMark height={130} />
      </div>
    ),
    { width: 192, height: 192 }
  )
}
