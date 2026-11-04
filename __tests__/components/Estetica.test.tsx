import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { Estetica } from '@/app/relatorios/Estetica'

// Nomes e procedimentos INVENTADOS: nada de paciente real em teste.
//
// Duas pessoas em DEPILAÇÃO: uma veio há pouco (fica "em dia") e outra sumiu
// há muito (fica "atrasada"). É o que permite provar que o papel segue o
// filtro da tela em vez de imprimir a lista inteira.
const HOJE = new Date('2026-11-04T12:00:00Z')

const SESSOES = [
  {
    id: 1, patientId: 10, patientName: 'Conceição Açaí Brandão',
    procedimento: 'DEPILAÇÃO A LASER', totalSessoes: 6, feitas: 4,
    inicio: '2026-08-01', ultimaFeita: '2026-10-28',
    sessions_per_week: null, intervalo_valor: 1, intervalo_unidade: 'meses',
  },
  {
    id: 2, patientId: 11, patientName: 'Thaís Gonçalves Müller',
    procedimento: 'DEPILAÇÃO A LASER', totalSessoes: 6, feitas: 1,
    inicio: '2026-02-01', ultimaFeita: '2026-02-10',
    sessions_per_week: null, intervalo_valor: 1, intervalo_unidade: 'meses',
  },
]

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'queueMicrotask'] }).setSystemTime(HOJE)
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => SESSOES })) as unknown as typeof fetch
  window.print = jest.fn()
})

afterEach(() => {
  jest.useRealTimers()
})

async function abrir() {
  render(<Estetica />)
  await waitFor(() => expect(screen.getByRole('button', { name: /quem está atrasado/i })).toBeInTheDocument())
}

const papel = () => screen.getByRole('region', { name: /relatório de estética para impressão/i })

describe('Estetica: imprimir / salvar PDF', () => {
  it('o botão manda imprimir', async () => {
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: /imprimir.*pdf/i }))

    expect(window.print).toHaveBeenCalled()
  })

  it('o papel segue o filtro escolhido na tela, não a lista inteira', async () => {
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: /quem está atrasado/i }))
    await userEvent.click(screen.getByRole('button', { name: /^Em dia/i }))

    expect(papel()).toHaveTextContent('Conceição Açaí Brandão')
    expect(papel()).not.toHaveTextContent('Thaís Gonçalves Müller')
  })

  it('trocar o filtro troca o que sai no papel', async () => {
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: /quem está atrasado/i }))
    await userEvent.click(screen.getByRole('button', { name: /^Atrasados/i }))

    expect(papel()).toHaveTextContent('Thaís Gonçalves Müller')
    expect(papel()).not.toHaveTextContent('Conceição Açaí Brandão')
  })

  it('na visão por procedimento o papel traz o procedimento aberto', async () => {
    await abrir()

    expect(papel()).toHaveTextContent('DEPILAÇÃO A LASER')
    expect(within(papel()).getByRole('table', { name: /em aberto/i })).toBeInTheDocument()
  })

  it('o papel não aparece como conteúdo duplicado na tela', async () => {
    await abrir()
    // Na tela o nome aparece uma vez na lista e uma no papel escondido; o que
    // não pode é o papel estar visível junto com a tela.
    expect(papel()).toHaveClass('hidden')
  })
})
