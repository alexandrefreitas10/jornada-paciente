import type { Metadata, Viewport } from 'next'
import { Marcellus, Nunito_Sans } from 'next/font/google'
import { RegisterSW } from './RegisterSW'

// Tipografia do design system do portal
const marcellus = Marcellus({ weight: '400', subsets: ['latin'], variable: '--font-marcellus', display: 'swap' })
const nunito = Nunito_Sans({ weight: ['300', '400', '600', '700', '800'], subsets: ['latin'], variable: '--font-nunito', display: 'swap' })

export const metadata: Metadata = {
  title: 'Instituto - Pacientes',
  manifest: '/portal-manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Instituto - Pacientes',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#FBF6EF',
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${marcellus.variable} ${nunito.variable}`} style={{ fontFamily: 'var(--font-nunito), sans-serif' }}>
      <RegisterSW />
      {children}
    </div>
  )
}
