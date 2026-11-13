import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  duracaoValida,
  ehFatiaOcupada,
  ehStatusAgendamento,
  mudarDuracao,
  mudarStatus,
  type Agendamento,
} from '@/lib/agenda-db'

export const dynamic = 'force-dynamic'

const MSG_OCUPADO = 'Este horário já foi retomado por outro agendamento.'

// "12abc" e "1.5" viram NaN/decimal em Number(); o id só vale se for inteiro puro.
function lerId(s: string): number | null {
  return /^\d+$/.test(s) && Number(s) > 0 ? Number(s) : null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const id = lerId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Agendamento inválido.' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const { status, duracao } = body ?? {}
  if (status === undefined && duracao === undefined)
    return NextResponse.json({ error: 'Informe o status ou a duração.' }, { status: 400 })
  // Valida tudo antes de gravar qualquer coisa: pedido com os dois campos não
  // pode aplicar metade e recusar a outra metade.
  if (status !== undefined && !(typeof status === 'string' && ehStatusAgendamento(status)))
    return NextResponse.json(
      { error: 'Status inválido. Use agendado, atendido, faltou, remarcou ou desmarcou.' },
      { status: 400 },
    )
  if (duracao !== undefined && !(Number.isInteger(duracao) && duracaoValida(duracao)))
    return NextResponse.json({ error: 'Duração inválida. Use 10 ou 40 minutos.' }, { status: 400 })

  try {
    let agendamento: Agendamento | null = null
    if (status !== undefined) agendamento = await mudarStatus(id, status, session.user.name ?? null)
    if (duracao !== undefined && (status === undefined || agendamento)) agendamento = await mudarDuracao(id, duracao)
    if (!agendamento) return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
    return NextResponse.json({ agendamento })
  } catch (erro) {
    // Reviver (agendado) uma linha cuja fatia outro já retomou.
    if (ehFatiaOcupada(erro)) return NextResponse.json({ error: MSG_OCUPADO }, { status: 409 })
    throw erro
  }
}

// Desmarcar não apaga: vira status 'desmarcou' e guarda quem soltou o horário.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const id = lerId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Agendamento inválido.' }, { status: 400 })

  const agendamento = await mudarStatus(id, 'desmarcou', session.user.name ?? null)
  if (!agendamento) return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
  return NextResponse.json({ agendamento })
}
