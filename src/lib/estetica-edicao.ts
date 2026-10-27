// As regras de editar um procedimento estético já criado. PURAS: é aqui que
// elas podem ser testadas sem banco e sem tela.

export interface EdicaoProcedimento {
  nome: string
  totalSessoes: number
  inicio: string
  fim: string
}

/**
 * Devolve a mensagem do primeiro problema, ou `null` quando pode salvar.
 *
 * A regra que mais importa é o total de sessões não poder cair abaixo do que
 * já foi realizado: a clínica marca a sessão 6 de 10 e depois corrige o total
 * para 4 — as marcações 5 e 6 ficariam órfãs, sem lugar na barra de progresso
 * e sem forma de serem desmarcadas pela tela. Apagar marcação de sessão feita
 * é decisão de quem atende, não efeito colateral de corrigir um número.
 */
export function validarEdicao(e: EdicaoProcedimento, feitas: number): string | null {
  if (!e.nome?.trim()) return 'Escolha o procedimento'

  const total = Math.floor(e.totalSessoes)
  if (!Number.isFinite(total) || total < 1) return 'A quantidade de sessões precisa ser pelo menos 1'
  if (total < feitas) {
    return feitas === 1
      ? 'Já existe 1 sessão realizada: desmarque-a antes de reduzir o total'
      : `Já existem ${feitas} sessões realizadas: desmarque as que sobram antes de reduzir o total`
  }

  if (!e.inicio) return 'Informe a data inicial'
  if (e.fim && e.fim < e.inicio) return 'A data final não pode ser antes da inicial'

  return null
}
