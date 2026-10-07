import type { Metadata, Viewport } from 'next';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = { title: { default: 'ParentCare Admin', template: '%s · ParentCare Admin' }, description: 'Operations console for ParentCare home health visits', robots: { index: false } };
export const viewport: Viewport = { themeColor: '#C8352E' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
