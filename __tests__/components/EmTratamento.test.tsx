// __tests__/components/EmTratamento.test.tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmTratamento } from '@/app/relatorios/EmTratamento'
import type { PacienteEmTratamento } from '@/lib/em-tratamento'

const LISTA: PacienteEmTratamento[] = [
  { patientId: 1, nome: 'BRUNO LIMA', etiqueta: 'verde', diasSemVir: 2, ultimaAplicacao: '2026-09-15T12:00:00.000Z', ultimaFolha: null, intervalo: 7, diasAguardando: null, enviada: null },
  { patientId: 2, nome: 'Carla Dias', etiqueta: 'amarela', diasSemVir: 10, ultimaAplicacao: '2026-09-07T12:00:00.000Z', ultimaFolha: null, intervalo: 7, diasAguardando: null, enviada: null },
  { patientId: 3, nome: 'Ana Souza', etiqueta: 'vermelha', diasSemVir: 40, ultimaAplicacao: '2026-08-08T12:00:00.000Z', ultimaFolha: null, intervalo: 7, diasAguardando: null, enviada: null },
  { patientId: 4, nome: 'Davi Rocha', etiqueta: 'aguardando', diasSemVir: 12, ultimaAplicacao: '2026-09-05T12:00:00.000Z', ultimaFolha: '2026-09-12T12:00:00.000Z', intervalo: 7, diasAguardando: 5, enviada: null },
]

let fetchMock: jest.Mock

beforeEach(() => {
  fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      return { ok: true, status: 200, json: async () => ({ intervalo: JSON.parse(String(init.body)).intervalo }) }
    }
    if (url.includes('/archive')) return { ok: true, status: 200, json: async () => ({ ok: true }) }
    if (init?.method === 'POST') {
      return { ok: true, status: 201, json: async () => ({ template: 'amarela', sentBy: 'Carlos', sentAt: '2026-09-17T17:32:00.000Z' }) }
    }
    if (init?.method === 'DELETE') return { ok: true, status: 204, json: async () => null }
    return { ok: true, status: 200, json: async () => LISTA }
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

const cards = () => screen.getAllByRole('listitem')
const nomes = () => cards().map(c => within(c).getByRole('link').textContent)

describe('EmTratamento', () => {
  it('abre em Todos, com a contagem de cada sub-aba e os críticos primeiro', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(screen.getByRole('button', { name: 'Todos (3)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Não veio (2)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Veio (1)' })).toBeInTheDocument()
    expect(nomes()).toEqual(['Ana Souza', 'Carla Dias', 'BRUNO LIMA'])
  })

  it('cada paciente mostra a etiqueta da sua situação', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    const [ana, carla, bruno] = cards()
    expect(ana).toHaveTextContent('Crítico')
    expect(ana).toHaveTextContent('há 40 dias sem vir')
    expect(carla).toHaveTextContent('Faltou')
    expect(bruno).toHaveTextContent('Em dia')
    expect(bruno).not.toHaveTextContent('dias sem vir')
  })

  it('as sub-abas filtram', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(screen.getByRole('button', { name: 'Veio (1)' }))
    expect(nomes()).toEqual(['BRUNO LIMA'])
    await userEvent.click(screen.getByRole('button', { name: 'Não veio (2)' }))
    expect(nomes()).toEqual(['Ana Souza', 'Carla Dias'])
  })

  it('o nome leva ao card do paciente', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(within(cards()[0]).getByRole('link')).toHaveAttribute('href', '/pacientes/3')
  })

  it('copia a mensagem certa, com o primeiro nome', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(within(cards()[2]).getByRole('button', { name: /Copiar mensagem/ }))
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^Oi, Bruno! /))
    expect(await within(cards()[2]).findByRole('button', { name: /Copiada/ })).toBeInTheDocument()
  })

  it('marca como enviada, mostra quem marcou e atualiza o contador', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(screen.getByText('0 de 3 mensagens enviadas nesta semana')).toBeInTheDocument()

    await userEvent.click(within(cards()[1]).getByRole('button', { name: /Marcar como enviada/ }))

    expect(await within(cards()[1]).findByText(/Enviada por Carlos/)).toBeInTheDocument()
    expect(screen.getByText('1 de 3 mensagens enviadas nesta semana')).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(c => c[1]?.method === 'POST')
    expect(JSON.parse(String(post[1].body))).toEqual({ patient_id: 2, template: 'amarela' })
  })

  it('desfaz a marcação', async () => {
    const marcada = LISTA.map(p => p.patientId === 2
      ? { ...p, enviada: { template: 'amarela' as const, sentBy: 'Carlos', sentAt: '2026-09-17T17:32:00.000Z' } }
      : p)
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => marcada }))
    render(<EmTratamento />)
    await waitFor(() => expect(within(cards()[1]).getByText(/Enviada por Carlos/)).toBeInTheDocument())

    await userEvent.click(within(cards()[1]).getByRole('button', { name: /Desfazer/ }))

    expect(fetchMock).toHaveBeenCalledWith('/api/reports/em-tratamento/enviada?patient_id=2', { method: 'DELETE' })
    await waitFor(() => expect(within(cards()[1]).queryByText(/Enviada por/)).not.toBeInTheDocument())
  })

  it('a mensagem no card mantém as quebras de linha', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    const mensagem = within(cards()[2]).getByText(/Vamos ao seu acompanhamento semanal/)
    expect(mensagem).toHaveClass('whitespace-pre-line')
  })

  it('avisa quando a lista não carrega', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    render(<EmTratamento />)
    expect(await screen.findByText(/Não foi possível carregar a lista/)).toBeInTheDocument()
  })

  it('mostra mensagem própria quando a sub-aba está vazia', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => [LISTA[0]] }))
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(1))
    await userEvent.click(screen.getByRole('button', { name: 'Não veio (0)' }))
    expect(screen.getByText('Ninguém nesta lista.')).toBeInTheDocument()
  })

  it('não marca quando o POST falha', async () => {
    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) =>
      init?.method === 'POST' ? { ok: false, status: 500, json: async () => ({}) }
                              : { ok: true, status: 200, json: async () => LISTA })
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(within(cards()[1]).getByRole('button', { name: /Marcar como enviada/ }))
    expect(await within(cards()[1]).findByRole('alert')).toHaveTextContent('Não foi possível salvar a marcação')
    expect(screen.getByText('0 de 3 mensagens enviadas nesta semana')).toBeInTheDocument()
    expect(within(cards()[1]).queryByText(/Enviada por/)).not.toBeInTheDocument()
  })

  it('avisa quando copiar falha e não mostra Copiada', async () => {
    const writeText = jest.fn().mockRejectedValue(new Error('denied'))
    Object.assign(navigator, { clipboard: { writeText } })
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(within(cards()[2]).getByRole('button', { name: /Copiar mensagem/ }))
    expect(await within(cards()[2]).findByRole('alert')).toHaveTextContent('Não deu para copiar')
    expect(within(cards()[2]).queryByRole('button', { name: /Copiada/ })).not.toBeInTheDocument()
  })

  it('mostra o modelo enviado quando é diferente da etiqueta atual', async () => {
    const comModeloDiferente = LISTA.map(p => p.patientId === 3
      ? { ...p, enviada: { template: 'amarela' as const, sentBy: 'Carlos', sentAt: '2026-09-17T17:32:00.000Z' } }
      : p)
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => comModeloDiferente }))
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(cards()[0]).toHaveTextContent('(modelo faltou)')
  })

  it('a mensagem longa começa recolhida e abre pela seta', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    const bruno = cards()[2]
    const mensagem = within(bruno).getByText(/Vamos ao seu acompanhamento semanal/)
    expect(mensagem).toHaveClass('line-clamp-3')

    const seta = within(bruno).getByRole('button', { name: /Ver mensagem completa/ })
    expect(seta).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(seta)

    expect(mensagem).not.toHaveClass('line-clamp-3')
    const recolher = within(bruno).getByRole('button', { name: /Recolher/ })
    expect(recolher).toHaveAttribute('aria-expanded', 'true')
    // Abrir um card não abre os outros.
    expect(within(cards()[0]).getByRole('button', { name: /Ver mensagem completa/ })).toBeInTheDocument()
  })

  it('a seta não aparece quando o texto cabe de verdade (medido, não estimado)', async () => {
    class ResizeObserverStub {
      observe() {}
      disconnect() {}
    }
    const originalRO = (global as unknown as { ResizeObserver?: unknown }).ResizeObserver
    ;(global as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
    const clientHeightDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    const scrollHeightDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 60 })
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 60 })
    try {
      render(<EmTratamento />)
      await waitFor(() => expect(cards()).toHaveLength(3))
      const bruno = cards()[2]
      const mensagem = within(bruno).getByText(/Vamos ao seu acompanhamento semanal/)
      await waitFor(() => expect(mensagem).not.toHaveClass('line-clamp-3'))
      expect(within(bruno).queryByRole('button', { name: /Ver mensagem completa/ })).not.toBeInTheDocument()
    } finally {
      if (clientHeightDesc) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDesc)
      else delete (HTMLElement.prototype as { clientHeight?: unknown }).clientHeight
      if (scrollHeightDesc) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDesc)
      else delete (HTMLElement.prototype as { scrollHeight?: unknown }).scrollHeight
      if (originalRO === undefined) delete (global as unknown as { ResizeObserver?: unknown }).ResizeObserver
      else (global as unknown as { ResizeObserver: unknown }).ResizeObserver = originalRO
    }
  })

  it('copiar leva o texto inteiro mesmo com a mensagem recolhida', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(within(cards()[2]).getByRole('button', { name: /Copiar mensagem/ }))
    expect(writeText.mock.calls[0][0]).toContain('4 = Todos os dias')
  })

  it('só os cards 🟡 e 🔴 têm o botão de mover para Pacientes Antigos', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    const [ana, carla, bruno] = cards()
    expect(within(ana).getByRole('button', { name: /Mover para Pacientes Antigos/ })).toBeInTheDocument()
    expect(within(carla).getByRole('button', { name: /Mover para Pacientes Antigos/ })).toBeInTheDocument()
    expect(within(bruno).queryByRole('button', { name: /Mover para Pacientes Antigos/ })).not.toBeInTheDocument()
  })

  it('Confirmar só libera com um motivo de pelo menos 3 caracteres', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(within(cards()[0]).getByRole('button', { name: /Mover para Pacientes Antigos/ }))
    const confirmar = within(cards()[0]).getByRole('button', { name: 'Confirmar' })
    expect(confirmar).toBeDisabled()
    const campo = within(cards()[0]).getByLabelText(/Observações/)
    await userEvent.type(campo, '  a ')
    expect(confirmar).toBeDisabled()
    await userEvent.type(campo, 'bc')
    expect(confirmar).toBeEnabled()
  })

  it('arquivar tira o card da lista e atualiza as contagens', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(within(cards()[0]).getByRole('button', { name: /Mover para Pacientes Antigos/ }))
    await userEvent.type(within(cards()[0]).getByLabelText(/Observações/), '  Parou por custo ')
    await userEvent.click(within(cards()[0]).getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(nomes()).toEqual(['Carla Dias', 'BRUNO LIMA'])
    expect(screen.getByRole('button', { name: 'Todos (2)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Não veio (1)' })).toBeInTheDocument()
    expect(screen.getByText('0 de 2 mensagens enviadas nesta semana')).toBeInTheDocument()

    const chamada = fetchMock.mock.calls.find(c => String(c[0]).includes('/archive'))
    expect(chamada[0]).toBe('/api/patients/3/archive')
    expect(chamada[1].method).toBe('POST')
    expect(JSON.parse(String(chamada[1].body))).toEqual({ motivo: 'Parou por custo', origem: 'em_tratamento' })
  })

  it('se arquivar falha, o card fica e o aviso aparece nele', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/archive')
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => LISTA })
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(within(cards()[0]).getByRole('button', { name: /Mover para Pacientes Antigos/ }))
    await userEvent.type(within(cards()[0]).getByLabelText(/Observações/), 'Parou por custo')
    await userEvent.click(within(cards()[0]).getByRole('button', { name: 'Confirmar' }))

    expect(await within(cards()[0]).findByRole('alert')).toHaveTextContent('Não foi possível mover para Pacientes Antigos')
    expect(cards()).toHaveLength(3)
    expect(within(cards()[0]).getByLabelText(/Observações/)).toHaveValue('Parou por custo')
  })

  it('Cancelar fecha o formulário sem chamar o servidor', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(within(cards()[0]).getByRole('button', { name: /Mover para Pacientes Antigos/ }))
    await userEvent.click(within(cards()[0]).getByRole('button', { name: 'Cancelar' }))
    expect(within(cards()[0]).queryByLabelText(/Observações/)).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(c => String(c[0]).includes('/archive'))).toBe(false)
  })

  it('a 4ª sub-aba mostra só quem aguarda nova prescrição', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(nomes()).not.toContain('Davi Rocha')

    await userEvent.click(screen.getByRole('button', { name: 'Aguardando nova prescrição (1)' }))
    expect(nomes()).toEqual(['Davi Rocha'])
    const davi = cards()[0]
    expect(davi).toHaveTextContent('🔵 Aguardando')
    expect(davi).toHaveTextContent(/Prescrição finalizada em .* · há 5 dias/)
    expect(davi).not.toHaveTextContent('dias sem vir')
    expect(davi).toHaveTextContent('Oi, Davi! Tudo bem? 😊 Sua prescrição chegou ao fim')
    expect(within(davi).getByRole('button', { name: /Mover para Pacientes Antigos/ })).toBeInTheDocument()
  })

  it('marcar como enviada no 🔵 usa o modelo aguardando', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.click(screen.getByRole('button', { name: 'Aguardando nova prescrição (1)' }))
    await userEvent.click(within(cards()[0]).getByRole('button', { name: /Marcar como enviada/ }))
    const post = fetchMock.mock.calls.find(c => c[1]?.method === 'POST')
    expect(JSON.parse(String(post[1].body))).toEqual({ patient_id: 4, template: 'aguardando' })
  })

  it('a legenda explica a regra por intervalo', async () => {
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(screen.getByText(/dentro do intervalo/)).toHaveTextContent(
      '🟢 dentro do intervalo · 🟡 passou do intervalo · 🔴 mais de 28 dias (ou 2 intervalos, para quem aplica a cada 15+ dias) · 🔵 prescrição finalizada'
    )
  })

  it('mudar o intervalo salva, e quem estava em dia pelo intervalo novo vai para Veio', async () => {
    // Datas relativas a agora: a etiqueta é recalculada na hora da troca.
    const dezDiasAtras = new Date(Date.now() - 10 * 86400000).toISOString()
    const lista = LISTA.map(p => (p.patientId === 2 ? { ...p, ultimaAplicacao: dezDiasAtras, diasSemVir: 10 } : p))
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => lista }))
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(screen.getByRole('button', { name: 'Veio (1)' })).toBeInTheDocument()

    const carla = cards()[1]
    const seletor = within(carla).getByRole('combobox', { name: 'Intervalo de aplicação' })
    expect(seletor).toHaveValue('7')
    await userEvent.selectOptions(seletor, '15')

    const patch = fetchMock.mock.calls.find(c => c[1]?.method === 'PATCH')
    expect(patch[0]).toBe('/api/reports/em-tratamento/intervalo')
    expect(JSON.parse(String(patch[1].body))).toEqual({ patient_id: 2, intervalo: 15 })
    expect(await screen.findByRole('button', { name: 'Veio (2)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Não veio (1)' })).toBeInTheDocument()
    expect(within(cards()[1]).getByRole('combobox', { name: 'Intervalo de aplicação' })).toHaveValue('15')
  })

  it('se salvar o intervalo falha, volta ao valor anterior e avisa no card', async () => {
    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) =>
      init?.method === 'PATCH'
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => LISTA })
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    await userEvent.selectOptions(within(cards()[1]).getByRole('combobox', { name: 'Intervalo de aplicação' }), '15')

    expect(await within(cards()[1]).findByRole('alert')).toHaveTextContent('Não foi possível salvar o intervalo')
    expect(within(cards()[1]).getByRole('combobox', { name: 'Intervalo de aplicação' })).toHaveValue('7')
    expect(screen.getByRole('button', { name: 'Não veio (2)' })).toBeInTheDocument()
  })

  it('a marcação de enviada no meio do caminho não é desfeita quando o intervalo falha', async () => {
    let liberar!: (v: unknown) => void
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return new Promise(r => { liberar = r })
      if (init?.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ template: 'amarela', sentBy: 'Carlos', sentAt: '2026-09-17T17:32:00.000Z' }) }
      }
      return { ok: true, status: 200, json: async () => LISTA }
    })
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    const carla = cards()[1]

    await userEvent.selectOptions(within(carla).getByRole('combobox', { name: 'Intervalo de aplicação' }), '15')
    await userEvent.click(within(carla).getByRole('button', { name: /Marcar como enviada/ }))
    expect(await within(carla).findByText(/Enviada por Carlos/)).toBeInTheDocument()

    liberar({ ok: false, status: 500, json: async () => ({}) })

    expect(await within(carla).findByRole('alert')).toHaveTextContent('Não foi possível salvar o intervalo')
    expect(within(carla).getByText(/Enviada por Carlos/)).toBeInTheDocument()
    expect(within(carla).getByRole('combobox', { name: 'Intervalo de aplicação' })).toHaveValue('7')
  })

  it('salvar o intervalo em dois cards ao mesmo tempo não libera um pelo outro', async () => {
    const liberar: Record<number, (v: unknown) => void> = {}
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const { patient_id } = JSON.parse(String(init.body))
        return new Promise(r => { liberar[patient_id] = r })
      }
      return { ok: true, status: 200, json: async () => LISTA }
    })
    render(<EmTratamento />)
    await waitFor(() => expect(cards()).toHaveLength(3))
    const ana = cards()[0]
    const carla = cards()[1]

    await userEvent.selectOptions(within(ana).getByRole('combobox', { name: 'Intervalo de aplicação' }), '14')
    await userEvent.selectOptions(within(carla).getByRole('combobox', { name: 'Intervalo de aplicação' }), '15')

    liberar[2]({ ok: true, status: 200, json: async () => ({ intervalo: 15 }) })
    await waitFor(() => expect(within(carla).getByRole('combobox', { name: 'Intervalo de aplicação' })).toBeEnabled())
    expect(within(ana).getByRole('combobox', { name: 'Intervalo de aplicação' })).toBeDisabled()

    liberar[3]({ ok: true, status: 200, json: async () => ({ intervalo: 14 }) })
    await waitFor(() => expect(within(ana).getByRole('combobox', { name: 'Intervalo de aplicação' })).toBeEnabled())
  })
})
