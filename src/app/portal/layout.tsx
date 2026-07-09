import type { Metadata, Viewport } from 'next'
import { RegisterSW } from './RegisterSW'

export const metadata: Metadata = {
  title: 'Minha Área — Instituto Torres',
  manifest: '/portal-manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Minha Área',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RegisterSW />
      {children}
    </>
  )
}
