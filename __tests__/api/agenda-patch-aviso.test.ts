/**
 * Mudar o status de um agendamento para um status VIVO pode colocar gente
 * numa sala fechada — e precisa avisar.
 *
 * Por que isto virou teste: a sub-aba Relatórios › Agendamentos é o primeiro
 * lugar do sistema onde se revive um cancelamento (a grade esconde
 * `desmarcou`/`remarcou`). O dono vê "Desmarcou — 20/11 15:00", acha que foi
 * engano de alguém e põe "Agendado". Mas 20/11 é feriado e a clínica fecha:
 * o paciente passa a ver no portal uma aplicação num dia de sala fechada, que
 * é, com estas palavras, o modo de fracasso declarado na spec.
 *
 * A rota grava assim mesmo — a equipe pode furar a regra, é decisão do dono —
 * mas devolve o motivo, e a tela mostra.
 *
 * Nomes e dados INVENTADOS.
 */

let sessaoAgora: { user?: { name?: string } } | null = { user: { name: 'Recepção' } }

jest.mock('@/auth', () => ({ auth: jest.fn(async () => sessaoAgora) }))
jest.mock('@/lib/audit', () => ({ logAudit: jest.fn(async () => undefined) }))

const LINHA = {
  id: 5, patient_id: 12, dia: '2026-11-20', hora: '15:00', duracao: 10,
  status: 'agendado', encaixe: false, criado_por: 'Recepção', desmarcado_por: null,
}

const mudarStatus = jest.fn()
let bloqueios: { dia: string; de: string; ate: string }[] = []

jest.mock('@/lib/agenda-db', () => {
  const real = jest.requireActual('@/lib/agenda-status')
  return {
    ...real,
    duracaoValida: (n: number) => n === 10 || n === 40,
    ehFatiaOcupada: () => false,
    mudarStatus: (...args: unknown[]) => mudarStatus(...args),
    mudarDuracao: jest.fn(),
    agendamentosDoPeriodo: jest.fn(async () => []),
    bloqueiosDoPeriodo: jest.fn(async () => bloqueios),
  }
})

import { PATCH } from '@/app/api/agenda/[id]/route'

function pedido(corpo: unknown) {
  return PATCH(
    new Request('http://localhost/api/agenda/5', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    }) as never,
    { params: Promise.resolve({ id: '5' }) },
  )
}

beforeEach(() => {
  sessaoAgora = { user: { name: 'Recepção' } }
  bloqueios = []
  mudarStatus.mockReset()
  mudarStatus.mockResolvedValue(LINHA)
})

describe('PATCH status — aviso de sala fechada', () => {
  it('reviver para um dia FERIADO devolve o aviso', async () => {
    // 20/11/2026 é feriado nacional e a clínica fecha (decisão do dono).
    const r = await pedido({ status: 'agendado' })
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo.agendamento).toBeTruthy()
    expect(corpo.aviso).toBeTruthy()
  })

  it('reviver para dentro de um BLOQUEIO devolve o aviso', async () => {
    mudarStatus.mockResolvedValue({ ...LINHA, dia: '2026-11-17' }) // terça, 14h-20h
    bloqueios = [{ dia: '2026-11-17', de: '14:00', ate: '18:00' }]
    const corpo = await (await pedido({ status: 'agendado' })).json()
    expect(corpo.aviso).toBeTruthy()
  })

  it('dia normal, horário normal: nenhum aviso', async () => {
    // Senão o "marcar como atendido" do dia a dia viraria alarme falso.
    mudarStatus.mockResolvedValue({ ...LINHA, dia: '2026-11-17' })
    const corpo = await (await pedido({ status: 'atendido' })).json()
    expect(corpo.aviso).toBeNull()
  })

  it('status que NÃO segura horário não gera aviso', async () => {
    // Desmarcar num dia fechado não põe ninguém na sala.
    mudarStatus.mockResolvedValue({ ...LINHA, status: 'desmarcou' })
    const corpo = await (await pedido({ status: 'desmarcou' })).json()
    expect(corpo.aviso).toBeNull()
  })
})
