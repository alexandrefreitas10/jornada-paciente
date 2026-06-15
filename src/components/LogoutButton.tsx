'use client'

import { signOut } from 'next-auth/react'

export function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="text-sm text-gray-500 hover:text-red-600 transition-colors"
    >
      Sair
    </button>
  )
}
