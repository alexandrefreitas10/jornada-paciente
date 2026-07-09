import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { auth } from '../auth'
import { NavMenu } from '@/components/NavMenu'
import { SessionProviderWrapper } from '@/components/SessionProviderWrapper'
import { RegisterSW } from './portal/RegisterSW'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Instituto Torres',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Equipe Instituto',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <html lang="pt-BR">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>
        <RegisterSW />
        <SessionProviderWrapper>
          {session?.user && (
            <header className="bg-white border-b border-gray-200 px-4 py-2">
              {/* Logo centralizada */}
              <div className="flex justify-center">
                <a href="/">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo-it.png"
                    alt="Instituto Torres"
                    style={{ height: '70px', width: 'auto' }}
                  />
                </a>
              </div>
              <NavMenu
                userName={session.user.name ?? ''}
                isAdmin={!!(session.user as { is_admin?: boolean }).is_admin}
                canEstoque={!!(session.user as { can_estoque?: boolean }).can_estoque}
              />
            </header>
          )}
          {children}
        </SessionProviderWrapper>
      </body>
    </html>
  )
}
