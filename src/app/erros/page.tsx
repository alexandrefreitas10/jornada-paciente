import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getRecentSystemErrors } from '@/lib/system-errors'

export const dynamic = 'force-dynamic'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function sourceLabel(s: string) {
  switch (s) {
    case 'audit': return { label: 'Auditoria', cls: 'bg-red-100 text-red-700' }
    case 's3_delete': return { label: 'Arquivo S3', cls: 'bg-amber-100 text-amber-700' }
    case 'ai_summary': return { label: 'Resumo IA', cls: 'bg-violet-100 text-violet-700' }
    default: return { label: s, cls: 'bg-gray-100 text-gray-600' }
  }
}

export default async function ErrosPage() {
  const session = await auth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isAdmin = !!(session?.user as any)?.is_admin
  if (!session?.user) redirect('/login')
  if (!isAdmin) redirect('/')

  const errors = await getRecentSystemErrors()

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Erros do Sistema</h1>
        <p className="text-sm text-gray-500 mt-1">
          Falhas silenciosas registradas (resumo de IA, arquivo no S3, auditoria). Sem dados de paciente.
        </p>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Recentes ({errors.length})</h2>
        {errors.length === 0 ? (
          <p className="text-sm text-gray-400">✅ Nenhum erro registrado.</p>
        ) : (
          <div className="space-y-3">
            {errors.map(e => {
              const src = sourceLabel(e.source)
              return (
                <div key={e.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${src.cls}`}>{src.label}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(e.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-700">{e.message}</p>
                  {e.context && (
                    <pre className="text-[11px] text-gray-500 mt-1 whitespace-pre-wrap break-all font-mono">
                      {JSON.stringify(e.context)}
                    </pre>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
