import { brParaCentavos, dataBrParaIso, type ExtratoLido, type LancamentoExtrato, type PeriodoExtrato } from './tipos'

// Leitor do extrato do Unicred, a partir das linhas que o `unpdf` devolve.
//
// A peculiaridade central, MEDIDA no arquivo real: o PDF não entrega um
// movimento por linha. Um registro abre numa linha que começa com data e só
// fecha algumas linhas depois, quando os valores aparecem — por isso a máquina
// de estado com acumulador, e não uma regex por linha.
//
// Cada movimento fecha com dois valores: primeiro o SALDO da conta depois do
// movimento, depois o VALOR do movimento. O sinal de débito fica ENTRE os dois,
// colado no fim do saldo:
//   "... R$ 38.412,70- R$ 207,00"   → débito de 207,00
//   "... R$ 38.657,35R$ 362,80"     → crédito de 362,80
// O penúltimo número é sempre saldo e é descartado; só o último é dinheiro que
// se moveu.

const PERIODO = /Período de (\d{2}\/\d{2}\/\d{4}) a (\d{2}\/\d{2}\/\d{4})/
// Data seguida de hora é cabeçalho/rodapé, não movimento. A proteção vem ANTES
// do \s+ porque, depois dele, um espaço duplo deixaria o retrocesso da regex
// escapar da verificação e abrir um registro falso.
const ABRE = /^(\d{2}\/\d{2}\/\d{4})(?!\s*\d{2}:\d{2})\s+/
const FECHA = /R\$\s*[\d.]+,\d{2}\s*(-)?\s*R\$\s*([\d.]+,\d{2})\s*$/

// Os dois saldos impressos, que são a prova de que a leitura não perdeu nada
// (ver `ConferenciaSaldo`). MEDIDOS no arquivo real: a abertura é a linha
// "Saldo em DD/MM/AAAA: R$ <valor>", logo no cabeçalho (a data é a do dia
// anterior ao período), e o fechamento é o "Saldo no final do período" perto do
// fim do arquivo. O sinal negativo, quando existe, vem colado DEPOIS do
// número, como nas linhas de movimento.
const ABERTURA = /Saldo em \d{2}\/\d{2}\/\d{4}:\s*R\$\s*(-?[\d.]+,\d{2})\s*(-)?/
const FECHAMENTO = /Saldo no final do per[íi]odo\s*R\$\s*(-?[\d.]+,\d{2})\s*(-)?/

/** O saldo impresso em centavos, com o sinal que vem depois do número. */
function saldoImpresso(m: RegExpExecArray): number {
  const v = brParaCentavos(m[1])
  return m[2] ? -Math.abs(v) : v
}

export function lerExtratoUnicred(linhas: string[]): ExtratoLido {
  let periodo: PeriodoExtrato | null = null
  const lancamentos: LancamentoExtrato[] = []
  let data: string | null = null
  let buffer = ''
  let naoEntendidas = 0
  // `null` é "não achei o saldo impresso". Nunca zero: zero afirmaria um saldo
  // de R$ 0,00 e deixaria a conferência fechar por acidente.
  let abertura: number | null = null
  let fechamento: number | null = null

  const fechar = () => {
    const m = data && FECHA.exec(buffer)
    if (m) {
      const centavos = brParaCentavos(m[2]) * (m[1] ? -1 : 1)
      lancamentos.push({ data: data!, centavos, descricao: buffer.replace(FECHA, '').trim() })
    } else if (data) {
      // Registro que abriu com data e nunca mostrou valor. Não há descarte
      // deliberado neste extrato: tudo que abre deveria fechar, então isto é
      // falha de leitura e tem de ficar contada, não engolida.
      naoEntendidas++
    }
    data = null
    buffer = ''
  }

  for (const linha of linhas) {
    if (!periodo) {
      const p = PERIODO.exec(linha)
      if (p) periodo = { inicio: dataBrParaIso(p[1])!, fim: dataBrParaIso(p[2])! }
    }
    if (abertura === null) {
      const a = ABERTURA.exec(linha)
      if (a) abertura = saldoImpresso(a)
    }
    const f = FECHAMENTO.exec(linha)
    // O último impresso vence: se o extrato repetir a linha (um rodapé por
    // página, por exemplo), o fechamento é o do fim do arquivo.
    if (f) fechamento = saldoImpresso(f)

    const abre = ABRE.exec(linha)
    if (abre) {
      fechar() // o registro anterior que não fechou é descartado
      data = dataBrParaIso(abre[1])
      buffer = linha.slice(abre[0].length).trim()
    } else if (data) {
      buffer += ' ' + linha.trim()
    }
    if (data && FECHA.test(buffer)) fechar()
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
