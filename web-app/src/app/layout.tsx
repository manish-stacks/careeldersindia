import type { Metadata, Viewport } from 'next';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  metadataBase: new URL('https://careeldersindia.com'),
  title: { default: 'Care Elders India | Home health visits for your parents in India', template: '%s | Care Elders India' },
  description: 'Trained care assistants visit your parents at home in India, check vitals and send you a clear health report. Built for families living abroad.',
};
export const viewport: Viewport = { themeColor: '#0E5A8A' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
