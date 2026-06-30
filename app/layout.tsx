import type { Metadata, Viewport } from 'next'
import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ledge-phi.vercel.app'
const OG_TITLE = 'Ledge — Social Prediction Market'
const OG_DESCRIPTION = 'Stop arguing with no record to back it up. Bet on sports, politics & culture with free virtual credits. Track your accuracy, build your streak, beat your friends.'

export const metadata: Metadata = {
  title: OG_TITLE,
  description: OG_DESCRIPTION,
  metadataBase: new URL(BASE_URL),
  verification: {
    google: 'oHDLFKp_3yALe6CKBstR8otJABidGi0XGsDLKeYRNMM',
  },
  openGraph: {
    type: 'website',
    url: `${BASE_URL}/landing`,
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    siteName: 'Ledge',
  },
  twitter: {
    card: 'summary_large_image',
    title: OG_TITLE,
    description: OG_DESCRIPTION,
  },
  icons: {
    icon: [
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/icon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#0A0A0B',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${hankenGrotesk.variable} ${jetbrainsMono.variable} bg-background`}>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
