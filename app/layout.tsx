import type { Metadata, Viewport } from 'next'
import { Inter, Poppins } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'
import InstallInstructions from '@/components/InstallInstructions'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const poppins = Poppins({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-poppins',
})

export const metadata: Metadata = {
  title: "SANGA - Connecting Africa's Wealth",
  description:
    'The unified financial network connecting African SACCOs and their members',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SANGA',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: [
      { url: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
}

// Next 14+ requires viewport/themeColor to live in a separate export.
// We deliberately do NOT set maximumScale/userScalable — blocking pinch-zoom
// is a WCAG 2.1 SC 1.4.4 violation and particularly bad for a finance app
// where users need to verify numbers.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1A2A4F',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-152x152.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body
        className={`${inter.variable} ${poppins.variable} font-sans min-h-screen bg-gray-50`}
      >
        {children}
        <ServiceWorkerRegistration />
        <PWAInstallPrompt />
        <InstallInstructions />
        <Toaster position="top-center" richColors />
      </body>
    </html>
  )
}
