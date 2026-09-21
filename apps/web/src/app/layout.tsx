import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Automation Monitor',
  description: 'Track automation runs, investigate failures, and keep workflows reliable.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
