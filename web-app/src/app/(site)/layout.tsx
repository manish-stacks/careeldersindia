import { SiteHeader, SiteFooter } from '@/components/site/chrome';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site flex min-h-screen flex-col bg-paper">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
