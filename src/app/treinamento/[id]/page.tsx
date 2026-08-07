'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type {
  CriterionKey, MessageRole, Outcome, TrainingMessage, TrainingReport, TrainingSession, Verdict,
} from '@/lib/training/types'

// CRITERION_LABELS mora em src/lib/training/evaluator.ts, mas esse arquivo
// importa '@anthropic-ai/sdk' no topo — importar de lá aqui levaria o SDK
// inteiro (e a chave de API) pro bundle do navegador. Por isso o mapa é
// duplicado aqui, só com os rótulos (sem nenhuma lógica de chamada de IA).
const CRITERION_LABELS: Record<CriterionKey, string> = {
  acolhimento: 'Acolhimento e clareza',
  qualificacao: 'Qualificação',
  argumentos: 'Argumentos e valor',
  objecoes: 'Objeções',
  fechamento: 'Fechamento',
  precisao: 'Precisão',
  risco: 'Risco',
}
const CRITERION_ORDER: CriterionKey[] = [
  'acolhimento', 'qualificacao', 'argumentos', 'objecoes', 'fechamento', 'precisao', 'risco',
]

// DISPENSOU_BEM é um bom desfecho (o caso era impossível e ela encerrou bem) —
// por isso tem o mesmo tom de sucesso que AGENDOU, não o tom de PERDEU_O_PACIENTE.
const OUTCOME_LABELS: Record<Outcome, string> = {
  AGENDOU: 'Agendou',
  NAO_AGENDOU: 'Não agendou',
  SUMIU: 'Sumiu',
  PERDEU_O_PACIENTE: 'Perdeu o paciente',
  DISPENSOU_BEM: 'Dispensou bem',
}
const OUTCOME_CLASS: Record<Outcome, string> = {
  AGENDOU: 'bg-green-100 text-green-700',
  NAO_AGENDOU: 'bg-gray-100 text-gray-600',
  SUMIU: 'bg-amber-100 text-amber-700',
  PERDEU_O_PACIENTE: 'bg-red-100 text-red-700',
  DISPENSOU_BEM: 'bg-green-100 text-green-700',
}

const VERDICT_LABELS: Record<Verdict, string> = {
  APROVADA: 'Aprovada',
  APROVADA_COM_RESSALVA: 'Aprovada com ressalva',
  REPROVADA: 'Reprovada',
}
const VERDICT_CLASS: Record<Verdict, string> = {
  APROVADA: 'bg-green-100 text-green-700 border-green-200',
  APROVADA_COM_RESSALVA: 'bg-amber-100 text-amber-700 border-amber-200',
  REPROVADA: 'bg-red-100 text-red-700 border-red-200',
}

const BUBBLE_DELAY_MS = 600

interface Bubble {
  key: string
  role: MessageRole
  content: string
}

function messagesToBubbles(messages: TrainingMessage[]): Bubble[] {
  return messages.map(m => ({ key: `m-${m.id}`, role: m.role, content: m.content }))
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// --- Balões de chat -----------------------------------------------------

function ChatBubble({ role, content }: { role: MessageRole; content: string }) {
  const isSecretaria = role === 'secretaria'
  return (
    <div className={`flex ${isSecretaria ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] sm:max-w-[70%] px-3 py-2 text-sm whitespace-pre-wrap break-words rounded-2xl ${
          isSecretaria
            ? 'bg-violet-600 text-white rounded-br-sm'
            : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
        }`}
      >
        {content}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
      </div>
    </div>
  )
}

// --- Relatório ------------------------------------------------------------

function ReportView({ session, report }: { session: TrainingSession; report: TrainingReport }) {
  const hasRedFlags = report.redFlags.length > 0

  return (
    <div className="space-y-4">
      {/* 1. Alertas vermelhos — o bloco mais importante da página. */}
      {hasRedFlags ? (
        <div className="bg-red-50 border-2 border-red-400 rounded-2xl shadow-sm p-5">
          <h2 className="text-base font-bold text-red-800 flex items-center gap-2 mb-3">
            🚨 Alertas vermelhos
          </h2>
          <div className="space-y-3">
            {report.redFlags.map((flag, i) => (
              <div key={i} className="bg-white border border-red-200 rounded-xl p-3">
                <p className="text-sm text-gray-800 italic">&ldquo;{flag.quote}&rdquo;</p>
                <p className="text-xs font-semibold text-red-700 mt-2">Linha cruzada: {flag.redLine}</p>
                <p className="text-xs text-gray-600 mt-1">{flag.why}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-2xl px-5 py-4">
          ✓ Nenhuma linha vermelha cruzada nesta conversa.
        </div>
      )}

      {/* 2. Desfecho */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Desfecho</h2>
        <span className={`inline-block text-sm px-3 py-1 rounded-full ${OUTCOME_CLASS[report.outcome]}`}>
          {OUTCOME_LABELS[report.outcome]}
        </span>
      </div>

      {/* 3. As 7 notas com justificativa */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Notas por critério</h2>
        <div className="space-y-3">
          {CRITERION_ORDER.map(key => (
            <div key={key} className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-800">{CRITERION_LABELS[key]}</p>
                <p className="text-sm font-bold text-violet-700">{report.scores[key].toFixed(1)}</p>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{report.rationales[key]}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Média e status — vêm da sessão, nunca recalculados no cliente */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Média</h2>
          <p className="text-2xl font-bold text-gray-900">{session.average !== null ? session.average.toFixed(1) : '—'}</p>
        </div>
        {session.verdict && (
          <span className={`text-sm font-medium px-3 py-1.5 rounded-full border ${VERDICT_CLASS[session.verdict]}`}>
            {VERDICT_LABELS[session.verdict]}
          </span>
        )}
      </div>

      {/* 5. Pontos fortes */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Pontos fortes</h2>
        {report.strengths.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum ponto forte registrado.</p>
        ) : (
          <ul className="list-disc list-inside space-y-1">
            {report.strengths.map((s, i) => (
              <li key={i} className="text-sm text-gray-700">{s}</li>
            ))}
          </ul>
        )}
      </div>

      {/* 6. A melhorar */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">A melhorar</h2>
        {report.improvements.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum ponto de melhoria registrado.</p>
        ) : (
          <div className="space-y-3">
            {report.improvements.map((item, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                <p className="text-sm text-gray-800 italic">&ldquo;{item.quote}&rdquo;</p>
                <p className="text-xs text-gray-600 mt-1">{item.problem}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 7. Dica prática */}
      <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-violet-800 mb-2">💡 Dica prática</h2>
        <p className="text-sm text-violet-900">{report.practicalTip}</p>
      </div>

      {/* 8. Próximo treino sugerido */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Próximo treino sugerido</h2>
        <p className="text-sm text-gray-700">{report.nextTraining}</p>
      </div>
    </div>
  )
}

// --- Página -----------------------------------------------------------

export default function TreinamentoSessionPage() {
  const params = useParams<{ id: string }>()
  const id = params.id

  const [session, setSession] = useState<TrainingSession | null>(null)
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [report, setReport] = useState<TrainingReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)

  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const bubbleCounter = useRef(0)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/treinamento/sessions/${id}`)
      .then(async res => {
        if (cancelled) return
        if (!res.ok) {
          const data = await res.json().catch(() => ({}) as { error?: string })
          setLoadError(data.error || 'Não foi possível carregar este treino.')
          setLoading(false)
          return
        }
        const data = (await res.json()) as { session: TrainingSession; messages: TrainingMessage[] }
        setSession(data.session)
        setBubbles(messagesToBubbles(data.messages))
        if (data.session.report) setReport(data.session.report)
        if (data.session.status !== 'em_andamento') setEnded(true)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Não foi possível carregar este treino.')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [bubbles, typing])

  function pushBubble(role: MessageRole, content: string) {
    bubbleCounter.current += 1
    setBubbles(prev => [...prev, { key: `local-${bubbleCounter.current}`, role, content }])
  }

  // Revela os balões do paciente um a um, no ritmo de uma conversa real.
  function revealBubbles(contents: string[], onDone: () => void) {
    if (contents.length === 0) {
      onDone()
      return
    }
    let i = 0
    function next() {
      pushBubble('paciente', contents[i])
      i += 1
      if (i < contents.length) {
        setTimeout(next, BUBBLE_DELAY_MS)
      } else {
        onDone()
      }
    }
    next()
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const content = input.trim()
    if (!content || sending || ended || !session) return

    setSendError(null)
    pushBubble('secretaria', content)
    setInput('')
    setSending(true)
    setTyping(true)

    let res: Response
    try {
      res = await fetch(`/api/treinamento/sessions/${session.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
    } catch {
      setTyping(false)
      setSending(false)
      setSendError('Não foi possível conectar ao servidor. A mensagem pode não ter sido salva — tente novamente.')
      return
    }

    if (res.status === 503) {
      const data = await res.json().catch(() => ({}) as { error?: string })
      setTyping(false)
      setSending(false)
      setSendError(data.error || 'Os créditos da IA acabaram. A conversa está salva e pode continuar depois.')
      return
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}) as { error?: string })
      setTyping(false)
      setSending(false)
      setSendError(data.error || 'Não foi possível enviar a mensagem. Tente novamente.')
      return
    }

    const data = (await res.json()) as { bubbles: string[]; outcome: Outcome | null; ended: boolean }
    revealBubbles(data.bubbles, () => {
      setTyping(false)
      setSending(false)
      if (data.ended) setEnded(true)
    })
  }

  async function handleFinish() {
    if (!session || finishing) return
    setFinishing(true)
    setFinishError(null)

    let res: Response
    try {
      res = await fetch(`/api/treinamento/sessions/${session.id}/finish`, { method: 'POST' })
    } catch {
      setFinishing(false)
      setFinishError('Não foi possível conectar ao servidor. Tente novamente.')
      return
    }

    if (res.status === 503) {
      const data = await res.json().catch(() => ({}) as { error?: string })
      setFinishing(false)
      setFinishError(data.error || 'Os créditos da IA acabaram. A conversa está salva — tente avaliar de novo mais tarde.')
      return
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}) as { error?: string })
      setFinishing(false)
      setFinishError(data.error || 'Não foi possível gerar a avaliação. Tente novamente.')
      return
    }

    const data = (await res.json()) as { session: TrainingSession; report: TrainingReport }
    setSession(data.session)
    setReport(data.report)
    setEnded(true)
    setFinishing(false)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="w-10 h-10 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Carregando treino...</p>
        </div>
      </main>
    )
  }

  if (loadError || !session) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {loadError || 'Treino não encontrado.'}
          </div>
          <Link href="/treinamento" className="inline-block mt-4 text-sm text-violet-600 hover:underline">
            ← Voltar para o treinador
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <Link href="/treinamento" className="text-xs text-violet-600 hover:underline">← Treinador de Atendimento</Link>
            <h1 className="text-lg font-bold text-gray-900 mt-1">
              Nível {session.level} · Cenário {session.scenario}
            </h1>
            <p className="text-xs text-gray-400">{fmtDate(session.started_at)}</p>
          </div>
          <button
            type="button"
            onClick={handleFinish}
            disabled={finishing || session.status === 'avaliada'}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
              ended && session.status !== 'avaliada'
                ? 'bg-violet-600 text-white hover:bg-violet-700 ring-2 ring-violet-300 animate-pulse'
                : 'border border-violet-200 text-violet-700 hover:bg-violet-50'
            }`}
          >
            {finishing ? 'Avaliando...' : session.status === 'avaliada' ? 'Avaliado' : 'Encerrar e avaliar'}
          </button>
        </div>

        {finishError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {finishError}
          </div>
        )}

        {/* Chat */}
        <div className="bg-gray-100 rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="max-h-[55vh] overflow-y-auto p-4 space-y-2">
            {bubbles.map(b => <ChatBubble key={b.key} role={b.role} content={b.content} />)}
            {typing && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSend} className="border-t border-gray-200 bg-white p-3 flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={ended || sending}
              placeholder={ended ? 'Este treino foi encerrado.' : 'Escreva sua resposta...'}
              className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:bg-gray-100 disabled:text-gray-400"
            />
            <button
              type="submit"
              disabled={ended || sending || !input.trim()}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              Enviar
            </button>
          </form>
        </div>

        {sendError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {sendError}
          </div>
        )}

        {ended && !report && (
          <div className="bg-violet-50 border border-violet-200 text-violet-800 text-sm rounded-lg px-4 py-3">
            Conversa encerrada. Clique em &ldquo;Encerrar e avaliar&rdquo; para ver o relatório.
          </div>
        )}

        {report && <ReportView session={session} report={report} />}
      </div>
    </main>
  )
}
