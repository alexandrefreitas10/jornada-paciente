// __tests__/components/SaidaPaciente.test.tsx
// Atalho da Agenda: /estoque/saida?paciente=<id>. Câmera/QR ficam de fora.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('depois de finalizar a saída pelo atalho da Agenda', () => {
  // O caso real, relatado pelo dono em 17/11/2026: o enfermeiro concluiu o
  // atendimento, deu saída nas medicações, e a tela mostrou "Medicação não
  // encontrada" — mas a baixa TINHA sido gravada, no estoque e no card do
  // paciente. A gravação sempre esteve certa; quem estava errada era a tela.
  //
  // Por que isso é perigoso e não só feio: diante de um X vermelho, a reação
  // natural é refazer. Como o carrinho é limpo ao gravar, refazer significa
  // escanear de novo, com chaves de idempotência NOVAS — e aí a baixa sai em
  // dobro, no estoque de uma clínica.

  function respostas() {
    return jest.fn(async (url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: true, status: 201, json: async () => ({ ok: true }) }
      if (String(url).startsWith('/api/patients')) {
        return { ok: true, status: 200, json: async () => [{ id: 11, name: 'Marta Exemplo' }] }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    }) as unknown as typeof fetch
  }

  it('mostra a confirmação de sucesso, e não "Medicação não encontrada"', async () => {
    localStorage.setItem('saida_cart', JSON.stringify(CARRINHO_VELHO))
    params = new URLSearchParams('paciente=11')
    global.fetch = respostas()
    const user = userEvent.setup()
    render(<SaidaPage />)

    // Carrinho aberto com o item escaneado.
    expect(await screen.findByText('Soro Exemplo')).toBeInTheDocument()

    // Escolhe o paciente e finaliza.
    await user.click(screen.getByPlaceholderText('Buscar paciente...'))
    await user.click(await screen.findByText('Marta Exemplo'))
    const finalizar = await screen.findByRole('button', { name: /finalizar|registrar sa/i })
    await user.click(finalizar)

    // O que o enfermeiro precisa ver é que deu certo.
    expect(await screen.findByText(/sa[ií]da registrada|registrada com sucesso|pronto/i)).toBeInTheDocument()
    expect(screen.queryByText('Medicação não encontrada.')).not.toBeInTheDocument()
  })
})
