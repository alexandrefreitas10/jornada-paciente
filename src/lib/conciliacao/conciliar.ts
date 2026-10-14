import type { Banco, LancamentoExtrato, LancamentoSistema } from './tipos'

// O casamento entre os dois lados: o que o BPO registrou no sistema contábil e
// o que de fato se moveu na conta do banco.
//
// Casa por DATA + CENTAVOS EXATOS, dentro de um banco só. Nada de tolerância de
// um dia ou de um centavo: a pergunta que a tela responde é "o que o BPO
// lançou que não aconteceu no banco, e vice-versa", e afrouxar o critério
// esconde exatamente o erro que se quer achar.
//
// O detalhe que faz a conta certa: o casamento é por CONTAGEM, não por
// existência. Um mês de verdade tem dois boletos do MESMO valor no mesmo dia —
// dois lançamentos do sistema têm de consumir dois movimentos do extrato.
// Procurar "existe esse valor nesse dia?" casaria um e deixaria o outro
// sobrando, e o dono cobraria do BPO um pagamento que de fato ocorreu.

export interface ResultadoConciliacao {
  banco: Banco
  conciliados: number
  /** O BPO lançou e o banco não tem. Na ordem em que entraram. */
  soNoSistema: LancamentoSistema[]
  /** O banco tem e o BPO não lançou. Na ordem em que entraram. */
  soNoExtrato: LancamentoExtrato[]
  /** Soma dos valores positivos. */
  totalSistemaCredito: number
  /** Soma dos valores negativos, NEGATIVA: crédito + débito = resultado do mês. */
  totalSistemaDebito: number
  totalExtratoCredito: number
  totalExtratoDebito: number
}

const chave = (data: string, centavos: number) => `${data}|${centavos}`

function somar(valores: number[]) {
  return {
    credito: valores.filter(c => c > 0).reduce((a, c) => a + c, 0),
    debito: valores.filter(c => c < 0).reduce((a, c) => a + c, 0),
  }
}

export function conciliar(
  sistema: LancamentoSistema[],
  extrato: LancamentoExtrato[],
  banco: Banco,
): ResultadoConciliacao {
  // Só o que foi pago por ESTA conta. Um pagamento do Itaú não pode casar com
  // o extrato do Unicred nem contar como sobra dele.
  const doBanco = sistema.filter(l => l.banco === banco)

  // Fila de índices do extrato por data+valor: consumir a fila é o que faz a
  // contagem funcionar (duas entradas iguais consomem duas saídas iguais).
  const filas = new Map<string, number[]>()
  extrato.forEach((l, idx) => {
    const k = chave(l.data, l.centavos)
    const fila = filas.get(k)
    if (fila) fila.push(idx)
    else filas.set(k, [idx])
  })

  const usado = new Array<boolean>(extrato.length).fill(false)
  const soNoSistema: LancamentoSistema[] = []
  let conciliados = 0

  for (const l of doBanco) {
    const fila = filas.get(chave(l.data, l.centavos))
    const idx = fila?.shift()
    if (idx === undefined) soNoSistema.push(l)
    else {
      usado[idx] = true
      conciliados++
    }
  }

  const sis = somar(doBanco.map(l => l.centavos))
  const ext = somar(extrato.map(l => l.centavos))

  return {
    banco,
    conciliados,
    soNoSistema,
    soNoExtrato: extrato.filter((_, idx) => !usado[idx]),
    totalSistemaCredito: sis.credito,
    totalSistemaDebito: sis.debito,
    totalExtratoCredito: ext.credito,
    totalExtratoDebito: ext.debito,
  }
}
