import { redirect } from 'next/navigation'
import { countUsers } from '@/lib/users'
import { SetupForm } from './SetupForm'

export default async function SetupPage() {
  const count = await countUsers()
  if (count > 0) redirect('/login')

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Configuração Inicial</h1>
          <p className="text-sm text-gray-500 mt-1">Crie o primeiro usuário administrador</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <SetupForm />
        </div>
      </div>
    </main>
  )
}
