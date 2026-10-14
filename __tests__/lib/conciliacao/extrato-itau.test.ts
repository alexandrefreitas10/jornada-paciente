import { lerExtratoItau } from '@/lib/conciliacao/extrato-itau'

// Trechos ANONIMIZADOS. A estrutura, as quebras de linha e o formato dos
// números são os do extrato real; os números em si são INVENTADOS — agência,
// conta, saldos, limite, CNPJs e valores. Nada aqui saiu de uma conta da
// clínica, e nada aqui deve voltar a sair.
// No Itaú NÃO há saldo por linha: o valor é o último número do registro, e o
// CNPJ aparece antes dele. Linhas de SALDO não são movimento.
const LINHAS = [
  'Agência 9999 Conta 9999999-9CNPJ 12.345.678/0001-99EMPRESA EXEMPLO LTDA',
  'Saldo total Limite da conta Utilizado Disponível',
  'R$ 13.207,80 R$ 30.000,00 R$ 0,00 R$ 30.000,00',
  'Lançamentos do período: 01/09/2026 até 30/09/2026',
  'Data Lançamentos Razão Social CNPJ/CPF Valor (R$) Saldo (R$)',
  '30/09/2026 SALDO EM CONTA CORRENTE 13.207,80',
  '29/09/2026 SALDO TOTAL DISPONÍVEL DIA 13.207,07',
  // fecha na própria linha, débito
  '29/09/2026 PIX ENVIADO EMPRESA EXEMPLO LTDA 12.345.678/0001-99 -7.400,00',
  // sem CNPJ, crédito pequeno
  '28/09/2026 RENDIMENTOS REND PAGO APLIC AUT MAIS 0,02',
  // quebra em duas: CNPJ e valor na linha seguinte
  '27/09/2026 RECEBIMENTO REDE VISA',
  'AT1234567890',
  'ADQUIRENTE EXEMPLO S.A. 09.876.543/0001-21 4.117,20',
  // quebra em quatro
  '26/09/2026 PAGAMENTOS',
  'FORNECEDOR EXEMPLO INDUSTRIA,',
  'COMERCIO, IMPORTACAO E',
  'EXPORTACAO LTDA',
  '11.222.333/0002-44 -312,45',
  // O extrato vem do mais NOVO para o mais antigo, então a abertura é a última
  // linha. 16.802,30 - 3.595,23 (os quatro movimentos) = 13.207,07, que é o
  // último 'SALDO TOTAL DISPONÍVEL DIA' do arquivo — a conta fecha.
  '01/09/2026 SALDO ANTERIOR 16.802,30',
]

describe('lerExtratoItau', () => {
  it('lê o período declarado', () => {
    expect(lerExtratoItau(LINHAS).periodo).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' })
  })

  it('ignora as linhas de saldo — elas não são movimento', () => {
    const { lancamentos } = lerExtratoItau(LINHAS)
    expect(lancamentos.some(l => /SALDO/i.test(l.descricao))).toBe(false)
    expect(lancamentos.some(l => Math.abs(l.centavos) === 1320780)).toBe(false)
  })

  it('lê débito e crédito que fecham na própria linha', () => {
    const { lancamentos } = lerExtratoItau(LINHAS)
    expect(lancamentos.find(l => l.descricao.includes('PIX ENVIADO'))?.centavos).toBe(-740000)
    expect(lancamentos.find(l => l.descricao.includes('RENDIMENTOS'))?.centavos).toBe(2)
  })

  it('não confunde o CNPJ com o valor', () => {
    const { lancamentos } = lerExtratoItau(LINHAS)
    const rede = lancamentos.find(l => l.descricao.includes('REDE VISA'))
    expect(rede?.centavos).toBe(411720)
    expect(rede?.data).toBe('2026-09-27')
  })

  it('junta a descrição quebrada em quatro linhas', () => {
    const { lancamentos } = lerExtratoItau(LINHAS)
    const pag = lancamentos.find(l => l.centavos === -31245)
    expect(pag?.data).toBe('2026-09-26')
    expect(pag?.descricao).toContain('FORNECEDOR EXEMPLO')
  })

  it('lê exatamente 4 movimentos neste trecho', () => {
    expect(lerExtratoItau(LINHAS).lancamentos).toHaveLength(4)
  })

  it('descarta o SALDO ANTERIOR — é o saldo de abertura, não um movimento', () => {
    // Caso REAL encontrado no extrato do Itaú: além de "SALDO EM CONTA
    // CORRENTE" e "SALDO TOTAL DISPONÍVEL DIA", o arquivo abre com um
    // "SALDO ANTERIOR" na mesma forma de um lançamento (data + valor). Lê-lo
    // como movimento inventa uma entrada do tamanho do saldo da conta.
    const { lancamentos } = lerExtratoItau([
      'Lançamentos do período: 01/09/2026 até 30/09/2026',
      '01/09/2026 SALDO ANTERIOR 8.123,45',
      '02/09/2026 PIX RECEBIDO CLIENTE EXEMPLO LTDA 12.345.678/0001-99 1.200,00',
    ])
    expect(lancamentos).toEqual([
      { data: '2026-09-02', centavos: 120000, descricao: 'PIX RECEBIDO CLIENTE EXEMPLO LTDA' },
    ])
  })

  it('lê o valor inteiro mesmo sem separador de milhar', () => {
    // Defesa: um padrão que começasse com \d{1,3} leria "12345,67" pela metade,
    // como 345,67 — erro de milhares de reais passando por valor válido.
    const { lancamentos } = lerExtratoItau([
      'Lançamentos do período: 01/09/2026 até 30/09/2026',
      '15/09/2026 PIX ENVIADO FORNECEDOR EXEMPLO LTDA -12345,67',
    ])
    expect(lancamentos).toEqual([
      { data: '2026-09-15', centavos: -1234567, descricao: 'PIX ENVIADO FORNECEDOR EXEMPLO LTDA' },
    ])
  })

  it('registro que não fecha é descartado e não engole o seguinte', () => {
    const { lancamentos } = lerExtratoItau([
      'Lançamentos do período: 01/09/2026 até 30/09/2026',
      '15/09/2026 LANCAMENTO QUE NUNCA FECHA',
      '16/09/2026 TARIFA MENSALIDADE PACOTE DE SERVICOS -44,70',
    ])
    expect(lancamentos).toEqual([
      { data: '2026-09-16', centavos: -4470, descricao: 'TARIFA MENSALIDADE PACOTE DE SERVICOS' },
    ])
  })

  it('não abre registro numa linha de data com hora', () => {
    const { lancamentos } = lerExtratoItau([
      'Lançamentos do período: 01/09/2026 até 30/09/2026',
      '14/10/2026  14:14 0,00',
    ])
    expect(lancamentos).toEqual([])
  })
})

describe('lerExtratoItau: registros não entendidos', () => {
  it('conta zero num trecho em que todos os registros fecham', () => {
    expect(lerExtratoItau(LINHAS).naoEntendidas).toBe(0)
  })

  it('conta o registro que abre com data e nunca mostra valor', () => {
    expect(lerExtratoItau([
      'Lançamentos do período: 01/09/2026 até 30/09/2026',
      '15/09/2026 LANCAMENTO QUE NUNCA FECHA',
      '16/09/2026 TARIFA MENSALIDADE PACOTE DE SERVICOS -44,70',
    ]).naoEntendidas).toBe(1)
  })

  it('a linha de SALDO é descarte deliberado, não registro não entendido', () => {
    // Saldo não é movimento: descartá-lo é o comportamento correto, e não pode
    // acender o aviso de falha de leitura.
    expect(lerExtratoItau([
      'Lançamentos do período: 01/09/2026 até 30/09/2026',
      '01/09/2026 SALDO ANTERIOR 8.123,45',
      '30/09/2026 SALDO EM CONTA CORRENTE 13.207,80',
    ]).naoEntendidas).toBe(0)
  })
})

describe('lerExtratoItau: prova de saldo', () => {
  // Por que isto existe: o contador de registros não entendidos só pega o
  // registro que abre e nunca fecha. No Itaú o critério de fechamento é só
  // "termina em número com dois decimais", então uma linha intermediária de
  // descrição que acabe em número fecha o registro CEDO — a linha do valor de
  // verdade é descartada e nenhum contador acende. A conta de saldo é a defesa
  // independente: abertura + tudo o que foi lido tem de dar o fechamento
  // impresso.
  it('fecha: abertura + movimentos = fechamento impresso', () => {
    const { lancamentos, conferenciaSaldo } = lerExtratoItau(LINHAS)
    expect(lancamentos.reduce((a, l) => a + l.centavos, 0)).toBe(-359523)
    expect(conferenciaSaldo).toEqual({
      abertura: 1680230,
      // 13.207,07 = o SALDO TOTAL DISPONÍVEL DIA. NÃO o 13.207,80 do SALDO EM
      // CONTA CORRENTE, que no arquivo real vem 0,73 mais alto (rendimento do
      // dia seguinte ao último movimento) e faria um extrato certo parecer
      // quebrado.
      fechamento: 1320707,
      soma: -359523,
      residuo: 0,
    })
  })

  it('o fechamento é o SALDO TOTAL DISPONÍVEL DIA mais recente, não o último do arquivo', () => {
    // O extrato do Itaú vem do mais novo para o mais antigo: o último saldo do
    // arquivo é o mais ANTIGO. Pegá-lo por posição daria um fechamento de
    // semanas antes e um resíduo enorme num extrato correto.
    const linhas = [
      'Lançamentos do período: 01/09/2026 até 30/09/2026',
      '20/09/2026 SALDO TOTAL DISPONÍVEL DIA 9.912,00',
      '20/09/2026 TARIFA MENSALIDADE PACOTE DE SERVICOS -88,00',
      '10/09/2026 SALDO TOTAL DISPONÍVEL DIA 10.000,00',
      '01/09/2026 SALDO ANTERIOR 10.000,00',
    ]
    expect(lerExtratoItau(linhas).conferenciaSaldo).toEqual({
      abertura: 1000000,
      fechamento: 991200,
      soma: -8800,
      residuo: 0,
    })
  })

  it('não fecha: o resíduo aparece com o sinal certo', () => {
    // O fechamento impresso está 10.000,00 ACIMA do que a leitura explica (é
    // como se um crédito de 10.000,00 não tivesse sido lido). O resíduo é
    // negativo: o que foi lido fica abaixo do que o banco imprimiu.
    const linhas = [
      'Lançamentos do período: 01/09/2026 até 30/09/2026',
      '20/09/2026 SALDO TOTAL DISPONÍVEL DIA 19.912,00',
      '20/09/2026 TARIFA MENSALIDADE PACOTE DE SERVICOS -88,00',
      '01/09/2026 SALDO ANTERIOR 10.000,00',
    ]
    expect(lerExtratoItau(linhas).conferenciaSaldo).toEqual({
      abertura: 1000000,
      fechamento: 1991200,
      soma: -8800,
      residuo: -1000000,
    })
  })

  it('registro que fecha CEDO deixa resíduo do tamanho do valor perdido', () => {
    // A falha que este teste existe para pegar, na forma exata do Itaú: a
    // primeira linha do registro termina em "0,00" (um número de contrato, uma
    // taxa zerada), o leitor fecha ali com valor zero e a linha seguinte — que
    // traz os 88,00 de verdade — é descartada em silêncio.
    const linhas = [
      'Lançamentos do período: 01/09/2026 até 30/09/2026',
      '20/09/2026 SALDO TOTAL DISPONÍVEL DIA 9.912,00',
      '20/09/2026 TARIFA MENSALIDADE PACOTE DE SERVICOS TAXA 0,00',
      'COBRANCA REFERENTE A 09/2026 -88,00',
      '01/09/2026 SALDO ANTERIOR 10.000,00',
    ]
    const lido = lerExtratoItau(linhas)
    // O silêncio: um movimento de zero entrou e nenhum contador acendeu.
    expect(lido.lancamentos).toEqual([{ data: '2026-09-20', centavos: 0, descricao: expect.any(String) }])
    expect(lido.naoEntendidas).toBe(0)
    // A prova de saldo é quem acusa, e o resíduo é exatamente o valor perdido:
    // o extrato saiu 88,00 mais pobre do que a leitura explica.
    expect(lido.conferenciaSaldo?.residuo).toBe(8800)
  })

  it('sem o SALDO ANTERIOR impresso, não há o que provar: null', () => {
    const linhas = LINHAS.filter(l => !/SALDO ANTERIOR/.test(l))
    expect(lerExtratoItau(linhas).conferenciaSaldo).toBeNull()
  })

  it('sem o SALDO TOTAL DISPONÍVEL DIA impresso, não há o que provar: null', () => {
    // O SALDO EM CONTA CORRENTE continua no trecho: ele NÃO serve de
    // fechamento, e aceitá-lo como substituto inventaria um resíduo.
    const linhas = LINHAS.filter(l => !/SALDO TOTAL DISPON/.test(l))
    expect(linhas.some(l => /SALDO EM CONTA CORRENTE/.test(l))).toBe(true)
    expect(lerExtratoItau(linhas).conferenciaSaldo).toBeNull()
  })

  it('o SALDO ANTERIOR continua fora dos movimentos', () => {
    // Usá-lo como abertura não pode trazê-lo de volta para a lista: ele
    // inventaria uma entrada do tamanho do saldo da conta.
    const { lancamentos } = lerExtratoItau(LINHAS)
    expect(lancamentos).toHaveLength(4)
    expect(lancamentos.some(l => /SALDO/i.test(l.descricao))).toBe(false)
  })
})
