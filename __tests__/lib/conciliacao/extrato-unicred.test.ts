import { lerExtratoUnicred } from '@/lib/conciliacao/extrato-unicred'

// Trechos ANONIMIZADOS. A estrutura, as quebras de linha e o formato dos
// números são os do extrato real; os números em si são INVENTADOS — cooperativa,
// agência, conta, saldos, documentos, CNPJs e valores. Nada aqui saiu de uma
// conta da clínica, e nada aqui deve voltar a sair.
// No Unicred cada movimento fecha com "R$ <saldo>" e depois "[-] R$ <valor>".
const LINHAS = [
  'Pág. 1CENTRAL DE RELACIONAMENTO: Capitais e regiões metropolitanas: 3003 7703',
  'Extrato',
  'EMPRESA EXEMPLO LTDA - **.',
  'Coop: 999 - AG: 9999 - Conta: 999999Período de 01/09/2026 a 30/09/2026',
  'Saldo em 31/08/2026: R$ 57.219,04',
  'Lançamentos Saldo (R$)Data Valor (R$)',
  // fecha na própria linha
  '02/09/2026 ARRECADACAO DE CONVENIOS ( Doc.: Convênio ) R$ 38.412,70- R$ 207,00',
  '02/09/2026 ARRECADACAO DE CONVENIOS ( Doc.: Convênio ) R$ 38.205,70- R$ 207,00',
  // quebra: a descrição e os valores vêm nas linhas seguintes
  '01/09/2026 CRED DOM – ARRANJO CREDITO ( Doc.: DomCred /',
  'FORNECEDOR EXEMPLO INSTITUIC ) R$ 38.657,35R$ 362,80',
  '01/09/2026 DEBITO TRANSFERENCIA PIX ( Doc.: DEB PIX /',
  'FULANO DE TAL ) R$ 24.657,35- R$ 14.000,00',
  // quebra em três
  '08/09/2026 LIQUIDACAO DE TITULO - IB ( Doc.: 1234567890 /',
  '12345678000199 - EMPRESA DE SERVICOS',
  'EXEMPLO LTDA ) R$ 23.036,15- R$ 1.408,55',
  // O fechamento impresso, no fim do arquivo (o real traz um). Aqui ele CONFERE
  // com a abertura mais os cinco movimentos: 57.219,04 - 15.459,75 = 41.759,29.
  'Saldo no final do período R$ 41.759,29',
]

describe('lerExtratoUnicred', () => {
  it('lê o período declarado no cabeçalho', () => {
    expect(lerExtratoUnicred(LINHAS).periodo).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' })
  })

  it('lê o movimento que fecha na própria linha, com sinal', () => {
    const { lancamentos } = lerExtratoUnicred(LINHAS)
    const convenios = lancamentos.filter(l => l.descricao.includes('CONVENIOS'))
    expect(convenios).toHaveLength(2)
    expect(convenios[0]).toEqual({ data: '2026-09-02', centavos: -20700, descricao: expect.stringContaining('ARRECADACAO DE CONVENIOS') })
  })

  it('junta a descrição quebrada em duas linhas', () => {
    const { lancamentos } = lerExtratoUnicred(LINHAS)
    const credito = lancamentos.find(l => l.centavos === 36280)
    expect(credito?.data).toBe('2026-09-01')
    expect(credito?.descricao).toContain('FORNECEDOR EXEMPLO')
  })

  it('junta a descrição quebrada em três linhas', () => {
    const { lancamentos } = lerExtratoUnicred(LINHAS)
    const titulo = lancamentos.find(l => l.centavos === -140855)
    expect(titulo?.data).toBe('2026-09-08')
    expect(titulo?.descricao).toContain('EMPRESA DE SERVICOS')
  })

  it('não confunde o saldo com o valor', () => {
    const { lancamentos } = lerExtratoUnicred(LINHAS)
    // 38.657,35 é saldo; 362,80 é o valor. Nenhum lançamento pode ter o saldo.
    expect(lancamentos.some(l => Math.abs(l.centavos) === 3865735)).toBe(false)
  })

  it('ignora cabeçalho, rodapé e a linha de saldo anterior', () => {
    const { lancamentos } = lerExtratoUnicred(LINHAS)
    expect(lancamentos).toHaveLength(5)
    expect(lancamentos.some(l => l.descricao.includes('Saldo em'))).toBe(false)
  })

  it('devolve período nulo e lista vazia num texto que não é extrato', () => {
    expect(lerExtratoUnicred(['qualquer coisa', 'outra linha'])).toEqual({
      periodo: null,
      lancamentos: [],
      naoEntendidas: 0,
      conferenciaSaldo: null,
    })
  })

  it('não abre registro numa linha de data com hora (cabeçalho/rodapé)', () => {
    // O extrato real tem uma linha assim. Com espaço duplo ela não pode escapar
    // da proteção e virar um lançamento de R$ 0,00.
    const { lancamentos } = lerExtratoUnicred([
      'Coop: 999 - AG: 9999 - Conta: 999999Período de 01/09/2026 a 30/09/2026',
      '14/10/2026  14:14 R$ 0,00R$ 0,00',
    ])
    expect(lancamentos).toEqual([])
  })

  it('registro que não fecha é descartado e não engole o seguinte', () => {
    const { lancamentos } = lerExtratoUnicred([
      'Coop: 999 - AG: 9999 - Conta: 999999Período de 01/09/2026 a 30/09/2026',
      '03/09/2026 MOVIMENTO QUE NUNCA FECHA ( Doc.: Teste /',
      '04/09/2026 TARIFA PACOTE DE SERVICOS ( Doc.: Tarifa ) R$ 20.000,00- R$ 88,00',
    ])
    expect(lancamentos).toEqual([
      { data: '2026-09-04', centavos: -8800, descricao: expect.stringContaining('TARIFA PACOTE DE SERVICOS') },
    ])
  })
})

describe('lerExtratoUnicred: registros não entendidos', () => {
  // Por que isto existe: o leitor descarta em silêncio um registro que não
  // consegue fechar. Nos arquivos reais isso nunca acontece — mas se
  // acontecer, a linha perdida reaparece como divergência de um lado só e o
  // dono culpa o BPO por um bug do leitor. O contador deixa a falha visível.
  it('conta zero num trecho em que todos os registros fecham', () => {
    expect(lerExtratoUnicred(LINHAS).naoEntendidas).toBe(0)
  })

  it('conta o registro que abre com data e nunca mostra valor', () => {
    expect(lerExtratoUnicred([
      'Coop: 999 - AG: 9999 - Conta: 999999Período de 01/09/2026 a 30/09/2026',
      '03/09/2026 MOVIMENTO QUE NUNCA FECHA ( Doc.: Teste /',
      '04/09/2026 TARIFA PACOTE DE SERVICOS ( Doc.: Tarifa ) R$ 20.000,00- R$ 88,00',
    ]).naoEntendidas).toBe(1)
  })
})

describe('lerExtratoUnicred: prova de saldo', () => {
  // Por que isto existe: o contador de registros não entendidos só pega o
  // registro que abre e nunca fecha. O furo é o registro que fecha CEDO — numa
  // linha intermediária que termina com dois valores — porque aí a linha de
  // valor de verdade é jogada fora e NINGUÉM conta nada. A conta de saldo é
  // independente do leitor: se abertura + tudo o que foi lido dá o fechamento
  // impresso, nada se perdeu; se não dá, a sobra aparece na tela e o dono sabe
  // que a diferença pode ser nossa, não do BPO.
  const soma = (linhas: string[]) =>
    lerExtratoUnicred(linhas).lancamentos.reduce((a, l) => a + l.centavos, 0)

  it('fecha: abertura + movimentos = fechamento impresso', () => {
    expect(soma(LINHAS)).toBe(-1545975)
    expect(lerExtratoUnicred(LINHAS).conferenciaSaldo).toEqual({
      abertura: 5721904,
      fechamento: 4175929,
      soma: -1545975,
      residuo: 0,
    })
  })

  it('não fecha: o resíduo aparece com o sinal certo', () => {
    // O fechamento impresso está 10.000,00 ACIMA do que a leitura explica (é
    // como se um crédito de 10.000,00 não tivesse sido lido). O resíduo é
    // negativo: o que foi lido fica abaixo do que o banco imprimiu.
    const linhas = [
      'Coop: 999 - AG: 9999 - Conta: 999999Período de 01/09/2026 a 30/09/2026',
      'Saldo em 31/08/2026: R$ 20.000,00',
      '04/09/2026 TARIFA PACOTE DE SERVICOS ( Doc.: Tarifa ) R$ 19.912,00- R$ 88,00',
      'Saldo no final do período R$ 29.912,00',
    ]
    expect(lerExtratoUnicred(linhas).conferenciaSaldo).toEqual({
      abertura: 2000000,
      fechamento: 2991200,
      soma: -8800,
      residuo: -1000000,
    })
  })

  it('registro que fecha CEDO deixa resíduo do tamanho do valor perdido', () => {
    // A falha que este teste existe para pegar. A primeira linha do registro
    // termina com "R$ 0,00R$ 0,00": o leitor acha que o registro fechou ali,
    // com valor zero, e a linha seguinte — que traz os 88,00 de verdade — é
    // descartada sem que nada seja contado.
    const linhas = [
      'Coop: 999 - AG: 9999 - Conta: 999999Período de 01/09/2026 a 30/09/2026',
      'Saldo em 31/08/2026: R$ 20.000,00',
      '10/09/2026 LIQUIDACAO DE TITULO ( Doc.: 123 / TAXA R$ 0,00R$ 0,00',
      'EMPRESA EXEMPLO ) R$ 19.912,00- R$ 88,00',
      'Saldo no final do período R$ 19.912,00',
    ]
    const lido = lerExtratoUnicred(linhas)
    // O silêncio: um movimento de zero entrou e nenhum contador acendeu.
    expect(lido.lancamentos).toEqual([{ data: '2026-09-10', centavos: 0, descricao: expect.any(String) }])
    expect(lido.naoEntendidas).toBe(0)
    // A prova de saldo é quem acusa, e o resíduo é exatamente o valor perdido:
    // o extrato saiu 88,00 mais pobre do que a leitura explica.
    expect(lido.conferenciaSaldo?.residuo).toBe(8800)
  })

  it('sem o saldo de abertura impresso, não há o que provar: null', () => {
    const linhas = LINHAS.filter(l => !l.startsWith('Saldo em'))
    expect(lerExtratoUnicred(linhas).conferenciaSaldo).toBeNull()
  })

  it('sem o saldo final impresso, não há o que provar: null', () => {
    const linhas = LINHAS.filter(l => !l.startsWith('Saldo no final'))
    expect(lerExtratoUnicred(linhas).conferenciaSaldo).toBeNull()
  })

  it('saldo negativo impresso com o sinal depois do número é lido negativo', () => {
    // No Unicred o sinal vem colado DEPOIS do número. Um fechamento negativo
    // lido como positivo faria o resíduo aparecer no dobro do tamanho.
    const linhas = [
      'Coop: 999 - AG: 9999 - Conta: 999999Período de 01/09/2026 a 30/09/2026',
      'Saldo em 31/08/2026: R$ 1.000,00',
      '04/09/2026 TARIFA PACOTE DE SERVICOS ( Doc.: Tarifa ) R$ 500,00- R$ 1.500,00',
      'Saldo no final do período R$ 500,00-',
    ]
    expect(lerExtratoUnicred(linhas).conferenciaSaldo).toEqual({
      abertura: 100000,
      fechamento: -50000,
      soma: -150000,
      residuo: 0,
    })
  })
})
