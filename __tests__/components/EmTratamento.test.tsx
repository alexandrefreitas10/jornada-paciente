// __tests__/components/EmTratamento.test.tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmTratamento } from '@/app/relatorios/EmTratamento'
import type { PacienteEmTratamento } from '@/lib/em-tratamento'

const LISTA: PacienteEmTratamento[] = [
  { patientId: 1, nome: 'BRUNO LIMA', etiqueta: 'verde', diasSemVir: 2, ultimaAplicacao: '2026-09-15T12:00:00.000Z', enviada: null },
  { patientId: 2, nome: 'Carla Dias', etiqueta: 'amarela', diasSemVir: 10, ultimaAplicacao: '2026-09-07T12:00:00.000Z', enviada: null },
  { patientId: 3, nome: 'Ana Souza', etiqueta: 'vermelha', diasSemVir: 40, ultimaAplicacao: '2026-08-08T12:00:00.000Z', enviada: null },
]

let fetchMock: jest.Mock

beforeEach(() => {
  fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
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
})
