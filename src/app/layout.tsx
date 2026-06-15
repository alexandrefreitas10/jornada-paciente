import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { auth } from '../auth'
import { LogoutButton } from '@/components/LogoutButton'
import { SessionProviderWrapper } from '@/components/SessionProviderWrapper'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Jornada do Paciente',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <html lang="pt-BR">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>
        <SessionProviderWrapper>
        {session?.user && (
          <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
            <a href="/">
              <img src="/logo.png" alt="Instituto Torres" className="h-10 w-auto" />
            </a>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <a href="/usuarios" className="hover:text-violet-700 transition-colors">Usuários</a>
              <span className="text-gray-400">|</span>
              <span>{session.user.name}</span>
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
