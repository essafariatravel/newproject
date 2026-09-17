export default function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx="20" cy="20" r="19" className="fill-navy-900" />
      <path d="M12 12h16v4.2H17v3.4h9.6v4H17v3.4h11V31H12z" className="fill-gold-400" />
      <circle cx="20" cy="20" r="18.2" fill="none" stroke="#c9a961" strokeOpacity="0.5" strokeWidth="1" />
    </svg>
  );
}
