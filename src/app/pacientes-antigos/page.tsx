import { listArchivedPatients } from '@/lib/patients'
import { ArchivedPatientsList } from '@/components/ArchivedPatientsList'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function PacientesAntigosPage() {
  const patients = await listArchivedPatients()

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
          ← Voltar
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pacientes Antigos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {patients.length} paciente{patients.length !== 1 ? 's' : ''} arquivado{patients.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {patients.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-sm">Nenhum paciente arquivado ainda.</p>
          <p className="text-xs mt-1">Quando um paciente sair do tratamento, use o botão 📦 no card dele.</p>
        </div>
      ) : (
        <ArchivedPatientsList patients={patients} />
      )}
    </main>
  )
}
