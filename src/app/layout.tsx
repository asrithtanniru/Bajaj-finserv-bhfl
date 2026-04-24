import type { Metadata } from 'next'
import './globals.css'
import { Rethink_Sans } from 'next/font/google'
import { cn } from '@/lib/utils'

const rethinkSans = Rethink_Sans({
  subsets: ['latin'],
  variable: '--font-rethink-sans',
})

export const metadata: Metadata = {
  title: 'Bajaj Finserv BFHL Challenge - Asrith Tanniru',
  description: 'Bajaj Finserv full stack submission',
  authors: [{ name: 'Asrith Tanniru', url: 'https://asrithtanniru.dev' }],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(rethinkSans.variable, 'font-sans')}>
      <body className="antialiased">{children}</body>
    </html>
  )
}
