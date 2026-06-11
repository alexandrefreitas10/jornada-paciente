// src/app/page.tsx
import { listPatients } from '@/lib/patients'
import { PatientCard } from '@/components/PatientCard'
import { NewPatientButton } from '@/components/NewPatientButton'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const patients = await listPatients()

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jornada do Paciente</h1>
          <p className="text-sm text-gray-500 mt-1">{patients.length} paciente{patients.length !== 1 ? 's' : ''} cadastrado{patients.length !== 1 ? 's' : ''}</p>
        </div>
        <NewPatientButton />
      </div>

      {patients.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-1">Nenhum paciente ainda</p>
          <p className="text-sm">Clique em &quot;+ Novo Paciente&quot; para começar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {patients.map((patient) => (
            <PatientCard key={patient.id} patient={patient} />
          ))}
        </div>
      )}
    </main>
  )
}
