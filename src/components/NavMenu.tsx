'use client'

import { useState } from 'react'
import { LogoutButton } from './LogoutButton'

interface Props {
  userName: string
  isAdmin: boolean
  canEstoque?: boolean
}

export function NavMenu({ userName, isAdmin, canEstoque }: Props) {
  const [open, setOpen] = useState(false)

  const links = [
    { href: '/', label: 'Início' },
    { href: '/usuarios', label: 'Usuários' },
    { href: '/termos', label: 'Termos' },
    { href: '/implantes', label: 'Implantes' },
    { href: '/relatorios', label: 'Relatórios' },
    ...(isAdmin || canEstoque ? [{ href: '/estoque', label: 'Estoque' }] : []),
    { href: '/pacientes-antigos', label: 'Pacientes Antigos' },
  ]

  return (
    <>
      {/* Desktop: row de links */}
      <div className="hidden sm:flex items-center justify-center gap-3 text-sm text-gray-600 mt-1 pb-1 flex-wrap">
        {links.map((l, i) => (
          <span key={l.href} className="flex items-center gap-3">
            {i > 0 && <span className="text-gray-300">|</span>}
            <a href={l.href} className="hover:text-violet-700 transition-colors">{l.label}</a>
          </span>
        ))}
        <span className="text-gray-300">|</span>
        <span className="truncate max-w-[140px]">{userName}</span>
        <LogoutButton />
      </div>

      {/* Mobile: hamburger */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between px-1 pt-1 pb-1">
          <span className="text-sm text-gray-500 truncate max-w-[200px]">{userName}</span>
          <button
            onClick={() => setOpen(o => !o)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Menu"
          >
            {open ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {open && (
          <nav className="border-t border-gray-100 py-2 flex flex-col">
            {links.map(l => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="px-4 py-2.5 text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700 transition-colors"
              >
                {l.label}
              </a>
            ))}
            <div className="px-4 py-2.5 border-t border-gray-100 mt-1">
              <LogoutButton />
            </div>
          </nav>
        )}
      </div>
    </>
  )
}
