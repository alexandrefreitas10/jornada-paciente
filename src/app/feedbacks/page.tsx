import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { adminListNps, adminListFeedback } from '@/lib/feedback'

export const dynamic = 'force-dynamic'

function npsClass(score: number) {
  if (score <= 6) return 'bg-red-100 text-red-700'
  if (score <= 8) return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default async function FeedbacksPage() {
  const session = await auth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isAdmin = !!(session?.user as any)?.is_admin
  if (!session?.user) redirect('/login')
  if (!isAdmin) redirect('/')

  const [nps, feedbacks] = await Promise.all([adminListNps(), adminListFeedback()])

  const total = nps.length
  const promoters = nps.filter(n => n.score >= 9).length
  const detractors = nps.filter(n => n.score <= 6).length
  const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null
  const avg = total > 0 ? (nps.reduce((s, n) => s + n.score, 0) / total).toFixed(1) : null

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Feedbacks dos Pacientes</h1>

      {/* Resumo NPS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-violet-700">{npsScore !== null ? npsScore : '—'}</p>
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">NPS</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-gray-800">{avg ?? '—'}</p>
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Nota média</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{promoters}</p>
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Promotores</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{detractors}</p>
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Detratores</p>
        </div>
      </div>

      {/* Ouvidoria */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">📣 Ouvidoria ({feedbacks.length})</h2>
        {feedbacks.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum relato recebido ainda.</p>
        ) : (
          <div className="space-y-3">
            {feedbacks.map(f => (
              <div key={f.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <a href={`/pacientes/${f.patient_id}`} className="text-sm font-medium text-violet-700 hover:underline">
                    {f.patient_name}
                  </a>
                  <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(f.created_at)}</span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{f.message}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Respostas NPS */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">💜 Respostas NPS ({total})</h2>
        {total === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma resposta ainda. O NPS é exibido no primeiro acesso do paciente ao portal.</p>
        ) : (
          <div className="space-y-3">
            {nps.map(n => (
              <div key={n.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${npsClass(n.score)}`}>{n.score}</span>
                    <a href={`/pacientes/${n.patient_id}`} className="text-sm font-medium text-violet-700 hover:underline truncate">
                      {n.patient_name}
                    </a>
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(n.created_at)}</span>
                </div>
                {n.comment && <p className="text-sm text-gray-700 whitespace-pre-wrap">{n.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
