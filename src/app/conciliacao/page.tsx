import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { ConciliacaoClient } from './ConciliacaoClient'

export const dynamic = 'force-dynamic'

// A guarda é a mesma de /estoque, com a permissão da aba. Ela só funciona
// porque `can_conciliacao` entra na sessão em `src/auth.ts`; a sessão é JWT e
// só pega o campo no login, então quem acabou de receber a permissão precisa
// sair e entrar de novo.
export default async function ConciliacaoPage() {
  const session = await auth()
  const u = session?.user as { is_admin?: boolean; can_conciliacao?: boolean } | undefined
  if (!u?.is_admin && !u?.can_conciliacao) redirect('/')

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Conciliação</h1>
          <p className="text-sm text-gray-500 mt-1">
            Planilhas do BPO contra os extratos do banco, e o custo do mês contra o mês anterior.
          </p>
        </div>
        <ConciliacaoClient />
      </div>
    </main>
  )
}
