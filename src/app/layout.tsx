import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Image from 'next/image'
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
            <header className="bg-white border-b border-gray-200 px-6 py-3 relative flex items-center justify-center">
              <a href="/" className="flex items-center">
                <Image
                  src="/logo.png"
                  alt="Instituto Torres"
                  width={160}
                  height={80}
                  className="h-16 w-auto"
                  priority
                />
              </a>
              <div className="absolute right-6 flex items-center gap-4 text-sm text-gray-600">
                <a href="/usuarios" className="hover:text-violet-700 transition-colors">Usuários</a>
                <span className="text-gray-300">|</span>
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
