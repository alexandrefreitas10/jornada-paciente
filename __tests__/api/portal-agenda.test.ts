/**
 * A rota da agenda do PORTAL — a única porta por onde o paciente mexe sozinho
 * na agenda da clínica.
 *
 * Por que esta suíte existe: a Entrega 2 foi para produção sem nenhum teste da
 * rota, e a revisão independente achou dois defeitos que só a rota revela —
 * nenhum deles aparece nos testes de regra pura nem nos de tela. O banco é
 * dublê; as regras (`agenda-paciente`, `agenda-vagas`, `agenda-piloto`) rodam
 * de verdade, porque são elas que se quer medir.
 *
 * Nomes e dados INVENTADOS.
 */

const PACIENTE = 4201

// AGORA: 16/11/2026, 18h00 de Brasília (= 21h00 UTC). Segunda-feira.
const AGORA = new Date('2026-11-16T21:00:00Z')
const HOJE = '2026-11-16'
// A janela do paciente vai de hoje até hoje+27, ou seja 13/12/2026.
const FORA_DA_JANELA = '2026-12-21' // segunda, 35 dias à frente

interface Linha {
  id: number
  patient_id: number
  dia: string
  hora: string
  duracao: number
  status: string
  encaixe: boolean
  criado_por: string | null
  desmarcado_por: string | null
}

function linha(p: Partial<Linha> & { dia: string; hora: string }): Linha {
  return {
    id: 1, patient_id: PACIENTE, duracao: 10, status: 'agendado',
    encaixe: false, criado_por: null, desmarcado_por: null, ...p,
  }
}

/**
 * O "banco": uma lista só. Os dublês abaixo imitam o WHERE de cada consulta de
 * verdade — é isso que faz o teste enxergar a diferença entre perguntar
 * "dentro da janela" e perguntar "de hoje para frente".
 */
let BANCO: Linha[] = []
let temPrescricaoAgora = true
let pacienteNoBanco: Record<string, unknown> | null = { id: PACIENTE, name: 'Paciente de Teste' }
let sessaoAgora: { user?: { patient_id?: number } } | null = { user: { patient_id: PACIENTE } }

jest.mock('@/auth-portal', () => ({
  portalAuth: jest.fn(async () => sessaoAgora),
}))
jest.mock('@/lib/patients', () => ({
  getPatient: jest.fn(async () => pacienteNoBanco),
}))
jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn(async () => undefined),
}))

const marcarComTravaDoPaciente = jest.fn()
const mudarStatus = jest.fn()

jest.mock('@/lib/agenda-db', () => ({
  // WHERE dia >= hoje — sem teto para o futuro
  agendamentosFuturosDoPaciente: jest.fn(async (id: number, hoje: string) =>
    BANCO.filter((a) => a.patient_id === id && a.dia >= hoje)),
  agendamentosDoPeriodo: jest.fn(async (de: string, ate: string) =>
    BANCO.filter((a) => a.dia >= de && a.dia <= ate).map((a) => ({ ...a, nome: 'Alguem' }))),
  bloqueiosDoPeriodo: jest.fn(async () => []),
  marcarComTravaDoPaciente: (...args: unknown[]) => marcarComTravaDoPaciente(...args),
  mudarStatus: (...args: unknown[]) => mudarStatus(...args),
  duracaoValida: (n: number) => n === 10 || n === 40,
  ehFatiaOcupada: () => false,
  temPrescricao: jest.fn(async () => temPrescricaoAgora),
}))

// Importado DEPOIS dos mocks.
import { DELETE, GET, POST } from '@/app/api/portal/agenda/route'

function pedidoDeMarcar(corpo: unknown) {
  return new Request('http://localhost/api/portal/agenda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
}
function pedidoDeDesmarcar(corpo: unknown) {
  return new Request('http://localhost/api/portal/agenda', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
}

function auditoria(): jest.Mock {
  return (jest.requireMock('@/lib/audit') as { logAudit: jest.Mock }).logAudit
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
  jest.setSystemTime(AGORA)
  process.env.AGENDA_PORTAL_PACIENTES = 'todos'
  BANCO = []
  temPrescricaoAgora = true
  pacienteNoBanco = { id: PACIENTE, name: 'Paciente de Teste' }
  sessaoAgora = { user: { patient_id: PACIENTE } }
  marcarComTravaDoPaciente.mockReset()
  marcarComTravaDoPaciente.mockResolvedValue({
    ok: true,
    agendamento: linha({ id: 99, dia: '2026-11-17', hora: '14:00' }),
  })
  mudarStatus.mockReset()
  mudarStatus.mockResolvedValue(linha({ id: 1, dia: '2026-11-20', hora: '15:00', status: 'desmarcou' }))
  auditoria().mockClear()
})
afterEach(() => { jest.useRealTimers() })

describe('agendamento marcado pela equipe ALEM das 4 semanas', () => {
  // O caso que a revisão achou: a recepcionista marca para daqui a cinco
  // semanas. Se a rota só olha a janela de 4, o portal diz "nenhuma aplicação
  // marcada", o paciente marca outra, e ele fica com DOIS horários presos —
  // exatamente o que a regra de "um por vez" existe para impedir.
  beforeEach(() => {
    BANCO = [linha({ id: 7, dia: FORA_DA_JANELA, hora: '15:00' })]
  })

  it('aparece na tela do paciente e tranca o botão de marcar', async () => {
    const corpo = await (await GET()).json()
    expect(corpo.meus).toHaveLength(1)
    expect(corpo.meus[0]).toMatchObject({ id: 7, dia: FORA_DA_JANELA, hora: '15:00' })
    expect(corpo.podeMarcar).toBe(false)
  })

  it('recusa marcar um segundo horário', async () => {
    const r = await POST(pedidoDeMarcar({ dia: '2026-11-17', hora: '14:00', duracao: 10 }))
    expect(r.status).toBe(409)
    expect((await r.json()).error).toMatch(/já tem uma aplicação marcada/i)
    expect(marcarComTravaDoPaciente).not.toHaveBeenCalled()
  })

  it('pode ser desmarcado pelo próprio paciente', async () => {
    const r = await DELETE(pedidoDeDesmarcar({ id: 7 }))
    expect(r.status).toBe(200)
    expect(mudarStatus).toHaveBeenCalledWith(7, 'desmarcou', expect.any(String))
  })
})

describe('agendamento de HOJE que já aconteceu', () => {
  // O outro defeito da revisão, e o de maior frequência: às 18h, a aplicação
  // das 14h continuava na tela como "Sua próxima aplicação", com o recado
  // "avise no grupo" — e o botão de marcar logo abaixo. Três coisas que se
  // contradizem, para TODO paciente, DEPOIS DE TODA aplicação.
  beforeEach(() => {
    BANCO = [linha({ id: 8, dia: HOJE, hora: '14:00' })]
  })

  it('sai da tela e libera a próxima marcação', async () => {
    const corpo = await (await GET()).json()
    expect(corpo.meus).toHaveLength(0)
    expect(corpo.podeMarcar).toBe(true)
  })
})

describe('agendamento de hoje ainda por vir', () => {
  it('continua na tela, com as duas permissões separadas', async () => {
    // 18h30, meia hora à frente: trocar pode (decisão do dono), desmarcar não.
    BANCO = [linha({ id: 9, dia: HOJE, hora: '18:30' })]
    const corpo = await (await GET()).json()
    expect(corpo.meus).toHaveLength(1)
    expect(corpo.meus[0]).toMatchObject({ podeTrocar: true, podeDesmarcar: false })
    expect(corpo.podeMarcar).toBe(false)
  })
})

describe('recusa de acesso', () => {
  it('responde 403 TODAS as vezes, não só na primeira', async () => {
    // A resposta de recusa era um objeto só, montado uma vez e devolvido
    // sempre. Corpo de `Response` se lê UMA vez: a segunda recusa do processo
    // virava erro 500 — e o processo serve todos os pacientes.
    temPrescricaoAgora = false
    const primeira = await GET()
    const segunda = await GET()
    expect(primeira.status).toBe(403)
    expect(segunda.status).toBe(403)
    expect(await primeira.json()).toMatchObject({ error: expect.any(String) })
    expect(await segunda.json()).toMatchObject({ error: expect.any(String) })
  })

  it('sem sessão do portal, 401', async () => {
    sessaoAgora = null
    expect((await GET()).status).toBe(401)
    expect((await POST(pedidoDeMarcar({ dia: '2026-11-17', hora: '14:00', duracao: 10 }))).status).toBe(401)
    expect((await DELETE(pedidoDeDesmarcar({ id: 1 }))).status).toBe(401)
  })

  it('fora do piloto, 403', async () => {
    process.env.AGENDA_PORTAL_PACIENTES = '1,2,3'
    expect((await GET()).status).toBe(403)
  })

  it('paciente arquivado, 403 — mesmo com a sessão já aberta', async () => {
    pacienteNoBanco = { id: PACIENTE, name: 'Paciente de Teste', archived_at: '2026-11-01' }
    expect((await GET()).status).toBe(403)
    expect((await POST(pedidoDeMarcar({ dia: '2026-11-17', hora: '14:00', duracao: 10 }))).status).toBe(403)
  })

  it('sem folha na aba Prescrições, 403', async () => {
    temPrescricaoAgora = false
    expect((await GET()).status).toBe(403)
  })
})

describe('o paciente só mexe no que é dele', () => {
  it('ignora o patient_id do corpo e usa o da sessão', async () => {
    // Aceitar o id do corpo deixaria qualquer paciente marcar na agenda de
    // outro. A sessão é a única fonte.
    await POST(pedidoDeMarcar({
      dia: '2026-11-17', hora: '14:00', duracao: 10, patientId: 999, patient_id: 999,
    }))
    expect(marcarComTravaDoPaciente).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: PACIENTE }),
    )
  })

  it('não desmarca agendamento de outra pessoa', async () => {
    BANCO = [linha({ id: 50, patient_id: 777, dia: '2026-11-18', hora: '15:00' })]
    const r = await DELETE(pedidoDeDesmarcar({ id: 50 }))
    expect(r.status).toBe(404)
    expect(mudarStatus).not.toHaveBeenCalled()
  })

  it('não marca em data fora da janela que ele enxerga', async () => {
    const r = await POST(pedidoDeMarcar({ dia: FORA_DA_JANELA, hora: '15:00', duracao: 10 }))
    expect(r.status).toBe(400)
    expect(marcarComTravaDoPaciente).not.toHaveBeenCalled()
  })

  it('não marca horário que já começou hoje', async () => {
    const r = await POST(pedidoDeMarcar({ dia: HOJE, hora: '14:00', duracao: 10 }))
    expect(r.status).toBe(409)
    expect(marcarComTravaDoPaciente).not.toHaveBeenCalled()
  })
})

describe('registro de auditoria', () => {
  // Toda mudança feita pela EQUIPE grava linha de auditoria. As do paciente
  // não gravavam nada: a pergunta "quem soltou esse horário?" ficava sem
  // resposta justamente no caso em que alguém está reclamando.
  it('desmarcar pelo portal deixa rastro', async () => {
    BANCO = [linha({ id: 11, dia: '2026-11-20', hora: '15:00' })]
    await DELETE(pedidoDeDesmarcar({ id: 11 }))
    expect(auditoria()).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'agendamento',
      entityId: 11,
      patientId: PACIENTE,
    }))
  })

  it('marcar pelo portal deixa rastro', async () => {
    await POST(pedidoDeMarcar({ dia: '2026-11-17', hora: '14:00', duracao: 10 }))
    expect(auditoria()).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'agendamento',
      patientId: PACIENTE,
    }))
  })
})
