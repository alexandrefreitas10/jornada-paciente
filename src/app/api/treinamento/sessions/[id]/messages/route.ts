import { NextRequest, NextResponse } from 'next/server'
import { loadOwnedSession } from '@/lib/training/guard'
import { nextPatientTurn, OutOfCreditsError } from '@/lib/training/patient'
import { addMessages, addPatientUsage, countSecretariaMessages, listMessages, markEnded } from '@/lib/training/sessions'

const MAX_SECRETARIA_MESSAGES = 30

// IA-paciente (haiku) roda uma vez por resposta, com até 2 tentativas internas
// em nextPatientTurn — folga sobre o tempo normal de uma chamada só.
export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // ownerOnly: responder dentro de um treino é ação do dono, mesmo para admin
  // (o admin só tem leitura aqui — ver docs/superpowers/specs/2026-08-06-treinador-atendimento-design.md).
  const result = await loadOwnedSession(Number(id), { ownerOnly: true })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  const { session } = result

  if (session.status !== 'em_andamento') {
    return NextResponse.json({ error: 'Este treino já foi encerrado.' }, { status: 409 })
  }

  const body = (await req.json().catch(() => ({}))) as { content?: string }
  const content = String(body.content ?? '').trim()
  if (!content) return NextResponse.json({ error: 'Escreva uma resposta.' }, { status: 400 })

  await addMessages(session.id, [{ role: 'secretaria', content }])

  // Teto de 30 mensagens da secretária: encerra sem gastar mais uma chamada de IA.
  // Sem declared_outcome de propósito — este NAO_AGENDOU é corte do sistema, não
  // algo que o paciente sinalizou. Gravá-lo faria a avaliadora ler um sinal falso.
  const sent = await countSecretariaMessages(session.id)
  if (sent >= MAX_SECRETARIA_MESSAGES) {
    await markEnded(session.id)
    return NextResponse.json({ bubbles: [], outcome: 'NAO_AGENDOU', ended: true, reason: 'limite' })
  }

  const history = await listMessages(session.id)
  try {
    const { bubbles, outcome, usage } = await nextPatientTurn({
      persona: session.persona,
      level: session.level,
      scenario: session.scenario,
      kb: session.kb_snapshot,
      history,
    })
    // bubbles vazio com outcome preenchido = o paciente encerrou sem mandar uma
    // última mensagem — não grava mensagem vazia, só encerra a sessão abaixo.
    if (bubbles.length > 0) {
      await addMessages(session.id, bubbles.map(c => ({ role: 'paciente' as const, content: c })))
    }
    // Grava os tokens gastos neste turno (inclusive tentativas descartadas
    // dentro de nextPatientTurn) mesmo quando não sobra bolha nenhuma pra salvar.
    await addPatientUsage(session.id, usage)
    // Guarda o desfecho declarado pelo paciente junto do encerramento: é o único
    // momento em que ele existe, e a avaliadora vai precisar dele lá no finish.
    if (outcome) await markEnded(session.id, outcome)
    return NextResponse.json({ bubbles, outcome, ended: outcome !== null })
  } catch (err) {
    if (err instanceof OutOfCreditsError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    throw err
  }
}
