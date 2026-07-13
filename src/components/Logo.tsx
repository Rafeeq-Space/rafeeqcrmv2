interface LogoProps {
  className?: string
  style?: React.CSSProperties
}

// Rafeeq CRM brand mark. Uses currentColor so it adapts to the surrounding
// text/brand color on any background (light or dark). Size it via height.
export default function Logo({ className, style }: LogoProps) {
  return (
    <svg
      viewBox="0 0 113.62 227.23"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      role="img"
      aria-label="رفيق CRM"
      className={className}
      style={style}
    >
      <path d="M113.62,56.81v56.81c-15.06,0-29.52-5.99-40.17-16.64-10.65-10.65-16.64-25.11-16.64-40.17h56.81Z" />
      <path d="M0,170.42v-56.81c15.06,0,29.52,5.99,40.17,16.64s16.64,25.11,16.64,40.17H0Z" />
      <path d="M113.62,170.42h-56.81c0-15.06,5.99-29.52,16.64-40.17,10.65-10.65,25.11-16.64,40.17-16.64v56.81Z" />
      <path d="M56.81,170.42h56.81c0,15.06-5.99,29.52-16.64,40.17-10.65,10.65-25.11,16.64-40.17,16.64v-56.81Z" />
      <path d="M0,56.81h56.81c0,15.06-5.99,29.52-16.64,40.17-10.65,10.65-25.11,16.64-40.17,16.64v-56.81Z" />
      <rect width="113.62" height="42.61" />
    </svg>
  )
}
