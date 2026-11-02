/** The one signature mark: a thin gold seal ring. Used only for the app mark and the ticket icon. */
export function SealRing({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" aria-hidden="true">
      {/* Strokes keep their pixel width, so the ring stays thin at any size. */}
      <path d="M12 2.75A9.25 9.25 0 1 1 8.4 3.5" strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx="12" cy="12" r="5.5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
