/**
 * Quando a EQUIPE marca ou remarca, o paciente é avisado no celular.
 *
 * Até aqui isso virava mensagem no grupo de WhatsApp, uma a uma. O que NÃO
 * muda: o bloqueio de um dia, que derruba vários agendamentos de uma vez,
 * continua sendo avisado por uma pessoa — decisão do dono, e ela se sustenta
 * (receber "sua aplicação foi cancelada" de um robô, sem ninguém a quem
 * perguntar o que houve, é pior que o WhatsApp da clínica).
 *
 * Nomes e dados INVENTADOS.
 */

let sessaoAgora: { user?: { name?: string } } | null = { user: { name: 'Recepção' } }

jest.mock('@/auth', () => ({ auth: jest.fn(async () => sessaoAgora) }))
jest.mock('@/lib/audit', () => ({ logAudit: jest.fn(async () => undefined) }))
jest.mock('@/lib/patients', () => ({ getPatient: jest.fn(async () => ({ id: 12, name: 'Paciente Inventado' })) }))

const avisarPaciente: jest.Mock = jest.fn(async () => ({ enviados: 1, removidos: 0, falhas: 0 }))
jest.mock('@/lib/push-envio', () => ({ avisarPaciente: (...a: unknown[]) => avisarPaciente(...a) }))

const LINHA = {
  id: 5, patient_id: 12, dia: '2026-11-20', hora: '14:00', duracao: 10,
  status: 'agendado', encaixe: false, criado_por: 'Recepção', desmarcado_por: null,
}

const criarAgendamento: jest.Mock = jest.fn(async () => LINHA)
const mudarStatus: jest.Mock = jest.fn(async () => LINHA)

jest.mock('@/lib/agenda-db', () => {
  const status = jest.requireActual('@/lib/agenda-status')
  return {
    ...status,
    duracaoValida: (n: number) => n === 10 || n === 40,
    ehFatiaOcupada: () => false,
    criarAgendamento: (...a: unknown[]) => criarAgendamento(...a),
    mudarStatus: (...a: unknown[]) => mudarStatus(...a),
    mudarDuracao: jest.fn(async () => LINHA),
    agendamentosDoPeriodo: jest.fn(async () => []),
    bloqueiosDoPeriodo: jest.fn(async () => []),
  }
})

import { POST } from '@/app/api/agenda/route'
import { PATCH } from '@/app/api/agenda/[id]/route'

beforeEach(() => {
  sessaoAgora = { user: { name: 'Recepção' } }
  avisarPaciente.mockClear()
  criarAgendamento.mockClear()
  mudarStatus.mockClear()
})

function marcar(corpo: unknown) {
  return POST(new Request('http://localhost/api/agenda', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  }) as never)
}

describe('a equipe marca pelo paciente', () => {
  it('avisa no celular, com o dia e a hora', async () => {
    // 2026-11-17 é uma terça (14h-20h de expediente).
    criarAgendamento.mockResolvedValue({ ...LINHA, dia: '2026-11-17', hora: '14:00' })
    const r = await marcar({ patientId: 12, dia: '2026-11-17', hora: '14:00', duracao: 10 })
    expect(r.status).toBeLessThan(300)

    expect(avisarPaciente).toHaveBeenCalledTimes(1)
    const [paciente, aviso] = avisarPaciente.mock.calls[0] as unknown as [number, { titulo: string; texto: string }]
    expect(paciente).toBe(12)
    expect(aviso.titulo).toMatch(/marcado/i)
    expect(aviso.texto).toContain('Terça-feira, às 14h')
  })

  it('o aviso não cita medicação nem procedimento', async () => {
    // A regra da tela bloqueada vale aqui também, não só no módulo de textos.
    criarAgendamento.mockResolvedValue({ ...LINHA, dia: '2026-11-17', hora: '14:00' })
    await marcar({ patientId: 12, dia: '2026-11-17', hora: '14:00', duracao: 10 })
    const [, aviso] = avisarPaciente.mock.calls[0] as unknown as [number, { titulo: string; texto: string }]
    const tudo = (aviso.titulo + ' ' + aviso.texto).toLowerCase()
    for (const palavra of ['tirzepatida', 'soroterapia', 'medicação', 'injeção', 'paciente inventado']) {
      expect(tudo).not.toContain(palavra)
    }
  })
})

describe('a equipe muda o status', () => {
  function mudar(corpo: unknown) {
    return PATCH(
      new Request('http://localhost/api/agenda/5', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      }) as never,
      { params: Promise.resolve({ id: '5' }) },
    )
  }

  it('reviver um agendamento avisa que o horário mudou', async () => {
    mudarStatus.mockResolvedValue({ ...LINHA, dia: '2026-11-17', hora: '14:00', status: 'agendado' })
    await mudar({ status: 'agendado' })
    expect(avisarPaciente).toHaveBeenCalledTimes(1)
    const [, aviso] = avisarPaciente.mock.calls[0] as unknown as [number, { titulo: string }]
    expect(aviso.titulo).toMatch(/mudou/i)
  })

  it('marcar como ATENDIDO não avisa nada', async () => {
    // É o clique mais comum do dia da enfermeira. Avisar aqui seria contar à
    // pessoa o que ela acabou de viver na cadeira.
    mudarStatus.mockResolvedValue({ ...LINHA, status: 'atendido' })
    await mudar({ status: 'atendido' })
    expect(avisarPaciente).not.toHaveBeenCalled()
  })

  it('marcar FALTOU não avisa nada', async () => {
    mudarStatus.mockResolvedValue({ ...LINHA, status: 'faltou' })
    await mudar({ status: 'faltou' })
    expect(avisarPaciente).not.toHaveBeenCalled()
  })

  it('desmarcar não avisa: esse recado é humano', async () => {
    mudarStatus.mockResolvedValue({ ...LINHA, status: 'desmarcou' })
    await mudar({ status: 'desmarcou' })
    expect(avisarPaciente).not.toHaveBeenCalled()
  })
})
