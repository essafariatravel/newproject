/**
 * Brand mark. When a custom logo has been uploaded (src provided) it renders
 * the image; otherwise the built-in soft gradient monogram.
 */
export default function BrandMark({
  className = "h-9 w-9",
  src,
  alt = "Logo",
}: {
  className?: string;
  src?: string | null;
  alt?: string;
}) {
  if (src) {
    return <img src={src} alt={alt} className={`${className} rounded-[30%] object-contain`} />;
  }
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx="20" cy="20" r="17" fill="none" stroke="var(--color-gold-500, #C99A32)" strokeWidth="1.6" />
      <ellipse cx="20" cy="20" rx="7.5" ry="17" fill="none" stroke="var(--color-gold-500, #C99A32)" strokeWidth="1.2" />
      <path d="M3 20h34M7 11.5h26M7 28.5h26" fill="none" stroke="var(--color-gold-500, #C99A32)" strokeWidth="1.2" />
    </svg>
  );
}
