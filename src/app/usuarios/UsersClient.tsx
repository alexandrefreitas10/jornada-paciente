'use client'

import { useState } from 'react'

type User = { id: number; username: string; created_at: string }

export function UsersClient({ initialUsers }: { initialUsers: User[] }) {
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername, password: newPassword }),
    })
    if (!res.ok) {
      const body = await res.json()
      setError(body.error || 'Erro ao criar usuário')
    } else {
      const user = await res.json()
      setUsers(prev => [...prev, user])
      setNewUsername('')
      setNewPassword('')
    }
    setLoading(false)
  }

  async function handleDelete(id: number) {
    if (!confirm('Remover este usuário?')) return
    await fetch(`/api/usuarios/${id}`, { method: 'DELETE' })
    setUsers(prev => prev.filter(u => u.id !== id))
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Adicionar usuário ({users.length}/10)</h2>
        <form onSubmit={handleAdd} className="space-y-3">
          <input
            value={newUsername}
            onChange={e => setNewUsername(e.target.value)}
            required
            placeholder="Nome de usuário"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            minLength={6}
            placeholder="Senha (mínimo 6 caracteres)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || users.length >= 10}
            className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Adicionando...' : 'Adicionar'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
        {users.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum usuário cadastrado</p>
        )}
        {users.map(u => (
          <div key={u.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{u.username}</p>
              <p className="text-xs text-gray-400">{new Date(u.created_at).toLocaleDateString('pt-BR')}</p>
            </div>
            <button
              onClick={() => handleDelete(u.id)}
              className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
            >
              Remover
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
