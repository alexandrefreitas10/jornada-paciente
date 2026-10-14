import { brParaCentavos, dataBrParaIso, type ExtratoLido, type LancamentoExtrato, type PeriodoExtrato } from './tipos'

// Leitor do extrato do Itaú. Mesma máquina de estado do Unicred (um registro
// abre numa linha que começa com data e fecha algumas linhas depois), mas o
// critério de fechamento é outro:
//
// - NÃO há saldo por linha: o valor do movimento é o ÚLTIMO número do registro,
//   com o sinal colado nele ("-7.400,00" é débito).
// - O CNPJ/CPF da razão social aparece ANTES do valor ("...12.345.678/0001-99
//   -7.400,00"). Ele é retirado do texto antes de procurar o número, senão o
//   "0001-99" do CNPJ poderia ser lido como dinheiro.
// - As linhas de SALDO (em conta corrente / total disponível) são o retrato de
//   um momento, não um movimento: entram no PDF com data e número iguais aos de
//   um lançamento e precisam ser descartadas.

const PERIODO_ITAU = /Lançamentos do período:\s*(\d{2}\/\d{2}\/\d{4})\s*até\s*(\d{2}\/\d{2}\/\d{4})/
// Data seguida de hora é cabeçalho/rodapé, não movimento. A proteção vem ANTES
// do \s+ porque, depois dele, um espaço duplo deixaria o retrocesso da regex
// escapar da verificação e abrir um registro falso.
const ABRE = /^(\d{2}\/\d{2}\/\d{4})(?!\s*\d{2}:\d{2})\s+/
const DOC = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/g
// O (?<![\d.,]) impede que um número seja lido pela metade: o valor tem de
// começar onde o número começa. Com "\d{1,3}" solto, "12345,67" viraria 345,67.
const VALOR_FIM = /(?<![\d.,])(-?\d+(?:\.\d{3})*,\d{2})\s*$/
// Registro que é saldo, não movimento. Os dois primeiros padrões foram medidos
// no arquivo real; o terceiro cobre a família inteira ("SALDO ANTERIOR", que
// também está no arquivo, e qualquer outro saldo que o Itaú resolva imprimir):
// nenhum lançamento de verdade começa com a palavra SALDO.
const NAO_E_MOVIMENTO = /SALDO EM CONTA CORRENTE|SALDO TOTAL DISPON|^\s*SALDO\b/i

// Duas dessas linhas de saldo descartadas são a prova de que a leitura não
// perdeu nada (ver `ConferenciaSaldo`). MEDIDO no arquivo real:
// - a ABERTURA é o "SALDO ANTERIOR", que o extrato imprime na última linha
//   (o arquivo vem do mais novo para o mais antigo);
// - o FECHAMENTO é o "SALDO TOTAL DISPONÍVEL DIA" da data mais recente.
// O "SALDO EM CONTA CORRENTE" NÃO serve: no arquivo real ele vem 0,73 acima,
// porque é de um dia depois do último movimento e já conta um rendimento ainda
// não lançado. Usá-lo faria um extrato correto parecer quebrado.
//
// O "SALDO TOTAL DISPONÍVEL DIA" é um cabeçalho por dia com movimento, então o
// mais recente é o de depois do último movimento — é isso que faz a conta
// fechar. Se um dia com movimento vier sem o seu saldo (um extrato tirado no
// meio do dia, por exemplo), a conferência vai acusar resíduo num extrato
// íntegro. É o erro aceitável dos dois: um aviso a mais manda conferir o
// arquivo; um aviso a menos manda cobrar o BPO por um tropeço nosso.
const SALDO_ABERTURA = /SALDO ANTERIOR/i
const SALDO_FECHAMENTO = /SALDO TOTAL DISPON/i

/** O texto do registro sem os CNPJ/CPF, que é onde se procura o valor. */
function semDocumentos(buffer: string): string {
  return buffer.replace(DOC, ' ')
}

export function lerExtratoItau(linhas: string[]): ExtratoLido {
  let periodo: PeriodoExtrato | null = null
  const lancamentos: LancamentoExtrato[] = []
  let data: string | null = null
  let buffer = ''
  let naoEntendidas = 0
  // `null` é "não achei o saldo impresso". Nunca zero: zero afirmaria um saldo
  // de R$ 0,00 e deixaria a conferência fechar por acidente.
  let abertura: number | null = null
  let fechamento: number | null = null
  let fechamentoEm: string | null = null

  const fechar = () => {
    const texto = semDocumentos(buffer)
    const d = data
    const m = d ? VALOR_FIM.exec(texto) : null
    if (d) {
      if (NAO_E_MOVIMENTO.test(texto)) {
        // Saldo: descarte DELIBERADO da lista de movimentos. Não é falha de
        // leitura e por isso não entra na conta de `naoEntendidas` — acender o
        // aviso aqui seria gritar lobo todo mês. Mas é aqui que estão os dois
        // saldos impressos da prova de leitura.
        if (m) {
          const valor = brParaCentavos(m[1])
          if (SALDO_ABERTURA.test(texto)) {
            // O primeiro que aparecer; o extrato imprime um só.
            if (abertura === null) abertura = valor
          } else if (SALDO_FECHAMENTO.test(texto)) {
            // Por DATA, não por posição: o arquivo vem do mais novo para o mais
            // antigo, então o último do arquivo é o saldo mais velho. Datas em
            // AAAA-MM-DD comparam como texto.
            if (fechamentoEm === null || d > fechamentoEm) {
              fechamentoEm = d
              fechamento = valor
            }
          }
        }
      } else if (m) {
        lancamentos.push({
          data: d,
          centavos: brParaCentavos(m[1]),
          descricao: texto.replace(VALOR_FIM, '').replace(/\s+/g, ' ').trim(),
        })
      } else {
        // Abriu com data e nunca mostrou valor: linha de extrato que o leitor
        // perdeu. Fica contada para a tela poder avisar.
        naoEntendidas++
      }
    }
    data = null
    buffer = ''
  }

  for (const linha of linhas) {
    if (!periodo) {
      const p = PERIODO_ITAU.exec(linha)
      if (p) periodo = { inicio: dataBrParaIso(p[1])!, fim: dataBrParaIso(p[2])! }
    }
    const abre = ABRE.exec(linha)
    if (abre) {
      fechar() // o registro anterior que não fechou é descartado
      data = dataBrParaIso(abre[1])
      buffer = linha.slice(abre[0].length).trim()
    } else if (data) {
      buffer += ' ' + linha.trim()
    }
    if (data && VALOR_FIM.test(semDocumentos(buffer))) fechar()
  }
  fechar()

  // A soma é de TODOS os movimentos lidos do arquivo — o recorte do mês é
  // problema da rota, e os saldos impressos cobrem o período inteiro.
  const soma = lancamentos.reduce((total, l) => total + l.centavos, 0)
  const conferenciaSaldo =
    abertura !== null && fechamento !== null
      ? { abertura, fechamento, soma, residuo: abertura + soma - fechamento }
      : null

  return { periodo, lancamentos, naoEntendidas, conferenciaSaldo }
}
