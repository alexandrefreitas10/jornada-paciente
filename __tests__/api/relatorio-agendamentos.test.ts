/**
 * Rota do histórico de agendamentos de um paciente, usada pela sub-aba
 * Relatórios › Agendamentos.
 *
 * Banco dublê; o que se mede é a rota: quem pode, o que ela aceita de id, e o
 * que devolve. Nomes e dados INVENTADOS.
 */

let sessaoAgora: { user?: { name?: string } } | null = { user: { name: 'Recepção' } }

jest.mock('@/auth', () => ({
  auth: jest.fn(async () => sessaoAgora),
}))

const historicoDoPaciente = jest.fn()
jest.mock('@/lib/agenda-db', () => ({
  historicoDoPaciente: (...args: unknown[]) => historicoDoPaciente(...args),
}))

import { GET } from '@/app/api/reports/agendamentos/[patientId]/route'

const LINHAS = [
  {
    id: 31, patient_id: 12, dia: '2026-11-10', hora: '15:00', duracao: 10,
    status: 'atendido', encaixe: false, criado_por: 'Recepção', desmarcado_por: null,
    nome: 'Paciente Inventado',
  },
  {
    id: 18, patient_id: 12, dia: '2026-10-27', hora: '14:00', duracao: 40,
    status: 'faltou', encaixe: false, criado_por: null, desmarcado_por: null,
    nome: 'Paciente Inventado',
  },
]

function pedido(patientId: string) {
  return GET(new Request('http://localhost/api/reports/agendamentos/' + patientId), {
    params: Promise.resolve({ patientId }),
  })
}

beforeEach(() => {
  sessaoAgora = { user: { name: 'Recepção' } }
  historicoDoPaciente.mockReset()
  historicoDoPaciente.mockResolvedValue(LINHAS)
})

describe('GET /api/reports/agendamentos/[patientId]', () => {
  it('sem sessão da equipe, 401', async () => {
    sessaoAgora = null
    const r = await pedido('12')
    expect(r.status).toBe(401)
    expect(historicoDoPaciente).not.toHaveBeenCalled()
  })

  it('devolve o histórico do paciente pedido', async () => {
    const r = await pedido('12')
    expect(r.status).toBe(200)
    expect(historicoDoPaciente).toHaveBeenCalledWith(12)
    const corpo = await r.json()
    expect(corpo.agendamentos).toHaveLength(2)
    // Todos os estados, inclusive os que a grade esconde — é para isso que o
    // relatório existe.
    expect(corpo.agendamentos.map((a: { status: string }) => a.status)).toEqual(['atendido', 'faltou'])
  })

  it('id que não é número vira 400, não consulta o banco', async () => {
    // Sem isto, `Number('abc')` viraria NaN e desceria até o Postgres como
    // erro 500 em vez de um recado legível.
    const r = await pedido('abc')
    expect(r.status).toBe(400)
    expect(historicoDoPaciente).not.toHaveBeenCalled()
  })

  it('id negativo ou zero também é 400', async () => {
    expect((await pedido('0')).status).toBe(400)
    expect((await pedido('-3')).status).toBe(400)
    expect(historicoDoPaciente).not.toHaveBeenCalled()
  })

  it('paciente sem nenhum agendamento devolve lista vazia, não erro', async () => {
    // A tela precisa distinguir "nunca teve" de "deu problema". 404 aqui
    // faria a sub-aba mostrar erro para um paciente novo, que é o caso normal.
    historicoDoPaciente.mockResolvedValue([])
    const r = await pedido('99')
    expect(r.status).toBe(200)
    expect((await r.json()).agendamentos).toEqual([])
  })
})
