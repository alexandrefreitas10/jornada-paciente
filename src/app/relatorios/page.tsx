import { listArchivedPatients, listPatients } from '@/lib/patients'
import { RelatoriosClient } from './RelatoriosClient'

export const dynamic = 'force-dynamic'

export default async function RelatoriosPage() {
  const [patients, arquivados] = await Promise.all([listPatients(), listArchivedPatients()])
  // Lista separada, e só para a aba Agendamentos: quem terminou o tratamento
  // está arquivado, e é exatamente quem tem o histórico mais longo — sem isto
  // o retrospecto dele é inalcançável. As outras sub-abas continuam recebendo
  // só os ativos, porque lá arquivado não deve aparecer.
  const paraHistorico = [
    ...patients.map((p) => ({ id: p.id, name: p.name })),
    ...arquivados.map((p) => ({ id: p.id, name: `${p.name} (arquivado)` })),
  ].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
          <p className="text-sm text-gray-500 mt-1">Área restrita ao administrador</p>
        </div>
        <RelatoriosClient patients={patients.map(p => ({ id: p.id, name: p.name }))} patientsComArquivados={paraHistorico} />
      </div>
    </main>
  )
}
