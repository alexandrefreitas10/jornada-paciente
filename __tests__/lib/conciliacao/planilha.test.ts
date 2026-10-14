import { lerPlanilha } from '@/lib/conciliacao/planilha'

// Cabeçalho MEDIDO nos arquivos reais do BPO. A planilha de contas recebidas
// tem 16 colunas (a última é "Número NFS-e") e a de contas pagas tem 15 — é
// por isso que as colunas são achadas pelo nome, nunca pela posição.
const CABECALHO = [
  'Id', 'Vencimento', 'Competência', 'Previsto para', 'Data de pagamento', 'CPF/CNPJ',
  'Nome', 'Descrição', 'Referência', 'Categoria', 'Detalhamento', 'Centro de Custo',
  'Valor categoria/centro de custo', 'Identificador', 'Banco', 'Número NFS-e',
]

/** Monta uma linha na ordem do cabeçalho real. Valores ANONIMIZADOS. */
function linha(campos: Partial<Record<string, unknown>>): unknown[] {
  return CABECALHO.map(c => campos[c] ?? '')
}

const RECEITA = linha({
  Id: 1, Vencimento: '01/09/2026', 'Competência': '01/09/2026', 'Previsto para': '01/09/2026',
  'Data de pagamento': '01/09/2026', 'CPF/CNPJ': '123.456.789-00', Nome: 'PACIENTES',
  'Descrição': 'FULANO DE TAL ', Categoria: 'Receita com serviços',
  'Valor categoria/centro de custo': '225', Identificador: 'Sem identificador', Banco: 'Unicred',
})

describe('lerPlanilha', () => {
  it('lê uma linha normal, com data em ISO e valor em centavos', () => {
    const { lancamentos } = lerPlanilha([CABECALHO, RECEITA])
    expect(lancamentos).toEqual([{
      data: '2026-09-01',
      competencia: '2026-09-01',
      centavos: 22500,
      banco: 'unicred',
      nome: 'PACIENTES',
      descricao: 'FULANO DE TAL',
      categoria: 'Receita com serviços',
    }])
  })

  it('acha as colunas pelo nome mesmo com o cabeçalho fora de ordem', () => {
    // O fornecedor pode reordenar as colunas a qualquer momento; ler por
    // posição faria o valor virar data e ninguém perceberia.
    const cab = ['Banco', 'Valor categoria/centro de custo', 'Categoria', 'Nome', 'Data de pagamento', 'Descrição', 'Competência']
    const { lancamentos } = lerPlanilha([
      cab,
      ['Itaú', '-312.45', 'Serviços contratados', 'FORNECEDOR EXEMPLO LTDA', '26/09/2026', 'MANUTENCAO', '01/09/2026'],
    ])
    expect(lancamentos).toEqual([{
      data: '2026-09-26',
      competencia: '2026-09-01',
      centavos: -31245,
      banco: 'itau',
      nome: 'FORNECEDOR EXEMPLO LTDA',
      descricao: 'MANUTENCAO',
      categoria: 'Serviços contratados',
    }])
  })

  it('descarta e conta a linha sem data de pagamento', () => {
    // Não foi paga: não pode estar no extrato, e se entrasse apareceria como
    // divergência inventada contra o banco.
    const r = lerPlanilha([CABECALHO, RECEITA, linha({ Nome: 'X', Categoria: 'Y', Banco: 'Unicred', 'Valor categoria/centro de custo': '100' })])
    expect(r.lancamentos).toHaveLength(1)
    expect(r.semDataPagamento).toBe(1)
  })

  it('lê valor negativo (contas pagas) sem inverter sinal', () => {
    const { lancamentos } = lerPlanilha([
      CABECALHO,
      linha({ 'Data de pagamento': '01/09/2026', Nome: 'SOCIO EXEMPLO', Categoria: 'Distribuição de Lucros', 'Valor categoria/centro de custo': '-10000', Banco: 'Unicred' }),
    ])
    expect(lancamentos[0].centavos).toBe(-1000000)
  })

  it('converte valor com e sem decimal, e sempre em inteiro', () => {
    // A coluna vem com ponto decimal: "362.80" e "-10000". A conversão trata
    // parte inteira e decimal separadamente — nenhum ida-e-volta por float,
    // que é o caminho clássico para perder um centavo.
    const casos: [unknown, number][] = [
      ['362.80', 36280], ['-10000', -1000000], ['0.01', 1], ['225', 22500],
      ['-21374', -2137400], ['1234567.89', 123456789], ['-0.5', -50],
    ]
    for (const [bruto, esperado] of casos) {
      const { lancamentos } = lerPlanilha([
        CABECALHO,
        linha({ 'Data de pagamento': '01/09/2026', Nome: 'N', Categoria: 'C', 'Valor categoria/centro de custo': bruto, Banco: 'Unicred' }),
      ])
      expect(lancamentos[0].centavos).toBe(esperado)
      expect(Number.isSafeInteger(lancamentos[0].centavos)).toBe(true)
    }
  })

  it('aceita o valor como número, que é o que o leitor de xlsx devolve', () => {
    // MEDIDO: no arquivo real a célula de valor é do tipo numérico (t="n"),
    // então a matriz chega com number, não com string.
    const { lancamentos } = lerPlanilha([
      CABECALHO,
      linha({ 'Data de pagamento': '02/09/2026', Nome: 'N', Categoria: 'C', 'Valor categoria/centro de custo': 407.23, Banco: 'Unicred' }),
      linha({ 'Data de pagamento': '02/09/2026', Nome: 'N', Categoria: 'C', 'Valor categoria/centro de custo': -207, Banco: 'Unicred' }),
    ])
    expect(lancamentos.map(l => l.centavos)).toEqual([40723, -20700])
  })

  it('descarta e conta a linha de banco desconhecido — não inventa banco', () => {
    const r = lerPlanilha([
      CABECALHO,
      RECEITA,
      linha({ 'Data de pagamento': '03/09/2026', Nome: 'N', Categoria: 'C', 'Valor categoria/centro de custo': '50', Banco: 'Banco do Brasil' }),
      linha({ 'Data de pagamento': '03/09/2026', Nome: 'N', Categoria: 'C', 'Valor categoria/centro de custo': '50', Banco: '' }),
    ])
    expect(r.lancamentos).toHaveLength(1)
    expect(r.bancoDesconhecido).toBe(2)
  })

  it('aceita Itaú com e sem acento e ignora caixa e espaços', () => {
    const { lancamentos } = lerPlanilha([
      CABECALHO,
      linha({ 'Data de pagamento': '01/09/2026', Nome: 'N', Categoria: 'C', 'Valor categoria/centro de custo': '1', Banco: ' Itaú ' }),
      linha({ 'Data de pagamento': '01/09/2026', Nome: 'N', Categoria: 'C', 'Valor categoria/centro de custo': '1', Banco: 'itau' }),
      linha({ 'Data de pagamento': '01/09/2026', Nome: 'N', Categoria: 'C', 'Valor categoria/centro de custo': '1', Banco: 'UNICRED' }),
    ])
    expect(lancamentos.map(l => l.banco)).toEqual(['itau', 'itau', 'unicred'])
  })

  it('descarta e conta a linha com data e banco mas sem valor legível', () => {
    const r = lerPlanilha([
      CABECALHO,
      linha({ 'Data de pagamento': '04/09/2026', Nome: 'N', Categoria: 'C', 'Valor categoria/centro de custo': '', Banco: 'Unicred' }),
      linha({ 'Data de pagamento': '04/09/2026', Nome: 'N', Categoria: 'C', 'Valor categoria/centro de custo': 'n/d', Banco: 'Unicred' }),
    ])
    expect(r.lancamentos).toEqual([])
    expect(r.semValor).toBe(2)
  })

  it('planilha vazia devolve resultado vazio, sem explodir', () => {
    expect(lerPlanilha([])).toEqual({ lancamentos: [], semDataPagamento: 0, bancoDesconhecido: 0, semValor: 0 })
    expect(lerPlanilha([CABECALHO])).toEqual({ lancamentos: [], semDataPagamento: 0, bancoDesconhecido: 0, semValor: 0 })
  })

  it('recusa uma planilha que não tem as colunas esperadas', () => {
    // Melhor estourar do que devolver zero lançamento em silêncio: o dono
    // subiu o arquivo errado e precisa saber disso, não ver "nada a conciliar".
    expect(() => lerPlanilha([['Paciente', 'Orçamento', 'Data'], ['x', 1, '01/09/2026']]))
      .toThrow(/Planilha não reconhecida/)
  })

  it('não lê o CPF/CNPJ: ele não aparece em campo nenhum do resultado', () => {
    // É dado pessoal de terceiro e não serve para nada na conciliação.
    const { lancamentos } = lerPlanilha([CABECALHO, RECEITA])
    expect(JSON.stringify(lancamentos)).not.toContain('123.456.789-00')
    expect(Object.keys(lancamentos[0]).sort()).toEqual(
      ['banco', 'categoria', 'centavos', 'competencia', 'data', 'descricao', 'nome'],
    )
  })

  it('competência e descrição ausentes viram null, não string vazia', () => {
    const { lancamentos } = lerPlanilha([
      CABECALHO,
      linha({ 'Data de pagamento': '05/09/2026', Nome: 'N', Categoria: 'C', 'Valor categoria/centro de custo': '1', Banco: 'Unicred' }),
    ])
    expect(lancamentos[0].competencia).toBeNull()
    expect(lancamentos[0].descricao).toBeNull()
  })

  it('ignora linhas totalmente vazias no fim da planilha', () => {
    const r = lerPlanilha([CABECALHO, RECEITA, [], ['', '', '']])
    expect(r.lancamentos).toHaveLength(1)
    expect(r).toMatchObject({ semDataPagamento: 0, bancoDesconhecido: 0, semValor: 0 })
  })
})

describe('lerPlanilha: valor zero', () => {
  it('não devolve -0, que soma como zero mas não é igual a zero', () => {
    const { lancamentos } = lerPlanilha([
      CABECALHO,
      linha({ 'Data de pagamento': '06/09/2026', Nome: 'N', Categoria: 'C', 'Valor categoria/centro de custo': '-0.00', Banco: 'Unicred' }),
    ])
    expect(Object.is(lancamentos[0].centavos, 0)).toBe(true)
  })
})
