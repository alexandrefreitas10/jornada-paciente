import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Agendamentos } from '@/app/relatorios/Agendamentos'

// Nomes e dados INVENTADOS.

const PACIENTES = [
  { id: 12, name: 'Paciente Inventado' },
  { id: 34, name: 'Outra Pessoa Inventada' },
]

const AGENDAMENTOS = [
  { id: 1, patient_id: 12, nome: 'Paciente Inventado', dia: '2026-11-10', hora: '15:00', duracao: 10, status: 'atendido', encaixe: false, criado_por: 'Recepção', desmarcado_por: null },
  { id: 2, patient_id: 34, nome: 'Outra Pessoa Inventada', dia: '2026-11-11', hora: '14:00', duracao: 40, status: 'faltou', encaixe: false, criado_por: 'Recepção', desmarcado_por: null },
  { id: 3, patient_id: 12, nome: 'Paciente Inventado', dia: '2026-11-12', hora: '16:00', duracao: 10, status: 'desmarcou', encaixe: false, criado_por: null, desmarcado_por: 'o próprio paciente' },
  { id: 4, patient_id: 34, nome: 'Outra Pessoa Inventada', dia: '2026-11-13', hora: '14:30', duracao: 10, status: 'atendido', encaixe: false, criado_por: 'Recepção', desmarcado_por: null },
]

/** Dublê de fetch que guarda as URLs pedidas. */
function servidor(resposta: { ok?: boolean; status?: number; corpo: unknown }) {
  const urls: string[] = []
  const fn = jest.fn(async (url: unknown) => {
    urls.push(String(url))
    return {
      ok: resposta.ok ?? true,
      status: resposta.status ?? 200,
      json: async () => resposta.corpo,
    }
  })
  global.fetch = fn as unknown as typeof fetch
  return urls
}

beforeEach(() => { jest.useRealTimers() })
afterEach(() => { jest.useRealTimers() })

/**
 * Dublê que separa a busca do período (GET) da correção de status (PATCH).
 * `respostaPatch` decide o que o servidor responde à correção.
 */
function servidorComPatch(respostaPatch: { ok: boolean; status: number; corpo: unknown }) {
  const chamadas: { url: string; metodo: string; corpo?: unknown }[] = []
  const fn = jest.fn(async (url: unknown, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET'
    chamadas.push({
      url: String(url),
      metodo,
      corpo: init?.body ? JSON.parse(init.body as string) : undefined,
    })
    if (metodo === 'PATCH') {
      return { ok: respostaPatch.ok, status: respostaPatch.status, json: async () => respostaPatch.corpo }
    }
    return { ok: true, status: 200, json: async () => ({ agendamentos: AGENDAMENTOS, bloqueios: [] }) }
  })
  global.fetch = fn as unknown as typeof fetch
  return chamadas
}

/** Dublê que responde diferente para o período e para o histórico de um paciente. */
function servidorComHistorico(historico: unknown[]) {
  const urls: string[] = []
  const fn = jest.fn(async (url: unknown) => {
    const u = String(url)
    urls.push(u)
    if (u.startsWith('/api/reports/agendamentos/')) {
      return { ok: true, status: 200, json: async () => ({ agendamentos: historico }) }
    }
    return { ok: true, status: 200, json: async () => ({ agendamentos: AGENDAMENTOS, bloqueios: [] }) }
  })
  global.fetch = fn as unknown as typeof fetch
  return urls
}

const HISTORICO_ANTIGO = [
  { id: 90, patient_id: 12, nome: 'Paciente Inventado', dia: '2026-03-02', hora: '15:00', duracao: 10, status: 'atendido', encaixe: false, criado_por: 'Recepção', desmarcado_por: null },
  { id: 91, patient_id: 12, nome: 'Paciente Inventado', dia: '2026-02-24', hora: '15:00', duracao: 40, status: 'remarcou', encaixe: false, criado_por: 'Recepção', desmarcado_por: null },
]

describe('Relatórios › Agendamentos — histórico de um paciente', () => {
  it('escolher um paciente busca o histórico completo dele', async () => {
    const urls = servidorComHistorico(HISTORICO_ANTIGO)
    const user = userEvent.setup()
    render(<Agendamentos patients={PACIENTES} />)
    await screen.findByRole('table')

    await user.selectOptions(screen.getByLabelText('Paciente'), '12')

    await waitFor(() => {
      expect(urls.some((u) => u === '/api/reports/agendamentos/12')).toBe(true)
    })
    // Agendamento de março, muito fora de qualquer período de quatro semanas.
    expect(await screen.findByText(/seg 02\/03/)).toBeInTheDocument()
  })

  it('no modo paciente, os campos de período somem', async () => {
    servidorComHistorico(HISTORICO_ANTIGO)
    const user = userEvent.setup()
    render(<Agendamentos patients={PACIENTES} />)
    await screen.findByRole('table')
    expect(screen.getByLabelText('De')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Paciente'), '12')

    // Filtrar o histórico de uma pessoa por data responderia a pergunta errada.
    await waitFor(() => expect(screen.queryByLabelText('De')).toBeNull())
    expect(screen.queryByLabelText('Até')).toBeNull()
  })

  it('paciente sem nenhum agendamento diz isso', async () => {
    servidorComHistorico([])
    const user = userEvent.setup()
    render(<Agendamentos patients={PACIENTES} />)
    await screen.findByRole('table')

    await user.selectOptions(screen.getByLabelText('Paciente'), '34')

    expect(await screen.findByText(/nunca teve agendamento/i)).toBeInTheDocument()
  })

  it('voltar para todos os pacientes devolve a lista do período', async () => {
    servidorComHistorico(HISTORICO_ANTIGO)
    const user = userEvent.setup()
    render(<Agendamentos patients={PACIENTES} />)
    await screen.findByRole('table')

    await user.selectOptions(screen.getByLabelText('Paciente'), '12')
    await screen.findByText(/seg 02\/03/)

    await user.selectOptions(screen.getByLabelText('Paciente'), '')

    expect(await screen.findByLabelText('De')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Todos \(4\)/ })).toBeInTheDocument()
  })
})

describe('Relatórios › Agendamentos — corrigir o status', () => {
  const SELECT_DA_FALTA = 'Status de Outra Pessoa Inventada, qua 11/11 14:00'

  it('mudar o status manda PATCH para o agendamento certo', async () => {
    const chamadas = servidorComPatch({
      ok: true, status: 200,
      corpo: { agendamento: { ...AGENDAMENTOS[1], status: 'atendido' } },
    })
    const user = userEvent.setup()
    render(<Agendamentos patients={PACIENTES} />)

    const select = await screen.findByLabelText(SELECT_DA_FALTA)
    await user.selectOptions(select, 'atendido')

    await waitFor(() => {
      const patch = chamadas.find((c) => c.metodo === 'PATCH')
      expect(patch).toBeDefined()
      expect(patch!.url).toBe('/api/agenda/2')
      expect(patch!.corpo).toEqual({ status: 'atendido' })
    })
  })

  it('depois de gravar, a linha e os números acompanham', async () => {
    servidorComPatch({
      ok: true, status: 200,
      corpo: { agendamento: { ...AGENDAMENTOS[1], status: 'atendido' } },
    })
    const user = userEvent.setup()
    render(<Agendamentos patients={PACIENTES} />)

    expect(await screen.findByRole('button', { name: /Atendido \(2\)/ })).toBeInTheDocument()
    await user.selectOptions(await screen.findByLabelText(SELECT_DA_FALTA), 'atendido')

    expect(await screen.findByRole('button', { name: /Atendido \(3\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Faltou \(0\)/ })).toBeInTheDocument()
  })

  it('se o agendamento sumiu (404), avisa e não finge que gravou', async () => {
    // Sem isto o <select> fica mostrando o valor novo e o dono acredita que
    // corrigiu — justamente na tela que ele abre para conferir.
    servidorComPatch({ ok: false, status: 404, corpo: { error: 'Agendamento não encontrado.' } })
    const user = userEvent.setup()
    render(<Agendamentos patients={PACIENTES} />)

    await user.selectOptions(await screen.findByLabelText(SELECT_DA_FALTA), 'atendido')

    expect(await screen.findByRole('alert')).toHaveTextContent(/não encontrado/i)
    // Voltou ao que era: a linha continua sendo uma falta.
    expect(await screen.findByLabelText(SELECT_DA_FALTA)).toHaveValue('faltou')
    expect(screen.getByRole('button', { name: /Faltou \(1\)/ })).toBeInTheDocument()
  })
})

describe('Relatórios › Agendamentos — lista do período', () => {
  it('mostra cada agendamento com dia, hora, nome e status', async () => {
    servidor({ corpo: { agendamentos: AGENDAMENTOS, bloqueios: [] } })
    render(<Agendamentos patients={PACIENTES} />)

    // Cada pessoa aparece nas DUAS linhas que são dela — o relatório lista
    // agendamentos, não pacientes.
    expect(await screen.findAllByText('Paciente Inventado', { selector: 'a' })).toHaveLength(2)
    expect(screen.getAllByText('Outra Pessoa Inventada', { selector: 'a' })).toHaveLength(2)
    // O status de cada linha, na palavra da clínica e não na do banco.
    expect(screen.getByLabelText('Status de Outra Pessoa Inventada, qua 11/11 14:00')).toHaveValue('faltou')
    expect(screen.getByLabelText('Status de Paciente Inventado, qui 12/11 16:00')).toHaveValue('desmarcou')
    // E o que a pessoa lê é "Faltou", não "faltou".
    expect(screen.getAllByRole('option', { name: 'Faltou' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('option', { name: 'faltou' })).toBeNull()
  })

  it('o nome do paciente é link para a ficha dele', async () => {
    servidor({ corpo: { agendamentos: AGENDAMENTOS, bloqueios: [] } })
    render(<Agendamentos patients={PACIENTES} />)

    const links = await screen.findAllByText('Outra Pessoa Inventada', { selector: 'a' })
    for (const link of links) expect(link).toHaveAttribute('href', '/pacientes/34')
  })

  it('os botões de status mostram quantos são de cada', async () => {
    servidor({ corpo: { agendamentos: AGENDAMENTOS, bloqueios: [] } })
    render(<Agendamentos patients={PACIENTES} />)

    expect(await screen.findByRole('button', { name: /Todos \(4\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Atendido \(2\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Faltou \(1\)/ })).toBeInTheDocument()
    // Zero aparece: "ninguém remarcou" é informação.
    expect(screen.getByRole('button', { name: /Remarcou \(0\)/ })).toBeInTheDocument()
  })

  it('filtrar por Faltou deixa só as faltas na tela', async () => {
    servidor({ corpo: { agendamentos: AGENDAMENTOS, bloqueios: [] } })
    const user = userEvent.setup()
    render(<Agendamentos patients={PACIENTES} />)

    await user.click(await screen.findByRole('button', { name: /Faltou \(1\)/ }))

    const lista = screen.getByRole('table')
    expect(within(lista).getByText('Outra Pessoa Inventada', { selector: 'a' })).toBeInTheDocument()
    expect(within(lista).queryByText('Paciente Inventado', { selector: 'a' })).toBeNull()
    // A contagem NÃO muda com o filtro: ela é do período, não do que está à vista.
    expect(screen.getByRole('button', { name: /Atendido \(2\)/ })).toBeInTheDocument()
  })

  it('período sem agendamento diz isso, em vez de tabela vazia', async () => {
    servidor({ corpo: { agendamentos: [], bloqueios: [] } })
    render(<Agendamentos patients={PACIENTES} />)

    expect(await screen.findByText(/nenhum agendamento neste período/i)).toBeInTheDocument()
  })

  it('período longo demais mostra o recado do servidor', async () => {
    // A rota recusa acima de 62 dias. Engolir o erro faria o dono ler
    // "nenhum agendamento" num trimestre cheio deles.
    servidor({
      ok: false, status: 400,
      corpo: { error: 'Período longo demais: no máximo 62 dias por consulta.' },
    })
    render(<Agendamentos patients={PACIENTES} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/período longo demais/i)
    expect(screen.queryByText(/nenhum agendamento neste período/i)).toBeNull()
  })

  it('o período padrão vem do fuso da clínica, não do relógio da máquina', async () => {
    // 30/11/2026 às 23h30 de Brasília = 01/12 às 02h30 em UTC. Com
    // `new Date().getMonth()` numa máquina em UTC, o mês já seria dezembro e o
    // dono abriria o relatório no mês errado.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
    jest.setSystemTime(new Date('2026-12-01T02:30:00Z'))
    const urls = servidor({ corpo: { agendamentos: [], bloqueios: [] } })
    render(<Agendamentos patients={PACIENTES} />)

    // Esperar a tela assentar, não só a chamada sair: sem isto o componente
    // ainda atualiza estado depois do teste e o React reclama.
    expect(await screen.findByText(/nenhum agendamento neste período/i)).toBeInTheDocument()
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('de=2026-11-01')
    expect(urls[0]).toContain('ate=2026-12-31')
  })

  it('mudar o período busca de novo com as datas novas', async () => {
    const urls = servidor({ corpo: { agendamentos: [], bloqueios: [] } })
    const user = userEvent.setup()
    render(<Agendamentos patients={PACIENTES} />)
    expect(await screen.findByText(/nenhum agendamento neste período/i)).toBeInTheDocument()
    expect(urls).toHaveLength(1)

    await user.clear(screen.getByLabelText('De'))
    await user.type(screen.getByLabelText('De'), '2026-10-01')

    await waitFor(() => {
      expect(urls[urls.length - 1]).toContain('de=2026-10-01')
    })
    expect(await screen.findByText(/nenhum agendamento neste período/i)).toBeInTheDocument()
  })
})
