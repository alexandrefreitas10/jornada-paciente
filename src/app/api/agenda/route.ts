import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPatient } from '@/lib/patients'
import {
  agendamentosDoPeriodo,
  bloqueiosDoPeriodo,
  criarAgendamento,
  duracaoValida,
  ehFatiaOcupada,
} from '@/lib/agenda-db'
import { decidirGravacao, motivoDeRecusa } from '@/lib/agenda-vagas'

export const dynamic = 'force-dynamic'

// Data de calendário real: a regex sozinha deixaria passar 2026-02-31, que o
// Postgres rejeitaria com erro 500 em vez de um 400 legível.
function diaValido(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

const horaValida = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const de = req.nextUrl.searchParams.get('de')
  const ate = req.nextUrl.searchParams.get('ate')
  if (!diaValido(de) || !diaValido(ate))
    return NextResponse.json({ error: 'Informe "de" e "ate" no formato AAAA-MM-DD.' }, { status: 400 })
  if (de > ate) return NextResponse.json({ error: 'A data inicial não pode ser depois da final.' }, { status: 400 })

  const [agendamentos, bloqueios] = await Promise.all([
    agendamentosDoPeriodo(de, ate),
    bloqueiosDoPeriodo(de, ate),
  ])
  return NextResponse.json({ agendamentos, bloqueios })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { patientId, dia, hora, duracao } = body ?? {}
  // `forcado` só vale se for exatamente true: texto "false" ou qualquer outra
  // coisa não pode virar licença para furar a regra.
  const forcado = body?.forcado === true

  if (!Number.isInteger(patientId) || patientId <= 0)
    return NextResponse.json({ error: 'Paciente inválido.' }, { status: 400 })
  if (!diaValido(dia)) return NextResponse.json({ error: 'Dia inválido. Use AAAA-MM-DD.' }, { status: 400 })
  if (!horaValida(hora)) return NextResponse.json({ error: 'Hora inválida. Use HH:MM.' }, { status: 400 })
  if (!Number.isInteger(duracao) || !duracaoValida(duracao))
    return NextResponse.json({ error: 'Duração inválida. Use 10 ou 40 minutos.' }, { status: 400 })

  // Sem isto, paciente inexistente estoura a chave estrangeira e vira 500.
  if (!(await getPatient(patientId)))
    return NextResponse.json({ error: 'Paciente não encontrado.' }, { status: 404 })

  const [doDia, bloqueios] = await Promise.all([agendamentosDoPeriodo(dia, dia), bloqueiosDoPeriodo(dia, dia)])
  // Só agendado/atendido segura a cadeira; faltou/remarcou/desmarcou libera.
  const ocupadas = doDia.filter((a) => a.status === 'agendado' || a.status === 'atendido')
  const decisao = decidirGravacao({ motivo: motivoDeRecusa(dia, hora, duracao, ocupadas, bloqueios), forcado })
  if (!decisao.grava) return NextResponse.json({ error: decisao.aviso }, { status: decisao.status })

  try {
    const agendamento = await criarAgendamento({
      patientId,
      dia,
      hora,
      duracao,
      encaixe: decisao.encaixe,
      criadoPor: session.user.name ?? null,
    })
    return NextResponse.json({ agendamento, aviso: decisao.aviso }, { status: decisao.status })
  } catch (erro) {
    // Outro pedido levou a fatia entre a checagem e o INSERT: o índice único
    // decide. É rotina, não falha — a recepção precisa ler "alguém acabou de
    // pegar", não "erro 500".
    if (ehFatiaOcupada(erro))
      return NextResponse.json({ error: 'Este horário acabou de ser ocupado por outro agendamento.' }, { status: 409 })
    throw erro
  }
}
