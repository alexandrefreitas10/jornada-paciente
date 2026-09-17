// __tests__/components/RelatoriosTab.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RelatoriosTab } from '@/app/estoque/RelatoriosTab'

// Datas de hoje, para cair no período padrão (do dia 1º até hoje).
const agora = new Date().toISOString()

function mov(id: number, over: Partial<Parameters<typeof RelatoriosTab>[0]['movements'][number]>) {
  return {
    id, item_id: id, item_name: 'Item', type: 'saida' as const, quantity: 1,
    lot: null, expiry_date: null, patient_id: null, patient_name: null,
    observation: null, created_by: 'Carlos', created_at: agora, ...over,
  }
}

const movements = [
  mov(1, { item_name: 'Tirzepartida BioMeds', quantity: 5, patient_name: 'Maria Souza' }),
  mov(2, { item_name: 'Tirzepartida BioMeds', quantity: 3, patient_name: 'João Pereira' }),
  mov(3, { item_name: 'Selênio', quantity: 1, patient_name: 'Maria Souza', lot: 'L-777' }),
  mov(4, { item_name: 'Curcumina', quantity: 9, patient_name: 'Ana Lima' }),
  mov(5, { item_name: 'Curcumina', quantity: 20, type: 'entrada' }),
]

const busca = () => screen.getByRole('searchbox')

beforeEach(() => {
  // Repor Estoque busca a lista completa de itens; o resto não chama a rede.
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ id: 1, name: 'Curcumina', unit: 'un', quantity: 3, notes: null, lot: null, expiry_date: null }],
  }) as unknown as typeof fetch
})

describe('RelatoriosTab — busca', () => {
  it('mostra a lupa com a dica do relatório aberto', async () => {
    render(<RelatoriosTab movements={movements} />)
    expect(busca()).toHaveAttribute('placeholder', 'Buscar produto, paciente ou lote')
    await userEvent.click(screen.getByRole('button', { name: /Por Paciente/ }))
    expect(busca()).toHaveAttribute('placeholder', 'Buscar paciente')
  })

  it('Entradas e Saídas: filtra ignorando acento e caixa, e os totais acompanham', async () => {
    render(<RelatoriosTab movements={movements} />)
    await userEvent.type(busca(), 'TIRZEPARTIDA')
    expect(screen.getAllByText('Tirzepartida BioMeds')).toHaveLength(2)
    expect(screen.queryByText('Selênio')).not.toBeInTheDocument()
    expect(screen.getByText('-8')).toBeInTheDocument() // 5 + 3
  })

  it('Entradas e Saídas: acha por paciente e por lote', async () => {
    render(<RelatoriosTab movements={movements} />)
    await userEvent.type(busca(), 'joao')
    expect(screen.getByText('Tirzepartida BioMeds')).toBeInTheDocument()
    await userEvent.clear(busca())
    await userEvent.type(busca(), 'l-777')
    expect(screen.getByText('Selênio')).toBeInTheDocument()
    expect(screen.queryByText('Curcumina')).not.toBeInTheDocument()
  })

  it('Por Paciente: acha o paciente e mantém o total dele inteiro', async () => {
    render(<RelatoriosTab movements={movements} />)
    await userEvent.click(screen.getByRole('button', { name: /Por Paciente/ }))
    await userEvent.type(busca(), 'maria')
    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
    expect(screen.queryByText('João Pereira')).not.toBeInTheDocument()
    // As duas saídas dela, inclusive a que não é Tirzepatida.
    expect(screen.getByText('2 item(s) · 6 unidades')).toBeInTheDocument()
  })

  it('Top Saídas: o item achado mantém a posição real no ranking', async () => {
    render(<RelatoriosTab movements={movements} />)
    await userEvent.click(screen.getByRole('button', { name: /Top Saídas/ }))
    await userEvent.type(busca(), 'selenio')
    // Curcumina (9) e Tirzepatida (8) vêm antes: o Selênio é o 3º, não o 1º.
    const linha = screen.getByText('Selênio').parentElement!
    expect(linha).toHaveTextContent('3')
  })

  it('Repor Estoque: busca sem resultado NÃO diz "estoque em dia"', async () => {
    render(<RelatoriosTab movements={movements} />)
    await userEvent.click(screen.getByRole('button', { name: /Repor Estoque/ }))
    await waitFor(() => expect(screen.getByText('Curcumina')).toBeInTheDocument())
    await userEvent.type(busca(), 'zzz')
    expect(screen.getByText('Nada encontrado para "zzz".')).toBeInTheDocument()
    expect(screen.queryByText('Estoque em dia')).not.toBeInTheDocument()
    expect(screen.getByText('0 de 1')).toBeInTheDocument()
  })

  it('o × limpa a busca e a lista volta inteira', async () => {
    render(<RelatoriosTab movements={movements} />)
    await userEvent.type(busca(), 'selenio')
    expect(screen.queryByText('Curcumina')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpar busca' }))
    expect(busca()).toHaveValue('')
    expect(screen.getAllByText('Curcumina').length).toBeGreaterThan(0)
  })

  it('a busca continua ao trocar de relatório', async () => {
    render(<RelatoriosTab movements={movements} />)
    await userEvent.type(busca(), 'curcumina')
    await userEvent.click(screen.getByRole('button', { name: /Por Produto/ }))
    expect(busca()).toHaveValue('curcumina')
    expect(screen.getByText('Curcumina')).toBeInTheDocument()
    expect(screen.queryByText('Selênio')).not.toBeInTheDocument()
  })

  it('o texto copiado avisa que a lista é filtrada', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<RelatoriosTab movements={movements} />)
    await userEvent.type(busca(), 'selenio')
    await userEvent.click(screen.getByRole('button', { name: /Copiar relatório/ }))
    const texto: string = writeText.mock.calls[0][0]
    expect(texto.split('\n')[1]).toBe('Filtro: "selenio"')
    expect(texto).toContain('Selênio')
    expect(texto).not.toContain('Tirzepartida')
  })
})
