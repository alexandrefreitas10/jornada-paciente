import type { ResultadoConciliacao } from './conciliar'
import type { Banco, LancamentoExtrato } from './tipos'

// Dinheiro trocando de bolso entre as contas da própria clínica.
//
// Uma transferência entre contas aparece DUAS vezes no extrato — saindo de um
// banco e entrando no outro — e nenhuma das duas é receita ou despesa, então o
// BPO não lança nenhuma delas nas planilhas. Resultado: as duas sobram como
// "só no extrato", e o dono vai cobrar do BPO dois lançamentos que ele estava
// certo em não fazer.
//
// POR QUE EXIGIR O NOME DA EMPRESA, e não só data + valor: um pagamento a
// fornecedor saindo de um banco e um recebimento de paciente entrando no outro,
// do mesmo valor e no mesmo dia, casariam por data + valor — e duas divergências
// de verdade sumiriam da tela que existe justamente para achá-las. Numa tela de
// cobrar o BPO, esconder é o erro caro. O nome é o que separa um caso do outro.
//
// E a regra erra de propósito para o lado de MOSTRAR: transferência que o banco
// descrever sem o nome, ou que cair no dia seguinte, continua aparecendo como
// diferença. Uma diferença a mais o dono resolve olhando; uma a menos ele nunca
// descobre que existiu.

/** Pedaço do nome da clínica como os bancos o escrevem no extrato. É um pedaço,
 *  e não a razão social inteira, porque cada banco trunca de um jeito: o Itaú
 *  escreve "ANDRADE TORRES SERVICOS MEDICOS" e o Unicred acrescenta "LTDA". */
const NOME_DA_EMPRESA = 'ANDRADE TORRES'

/** Um par casado: o mesmo dinheiro saindo de uma conta e entrando na outra. */
export interface ParTransferencia {
  data: string // AAAA-MM-DD
  /** Sempre positivo: é o valor transferido, não um lado do par. */
  centavos: number
  de: Banco
  para: Banco
  descricaoDe: string
  descricaoPara: string
}

/** Maiúsculas, sem acento, e tudo que não é letra ou número vira espaço — assim
 *  "andrade-torres serviços médicos" e "ANDRADE TORRES SERVICOS MEDICOS LTDA"
 *  chegam à mesma forma. Comparar o texto cru erraria por um hífen. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

/** A descrição cita a própria clínica? A ordem das palavras importa: um
 *  "TORRES ANDRADE COMERCIO" é outra empresa, não nós. */
function ehDaPropriaEmpresa(descricao: string): boolean {
  return normalizar(descricao).includes(NOME_DA_EMPRESA)
}

function parece(saida: LancamentoExtrato, entrada: LancamentoExtrato): boolean {
  return (
    entrada.data === saida.data &&
    entrada.centavos === -saida.centavos &&
    (ehDaPropriaEmpresa(saida.descricao) || ehDaPropriaEmpresa(entrada.descricao))
  )
}

/**
 * Separa, das sobras do extrato, os pares que são transferência entre as contas
 * da clínica. Devolve os pares e os mesmos blocos sem esses movimentos.
 *
 * Os TOTAIS de cada banco não são tocados: eles são a prova de que a leitura do
 * extrato fecha contra o saldo impresso, e mexer neles quebraria a prova.
 *
 * O casamento é por CONTAGEM, não por existência — o mesmo cuidado de
 * `conciliar`. Duas transferências de R$ 9.000 no mesmo dia têm de consumir
 * dois movimentos do outro lado; procurar "existe esse valor nesse dia?" casaria
 * a primeira duas vezes e deixaria a segunda sobrando.
 */
export function acharTransferencias(resultados: ResultadoConciliacao[]): {
  pares: ParTransferencia[]
  resultados: ResultadoConciliacao[]
} {
  const pares: ParTransferencia[] = []
  // Índice do bloco → índices de `soNoExtrato` já gastos. Por índice, e não por
  // banco, para não depender de a lista ter um bloco de cada banco.
  const usado = resultados.map(() => new Set<number>())

  resultados.forEach((bancoDeSaida, iSaida) => {
    bancoDeSaida.soNoExtrato.forEach((saida, iMovSaida) => {
      // Só o lado que SAI procura par. Deixar os dois lados procurarem acharia
      // o mesmo par duas vezes.
      if (saida.centavos >= 0 || usado[iSaida].has(iMovSaida)) return

      for (let iEntrada = 0; iEntrada < resultados.length; iEntrada++) {
        // Nunca dentro do mesmo banco: saída e entrada iguais na MESMA conta é
        // estorno, não transferência, e tem de continuar à vista.
        if (iEntrada === iSaida) continue

        const candidatos = resultados[iEntrada].soNoExtrato
        const iMovEntrada = candidatos.findIndex(
          (entrada, i) => !usado[iEntrada].has(i) && parece(saida, entrada)
        )
        if (iMovEntrada < 0) continue

        usado[iSaida].add(iMovSaida)
        usado[iEntrada].add(iMovEntrada)
        pares.push({
          data: saida.data,
          centavos: -saida.centavos,
          de: bancoDeSaida.banco,
          para: resultados[iEntrada].banco,
          descricaoDe: saida.descricao,
          descricaoPara: candidatos[iMovEntrada].descricao,
        })
        return
      }
    })
  })

  return {
    pares: pares.sort((a, b) => a.data.localeCompare(b.data) || b.centavos - a.centavos),
    resultados: resultados.map((r, i) =>
      usado[i].size === 0 ? r : { ...r, soNoExtrato: r.soNoExtrato.filter((_, m) => !usado[i].has(m)) }
    ),
  }
}
