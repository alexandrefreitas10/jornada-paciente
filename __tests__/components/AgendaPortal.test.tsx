import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Agenda } from '@/components/portal/screens/Agenda'

// Nomes e dados INVENTADOS.
const AVISO = 'Para remarcar com menos de 1h de antecedência, favor avisar no grupo de suporte pelo WhatsApp.'

function responder(dados: unknown) {
  return jest.fn(async () => ({ ok: true, json: async () => dados })) as unknown as typeof fetch
}

const SEM_NADA = {
  hoje: '2026-11-16',
  dias: [
    { dia: '2026-11-16', vagas10: ['14:00', '14:10'], vagas40: ['14:00'] },
    { dia: '2026-11-18', vagas10: ['15:00'], vagas40: [] },
  ],
  meus: [],
  podeMarcar: true,
  avisoEmCimaDaHora: AVISO,
}

const COM_AGENDAMENTO = {
  ...SEM_NADA,
  meus: [{ id: 7, dia: '2026-11-18', hora: '15:00', duracao: 10, podeTrocar: true, podeDesmarcar: true }],
  podeMarcar: false,
}

describe('Agenda do portal', () => {
  it('sem agendamento, convida a marcar', async () => {
    global.fetch = responder(SEM_NADA)
    render(<Agenda onBack={jest.fn()} />)

    expect(await screen.findByText(/Nenhuma aplicação marcada/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Marcar minha aplicação/ })).toBeInTheDocument()
  })

  it('com agendamento, mostra o dia e a hora e NÃO oferece marcar outro', async () => {
    global.fetch = responder(COM_AGENDAMENTO)
    render(<Agenda onBack={jest.fn()} />)

    expect(await screen.findByText('15:00')).toBeInTheDocument()
    expect(screen.getByText(/quarta, 18 de nov/)).toBeInTheDocument()
    // Um por vez: o botão de marcar não existe enquanto houver um vivo.
    expect(screen.queryByRole('button', { name: /Marcar minha aplicação/ })).toBeNull()
    expect(screen.getByText(/uma aplicação por vez/)).toBeInTheDocument()
  })

  it('dentro da última hora: TROCAR continua, DESMARCAR manda para o grupo', async () => {
    // É o caso que mais incomoda o paciente: ele tenta e não consegue. Se a
    // tela não disser o que fazer, ele liga para a clínica — ou simplesmente
    // não aparece.
    global.fetch = responder({
      ...COM_AGENDAMENTO,
      meus: [{ id: 7, dia: '2026-11-16', hora: '15:30', duracao: 10, podeTrocar: true, podeDesmarcar: false }],
    })
    render(<Agenda onBack={jest.fn()} />)

    // Trocar não perde o paciente; desmarcar perde. São permissões
    // diferentes, e a tela precisa refletir isso — senão o paciente que só
    // queria mudar de hora acha que está sem saída.
    expect(await screen.findByRole('button', { name: /Trocar horário/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Desmarcar/ })).toBeNull()
    expect(screen.getByRole('note')).toHaveTextContent(/ainda pode trocar/i)
    expect(screen.getByRole('note')).toHaveTextContent(/grupo de suporte/i)
  })

  it('a escolha é por TEMPO, e o dia só aparece depois dela', async () => {
    global.fetch = responder(SEM_NADA)
    const user = userEvent.setup()
    render(<Agenda onBack={jest.fn()} />)

    await user.click(await screen.findByRole('button', { name: /Marcar minha aplicação/ }))
    expect(screen.getByText(/Quanto tempo você vai ficar/)).toBeInTheDocument()
    expect(screen.getByText('10 minutos')).toBeInTheDocument()
    expect(screen.getByText('40 minutos')).toBeInTheDocument()
    // Antes de escolher a duração, não há dia nem horário na tela.
    expect(screen.queryByText(/Que dia/)).toBeNull()

    await user.click(screen.getByText('10 minutos'))
    expect(screen.getByText(/Que dia/)).toBeInTheDocument()
  })

  it('40 minutos só oferece os dias onde 40 cabe', async () => {
    // 18/11 tem vaga de 10 mas nenhuma de 40. Oferecer o dia e depois não ter
    // horário seria a pior experiência: ele escolhe e bate numa parede.
    global.fetch = responder(SEM_NADA)
    const user = userEvent.setup()
    render(<Agenda onBack={jest.fn()} />)

    await user.click(await screen.findByRole('button', { name: /Marcar minha aplicação/ }))
    await user.click(screen.getByText('40 minutos'))

    expect(screen.getByText('16')).toBeInTheDocument()
    expect(screen.queryByText('18')).toBeNull()
  })

  it('manda o pedido com o que foi escolhido', async () => {
    const fetchMock = responder(SEM_NADA)
    global.fetch = fetchMock
    const user = userEvent.setup()
    render(<Agenda onBack={jest.fn()} />)

    await user.click(await screen.findByRole('button', { name: /Marcar minha aplicação/ }))
    await user.click(screen.getByText('10 minutos'))
    await user.click(screen.getByText('16'))
    await user.click(screen.getByText('14:10'))

    await waitFor(() => {
      const post = (fetchMock as unknown as jest.Mock).mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      )
      expect(post).toBeDefined()
      expect(JSON.parse((post![1] as RequestInit).body as string)).toMatchObject({
        dia: '2026-11-16', hora: '14:10', duracao: 10,
      })
    })
  })
})
