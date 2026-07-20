// Shared mark used by the generated PWA icon routes (apple-icon.tsx,
// icon-192.png, icon-512.png) — same glyph/color as the existing favicon
// (src/app/icon.svg), just re-rendered at whatever size each route needs via
// next/og's ImageResponse (which needs a fresh JSX tree per request, not a
// static asset reference).
export function PwaIconMark({ height }: { height: number }) {
  const width = height / 2
  return (
    <svg width={width} height={height} viewBox="0 0 113.62 227.23" xmlns="http://www.w3.org/2000/svg">
      <g fill="#9dff2f">
        <path d="M113.62,56.81v56.81c-15.06,0-29.52-5.99-40.17-16.64-10.65-10.65-16.64-25.11-16.64-40.17h56.81Z" />
        <path d="M0,170.42v-56.81c15.06,0,29.52,5.99,40.17,16.64s16.64,25.11,16.64,40.17H0Z" />
        <path d="M113.62,170.42h-56.81c0-15.06,5.99-29.52,16.64-40.17,10.65-10.65,25.11-16.64,40.17-16.64v56.81Z" />
        <path d="M56.81,170.42h56.81c0,15.06-5.99,29.52-16.64,40.17-10.65,10.65-25.11,16.64-40.17,16.64v-56.81Z" />
        <path d="M0,56.81h56.81c0,15.06-5.99,29.52-16.64,40.17-10.65,10.65-25.11,16.64-40.17,16.64v-56.81Z" />
        <rect width="113.62" height="42.61" />
      </g>
    </svg>
  )
}

// Brand dark background the mark sits on for a home-screen icon — matches
// --background in globals.css' dark theme.
export const PWA_ICON_BG = '#080809'
