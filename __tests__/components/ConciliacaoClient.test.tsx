// __tests__/components/ConciliacaoClient.test.tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConciliacaoClient } from '@/app/conciliacao/ConciliacaoClient'
import type { CategoriaComparativo, ResultadoMes } from '@/lib/conciliacao/resultado'

// Dados inventados. Nenhum número real da clínica entra em teste.

const MESES = [
  { mes: '2026-09', criadoEm: '2026-10-14T18:30:00.000Z', criadoPor: 'Bruno' },
  { mes: '2026-08', criadoEm: '2026-09-12T13:00:00.000Z', criadoPor: 'Bruno' },
]

const categoria = (
  chave: string,
  atual: number,
  anterior: number,
  fornecedores: CategoriaComparativo['fornecedores'] = [],
): CategoriaComparativo => ({
  chave,
  atual,
  anterior,
  diferenca: atual - anterior,
  percentual: anterior === 0 ? null : Math.round(((atual - anterior) / anterior) * 10000) / 100,
  fornecedores,
})

const linha = (chave: string, atual: number, anterior: number) => {
  const { fornecedores: _f, ...resto } = categoria(chave, atual, anterior)
  return resto
}

/** O mês bom: 2 de 3 conferem no Unicred, uma única diferença de cada lado. */
const SETEMBRO: ResultadoMes = {
  mes: '2026-09',
  bancos: [
    {
      banco: 'unicred',
      conciliados: 138,
      // Fora de ordem de propósito: o envio concatena recebidas + pagas, e a
      // tela tem de ordenar por data.
      soNoSistema: [
        {
          data: '2026-09-22',
          competencia: '2026-09-01',
          centavos: -45000,
          banco: 'unicred',
          nome: 'Papelaria Inventada',
          descricao: 'Material de escritório',
          categoria: 'Material de consumo',
        },
        {
          data: '2026-09-08',
          competencia: '2026-09-01',
          centavos: -375000,
          banco: 'unicred',
          nome: 'Imobiliária Fictícia',
          descricao: 'SUBLOCAÇÃO',
          categoria: 'Aluguel',
        },
      ],
      soNoExtrato: [
        { data: '2026-09-30', centavos: -1234, descricao: 'TARIFA PACOTE DE SERVICOS' },
      ],
      totalSistemaCredito: 5000000,
      totalSistemaDebito: -3000000,
      totalExtratoCredito: 5000000,
      totalExtratoDebito: -2996234,
    },
    {
      banco: 'itau',
      conciliados: 12,
      soNoSistema: [],
      soNoExtrato: [],
      totalSistemaCredito: 800000,
      totalSistemaDebito: -200000,
      totalExtratoCredito: 800000,
      totalExtratoDebito: -200000,
    },
  ],
  comparativo: {
    mesAnterior: '2026-08',
    receitas: [categoria('Receita de consultas', 5000000, 4800000, [linha('Convênio Alfa', 3000000, 2000000)])],
    despesas: [
      // Aluguel subiu 3.000 (de -5.000 para -8.000); Salários caiu 1.000.
      categoria('Aluguel', -800000, -500000, [
        linha('Imobiliária Fictícia', -800000, -500000),
      ]),
      categoria('Serviços contratados', -250000, -200000, [
        linha('MKT Inventada', -250000, 0),
        linha('Agência Antiga', 0, -200000),
      ]),
      categoria('Salários', -2000000, -2100000, []),
    ],
  },
  leitura: null,
}

const PRIMEIRO_MES: ResultadoMes = {
  ...SETEMBRO,
  mes: '2026-08',
  comparativo: {
    mesAnterior: null,
    receitas: [categoria('Receita de consultas', 4800000, 0)],
    despesas: [categoria('Aluguel', -500000, 0)],
  },
}

/** Mês em que os dois bancos conferem — e o Itaú não teve movimento nenhum. */
const SEM_DIFERENCA: ResultadoMes = {
  ...SETEMBRO,
  bancos: [
    { ...SETEMBRO.bancos[0], conciliados: 139, soNoSistema: [], soNoExtrato: [] },
    {
      banco: 'itau',
      conciliados: 0,
      soNoSistema: [],
      soNoExtrato: [],
      totalSistemaCredito: 0,
      totalSistemaDebito: 0,
      totalExtratoCredito: 0,
      totalExtratoDebito: 0,
    },
  ],
}

/** Prova de saldo que FECHA. Números inventados, em centavos. */
const FECHA = { abertura: 5000000, soma: -1500000, fechamento: 3500000, residuo: 0 }

const LEITURA: ResultadoMes['leitura'] = {
  recebidas: { lancamentos: 83, semDataPagamento: 2, bancoDesconhecido: 0, semValor: 0, foraDoMes: 1 },
  pagas: { lancamentos: 230, semDataPagamento: 5, bancoDesconhecido: 3, semValor: 0, foraDoMes: 0 },
  unicred: {
    periodo: { inicio: '2026-09-01', fim: '2026-09-30' },
    movimentos: 139,
    naoEntendidas: 0,
    conferenciaSaldo: FECHA,
    foraDoMes: 0,
  },
  itau: {
    periodo: { inicio: '2026-09-01', fim: '2026-09-30' },
    movimentos: 12,
    naoEntendidas: 0,
    conferenciaSaldo: FECHA,
    foraDoMes: 0,
  },
}

/**
 * O que a releitura de um mês gravado devolve: SÓ os quatro descartes que o
 * banco guarda. Sem contagem de linhas e sem período — esses existiam no envio
 * e não foram guardados, então não podem ser desenhados como zero.
 */
const LEITURA_GRAVADA: ResultadoMes['leitura'] = {
  recebidas: { semValor: 0 },
  pagas: { semValor: 0 },
  unicred: { naoEntendidas: 0, conferenciaSaldo: FECHA },
  itau: { naoEntendidas: 0, conferenciaSaldo: FECHA },
}

interface Resposta {
  ok?: boolean
  status?: number
  body: unknown
}

let fetchMock: jest.Mock
let respostaDoMes: Resposta
let respostaDoPost: Resposta | (() => Promise<Resposta>)

function resolver(r: Resposta) {
  return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.body }
}

beforeEach(() => {
  respostaDoMes = { body: SETEMBRO }
  respostaDoPost = { body: { ...SETEMBRO, leitura: LEITURA } }
  fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const r = typeof respostaDoPost === 'function' ? await respostaDoPost() : respostaDoPost
      return resolver(r)
    }
    if (url === '/api/conciliacao') return resolver({ body: MESES })
    return resolver(respostaDoMes)
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

/** Espera o primeiro carregamento (o mês mais novo abre sozinho). */
async function abrir() {
  render(<ConciliacaoClient />)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Unicred' })).toBeInTheDocument())
}

const campos = () => ({
  recebidas: screen.getByLabelText(/contas recebidas/i),
  pagas: screen.getByLabelText(/contas pagas/i),
  unicred: screen.getByLabelText(/extrato do unicred/i),
  itau: screen.getByLabelText(/extrato do ita/i),
})

const arquivo = (nome: string) => new File(['conteudo'], nome, { type: 'application/octet-stream' })

async function anexarOsQuatro() {
  const c = campos()
  await userEvent.upload(c.recebidas, arquivo('recebidas.xlsx'))
  await userEvent.upload(c.pagas, arquivo('pagas.xlsx'))
  await userEvent.upload(c.unicred, arquivo('unicred.pdf'))
  await userEvent.upload(c.itau, arquivo('itau.pdf'))
}

// O rótulo muda para "Conciliando..." durante o envio: o botão é o mesmo.
const enviar = () => screen.getByRole('button', { name: /enviar e conciliar|conciliando/i })
// `input type="month"` não aceita digitação parcial no jsdom: cada tecla viraria
// um valor inválido e o campo se esvaziaria. A troca é pelo change, como o
// seletor nativo faz.
const trocarMes = (valor: string) =>
  fireEvent.change(screen.getByLabelText(/mês de referência/i), { target: { value: valor } })
const bloco = (nome: 'Unicred' | 'Itaú') =>
  screen.getByRole('heading', { name: nome }).closest('section') as HTMLElement

describe('ConciliacaoClient', () => {
  it('mostra os quatro campos de arquivo, rotulados', async () => {
    await abrir()
    const c = campos()
    expect(c.recebidas).toHaveAttribute('type', 'file')
    expect(c.pagas).toHaveAttribute('type', 'file')
    expect(c.unicred).toHaveAttribute('type', 'file')
    expect(c.itau).toHaveAttribute('type', 'file')
  })

  it('trava o envio enquanto faltar arquivo ou mês', async () => {
    await abrir()
    expect(enviar()).toBeDisabled()

    const c = campos()
    await userEvent.upload(c.recebidas, arquivo('recebidas.xlsx'))
    await userEvent.upload(c.pagas, arquivo('pagas.xlsx'))
    await userEvent.upload(c.unicred, arquivo('unicred.pdf'))
    expect(enviar()).toBeDisabled()
    expect(screen.getByText(/falta anexar/i)).toHaveTextContent(/extrato do Ita/i)

    await userEvent.upload(c.itau, arquivo('itau.pdf'))
    expect(enviar()).toBeEnabled()

    // Sem mês não dá para gravar nada: o botão trava de novo.
    trocarMes('')
    expect(enviar()).toBeDisabled()
  })

  it('mostra a mensagem de período que o servidor devolveu, não um erro genérico', async () => {
    const recusa =
      'O extrato do Itaú cobre 14/09/2026 a 14/10/2026, mas para conciliar 09/2026 ele precisa cobrir ' +
      '01/09/2026 a 30/09/2026. Exporte o extrato desse período e envie de novo.'
    respostaDoPost = { ok: false, status: 400, body: { error: recusa } }
    await abrir()
    await anexarOsQuatro()
    await userEvent.click(enviar())

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(recusa)
    expect(alerta).not.toHaveTextContent(/tente de novo\.$/i)
  })

  it('cai na mensagem genérica só quando o servidor não explica', async () => {
    respostaDoPost = { ok: false, status: 500, body: {} }
    await abrir()
    await anexarOsQuatro()
    await userEvent.click(enviar())
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível enviar/i)
  })

  it('não dispara dois envios com dois cliques', async () => {
    let liberar: (() => void) | null = null
    respostaDoPost = () =>
      new Promise<Resposta>(resolve => {
        liberar = () => resolve({ body: { ...SETEMBRO, leitura: LEITURA } })
      })

    await abrir()
    await anexarOsQuatro()
    await userEvent.click(enviar())
    expect(enviar()).toBeDisabled()
    await userEvent.click(enviar())

    expect(fetchMock.mock.calls.filter(c => c[1]?.method === 'POST')).toHaveLength(1)
    liberar!()
    await waitFor(() => expect(enviar()).toHaveTextContent(/enviar e conciliar/i))
    // Os campos voltam vazios: reenviar o mês exige anexar de novo, em vez de
    // reaproveitar em silêncio os arquivos que já subiram.
    expect(enviar()).toBeDisabled()
    expect(campos().recebidas).toHaveValue('')
  })

  it('tranca a escolha do mês enquanto o envio está em voo', async () => {
    // Trocar o mês no meio do envio deixaria o resultado que volta rotulado com
    // o mês errado — e é um resultado que o dono usa para cobrar o BPO.
    let liberar: (() => void) | null = null
    respostaDoPost = () =>
      new Promise<Resposta>(resolve => {
        liberar = () => resolve({ body: { ...SETEMBRO, leitura: LEITURA } })
      })

    await abrir()
    await anexarOsQuatro()
    await userEvent.click(enviar())

    expect(screen.getByLabelText(/mês de referência/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: '09/2026' })).toBeDisabled()

    liberar!()
    await waitFor(() => expect(screen.getByLabelText(/mês de referência/i)).toBeEnabled())
    expect(screen.getByRole('button', { name: '09/2026' })).toBeEnabled()
  })

  it('mostra, por banco, a contagem e as duas listas de diferença, em ordem de data', async () => {
    await abrir()

    const unicred = bloco('Unicred')
    expect(unicred).toHaveTextContent('138 de 140')
    expect(unicred).toHaveTextContent('138 de 139')

    const soNoSistema = within(unicred).getByRole('table', { name: /só no sistema/i })
    const datas = within(soNoSistema).getAllByText(/^\d{2}\/\d{2}\/\d{4}$/).map(n => n.textContent)
    expect(datas).toEqual(['08/09/2026', '22/09/2026'])

    const sublocacao = within(soNoSistema).getByText('SUBLOCAÇÃO').closest('tr') as HTMLElement
    expect(sublocacao).toHaveTextContent('08/09/2026')
    expect(sublocacao).toHaveTextContent('-R$ 3.750,00')
    expect(sublocacao).toHaveTextContent('Imobiliária Fictícia')
    expect(sublocacao).toHaveTextContent('Aluguel')

    const soNoExtrato = within(unicred).getByRole('table', { name: /só no extrato/i })
    expect(soNoExtrato).toHaveTextContent('TARIFA PACOTE DE SERVICOS')
    expect(soNoExtrato).toHaveTextContent('-R$ 12,34')
  })

  it('mostra os totais dos dois lados e a diferença, com o sinal do débito', async () => {
    await abrir()
    const unicred = bloco('Unicred')
    const saidas = within(unicred).getByText('Saídas').closest('tr') as HTMLElement
    expect(saidas).toHaveTextContent('-R$ 30.000,00')
    expect(saidas).toHaveTextContent('-R$ 29.962,34')
    expect(saidas).toHaveTextContent('-R$ 37,66')

    const entradas = within(unicred).getByText('Entradas').closest('tr') as HTMLElement
    expect(entradas).toHaveTextContent('R$ 50.000,00')
  })

  it('quando não há diferença nenhuma, diz isso em vez de mostrar lista vazia', async () => {
    respostaDoMes = { body: SEM_DIFERENCA }
    await abrir()
    const unicred = bloco('Unicred')
    expect(unicred).toHaveTextContent(/nenhuma diferença/i)
    expect(within(unicred).queryByRole('table', { name: /só no sistema/i })).not.toBeInTheDocument()
  })

  it('banco sem movimento nenhum não vira "tudo conferido"', async () => {
    respostaDoMes = { body: SEM_DIFERENCA }
    await abrir()
    const itau = bloco('Itaú')
    expect(itau).toHaveTextContent(/nada a conciliar/i)
    expect(itau).not.toHaveTextContent(/nenhuma diferença/i)
  })

  it('o detalhe da leitura aparece no envio; mês sem contagem guardada não mostra cartão', async () => {
    // SETEMBRO vem com `leitura: null` — é o mês gravado antes de existir onde
    // guardar os descartes. Sem contagem não há o que dizer, e um cartão vazio
    // sugeriria que a leitura foi conferida agora.
    await abrir()
    expect(screen.queryByText(/leitura dos arquivos/i)).not.toBeInTheDocument()

    await anexarOsQuatro()
    await userEvent.click(enviar())
    const leitura = await screen.findByText(/leitura dos arquivos/i)
    const cartao = leitura.closest('section') as HTMLElement
    expect(cartao).toHaveTextContent('83 lançamentos')
    expect(cartao).toHaveTextContent('230 lançamentos')
    expect(cartao).toHaveTextContent('5 sem data de pagamento')
    expect(cartao).toHaveTextContent('3 de outro banco')
    expect(cartao).toHaveTextContent('139 movimentos')
  })

  it('reabrir o mês mantém o aviso de falha de leitura, sem inventar o detalhe', async () => {
    // Este é o caso que o aviso existe para cobrir: o dono reabre setembro no
    // mês seguinte, vê as mesmas diferenças e precisa lembrar que o leitor
    // tropeçou — senão liga para o BPO cobrar um bug nosso.
    respostaDoMes = {
      body: { ...SETEMBRO, leitura: { ...LEITURA_GRAVADA!, unicred: { naoEntendidas: 2 } } },
    }
    await abrir()

    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent(/2 registros do extrato do Unicred/i)
    expect(aviso).toHaveTextContent(/não é erro do BPO/i)

    // Nada de contagem inventada: o que não foi guardado não vira "0".
    const cartao = screen.getByText(/leitura dos arquivos/i).closest('section') as HTMLElement
    expect(cartao).not.toHaveTextContent(/lançamento/i)
    expect(cartao).not.toHaveTextContent(/movimento/i)
    expect(cartao).not.toHaveTextContent(/período não declarado/i)
  })

  it('mês gravado sem descarte nenhum não ganha cartão só de enfeite', async () => {
    respostaDoMes = { body: { ...SETEMBRO, leitura: LEITURA_GRAVADA } }
    await abrir()
    expect(screen.queryByText(/leitura dos arquivos/i)).not.toBeInTheDocument()
  })

  // ── Prova de saldo ────────────────────────────────────────────
  // Por que estes testes existem: o leitor pode fechar um registro CEDO e
  // perder a linha do valor sem que nenhum contador acenda. A diferença então
  // aparece de um lado só e o dono cobra do BPO um bug nosso. A prova é
  // aritmética e independente do leitor: abertura + movimentos = fechamento
  // impresso. Ela fica no bloco do banco, ao lado das diferenças que ela pode
  // explicar.

  it('quando o extrato fecha, a confirmação é discreta e fica no bloco do banco', async () => {
    respostaDoMes = { body: { ...SETEMBRO, leitura: LEITURA_GRAVADA } }
    await abrir()
    expect(bloco('Unicred')).toHaveTextContent(/o extrato fecha/i)
    // Discreta: num mês bom não há alerta nenhum para gritar.
    expect(within(bloco('Unicred')).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('quando não fecha, o bloco do banco mostra o resíduo e tira a culpa do BPO', async () => {
    respostaDoMes = {
      body: {
        ...SETEMBRO,
        leitura: {
          ...LEITURA_GRAVADA!,
          unicred: {
            naoEntendidas: 0,
            // Faltam 88,00 para a conta fechar: é o tamanho exato do que a
            // leitura perdeu.
            conferenciaSaldo: { abertura: 5000000, soma: -1500000, fechamento: 3491200, residuo: 8800 },
          },
        },
      },
    }
    await abrir()
    const aviso = within(bloco('Unicred')).getByRole('alert')
    expect(aviso).toHaveTextContent(/não fecha/i)
    expect(aviso).toHaveTextContent('+R$ 88,00')
    expect(aviso).toHaveTextContent(/pode vir da leitura/i)
    expect(aviso).toHaveTextContent(/não do BPO/i)
    // O outro banco fecha e não é arrastado para o aviso.
    expect(within(bloco('Itaú')).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('sem os dois saldos impressos, a tela não diz nem que fecha nem que não fecha', async () => {
    respostaDoMes = {
      body: {
        ...SETEMBRO,
        leitura: { ...LEITURA_GRAVADA!, unicred: { naoEntendidas: 0, conferenciaSaldo: null } },
      },
    }
    await abrir()
    const b = bloco('Unicred')
    expect(b).toHaveTextContent(/não foi possível provar a leitura/i)
    // Sem a confirmação de quem fecha: 'não sei' não pode passar por 'confere'.
    expect(b).not.toHaveTextContent(/leitura conferida/i)
    expect(within(b).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('mês gravado antes da conferência não ganha frase nenhuma sobre saldo', async () => {
    // SETEMBRO vem com `leitura: null`: nada guardado. Dizer "não imprime os
    // dois saldos" seria inventar uma causa que ninguém mediu.
    await abrir()
    expect(bloco('Unicred')).not.toHaveTextContent(/saldo de abertura/i)
    expect(bloco('Unicred')).not.toHaveTextContent(/fecha/i)
  })

  it('avisa quando o leitor do extrato não entendeu um registro', async () => {
    respostaDoPost = {
      body: {
        ...SETEMBRO,
        leitura: { ...LEITURA, unicred: { ...LEITURA!.unicred, naoEntendidas: 2 } },
      },
    }
    await abrir()
    await anexarOsQuatro()
    await userEvent.click(enviar())
    expect(await screen.findByRole('alert')).toHaveTextContent(/2 registros do extrato do Unicred/i)
  })

  it('o comparativo lista as categorias ordenadas pela maior alta em reais', async () => {
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Custos' }))

    const despesas = screen.getByRole('table', { name: /despesas/i })
    const nomes = within(despesas).getAllByRole('button').map(b => b.textContent)
    expect(nomes).toEqual(['Aluguel', 'Serviços contratados', 'Salários'])

    // Em despesa a tela mostra o gasto como número positivo, para a alta em
    // reais e o percentual apontarem para o mesmo lado.
    const aluguel = within(despesas).getByRole('button', { name: 'Aluguel' }).closest('tr') as HTMLElement
    expect(aluguel).toHaveTextContent('R$ 8.000,00')
    expect(aluguel).toHaveTextContent('R$ 5.000,00')
    expect(aluguel).toHaveTextContent('+R$ 3.000,00')
    expect(aluguel).toHaveTextContent('+60,00%')

    const salarios = within(despesas).getByRole('button', { name: 'Salários' }).closest('tr') as HTMLElement
    expect(salarios).toHaveTextContent('-R$ 1.000,00')
    expect(salarios).toHaveTextContent('-4,76%')
  })

  it('clicar numa categoria abre os fornecedores, inclusive os de um mês só', async () => {
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Custos' }))

    const despesas = screen.getByRole('table', { name: /despesas/i })
    expect(within(despesas).queryByText('MKT Inventada')).not.toBeInTheDocument()

    const botao = within(despesas).getByRole('button', { name: 'Serviços contratados' })
    await userEvent.click(botao)
    expect(botao).toHaveAttribute('aria-expanded', 'true')

    const nova = within(despesas).getByText('MKT Inventada').closest('tr') as HTMLElement
    expect(nova).toHaveTextContent('R$ 2.500,00')
    const antiga = within(despesas).getByText('Agência Antiga').closest('tr') as HTMLElement
    expect(antiga).toHaveTextContent('R$ 2.000,00')
    expect(antiga).toHaveTextContent('-R$ 2.000,00')

    await userEvent.click(botao)
    expect(within(despesas).queryByText('MKT Inventada')).not.toBeInTheDocument()
  })

  it('avisa quando a categoria não tem fornecedor para abrir', async () => {
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Custos' }))
    const despesas = screen.getByRole('table', { name: /despesas/i })
    await userEvent.click(within(despesas).getByRole('button', { name: 'Salários' }))
    expect(despesas).toHaveTextContent(/sem detalhe por fornecedor/i)
  })

  it('no primeiro mês, o comparativo diz que não há mês anterior', async () => {
    respostaDoMes = { body: PRIMEIRO_MES }
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Custos' }))

    expect(screen.getByText(/não há mês anterior/i)).toBeInTheDocument()
    const despesas = screen.getByRole('table', { name: /despesas/i })
    expect(despesas).toHaveTextContent('Aluguel')
    expect(despesas).toHaveTextContent('R$ 5.000,00')
    // Sem base de comparação não se inventa coluna de variação.
    expect(despesas).not.toHaveTextContent('%')
  })

  it('um mês que ainda não foi enviado não mostra conciliação velha', async () => {
    await abrir()
    trocarMes('2026-07')
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Unicred' })).not.toBeInTheDocument())
    expect(screen.getByText(/ainda não foi enviada/i)).toBeInTheDocument()
  })

  it('diz quando a lista de meses não carrega', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    render(<ConciliacaoClient />)
    expect(await screen.findByText(/não foi possível carregar os meses/i)).toBeInTheDocument()
    // O envio continua de pé: é a única ação da aba.
    expect(enviar()).toBeInTheDocument()
  })
})
