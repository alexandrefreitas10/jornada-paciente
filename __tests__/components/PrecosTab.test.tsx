// __tests__/components/PrecosTab.test.tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  // ── Notas antigas (retroativo) ──────────────────────────────
  const arquivo = () => new File(['x'], 'nota.jpg', { type: 'image/jpeg' })

  const lida = (itens: unknown[], s3Key: string | null = 'stock-entries/nf/1.jpg') =>
    ({ ok: true, status: 200, json: async () => ({ items: itens, s3Key }) })

  it('trava o salvar da nota antiga enquanto faltar valor, laboratório ou data', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('scan-nf')
        ? lida([{ name: 'HMB', quantity: 10, unit: 'frasco', unit_price: '', laboratory: 'BioMeds', purchase_date: '2026-05-10' }])
        : { ok: true, status: 200, json: async () => GRUPOS })
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    await userEvent.upload(screen.getByLabelText('Foto ou PDF da nota antiga'), arquivo())

    const salvar = await screen.findByRole('button', { name: 'Salvar preços' })
    expect(salvar).toBeDisabled()
    expect(screen.getByText(/Falta valor, laboratório ou quantidade em: HMB/)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Valor unitário 1'), '100,00')
    expect(salvar).toBeEnabled()

    // Sem data não salva: a data é o que põe a compra na linha do tempo.
    fireEvent.change(screen.getByLabelText('Data da compra'), { target: { value: '' } })
    expect(salvar).toBeDisabled()
    expect(screen.getByText(/Informe a data da compra/)).toBeInTheDocument()
  })

  it('a leitura da nota aceita número no valor e na quantidade sem quebrar', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('scan-nf')
        ? lida([{ name: 'HMB', quantity: 10, unit: 'frasco', unit_price: 100, laboratory: 'BioMeds', purchase_date: null }, null])
        : { ok: true, status: 200, json: async () => GRUPOS })
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    await userEvent.upload(screen.getByLabelText('Foto ou PDF da nota antiga'), arquivo())

    // 100 (número) não é valor brasileiro válido em centavos? é: "100" → R$ 100,00.
    expect((await screen.findByLabelText('Valor unitário 1')) as HTMLInputElement).toHaveValue('100')
    // Sem data na nota, cai no dia de hoje (AAAA-MM-DD) e o salvar libera.
    expect(screen.getByLabelText('Data da compra')).toHaveValue(
      new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))
    expect(screen.getByRole('button', { name: 'Salvar preços' })).toBeEnabled()
  })

  it('salva os preços da nota antiga, sem dar entrada, e recarrega a lista', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('scan-nf')) {
        return lida([{ name: 'HMB', quantity: 10, unit: 'frasco', unit_price: '100,00', laboratory: 'BioMeds', purchase_date: '2026-05-10' }])
      }
      if (init?.method === 'POST') return { ok: true, status: 201, json: async () => ({ registrados: 1 }) }
      return { ok: true, status: 200, json: async () => GRUPOS }
    })
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    await userEvent.upload(screen.getByLabelText('Foto ou PDF da nota antiga'), arquivo())
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar preços' }))

    const posts = fetchMock.mock.calls.filter(c => c[1]?.method === 'POST')
    // Duas chamadas POST no fluxo, e só duas: a leitura e o registro dos preços.
    expect(posts.map(c => String(c[0]))).toEqual(['/api/estoque/scan-nf', '/api/estoque/precos'])
    const post = posts[1]
    expect(JSON.parse(String(post[1].body))).toEqual({
      itens: [{
        produto: 'HMB', valor: '100,00', laboratorio: 'BioMeds', quantidade: 10,
        unidade: 'frasco', data: '2026-05-10', nfS3Key: 'stock-entries/nf/1.jpg',
      }],
    })
    // Nada de entrada de estoque: só a leitura, o POST de preços e os GETs.
    expect(fetchMock.mock.calls.map(c => String(c[0]))).toEqual(
      expect.arrayContaining(['/api/estoque/precos']))
    expect(fetchMock.mock.calls.filter(c => /items|movements|stock-entr/.test(String(c[0])))).toHaveLength(0)
    // Formulário some e a lista é relida.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Salvar preços' })).not.toBeInTheDocument())
    expect(fetchMock.mock.calls.filter(c => String(c[0]) === '/api/estoque/precos' && !c[1]?.method)).toHaveLength(2)
  })

  it('se a recarga depois de salvar falha, avisa sem apagar a lista', async () => {
    let gets = 0
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('scan-nf')) {
        return lida([{ name: 'HMB', quantity: 10, unit: 'frasco', unit_price: '100,00', laboratory: 'BioMeds', purchase_date: '2026-05-10' }])
      }
      if (init?.method === 'POST') return { ok: true, status: 201, json: async () => ({ registrados: 1 }) }
      gets += 1
      return gets > 1
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => GRUPOS }
    })
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    await userEvent.upload(screen.getByLabelText('Foto ou PDF da nota antiga'), arquivo())
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar preços' }))

    // Salvou, mas a lista na tela ficou velha: o aviso não pode ficar invisível.
    expect(await screen.findByText(/Não foi possível carregar/)).toBeInTheDocument()
    expect(linhas()).toHaveLength(3)
  })

  it('se o salvar falha, o que foi digitado continua na tela', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('scan-nf')) {
        return lida([{ name: 'HMB', quantity: 10, unit: 'frasco', unit_price: '100,00', laboratory: 'BioMeds', purchase_date: '2026-05-10' }])
      }
      // Corpo que não é JSON (um HTML de proxy, por exemplo): sobra a genérica.
      if (init?.method === 'POST') return { ok: false, status: 500, json: async () => { throw new Error('não é JSON') } }
      return { ok: true, status: 200, json: async () => GRUPOS }
    })
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    await userEvent.upload(screen.getByLabelText('Foto ou PDF da nota antiga'), arquivo())
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar preços' }))

    expect(await screen.findByText(/Não foi possível salvar os preços/)).toBeInTheDocument()
    expect(screen.getByLabelText('Produto 1')).toHaveValue('HMB')
    expect(screen.getByLabelText('Valor unitário 1')).toHaveValue('100,00')
  })

  // Sem o motivo do servidor, 403 (sessão expirada) e o teto de itens viravam
  // o mesmo "tente de novo" — e a tentativa seguinte falhava igual.
  it('o motivo do servidor chega à tela em vez da mensagem genérica', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('scan-nf')) {
        return lida([{ name: 'HMB', quantity: 10, unit: 'frasco', unit_price: '100,00', laboratory: 'BioMeds', purchase_date: '2026-05-10' }])
      }
      if (init?.method === 'POST') return { ok: false, status: 403, json: async () => ({ error: 'Sessão expirada. Entre de novo.' }) }
      return { ok: true, status: 200, json: async () => GRUPOS }
    })
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    await userEvent.upload(screen.getByLabelText('Foto ou PDF da nota antiga'), arquivo())
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar preços' }))

    expect(await screen.findByText('Sessão expirada. Entre de novo.')).toBeInTheDocument()
    expect(screen.queryByText(/Não foi possível salvar os preços/)).not.toBeInTheDocument()
    // O que foi digitado continua na tela para a correção.
    expect(screen.getByLabelText('Produto 1')).toHaveValue('HMB')
  })

  it('o botão da nota antiga continua na tela quando a lista não carrega', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    render(<PrecosTab />)
    expect(await screen.findByText(/Não foi possível carregar/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Registrar preços de nota antiga/ })).toBeInTheDocument()
  })

  it('resposta fora do formato não derruba a aba', async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ error: 'opa' }) }))
    render(<PrecosTab />)
    expect(await screen.findByText(/Não foi possível carregar/)).toBeInTheDocument()
  })

  it('grupo sem histórico é descartado em vez de quebrar o render', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true, status: 200,
      json: async () => [{ produto: 'Vazio', laboratorio: 'X', chave: 'vazio|x', historico: [] }, ...GRUPOS],
    }))
    render(<PrecosTab />)
    await waitFor(() => expect(linhas()).toHaveLength(3))
    expect(screen.queryByText(/Vazio/)).not.toBeInTheDocument()
  })
})
