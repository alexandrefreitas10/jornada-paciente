import { NextRequest, NextResponse } from 'next/server'
import { loadOwnedSession } from '@/lib/training/guard'
import { nextPatientTurn, OutOfCreditsError } from '@/lib/training/patient'
import { addMessages, countSecretariaMessages, listMessages, markEnded } from '@/lib/training/sessions'

const MAX_SECRETARIA_MESSAGES = 30

// IA-paciente (haiku) roda uma vez por resposta, com até 2 tentativas internas
// em nextPatientTurn — folga sobre o tempo normal de uma chamada só.
export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await loadOwnedSession(Number(id))
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
  const sent = await countSecretariaMessages(session.id)
  if (sent >= MAX_SECRETARIA_MESSAGES) {
    await markEnded(session.id)
    return NextResponse.json({ bubbles: [], outcome: 'NAO_AGENDOU', ended: true, reason: 'limite' })
  }

  const history = await listMessages(session.id)
  try {
    const { bubbles, outcome } = await nextPatientTurn({
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
    if (outcome) await markEnded(session.id)
    return NextResponse.json({ bubbles, outcome, ended: outcome !== null })
  } catch (err) {
    if (err instanceof OutOfCreditsError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    throw err
  }
}
