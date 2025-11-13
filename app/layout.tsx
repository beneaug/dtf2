import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DTF2 - Thermal Sunrise',
  description: 'Build something thermal',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
