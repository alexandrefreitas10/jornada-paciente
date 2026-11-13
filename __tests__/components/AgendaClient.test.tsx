// __tests__/components/AgendaClient.test.tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AgendaClient } from '@/app/agenda/AgendaClient'

// 2026-11-13 é sexta (expediente 12h–19h). Pacientes inventados.
const HOJE = '2026-11-13'

type Ag = {
  id: number; patient_id: number; nome: string; dia: string; hora: string; duracao: 10 | 40
  status: 'agendado' | 'atendido' | 'faltou' | 'remarcou' | 'desmarcou'
  encaixe: boolean; criado_por: string | null; desmarcado_por: string | null
}
const ag = (o: Partial<Ag> & Pick<Ag, 'id' | 'patient_id' | 'nome' | 'hora'>): Ag => ({
  dia: HOJE, duracao: 10, status: 'agendado', encaixe: false, criado_por: null, desmarcado_por: null, ...o,
})

const DIA: { agendamentos: Ag[]; bloqueios: unknown[] } = {
  agendamentos: [
    ag({ id: 1, patient_id: 11, nome: 'Marta Exemplo', hora: '14:00', status: 'atendido' }),
    ag({ id: 2, patient_id: 22, nome: 'Otávio Modelo', hora: '15:10', status: 'agendado' }),
  ],
  bloqueios: [],
}

let fetchMock: jest.Mock
let resposta: { agendamentos: Ag[]; bloqueios: unknown[] }
let postResp: { status: number; body: unknown }

beforeEach(() => {
  resposta = DIA
  postResp = { status: 201, body: { agendamento: {}, aviso: null } }
  fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/patients')) {
      return { ok: true, status: 200, json: async () => [{ id: 33, name: 'Lúcia Teste' }, { id: 44, name: 'Pedro Ficticio' }] }
    }
    if (init?.method === 'POST' || init?.method === 'PATCH' || init?.method === 'DELETE') {
      return { ok: postResp.status < 400, status: postResp.status, json: async () => postResp.body }
    }
    return { ok: true, status: 200, json: async () => resposta }
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

const chamadasGet = () => fetchMock.mock.calls.map((c) => c[0] as string).filter((u) => u.startsWith('/api/agenda?'))
const linha = (nome: string) => screen.getByText(nome).closest('li') as HTMLElement

describe('AgendaClient', () => {
  it('mostra as fatias do dia e o nome em cada agendamento', async () => {
    render(<AgendaClient hoje={HOJE} />)
    await screen.findByText('Marta Exemplo')
    expect(screen.getByText('Otávio Modelo')).toBeInTheDocument()
    // sexta: 12:00 a 18:50 em fatias de 10 min
    expect(screen.getByLabelText('Horário 12:00')).toBeInTheDocument()
    expect(screen.getByLabelText('Horário 18:50')).toBeInTheDocument()
    expect(screen.queryByLabelText('Horário 19:00')).not.toBeInTheDocument()
    expect(within(screen.getByLabelText('Horário 15:10')).getByText('Otávio Modelo')).toBeInTheDocument()
  })

  it('pede a API só do dia aberto', async () => {
    render(<AgendaClient hoje={HOJE} />)
    await screen.findByText('Marta Exemplo')
    expect(chamadasGet()).toEqual([`/api/agenda?de=${HOJE}&ate=${HOJE}`])
  })

  it('o nome é um link para a ficha do paciente', async () => {
    render(<AgendaClient hoje={HOJE} />)
    const link = await screen.findByRole('link', { name: 'Marta Exemplo' })
    expect(link).toHaveAttribute('href', '/pacientes/11')
  })

  it('só o atendido mostra o atalho de saída dos ativos, com o paciente na URL', async () => {
    render(<AgendaClient hoje={HOJE} podeEstoque />)
    await screen.findByText('Marta Exemplo')
    const atalhos = screen.getAllByRole('link', { name: /registrar saída dos ativos/i })
    expect(atalhos).toHaveLength(1)
    expect(atalhos[0]).toHaveAttribute('href', '/estoque/saida?paciente=11')
    expect(within(linha('Otávio Modelo')).queryByRole('link', { name: /registrar saída/i })).not.toBeInTheDocument()
  })

  it('sem permissão de Estoque o atalho de saída não aparece', async () => {
    render(<AgendaClient hoje={HOJE} podeEstoque={false} />)
    await screen.findByText('Marta Exemplo')
    expect(screen.queryByRole('link', { name: /registrar saída/i })).not.toBeInTheDocument()
  })

  it('remarcou sai da grade e a fatia passa a oferecer "Encaixar às"', async () => {
    resposta = { agendamentos: [ag({ id: 8, patient_id: 81, nome: 'Wilson Remarcado', hora: '13:00', status: 'remarcou' })], bloqueios: [] }
    render(<AgendaClient hoje={HOJE} />)
    expect(await screen.findByRole('button', { name: 'Encaixar às 13:00' })).toBeInTheDocument()
    expect(screen.queryByText('Wilson Remarcado')).not.toBeInTheDocument()
  })

  it('faltou continua visível, e a fatia dele também oferece "Encaixar às"', async () => {
    resposta = { agendamentos: [ag({ id: 8, patient_id: 81, nome: 'Xênia Faltosa', hora: '13:00', status: 'faltou' })], bloqueios: [] }
    render(<AgendaClient hoje={HOJE} />)
    expect(await screen.findByText('Xênia Faltosa')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Encaixar às 13:00' })).toBeInTheDocument()
  })

  it('fatia dentro de um bloqueio não convida a encaixar; a anterior a ele convida', async () => {
    resposta = { agendamentos: [], bloqueios: [{ id: 1, dia: HOJE, de: '15:00', ate: '16:00', motivo: null, criado_por: null }] }
    render(<AgendaClient hoje={HOJE} />)
    await screen.findByText(/Bloqueado das 15:00/)
    expect(screen.queryByRole('button', { name: 'Encaixar às 15:30' })).not.toBeInTheDocument()
    expect(within(screen.getByLabelText('Horário 15:30')).getByText(/bloqueado/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Encaixar às 14:50' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Encaixar às 16:00' })).toBeInTheDocument()
  })

  it('alternar para Semana pede um período de 7 dias (segunda a domingo)', async () => {
    const user = userEvent.setup()
    render(<AgendaClient hoje={HOJE} />)
    await screen.findByText('Marta Exemplo')
    await user.click(screen.getByRole('button', { name: 'Semana' }))
    await waitFor(() => expect(chamadasGet()).toContain('/api/agenda?de=2026-11-09&ate=2026-11-15'))
  })

  it('encaixe: duas pessoas vivas no mesmo horário aparecem as duas, com o encaixe marcado', async () => {
    resposta = {
      agendamentos: [
        ag({ id: 5, patient_id: 51, nome: 'Rita Primeira', hora: '16:00' }),
        ag({ id: 6, patient_id: 52, nome: 'Sérgio Encaixado', hora: '16:00', encaixe: true }),
      ],
      bloqueios: [],
    }
    render(<AgendaClient hoje={HOJE} />)
    await screen.findByText('Rita Primeira')
    const slot = screen.getByLabelText('Horário 16:00')
    expect(within(slot).getByText('Rita Primeira')).toBeInTheDocument()
    expect(within(slot).getByText('Sérgio Encaixado')).toBeInTheDocument()
    expect(within(slot).getAllByText('Encaixe')).toHaveLength(1)
    expect(within(linha('Sérgio Encaixado')).getByText('Encaixe')).toBeInTheDocument()
  })

  it('encaixe fora do expediente ainda aparece (a linha existe mesmo sem fatia)', async () => {
    resposta = { agendamentos: [ag({ id: 7, patient_id: 71, nome: 'Tânia Tarde', hora: '20:30', encaixe: true })], bloqueios: [] }
    render(<AgendaClient hoje={HOJE} />)
    expect(await screen.findByText('Tânia Tarde')).toBeInTheDocument()
  })

  it('Encaixar alguém manda forcado: true e mostra o aviso devolvido', async () => {
    const user = userEvent.setup()
    postResp = { status: 201, body: { agendamento: {}, aviso: 'Este horário já está ocupado por outro agendamento.' } }
    render(<AgendaClient hoje={HOJE} />)
    await screen.findByText('Marta Exemplo')
    await user.click(screen.getByRole('button', { name: 'Encaixar alguém' }))
    await user.type(screen.getByLabelText('Buscar paciente'), 'lucia')
    await user.click(await screen.findByRole('button', { name: 'Lúcia Teste' }))
    await user.type(screen.getByLabelText(/hora/i), '15:10')
    await user.click(screen.getByRole('button', { name: 'Confirmar encaixe' }))

    const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')!
    expect(post[0]).toBe('/api/agenda')
    expect(JSON.parse(post[1].body)).toEqual({ patientId: 33, dia: HOJE, hora: '15:10', duracao: 10, forcado: true })
    expect(await screen.findByText(/já está ocupado por outro agendamento/)).toBeInTheDocument()
  })

  it('a lista de pacientes só é baixada quando se abre o encaixe', async () => {
    const user = userEvent.setup()
    render(<AgendaClient hoje={HOJE} />)
    await screen.findByText('Marta Exemplo')
    expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith('/api/patients'))).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Encaixar alguém' }))
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith('/api/patients'))).toBe(true))
  })

  it('Bloquear mostra a prévia de quem será desmarcado e, depois, a lista devolvida pelo servidor', async () => {
    const user = userEvent.setup()
    postResp = {
      status: 201,
      body: { bloqueio: {}, desmarcados: [{ id: 2, patientId: 22, nome: 'Otávio Modelo', hora: '15:10', duracao: 10 }] },
    }
    render(<AgendaClient hoje={HOJE} />)
    await screen.findByText('Marta Exemplo')
    await user.click(screen.getByRole('button', { name: 'Bloquear' }))
    const de = screen.getByLabelText('De')
    await user.clear(de); await user.type(de, '15:00')
    const ate = screen.getByLabelText('Até')
    await user.clear(ate); await user.type(ate, '16:00')
    // prévia, antes de confirmar
    expect(screen.getByText(/Serão desmarcados \(1\)/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar bloqueio' }))

    const post = fetchMock.mock.calls.find((c) => c[0] === '/api/agenda/bloqueios')!
    expect(JSON.parse(post[1].body)).toEqual({ dia: HOJE, de: '15:00', ate: '16:00' })
    // a lista oficial fica na tela, com link para a ficha
    const painel = (await screen.findByText(/avise pelo WhatsApp/)).closest('div[role="status"]') as HTMLElement
    expect(within(painel).getByRole('link', { name: 'Otávio Modelo' })).toHaveAttribute('href', '/pacientes/22')
  })

  it('trocar o status chama PATCH com o novo status', async () => {
    const user = userEvent.setup()
    render(<AgendaClient hoje={HOJE} />)
    await screen.findByText('Otávio Modelo')
    await user.click(within(linha('Otávio Modelo')).getByRole('button', { name: 'Faltou' }))
    const patch = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')!
    expect(patch[0]).toBe('/api/agenda/2')
    expect(JSON.parse(patch[1].body)).toEqual({ status: 'faltou' })
  })

  it('reviver faltou/remarcou para agendado avisa que o horário não é conferido, e só grava depois de confirmar', async () => {
    const user = userEvent.setup()
    resposta = { agendamentos: [ag({ id: 9, patient_id: 91, nome: 'Vera Faltosa', hora: '13:00', status: 'faltou' })], bloqueios: [] }
    render(<AgendaClient hoje={HOJE} />)
    await screen.findByText('Vera Faltosa')
    await user.click(within(linha('Vera Faltosa')).getByRole('button', { name: 'Agendado' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/sem conferir de novo/)
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Voltar mesmo assim' }))
    const patch = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')!
    expect(JSON.parse(patch[1].body)).toEqual({ status: 'agendado' })
  })

  it('trocar a duração mostra o aviso do servidor', async () => {
    const user = userEvent.setup()
    postResp = { status: 200, body: { agendamento: {}, aviso: 'Um atendimento de 40 minutos às 18:50 passaria da hora em que a clínica fecha.' } }
    render(<AgendaClient hoje={HOJE} />)
    await screen.findByText('Otávio Modelo')
    await user.click(within(linha('Otávio Modelo')).getByRole('button', { name: '40 min' }))
    expect(await screen.findByText(/passaria da hora em que a clínica fecha/)).toBeInTheDocument()
  })
})
