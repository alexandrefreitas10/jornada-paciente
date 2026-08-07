import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { loadOwnedSession } from '@/lib/training/guard'
import { evaluateSession } from '@/lib/training/evaluator'
import { OutOfCreditsError } from '@/lib/training/patient'
import { getSession, listMessages, markEnded, saveReport } from '@/lib/training/sessions'

// claude-opus-5 com effort 'high' e até 32k tokens, em stream, com uma repetição
// em caso de resposta incompleta — no pior caso são duas chamadas longas. Os
// 120s usados nas outras rotas de IA do projeto não sobram para isso.
export const maxDuration = 300

// Chave fixa (namespace) do advisory lock de 2 argumentos usado aqui. Postgres
// trata pg_advisory_lock(a, b) como um espaço de chaves totalmente separado de
// pg_advisory_xact_lock(id) (1 argumento, já usado em src/lib/stock.ts) — não
// há risco de colisão mesmo que um id de sessão de treino coincida com um id
// de item de estoque.
const LOCK_NAMESPACE = 74700

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // ownerOnly: encerrar/avaliar é ação do dono, mesmo para admin — o relatório
  // é salvo em nome de quem treinou, um admin não pode gerá-lo por outra pessoa
  // (ver docs/superpowers/specs/2026-08-06-treinador-atendimento-design.md).
  const result = await loadOwnedSession(Number(id), { ownerOnly: true })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  const { session } = result

  if (session.status === 'avaliada') {
    return NextResponse.json({ session, report: session.report })
  }

  const messages = await listMessages(session.id)
  if (!messages.some(m => m.role === 'secretaria')) {
    return NextResponse.json(
      { error: 'Responda pelo menos uma vez antes de encerrar.' },
      { status: 400 }
    )
  }

  // Trava contra duplo clique em "Encerrar e avaliar": sql.reserve() tira uma
  // conexão DO pool (max: 10 em src/lib/db.ts) e a segura, exclusiva, até o
  // reserved.release() no finally — necessário porque o advisory lock é por
  // conexão de sessão, não por transação, e a chamada ao Opus pode demorar
  // bastante (maxDuration acima). Prender uma conexão inteira por uma chamada
  // longa é um custo aceitável aqui: é uma ferramenta interna de uma clínica
  // só, com no máximo um punhado de avaliações concorrentes. Se outra chamada
  // já está avaliando a mesma sessão, devolve 409 em vez de rodar uma segunda
  // chamada cara ao Opus e sobrescrever o relatório que a primeira está
  // prestes a salvar.
  const reserved = await sql.reserve()
  try {
    const [{ locked }] = await reserved<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_NAMESPACE}, ${session.id}) AS locked
    `
    if (!locked) {
      return NextResponse.json(
        { error: 'Este treino já está sendo avaliado.' },
        { status: 409 }
      )
    }

    try {
      // Relê com a trava em mãos: uma chamada concorrente pode ter terminado a
      // avaliação entre o loadOwnedSession acima e a trava ser concedida.
      const fresh = await getSession(session.id)
      if (fresh?.status === 'avaliada') {
        return NextResponse.json({ session: fresh, report: fresh.report })
      }

      await markEnded(session.id)

      try {
        const report = await evaluateSession({
          persona: session.persona,
          level: session.level,
          scenario: session.scenario,
          kb: session.kb_snapshot,
          messages,
          // fresh primeiro: se o paciente declarou o fim entre o loadOwnedSession
          // e a trava, o sinal só existe na releitura.
          declaredOutcome: fresh?.declared_outcome ?? session.declared_outcome,
        })
        const updated = await saveReport(session.id, report)
        // saveReport devolve null se nenhuma linha bateu (ex.: sessão removida
        // entre a leitura e a gravação) — não pode virar um TrainingSession falso.
        if (!updated) {
          return NextResponse.json({ error: 'Treino não encontrado.' }, { status: 404 })
        }
        return NextResponse.json({ session: updated, report })
      } catch (err) {
        if (err instanceof OutOfCreditsError) {
          return NextResponse.json({ error: err.message }, { status: 503 })
        }
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Não foi possível gerar a avaliação. Tente de novo.' },
          { status: 502 }
        )
      }
    } finally {
      await reserved`SELECT pg_advisory_unlock(${LOCK_NAMESPACE}, ${session.id})`
    }
  } finally {
    reserved.release()
  }
}
