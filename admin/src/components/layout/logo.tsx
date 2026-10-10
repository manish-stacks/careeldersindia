/* eslint-disable @next/next/no-img-element */
export function Logo({ compact }: { compact?: boolean }) {
  return compact ? (
    <img src="/logo-mark.png" alt="Care Elders India" className="h-9 w-auto" />
  ) : (
    <span className="inline-flex items-center gap-2.5">
      <img src="/logo-mark.png" alt="" className="h-10 w-auto" />
      <span className="leading-tight">
        <span className="block text-[17px] font-bold text-brand">Care Elders India</span>
        <span className="block text-xs text-ink-muted">Care operations</span>
      </span>
    </span>
  );
}
