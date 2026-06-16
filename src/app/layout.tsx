import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { auth } from '../auth'
import { LogoutButton } from '@/components/LogoutButton'
import { SessionProviderWrapper } from '@/components/SessionProviderWrapper'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Instituto Torres',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <html lang="pt-BR">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>
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
              {/* Menu abaixo da logo */}
              <div className="flex items-center justify-center gap-3 text-sm text-gray-600 mt-1 pb-1">
                <a href="/usuarios" className="hover:text-violet-700 transition-colors">Usuários</a>
                <span className="text-gray-300">|</span>
                <a href="/relatorios" className="hover:text-violet-700 transition-colors">Relatórios</a>
                <span className="text-gray-300">|</span>
                <span className="truncate max-w-[140px]">{session.user.name}</span>
                <LogoutButton />
              </div>
            </header>
          )}
          {children}
        </SessionProviderWrapper>
      </body>
    </html>
  )
}
