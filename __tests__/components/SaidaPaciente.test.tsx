// __tests__/components/SaidaPaciente.test.tsx
// Atalho da Agenda: /estoque/saida?paciente=<id>. Câmera/QR ficam de fora.
import { render, screen } from '@testing-library/react'
import SaidaPage from '@/app/estoque/saida/page'

let params = new URLSearchParams()
jest.mock('next/navigation', () => ({ useSearchParams: () => params }))

const CARRINHO_VELHO = [
  { item: { id: 7, name: 'Soro Exemplo', unit: 'un', quantity: 5, lot: null, expiry_date: null }, quantity: 1, idem: 'x' },
]

beforeEach(() => {
  localStorage.clear()
  params = new URLSearchParams()
  global.fetch = jest.fn(async () => ({
    ok: true, status: 200, json: async () => [{ id: 11, name: 'Marta Exemplo' }, { id: 12, name: 'Otávio Modelo' }],
  })) as unknown as typeof fetch
})

describe('/estoque/saida com ?paciente', () => {
  it('sem parâmetro nenhum: "Medicação não encontrada", como sempre', async () => {
    render(<SaidaPage />)
    expect(await screen.findByText('Medicação não encontrada.')).toBeInTheDocument()
  })

  it('?paciente com carrinho vazio: abre o carrinho com o paciente escolhido e o aviso', async () => {
    params = new URLSearchParams('paciente=11')
    render(<SaidaPage />)
    expect(await screen.findByText('Marta Exemplo')).toBeInTheDocument()
    expect(screen.getByText(/Escaneie o primeiro item/)).toBeInTheDocument()
    expect(screen.queryByText('Medicação não encontrada.')).not.toBeInTheDocument()
  })

  it('?paciente com carrinho pendente: NÃO pré-seleciona e explica', async () => {
    localStorage.setItem('saida_cart', JSON.stringify(CARRINHO_VELHO))
    params = new URLSearchParams('paciente=11')
    render(<SaidaPage />)
    expect(await screen.findByText('Soro Exemplo')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/carrinho pendente de outro atendimento/)
    expect(screen.getByRole('alert')).toHaveTextContent('Marta Exemplo')
    // sem paciente escolhido: o campo de busca aparece, e não o chip do paciente
    expect(screen.getByPlaceholderText('Buscar paciente...')).toBeInTheDocument()
    // o nome aparece UMA vez (no <strong> do alerta); com o paciente pré-selecionado
    // apareceria também no chip violeta do campo Paciente
    expect(screen.getAllByText('Marta Exemplo')).toHaveLength(1)
  })
})
