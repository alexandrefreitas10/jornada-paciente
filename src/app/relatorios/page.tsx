import { listPatients } from '@/lib/patients'
import { RelatoriosClient } from './RelatoriosClient'

export const dynamic = 'force-dynamic'

export default async function RelatoriosPage() {
  const patients = await listPatients()
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
          <p className="text-sm text-gray-500 mt-1">Área restrita ao administrador</p>
        </div>
        <RelatoriosClient patients={patients.map(p => ({ id: p.id, name: p.name }))} />
      </div>
    </main>
  )
}
