import { NextResponse } from 'next/server'
import { portalAuth } from '@/auth-portal'
import {
  agendamentosDoPaciente,
  agendamentosDoPeriodo,
  bloqueiosDoPeriodo,
  criarAgendamento,
  duracaoValida,
  ehFatiaOcupada,
  mudarStatus,
  temPrescricao,
} from '@/lib/agenda-db'
import { motivoDeRecusa, vagasDoDia } from '@/lib/agenda-vagas'
import { vivo, type Duracao } from '@/lib/agenda-grade'
import {
  AVISO_EM_CIMA_DA_HORA,
  janelaDoPaciente,
  podeMarcarOutro,
  podeMexerNoAgendamento,
} from '@/lib/agenda-paciente'
import { pacientePodeVerAgenda } from '@/lib/agenda-piloto'
import { dataBrasilia } from '@/lib/datas'

// POR QUE ESTA ROTA VIVE EM /api/portal
//
// O guardião (`src/proxy.ts`) deixa a sessão do PACIENTE alcançar só
// `/portal/paciente` e leituras do próprio `/api/patients/{id}`. `/api/agenda`,
// a rota da equipe, é inalcançável para ele — e deve continuar sendo.
//
// `/api/portal/*` está na lista pública do guardião, então QUEM AUTENTICA É
// ESTA ROTA, como já faz `/api/portal/push`. Cada handler começa por
// `pacienteDaSessao()`, e o `patient_id` vem SEMPRE da sessão, nunca do corpo:
// aceitar do corpo deixaria qualquer paciente marcar na agenda de outro.

async function pacienteDaSessao(): Promise<number | null> {
  const session = await portalAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const id = (session?.user as any)?.patient_id as number | undefined
  return typeof id === 'number' ? id : null
}

/** Quem pode usar a aba: piloto liberado E folha na aba Prescrições. */
async function podeUsar(patientId: number): Promise<boolean> {
  if (!pacientePodeVerAgenda(patientId)) return false
  return temPrescricao(patientId)
}

const NEGADO = NextResponse.json({ error: 'Agenda não disponível.' }, { status: 403 })

/**
 * O que a tela do paciente precisa: a janela, o que ele já tem marcado, e os
 * horários livres de cada dia para cada duração.
 *
 * As vagas são calculadas AQUI, no servidor, a partir da agenda inteira — mas
 * só os horários saem. O paciente nunca recebe nome, id nem nada de quem
 * ocupa as outras fatias.
 */
export async function GET() {
  const patientId = await pacienteDaSessao()
  if (!patientId) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!(await podeUsar(patientId))) return NEGADO

  const hoje = dataBrasilia(new Date())
  const { de, ate } = janelaDoPaciente(hoje)

  const [todos, bloqueios, meus] = await Promise.all([
    agendamentosDoPeriodo(de, ate),
    bloqueiosDoPeriodo(de, ate),
    agendamentosDoPaciente(patientId, de, ate),
  ])

  const ocupadasPorDia = new Map<string, { hora: string }[]>()
  for (const a of todos) {
    if (!vivo(a.status)) continue
    const lista = ocupadasPorDia.get(a.dia) ?? []
    lista.push({ hora: a.hora })
    ocupadasPorDia.set(a.dia, lista)
  }
  const bloqueiosPorDia = new Map<string, { de: string; ate: string }[]>()
  for (const b of bloqueios) {
    const lista = bloqueiosPorDia.get(b.dia) ?? []
    lista.push({ de: b.de, ate: b.ate })
    bloqueiosPorDia.set(b.dia, lista)
  }

  const dias: { dia: string; vagas10: string[]; vagas40: string[] }[] = []
  for (let d: string | null = de; d && d <= ate; d = proximoDia(d)) {
    const ocupadas = ocupadasPorDia.get(d) ?? []
    const bloqueados = bloqueiosPorDia.get(d) ?? []
    const vagas10 = vagasDoDia(d, 10, ocupadas, bloqueados)
    const vagas40 = vagasDoDia(d, 40, ocupadas, bloqueados)
    if (vagas10.length || vagas40.length) dias.push({ dia: d, vagas10, vagas40 })
  }

  const agora = new Date()
  return NextResponse.json({
    hoje,
    janela: { de, ate },
    dias,
    meus: meus.filter((a) => vivo(a.status)).map((a) => ({
      id: a.id,
      dia: a.dia,
      hora: a.hora,
      duracao: a.duracao,
      podeMexer: podeMexerNoAgendamento(a.dia, a.hora, agora),
    })),
    podeMarcar: podeMarcarOutro(meus, agora),
    avisoEmCimaDaHora: AVISO_EM_CIMA_DA_HORA,
  })
}

function proximoDia(dia: string): string | null {
  const t = Date.parse(`${dia}T00:00:00Z`)
  if (Number.isNaN(t)) return null
  return new Date(t + 86_400_000).toISOString().slice(0, 10)
}

/** Marca. Nunca força: o paciente não encaixa em fatia ocupada, jamais. */
export async function POST(request: Request) {
  const patientId = await pacienteDaSessao()
  if (!patientId) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!(await podeUsar(patientId))) return NEGADO

  const { dia, hora, duracao, trocar } = await request.json().catch(() => ({})) as {
    dia?: string; hora?: string; duracao?: number; trocar?: number
  }
  if (typeof dia !== 'string' || typeof hora !== 'string'
      || typeof duracao !== 'number' || !duracaoValida(duracao)) {
    return NextResponse.json({ error: 'Pedido incompleto.' }, { status: 400 })
  }

  const hoje = dataBrasilia(new Date())
  const { de, ate } = janelaDoPaciente(hoje)
  // A janela é imposta AQUI, não só na tela: sem isto, bastaria mandar o
  // pedido direto para marcar daqui a seis meses.
  if (dia < de || dia > ate) {
    return NextResponse.json({ error: 'Esta data está fora do período que você pode marcar.' }, { status: 400 })
  }

  const agora = new Date()
  const meus = await agendamentosDoPaciente(patientId, de, ate)

  // Trocar de horário: a linha antiga vira `remarcou` e nasce uma nova. Assim
  // o relatório da clínica guarda as duas, como a spec pede.
  const antigo = typeof trocar === 'number' ? meus.find((a) => a.id === trocar && vivo(a.status)) : undefined
  if (typeof trocar === 'number' && !antigo) {
    return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
  }
  if (antigo && !podeMexerNoAgendamento(antigo.dia, antigo.hora, agora)) {
    return NextResponse.json({ error: AVISO_EM_CIMA_DA_HORA }, { status: 409 })
  }
  if (!antigo && !podeMarcarOutro(meus, agora)) {
    return NextResponse.json(
      { error: 'Você já tem uma aplicação marcada. Troque o horário dela ou desmarque antes de marcar outra.' },
      { status: 409 },
    )
  }

  const [doDia, bloqueios] = await Promise.all([
    agendamentosDoPeriodo(dia, dia),
    bloqueiosDoPeriodo(dia, dia),
  ])
  const ocupadas = doDia.filter((a) => vivo(a.status) && a.id !== antigo?.id).map((a) => ({ hora: a.hora }))
  const motivo = motivoDeRecusa(dia, hora, duracao as Duracao, ocupadas, bloqueios)
  if (motivo) return NextResponse.json({ error: motivo }, { status: 409 })

  try {
    if (antigo) await mudarStatus(antigo.id, 'remarcou', null)
    const criado = await criarAgendamento({
      patientId, dia, hora, duracao: duracao as Duracao, encaixe: false, criadoPor: null,
    })
    return NextResponse.json({ agendamento: criado }, { status: 201 })
  } catch (erro) {
    // Alguém pegou a fatia entre a conferência e a gravação.
    if (ehFatiaOcupada(erro)) {
      if (antigo) await mudarStatus(antigo.id, 'agendado', null).catch(() => {})
      return NextResponse.json(
        { error: 'Esse horário acabou de ser ocupado. Escolha outro.' },
        { status: 409 },
      )
    }
    throw erro
  }
}

/** Desmarca o próprio agendamento, até uma hora antes. */
export async function DELETE(request: Request) {
  const patientId = await pacienteDaSessao()
  if (!patientId) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!(await podeUsar(patientId))) return NEGADO

  const { id } = await request.json().catch(() => ({})) as { id?: number }
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Agendamento inválido.' }, { status: 400 })

  const hoje = dataBrasilia(new Date())
  const { de, ate } = janelaDoPaciente(hoje)
  const meus = await agendamentosDoPaciente(patientId, de, ate)
  // Só o PRÓPRIO: a busca é dentro dos agendamentos dele, então um id de
  // outra pessoa simplesmente não é encontrado.
  const alvo = meus.find((a) => a.id === id && vivo(a.status))
  if (!alvo) return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })

  if (!podeMexerNoAgendamento(alvo.dia, alvo.hora, new Date())) {
    return NextResponse.json({ error: AVISO_EM_CIMA_DA_HORA }, { status: 409 })
  }

  await mudarStatus(alvo.id, 'desmarcou', 'o próprio paciente')
  return NextResponse.json({ ok: true })
}
