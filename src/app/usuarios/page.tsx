import { listUsers } from '@/lib/users'
import { UsersClient } from './UsersClient'

export const dynamic = 'force-dynamic'

export default async function UsuariosPage() {
  const users = await listUsers()
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie os funcionários com acesso ao sistema</p>
        </div>
        <UsersClient initialUsers={users} />
      </div>
    </main>
  )
}
