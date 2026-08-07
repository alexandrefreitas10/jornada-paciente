import { NextRequest, NextResponse } from 'next/server'
import { isAdminSession } from '@/lib/authz'
import { readKb } from '@/lib/training/kb'
import { pickPersona, SCENARIOS } from '@/lib/training/personas'
import { nextPatientTurn, OutOfCreditsError } from '@/lib/training/patient'
import { addMessages, addPatientUsage, createSession, listSessions, markEnded } from '@/lib/training/sessions'
import { currentUserId } from '@/lib/training/guard'
import type { Level, ScenarioKey } from '@/lib/training/types'

// IA-paciente (haiku) roda uma vez para abrir a conversa, com até 2 tentativas
// internas em nextPatientTurn — folga sobre o tempo normal de uma chamada só.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const userId = await currentUserId()
  if (userId === null) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const all = req.nextUrl.searchParams.get('all') === '1' && (await isAdminSession())
  const sessions = await listSessions(all ? {} : { userId })
  return NextResponse.json({ sessions })
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId()
  if (userId === null) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  // Sem base de conhecimento cadastrada não há gabarito — bloqueia o treino aqui.
  const kb = await readKb()
  if (!kb) {
    return NextResponse.json(
      { error: 'A base de conhecimento ainda não foi preenchida. Sem ela o treino não sabe o que é certo.' },
      { status: 409 }
    )
  }

  const body = (await req.json().catch(() => ({}))) as { level?: number; scenario?: string }
  const level = Number(body.level) as Level
  if (![1, 2, 3, 4, 5].includes(level)) {
    return NextResponse.json({ error: 'Escolha um nível de 1 a 5.' }, { status: 400 })
  }
  const scenario = String(body.scenario ?? '') as ScenarioKey
  if (!(scenario in SCENARIOS)) {
    return NextResponse.json({ error: 'Cenário inválido.' }, { status: 400 })
  }

  const persona = pickPersona(level, scenario)
  const session = await createSession({ userId, level, scenario, persona, kb })

  try {
    const { bubbles, outcome, usage } = await nextPatientTurn({ persona, level, scenario, kb, history: [] })
    // bubbles vazio com outcome preenchido = o paciente "encerrou" sem mandar
    // texto (caso raro na abertura, mas possível) — não grava mensagem vazia.
    if (bubbles.length > 0) {
      await addMessages(session.id, bubbles.map(content => ({ role: 'paciente' as const, content })))
    }
    // Grava os tokens gastos nesta chamada (inclusive tentativas descartadas
    // dentro de nextPatientTurn) mesmo quando não sobra bolha nenhuma pra salvar.
    await addPatientUsage(session.id, usage)
    // Guarda o desfecho declarado pelo paciente junto do encerramento: é o único
    // momento em que ele existe, e a avaliadora vai precisar dele lá no finish.
    if (outcome) await markEnded(session.id, outcome)
    return NextResponse.json({ session, bubbles, outcome })
  } catch (err) {
    if (err instanceof OutOfCreditsError) {
      // A sessão já está criada e salva — ela pode retomar depois.
      return NextResponse.json({ session, error: err.message }, { status: 503 })
    }
    throw err
  }
}
