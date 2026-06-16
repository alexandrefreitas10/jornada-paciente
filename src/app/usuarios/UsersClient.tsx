'use client'

import { useState, useRef, useEffect } from 'react'
import { AdminPasswordModal } from '@/components/AdminPasswordModal'

type User = { id: number; username: string; created_at: string }

type EditMode = { type: 'username'; value: string } | { type: 'password'; value: string; confirm: string }

// Gate de senha do administrador
function AdminGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/verify-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      onUnlock()
    } else {
      const data = await res.json()
      setError(data.error || 'Senha incorreta')
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex flex-col items-center gap-4">
      <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center text-2xl">🔐</div>
      <div className="text-center">
        <h2 className="text-base font-semibold text-gray-900">Área restrita</h2>
        <p className="text-sm text-gray-500 mt-1">Digite a senha do administrador para continuar</p>
      </div>
      <form onSubmit={handleSubmit} className="w-full space-y-3">
        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Senha do administrador"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

export function UsersClient({ initialUsers }: { initialUsers: User[] }) {
  const [unlocked, setUnlocked] = useState(false)
  const [users, setUsers] = useState<User[]>(initialUsers)

  // Adicionar usuário
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addLoading, setAddLoading] = useState(false)

  // Edição inline
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editMode, setEditMode] = useState<EditMode | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  // Exclusão
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  if (!unlocked) {
    return <AdminGate onUnlock={() => setUnlocked(true)} />
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    setAddError(null)
    const res = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername, password: newPassword }),
    })
    if (!res.ok) {
      const body = await res.json()
      setAddError(body.error || 'Erro ao criar usuário')
    } else {
      const user = await res.json()
      setUsers(prev => [...prev, user])
      setNewUsername('')
      setNewPassword('')
    }
    setAddLoading(false)
  }

  function startEdit(u: User, type: 'username' | 'password') {
    setEditingId(u.id)
    setEditError(null)
    if (type === 'username') setEditMode({ type: 'username', value: u.username })
    else setEditMode({ type: 'password', value: '', confirm: '' })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditMode(null)
    setEditError(null)
  }

  async function handleSaveEdit(id: number) {
    if (!editMode) return
    setEditLoading(true)
    setEditError(null)

    if (editMode.type === 'password') {
      if (editMode.value.length < 6) {
        setEditError('Senha deve ter no mínimo 6 caracteres')
        setEditLoading(false)
        return
      }
      if (editMode.value !== editMode.confirm) {
        setEditError('As senhas não coincidem')
        setEditLoading(false)
        return
      }
    }

    const body = editMode.type === 'username'
      ? { username: editMode.value }
      : { password: editMode.value }

    const res = await fetch(`/api/usuarios/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json()
      setEditError(data.error || 'Erro ao salvar')
    } else {
      if (editMode.type === 'username') {
        const updated = await res.json()
        setUsers(prev => prev.map(u => u.id === id ? { ...u, username: updated.username } : u))
      }
      cancelEdit()
    }
    setEditLoading(false)
  }

  async function handleDelete(id: number) {
    await fetch(`/api/usuarios/${id}`, { method: 'DELETE' })
    setUsers(prev => prev.filter(u => u.id !== id))
    setPendingDeleteId(null)
  }

  return (
    <div className="space-y-6">
      {pendingDeleteId !== null && (
        <AdminPasswordModal
          onConfirm={() => handleDelete(pendingDeleteId)}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}

      {/* Adicionar usuário */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Adicionar usuário ({users.length}/10)</h2>
        <form onSubmit={handleAdd} className="space-y-3">
          <input
            value={newUsername}
            onChange={e => setNewUsername(e.target.value)}
            required
            placeholder="Login (ex: CPF ou nome)"
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
          {addError && <p className="text-sm text-red-600">{addError}</p>}
          <button
            type="submit"
            disabled={addLoading || users.length >= 10}
            className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {addLoading ? 'Adicionando...' : 'Adicionar usuário'}
          </button>
        </form>
      </div>

      {/* Lista de usuários */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {users.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">Nenhum usuário cadastrado</p>
        )}
        {users.map(u => (
          <div key={u.id} className="border-b border-gray-100 last:border-0 px-5 py-4">
            {editingId === u.id && editMode ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {editMode.type === 'username' ? 'Editar login' : 'Redefinir senha'}
                </p>
                {editMode.type === 'username' ? (
                  <input
                    autoFocus
                    value={editMode.value}
                    onChange={e => setEditMode({ type: 'username', value: e.target.value })}
                    className="w-full px-3 py-2 border border-violet-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                ) : (
                  <>
                    <input
                      autoFocus
                      type="password"
                      value={editMode.value}
                      onChange={e => setEditMode({ ...editMode, value: e.target.value })}
                      placeholder="Nova senha (mín. 6 caracteres)"
                      className="w-full px-3 py-2 border border-violet-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                    <input
                      type="password"
                      value={editMode.confirm}
                      onChange={e => setEditMode({ ...editMode, confirm: e.target.value })}
                      placeholder="Confirmar nova senha"
                      className="w-full px-3 py-2 border border-violet-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </>
                )}
                {editError && <p className="text-xs text-red-600">{editError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSaveEdit(u.id)}
                    disabled={editLoading}
                    className="px-4 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
                  >
                    {editLoading ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-1.5 border border-gray-300 text-xs rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{u.username}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Cadastrado em {new Date(u.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(u, 'username')}
                    className="text-xs px-2 py-1 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                    title="Editar login"
                  >
                    ✏️ Login
                  </button>
                  <button
                    onClick={() => startEdit(u, 'password')}
                    className="text-xs px-2 py-1 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                    title="Redefinir senha"
                  >
                    🔑 Senha
                  </button>
                  <button
                    onClick={() => setPendingDeleteId(u.id)}
                    className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remover usuário"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
