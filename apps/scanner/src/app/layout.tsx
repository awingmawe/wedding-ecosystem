import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';
import { PWAProvider } from '@/components/pwa-provider';
import { WebSocketProvider } from '@/components/websocket-provider';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Wedding Scanner',
  description: 'QR Code Scanner untuk verifikasi kehadiran tamu',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Wedding Scanner',
  },
};

export const viewport: Viewport = {
  themeColor: '#2d3436',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={poppins.variable}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className="font-body antialiased">
        <AuthProvider>
          <PWAProvider>
            <WebSocketProvider>{children}</WebSocketProvider>
          </PWAProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
