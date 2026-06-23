import { listTerms } from '@/lib/terms'
import { TermsManagementClient } from '@/components/TermsManagementClient'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function TermosPage() {
  const terms = await listTerms()

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
          ← Voltar
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Biblioteca de Termos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Crie templates de termos para usar com seus pacientes.
          </p>
        </div>
      </div>

      <TermsManagementClient initialTerms={terms} />
    </main>
  )
}
