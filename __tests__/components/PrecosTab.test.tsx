// __tests__/components/PrecosTab.test.tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrecosTab } from '@/app/estoque/PrecosTab'
import type { GrupoPreco } from '@/lib/precos'

const GRUPOS: GrupoPreco[] = [
  {
    produto: 'HMB', laboratorio: 'BioMeds', chave: 'hmb|biomeds',
    historico: [
      { centavos: 13000, quantidade: 10, unidade: 'frasco', data: '2026-09-20', fonte: 'nf' },
      { centavos: 10000, quantidade: 10, unidade: 'frasco', data: '2026-08-10', fonte: 'nf' },
    ],
  },
  {
    produto: 'Curcumina', laboratorio: 'Formedica', chave: 'curcumina|formedica',
    historico: [
      { centavos: 10600, quantidade: 5, unidade: 'frasco', data: '2026-09-18', fonte: 'manual' },
      { centavos: 10000, quantidade: 5, unidade: 'frasco', data: '2026-07-01', fonte: 'retroativo' },
    ],
  },
  {
    produto: 'Pill Food', laboratorio: 'BioMeds', chave: 'pill food|biomeds',
    historico: [{ centavos: 8200, quantidade: 1, unidade: 'frasco', data: '2026-09-01', fonte: 'retroativo' }],
  },
]

let fetchMock: jest.Mock

beforeEach(() => {
  fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => GRUPOS }))
  global.fetch = fetchMock as unknown as typeof fetch
})

const linhas = () => screen.getAllByRole('listitem')

describe('PrecosTab', () => {
  it('lista por produto e laboratório, maior aumento primeiro', async () => {
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    expect(linhas().map(l => within(l).getByRole('heading').textContent)).toEqual([
      'HMB · BioMeds', 'Curcumina · Formedica', 'Pill Food · BioMeds',
    ])
  })

  it('mostra o último valor, a data e a variação', async () => {
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    const hmb = linhas()[0]
    expect(hmb).toHaveTextContent('R$ 130,00')
    expect(hmb).toHaveTextContent('/ frasco')
    expect(hmb).toHaveTextContent('20/09/2026')
    expect(hmb).toHaveTextContent('+30,0%')
    expect(hmb).toHaveTextContent('🔴')
  })

  it('aumento entre 5% e 10% é atenção; primeira compra não tem percentual', async () => {
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    expect(linhas()[1]).toHaveTextContent('🟡')
    expect(linhas()[2]).toHaveTextContent('primeira compra')
    expect(linhas()[2]).not.toHaveTextContent('%')
  })

  it('abre o histórico do par', async () => {
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    await userEvent.click(within(linhas()[0]).getByRole('button', { name: /histórico/i }))
    // A ordem importa: o mais recente primeiro.
    expect(within(linhas()[0]).getAllByText(/^\d{2}\/\d{2}\/\d{4}$/).map(n => n.textContent))
      .toEqual(['20/09/2026', '10/08/2026'])
    expect(within(linhas()[0]).getByText(/10\/08\/2026/)).toBeInTheDocument()
    expect(within(linhas()[0]).getByText(/R\$ 100,00/)).toBeInTheDocument()
  })

  it('busca por produto e por laboratório', async () => {
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    const busca = screen.getByRole('searchbox')
    await userEvent.type(busca, 'formedica')
    expect(linhas()).toHaveLength(1)
    expect(linhas()[0]).toHaveTextContent('Curcumina')
    await userEvent.clear(busca)
    await userEvent.type(busca, 'pill')
    expect(linhas()).toHaveLength(1)
  })

  it('avisa quando não há nada registrado', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => [] }))
    render(<PrecosTab />)
    expect(await screen.findByText(/Nenhum preço registrado ainda/)).toBeInTheDocument()
  })

  it('avisa quando a lista não carrega', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    render(<PrecosTab />)
    expect(await screen.findByText(/Não foi possível carregar/)).toBeInTheDocument()
  })

  it('queda de preço aparece em verde, com o sinal', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: true, status: 200, json: async () => [{
        produto: 'Baiba', laboratorio: 'BioMeds', chave: 'baiba|biomeds',
        historico: [
          { centavos: 9000, quantidade: 1, unidade: 'frasco', data: '2026-09-20', fonte: 'nf' },
          { centavos: 10000, quantidade: 1, unidade: 'frasco', data: '2026-08-10', fonte: 'nf' },
        ],
      }],
    }))
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(linhas()[0]).toHaveTextContent('🟢')
    expect(linhas()[0]).toHaveTextContent('-10,0%')
    expect(linhas()[0]).not.toHaveTextContent('🔴')
  })

  it('unidade diferente na compra anterior: diz o que mudou, sem percentual', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: true, status: 200, json: async () => [{
        produto: 'Curcumina', laboratorio: 'Formedica', chave: 'curcumina|formedica',
        historico: [
          { centavos: 90000, quantidade: 1, unidade: 'caixa', data: '2026-09-20', fonte: 'nf' },
          { centavos: 10000, quantidade: 1, unidade: 'frasco', data: '2026-08-10', fonte: 'nf' },
        ],
      }],
    }))
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(linhas()[0]).toHaveTextContent('unidade mudou')
    expect(linhas()[0]).toHaveTextContent('frasco → caixa')
    expect(linhas()[0]).not.toHaveTextContent('%')
  })
})
