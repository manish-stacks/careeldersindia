export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#C8352E" />
        <path d="M16 24.5s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 16 11.6a4.3 4.3 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z" fill="#fff" />
      </svg>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[17px] font-bold">ParentCare</span>
          <span className="block text-xs text-ink-muted">Care operations</span>
        </span>
      )}
    </span>
  );
}
