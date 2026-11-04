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

// Nomes INVENTADOS. `ultimaFeita` com hora e `Z` de propósito: é um
// `timestamptz` (`completed_at`), e não um dia puro como `inicio` — a sessão foi
// lançada às 22h30 de 28/10 em Brasília, que o banco guarda como 29/10 em UTC.
const COM_DATAS = [{
  id: 7, patientId: 70, patientName: 'Marcela Quintiliano Reis',
  procedimento: 'CRIOFREQUÊNCIA', totalSessoes: 10, feitas: 3,
  inicio: '2026-08-01T00:00:00.000Z', ultimaFeita: '2026-10-29T01:30:00.000Z',
  sessions_per_week: null, intervalo_valor: 1, intervalo_unidade: 'meses',
}]

describe('Estetica: as datas saem iguais às do banco', () => {
  beforeEach(() => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => COM_DATAS })) as unknown as typeof fetch
  })

  it('o início é o dia cadastrado, não o anterior', async () => {
    await abrir()

    const linha = screen.getByRole('link', { name: 'Marcela Quintiliano Reis' }).closest('div')!
    // Era aqui que aparecia 31/07/2026: `start_date` é um dia de calendário e
    // estava sendo lido como meia-noite UTC convertida para Brasília.
    expect(linha).toHaveTextContent('início 01/08/2026')
    expect(linha).not.toHaveTextContent('31/07/2026')
  })

  it('a última sessão é o dia do atendimento em Brasília, não o do servidor', async () => {
    await abrir()

    const linha = screen.getByRole('link', { name: 'Marcela Quintiliano Reis' }).closest('div')!
    // O oposto do caso acima, e por isso as duas funções são separadas:
    // `completed_at` é um instante e TEM de ser convertido.
    expect(linha).toHaveTextContent('última 28/10/2026')
  })

  it('o papel não discorda da tela', async () => {
    await abrir()

    expect(papel()).toHaveTextContent('01/08/2026')
    expect(papel()).toHaveTextContent('28/10/2026')
    expect(papel()).not.toHaveTextContent('31/07/2026')
  })
})

describe('Estetica: nome do arquivo salvo', () => {
  it('batiza o arquivo com a visão e a hora antes de imprimir, e devolve o título depois', async () => {
    // O Chrome usa o título da página como nome do PDF. Sem isto, os dois
    // relatórios do mesmo dia nasciam os dois "Instituto Torres.pdf".
    const tituloOriginal = 'Instituto Torres'
    document.title = tituloOriginal
    const tituloNaHoraDeImprimir: string[] = []
    window.print = jest.fn(() => { tituloNaHoraDeImprimir.push(document.title) })

    await abrir()
    await userEvent.click(screen.getByRole('button', { name: /imprimir/i }))

    expect(tituloNaHoraDeImprimir).toEqual(['Estetica - DEPILACAO A LASER - 04-11-2026 09h00'])
    expect(document.title).toBe(tituloOriginal)
  })

  it('usa o nome da visão de atraso quando é ela que está aberta', async () => {
    const tituloNaHoraDeImprimir: string[] = []
    window.print = jest.fn(() => { tituloNaHoraDeImprimir.push(document.title) })

    await abrir()
    await userEvent.click(screen.getByRole('button', { name: /quem está atrasado/i }))
    await userEvent.click(screen.getByRole('button', { name: /imprimir/i }))

    expect(tituloNaHoraDeImprimir).toEqual(['Estetica - Quem esta atrasado - Atrasados - 04-11-2026 09h00'])
  })
})

describe('Estetica: o carimbo é o momento de imprimir', () => {
  it('já está pintado no papel quando o navegador fotografa a página', async () => {
    // Olha o DOM DE DENTRO do `print`: é esse instante que o navegador manda
    // para o papel. Se o React ainda não tiver pintado o novo horário aqui, o
    // relatório sai carimbado com a hora em que a página foi aberta.
    const papelNaHoraDeImprimir: string[] = []
    window.print = jest.fn(() => {
      papelNaHoraDeImprimir.push(document.getElementById('estetica-print')?.textContent ?? '')
    })

    await abrir()
    jest.setSystemTime(new Date('2026-11-04T20:00:00Z')) // 17h00 em Brasília
    await userEvent.click(screen.getByRole('button', { name: /imprimir/i }))

    expect(papelNaHoraDeImprimir[0]).toContain('Emitido em 04/11/2026 17h00')
  })
})
