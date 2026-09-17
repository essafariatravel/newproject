/**
 * ESSAFARIA brand mark — soft gradient squircle with a white monogram and a
 * champagne accent dot. Pure SVG, no raster assets.
 */
export default function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <defs>
        <linearGradient id="ess-mark-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8290E6" />
          <stop offset="1" stopColor="#4A5BD0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="13" fill="url(#ess-mark-g)" />
      <rect x="1" y="1" width="38" height="38" rx="13" fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1" />
      <path
        d="M12 13.2h16v3.3H16.6v2.9h9.8v3.3h-9.8v2.9H28v3.3H12z"
        fill="#ffffff"
        fillOpacity="0.96"
      />
      <circle cx="31.5" cy="8.5" r="2.6" fill="#CBB287" />
    </svg>
  );
}
